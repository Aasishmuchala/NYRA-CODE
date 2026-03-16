import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { readAuthProfiles } from './auth-profiles';

export const OLLAMA_BASE_URL = 'http://localhost:11434';
export const OLLAMA_PROVIDER_ID = 'ollama';

export interface OllamaModel {
  id: string;
  name: string;
  size: number;
  modifiedAt: string;
  parameterSize?: string;
  quantization?: string;
}

export interface OllamaProvider {
  id: string;
  label: string;
  icon: string;
  models: OllamaModel[];
}

export interface RecommendedModel {
  name: string;
  label: string;
  desc: string;
  size: string;
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  { name: 'llama3.3:70b', label: 'Llama 3.3 70B', desc: 'Best open-source general model', size: '40GB' },
  { name: 'qwen3:32b', label: 'Qwen 3 32B', desc: 'Strong coding + reasoning', size: '18GB' },
  { name: 'deepseek-r1:32b', label: 'DeepSeek R1 32B', desc: 'Advanced reasoning', size: '19GB' },
  { name: 'codestral:22b', label: 'Codestral 22B', desc: 'Code-focused model', size: '12GB' },
  { name: 'llama3.2:3b', label: 'Llama 3.2 3B', desc: 'Fast & lightweight', size: '2GB' },
  { name: 'phi4:14b', label: 'Phi-4 14B', desc: 'Microsoft reasoning model', size: '8GB' },
];

/**
 * Checks if Ollama is running by hitting the /api/tags endpoint
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches list of models available in Ollama
 */
export async function getOllamaModels(): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = (await response.json()) as { models?: Array<{
      name: string; size: number; modified_at: string;
      details?: { parameter_size?: string; quantization_level?: string; family?: string };
    }> };

    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }

    return data.models.map((model) => ({
      id: model.name,
      name: model.name,
      size: model.size,
      modifiedAt: model.modified_at,
      parameterSize: model.details?.parameter_size,
      quantization: model.details?.quantization_level,
    }));
  } catch (error) {
    console.error('Failed to fetch Ollama models:', error);
    return [];
  }
}

/**
 * Returns provider definition for Ollama
 */
export async function getOllamaProviderDef(): Promise<OllamaProvider> {
  const models = await getOllamaModels();
  return {
    id: OLLAMA_PROVIDER_ID,
    label: 'Ollama (Local)',
    icon: '🏠',
    models,
  };
}

/**
 * Syncs Ollama configuration + available models to OpenClaw auth-profiles.
 *
 * Uses the shared readAuthProfiles/writeAuthProfiles infrastructure from
 * auth-profiles.ts so we don't risk overwriting other providers' credentials.
 *
 * Returns the number of models synced so the renderer can show feedback.
 */
export async function syncOllamaToOpenClaw(): Promise<{ success: boolean; modelCount: number; error?: string }> {
  try {
    // 1. Check if Ollama is actually running
    const online = await isOllamaRunning();
    if (!online) {
      return { success: false, modelCount: 0, error: 'Ollama is not running. Start it first.' };
    }

    // 2. Get available models
    const models = await getOllamaModels();

    // 3. Read existing profiles via shared infrastructure
    const profiles = readAuthProfiles();

    // 4. Write Ollama profile with proper format
    //    Key: "ollama:default" (follows the "provider:profile" convention)
    //    We use type "local" to distinguish from api-key/oauth-token providers
    (profiles as Record<string, unknown>)['ollama:default'] = {
      type: 'local',
      baseUrl: OLLAMA_BASE_URL,
      models: models.map(m => ({
        id: m.id,
        name: m.name,
        size: m.size,
        parameterSize: m.parameterSize,
        quantization: m.quantization,
      })),
    };

    // 5. Write back using shared path + permissions
    const authProfilesPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
    const authProfilesDir = path.dirname(authProfilesPath);
    fs.mkdirSync(authProfilesDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(authProfilesPath, JSON.stringify(profiles, null, 2), { encoding: 'utf8', mode: 0o600 });

    console.log(`[Ollama] Synced ${models.length} model(s) to OpenClaw auth-profiles`);
    return { success: true, modelCount: models.length };
  } catch (error) {
    console.error('Failed to sync Ollama to OpenClaw:', error);
    return { success: false, modelCount: 0, error: String(error) };
  }
}

/**
 * Pulls a model from Ollama registry with optional progress callback
 */
export async function pullModel(
  modelName: string,
  onProgress?: (progress: { status: string; completed?: number; total?: number }) => void
): Promise<void> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Ollama pull error: ${response.statusText}`);
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              if (onProgress) {
                onProgress({
                  status: chunk.status || 'pulling',
                  completed: chunk.completed,
                  total: chunk.total,
                });
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } catch (streamError) {
      // Release the reader on mid-stream network failures
      try { reader.cancel(); } catch { /* ignore cancel errors */ }
      throw streamError;
    }
  } catch (error) {
    console.error('Failed to pull model:', error);
    throw error;
  }
}

/**
 * Deletes a model from Ollama
 */
export async function deleteModel(modelName: string): Promise<void> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Ollama delete error: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to delete model:', error);
    throw error;
  }
}

/**
 * Gets detailed information about a model
 */
export async function getModelInfo(modelName: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Ollama show error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get model info:', error);
    throw error;
  }
}
