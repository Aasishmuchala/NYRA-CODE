import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Check,
  Loader2,
  Zap,
  Clock,
  Hash,
  Plus,
  ChevronDown,
} from 'lucide-react';

interface ComparisonModel {
  id: string;
  label: string;
  provider: string;
  icon?: string;
}

interface ComparisonResponse {
  modelId: string;
  content: string;
  streaming: boolean;
  error?: string;
  tokensUsed?: number;
  latencyMs?: number;
  startedAt: number;
}

interface ModelComparisonProps {
  onClose: () => void;
  onSelectResponse?: (modelId: string, content: string) => void;
}

const AVAILABLE_MODELS: ComparisonModel[] = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', icon: '🟢' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', icon: '🟢' },
  {
    id: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet',
    provider: 'anthropic',
    icon: '🟠',
  },
  { id: 'claude-haiku-3.5', label: 'Claude Haiku', provider: 'anthropic', icon: '🟠' },
  { id: 'gemini-2.0-flash', label: 'Gemini Flash', provider: 'google', icon: '🔵' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B', provider: 'ollama', icon: '🏠' },
  { id: 'mistral:7b', label: 'Mistral 7B', provider: 'ollama', icon: '🏠' },
];

const getProviderColor = (provider: string): string => {
  switch (provider) {
    case 'anthropic':
      return 'bg-[#d4956d] text-black'; // terra
    case 'openai':
      return 'bg-[#4ade80] text-black'; // sage
    case 'google':
      return 'bg-[#fbbf24] text-black'; // gold
    case 'ollama':
    default:
      return 'bg-white/10 text-white';
  }
};

