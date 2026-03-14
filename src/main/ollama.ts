import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

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

    const data = (await response.json()) as { models?: Array<{ name: string; size: number; modified_at: string }> };

    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }

    return data.models.map((model) => ({
      id: model.name,
      name: model.name,
      size: model.size,
      modifiedAt: model.modified_at,
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
 * Syncs Ollama configuration to OpenClaw auth-profiles
 */
export async function syncOllamaToOpenClaw(): Promise<void> {
  try {
    const authProfilesPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
    const authProfilesDir = path.dirname(authProfilesPath);

    // Ensure directory exists
    if (!fs.existsSync(authProfilesDir)) {
      fs.mkdirSync(authProfilesDir, { recursive: true });
    }

    // Read existing profiles or create empty object
    let profiles: Record<string, unknown> = {};
    if (fs.existsSync(authProfilesPath)) {
      try {
        const content = fs.readFileSync(authProfilesPath, 'utf-8');
        profiles = JSON.parse(content);
      } catch {
        profiles = {};
      }
    }

    // Add or update Ollama profile
    profiles['ollama'] = {
      baseUrl: OLLAMA_BASE_URL,
    };

    // Write back
    fs.writeFileSync(authProfilesPath, JSON.stringify(profiles, null, 2));
  } catch (error) {
    console.error('Failed to sync Ollama to OpenClaw:', error);
    throw error;
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