const generatePlaceholderResponse = (modelLabel: string): string => {
  const responses = [
    `This is a response from ${modelLabel}. In a production version, this would stream from the actual model API. The response would be generated in real-time based on your prompt and the specific capabilities of ${modelLabel}.`,
    `${modelLabel} here! This simulated response demonstrates how the comparison view would display streaming content from multiple models simultaneously. Each model would contribute its unique perspective and approach to answering your question.`,
    `Response from ${modelLabel}: This placeholder text simulates the streaming behavior. In the full implementation, you'd see the actual model output appear character by character, allowing you to observe the differences in how each model approaches the same prompt.`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
};

const ModelComparisonColumn: React.FC<{
  model: ComparisonModel;
  response: ComparisonResponse | null;
  onUse: () => void;
  isLoading: boolean;
}> = ({ model, response, onUse, isLoading }) => {
  const hasContent = response && response.content.length > 0;
  const showCursor = response && response.streaming;

  return (
    <div className="flex flex-col h-full border-r border-white/[0.06] last:border-r-0">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-4 py-3 bg-[#0f0e0c]">
        <div className="flex items-center gap-2">
          <span className="text-lg">{model.icon}</span>
          <div className="flex-1">
            <div className="font-medium text-white">{model.label}</div>
            <div className="text-xs text-white/50 capitalize">{model.provider}</div>
          </div>
        </div>
      </div>

      {/* Response Content */}
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {isLoading && !hasContent ? (
          <div className="flex items-center justify-center h-full text-white/40">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : response?.error ? (
          <div className="text-red-400 text-xs">Error: {response.error}</div>
        ) : hasContent ? (
          <div className="font-mono text-white/80 whitespace-pre-wrap break-words">
            {response.content}
            {showCursor && <span className="animate-pulse">▌</span>}
          </div>
        ) : (
          <div className="text-white/40 text-xs">Awaiting prompt...</div>
        )}
      </div>

      {/* Stats Footer */}
      {hasContent && response && (
        <div className="border-t border-white/[0.06] px-4 py-3 bg-[#0f0e0c] text-xs text-white/60">
          <div className="flex items-center gap-4 mb-3">
            {response.tokensUsed !== undefined && (
              <div className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                <span>{response.tokensUsed} tokens</span>
              </div>
            )}
            {response.latencyMs !== undefined && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{response.latencyMs}ms</span>
              </div>
            )}
          </div>
          <button
            onClick={onUse}
            disabled={response.streaming}
            className="w-full px-3 py-2 rounded bg-[#d4956d] hover:bg-[#e5a77d] disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium text-xs transition-colors"
          >
            <Check className="w-3 h-3 inline mr-1.5" />
            Use this response
          </button>
        </div>
      )}
    </div>
  );
};

export const ModelComparison: React.FC<ModelComparisonProps> = ({
  onClose,
  onSelectResponse,
}) => {
  const [selectedModels, setSelectedModels] = useState<ComparisonModel[]>([]);
  const [prompt, setPrompt] = useState('');
  const [responses, setResponses] = useState<Record<string, ComparisonResponse>>({});
  const [isComparing, setIsComparing] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleModel = useCallback((model: ComparisonModel) => {
    setSelectedModels((prev) => {
      const isSelected = prev.some((m) => m.id === model.id);
      if (isSelected) {
        return prev.filter((m) => m.id !== model.id);
      } else if (prev.length < 3) {
        return [...prev, model];
      }
      return prev;
    });
  }, []);

  const availableModelsToAdd = AVAILABLE_MODELS.filter(
    (model) => !selectedModels.some((m) => m.id === model.id),
  );

  const simulateStream = useCallback(
    (modelId: string, modelLabel: string) => {
      const startDelay = Math.random() * 2500 + 500; // 500-3000ms
      const fullText = generatePlaceholderResponse(modelLabel);

      setTimeout(() => {
        setResponses((prev) => ({
          ...prev,
          [modelId]: {
            modelId,
            content: '',
            streaming: true,
            startedAt: Date.now(),
            latencyMs: startDelay,
            tokensUsed: Math.floor(Math.random() * 500) + 50,
          },
        }));

        let charIndex = 0;
        const streamSpeed = Math.random() * 30 + 20; // 20-50ms per character

        const streamInterval = setInterval(() => {
          charIndex++;
          if (charIndex > fullText.length) {
            clearInterval(streamInterval);
            setResponses((prev) => ({
              ...prev,
              [modelId]: {
                ...(prev[modelId] || { modelId, content: '', streaming: false, startedAt: 0 }),
                streaming: false,
              },
            }));
          } else {
            setResponses((prev) => ({
              ...prev,
              [modelId]: {
                ...(prev[modelId] || { modelId, content: '', streaming: false, startedAt: 0 }),
                content: fullText.slice(0, charIndex),
                streaming: true,
              },
            }));
          }
        }, streamSpeed);
      }, startDelay);
    },
    [],
  );

  const handleSendToAll = useCallback(() => {
    if (!prompt.trim() || selectedModels.length === 0) return;

    setIsComparing(true);
    setResponses({});

    selectedModels.forEach((model) => {
      simulateStream(model.id, model.label);
    });

    // Stop comparing after all streams finish (approximate)
    setTimeout(() => {
      setIsComparing(false);
    }, 5000);
  }, [prompt, selectedModels, simulateStream]);

  const handleUseResponse = (modelId: string, content: string) => {
    onSelectResponse?.(modelId, content);
    onClose();
  };

  const columnCount = selectedModels.length || 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
      {/* Top Bar */}
      <div className="border-b border-white/[0.06] bg-[#0b0a08] px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-[#d4956d]" />
            <h2 className="text-lg font-semibold text-white">Compare Models</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Model Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedModels.map((model) => (
            <div
              key={model.id}
              className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 ${getProviderColor(model.provider)}`}
            >
              <span>{model.icon}</span>
              <span>{model.label}</span>
              <button
                onClick={() => toggleModel(model)}
                className="ml-1 hover:opacity-70 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {selectedModels.length < 3 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add model</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showModelDropdown && (
                <div className="absolute top-full mt-2 left-0 bg-[#1a1815] border border-white/[0.06] rounded-lg shadow-xl max-h-64 overflow-y-auto w-56 z-10">
                  {availableModelsToAdd.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        toggleModel(model);
                        setShowModelDropdown(false);
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-white/5 border-b border-white/[0.03] last:border-b-0 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{model.icon}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{model.label}</div>
                          <div className="text-xs text-white/40 capitalize">{model.provider}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {selectedModels.length > 0 ? (
          <div className={`grid h-full`} style={{ gridTemplateColumns: `repeat(${selectedModels.length}, 1fr)` }}>
            {selectedModels.map((model) => (
              <ModelComparisonColumn
                key={model.id}
                model={model}
                response={responses[model.id] || null}
                onUse={() => {
                  const content = responses[model.id]?.content || '';
                  handleUseResponse(model.id, content);
                }}
                isLoading={isComparing}
              />
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-white/40">
            <div className="text-center">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select 2-3 models to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Prompt Input Area */}
      {selectedModels.length > 0 && (
        <div className="border-t border-white/[0.06] bg-[#0b0a08] p-4">
          <div className="flex gap-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt to compare..."
              className="flex-1 bg-white/5 border border-white/[0.06] rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#d4956d]/50 focus:border-transparent resize-none min-h-24"
            />
            <button
              onClick={handleSendToAll}
              disabled={!prompt.trim() || isComparing}
              className="px-6 py-3 h-fit bg-[#d4956d] hover:bg-[#e5a77d] disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium rounded-lg flex items-center gap-2 transition-colors"
            >
              {isComparing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Comparing...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send to all</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelComparison;
