import React, { useState, useMemo } from 'react';
import {
  Check,
  Key,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RotateCw,
  Trash2,
} from 'lucide-react';

interface Provider {
  id: string;
  label: string;
  icon: string;
  oauthUrl?: string;
  apiKeyPrefix?: string;
  models: Array<{ id: string; label: string; contextWindow?: number }>;
}

interface ProviderState {
  id: string;
  enabled: boolean;
  hasKey: boolean;
  activeModel?: string;
}

interface GatewayModel {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
}

interface Props {
  catalog: Provider[];
  states: ProviderState[];
  oauthAvail: Record<string, boolean>;
  gatewayCatalog?: GatewayModel[];
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  onStartOAuth: (providerId: string) => Promise<{ success: boolean; error?: string } | undefined>;
  onGithubDeviceFlow: () => Promise<{ success: boolean; error?: string } | undefined>;
  onDisconnect: (providerId: string) => Promise<void>;
  onRefreshStates: () => Promise<void>;
  compact?: boolean;
}

const getProviderOAuthLabel = (providerId: string): string => {
  const labels: Record<string, string> = {
    openai: 'Sign in with ChatGPT',
    gemini: 'Sign in with Google',
    copilot: 'Sign in with GitHub',
  };
  return labels[providerId] || `Sign in with ${providerId}`;
};

const getProviderIcon = (icon: string): string => {
  const iconMap: Record<string, string> = {
    openai: '🔷',
    gemini: '🔵',
    copilot: '⚫',
    anthropic: '🟠',
  };
  return iconMap[icon] || '📦';
};

export const ProviderSetup: React.FC<Props> = ({
  catalog,
  states,
  oauthAvail,
  gatewayCatalog,
  onSaveKey,
  onStartOAuth,
  onGithubDeviceFlow,
  onDisconnect,
  onRefreshStates,
  compact = false,
}) => {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Build model map from gateway catalog if available
  const modelsByProvider = useMemo(() => {
    if (!gatewayCatalog) return null;

    const map: Record<string, GatewayModel[]> = {};
    gatewayCatalog.forEach((model) => {
      if (!map[model.provider]) {
        map[model.provider] = [];
      }
      map[model.provider].push(model);
    });
    return map;
  }, [gatewayCatalog]);

  const getProviderState = (providerId: string): ProviderState | undefined => {
    return states.find((s) => s.id === providerId);
  };

  const getAvailableModels = (providerId: string) => {
    if (modelsByProvider) {
      return modelsByProvider[providerId] || [];
    }
    const provider = catalog.find((p) => p.id === providerId);
    return provider?.models || [];
  };

  const validateApiKey = (providerId: string, key: string): boolean => {
    const provider = catalog.find((p) => p.id === providerId);
    if (!provider?.apiKeyPrefix) return true;
    return key.startsWith(provider.apiKeyPrefix);
  };

  const handleOAuthClick = async (providerId: string) => {
    setLoadingProvider(providerId);
    setErrors(prev => ({ ...prev, [providerId]: '' }));

    try {
      const result = providerId === 'copilot'
        ? await onGithubDeviceFlow()
        : await onStartOAuth(providerId);

      // Check for failure: result is undefined, or success is explicitly false
      if (result && !result.success) {
        setErrors(prev => ({ ...prev, [providerId]: result.error || 'Sign-in failed' }));
      } else if (!result) {
        // undefined result = no structured response, treat as potential failure
        setErrors(prev => ({ ...prev, [providerId]: 'Sign-in did not return a result' }));
      }
      await onRefreshStates();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OAuth failed';
      setErrors(prev => ({ ...prev, [providerId]: errorMessage }));
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleSaveKey = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key) {
      setErrors(prev => ({ ...prev, [providerId]: 'API key is required' }));
      return;
    }

    if (!validateApiKey(providerId, key)) {
      const provider = catalog.find((p) => p.id === providerId);
      setErrors(prev => ({
        ...prev,
        [providerId]: `API key must start with ${provider?.apiKeyPrefix}`,
      }));
      return;
    }

    setSavingProvider(providerId);
    setErrors(prev => ({ ...prev, [providerId]: '' }));

    try {
      await onSaveKey(providerId, key);
      setApiKeys(prev => ({ ...prev, [providerId]: '' }));
      await onRefreshStates();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save API key';
      setErrors(prev => ({ ...prev, [providerId]: errorMessage }));
    } finally {
      setSavingProvider(null);
    }
  };

  const isExpanded = (providerId: string) => expandedProvider === providerId;
  const toggleExpand = (providerId: string) => {
    setExpandedProvider(isExpanded(providerId) ? null : providerId);
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {catalog.map((provider) => {
        const state = getProviderState(provider.id);
        const isConnected = state?.enabled && state?.hasKey;
        const hasOAuth = oauthAvail[provider.id];
        const models = getAvailableModels(provider.id);
        const modelCount = models.length;
        const error = errors[provider.id];

        return (
          <div
            key={provider.id}
            className={`rounded-lg border transition-all ${
              isConnected
                ? 'border-sage-500/25 bg-sage-500/[0.08]'
                : 'border-white/[0.08] bg-white/[0.02]'
            }`}
          >
            {/* Header */}
            <button
              onClick={() => toggleExpand(provider.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.04] transition-colors rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-xl flex-shrink-0">{getProviderIcon(provider.icon)}</span>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white truncate">{provider.label}</span>
                    {isConnected && (
                      <>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-sage-400"></div>
                          <span className="text-xs text-sage-300">Connected</span>
                        </div>
                      </>
                    )}
                  </div>
                  {isConnected && state?.activeModel && (
                    <p className="text-xs text-white/60 mt-1">
                      Model: {state.activeModel}
                    </p>
                  )}
                  {!isConnected && modelCount > 0 && (
                    <p className="text-xs text-white/60 mt-1">
                      {modelCount} model{modelCount !== 1 ? 's' : ''} available
                    </p>
                  )}
                </div>
              </div>

              {/* Connection Status & Expand Icon */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {isConnected && <Check className="w-4 h-4 text-sage-400" />}
                {!isConnected && isExpanded(provider.id) ? (
                  <ChevronDown className="w-4 h-4 text-white/60" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/60" />
                )}
              </div>
            </button>

            {/* Connected — switch account / disconnect */}
            {isConnected && isExpanded(provider.id) && (
              <div className="border-t border-white/[0.08] px-4 py-3 space-y-3">
                <p className="text-xs text-white/50">
                  Connected{state?.activeModel ? ` · ${state.activeModel}` : ''}
                </p>
                <div className="flex items-center gap-4">
                  {hasOAuth && (
                    <button
                      onClick={() => handleOAuthClick(provider.id)}
                      disabled={loadingProvider === provider.id}
                      className="flex items-center gap-1.5 text-terra-300/70 hover:text-terra-300 text-xs transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {loadingProvider === provider.id
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Switching...</>
                        : <><RotateCw className="w-3 h-3" /> Switch account</>}
                    </button>
                  )}
                  <button
                    onClick={async () => { await onDisconnect(provider.id); await onRefreshStates(); }}
                    className="flex items-center gap-1.5 text-blush-400/70 hover:text-blush-400 text-xs transition-colors cursor-pointer ml-auto"
                  >
                    <Trash2 className="w-3 h-3" /> Disconnect
                  </button>
                </div>
                {errors[provider.id] && (
                  <p className="text-xs text-blush-300">{errors[provider.id]}</p>
                )}
              </div>
            )}

            {/* Expanded Content */}
            {!isConnected && isExpanded(provider.id) && (
              <div className="border-t border-white/[0.08] px-4 py-3 space-y-3">
                {/* OAuth Section */}
                {hasOAuth && (
                  <>
                    <button
                      onClick={() => handleOAuthClick(provider.id)}
                      disabled={loadingProvider === provider.id}
                      className="w-full px-3 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.12] rounded-md flex items-center justify-center gap-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingProvider === provider.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4" />
                          <span>{getProviderOAuthLabel(provider.id)}</span>
                        </>
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-white/[0.1]"></div>
                      <span className="text-xs text-white/50 font-medium">or paste API key</span>
                      <div className="flex-1 h-px bg-white/[0.1]"></div>
                    </div>
                  </>
                )}

                {/* API Key Section */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/80">
                    API Key {provider.apiKeyPrefix && `(starts with ${provider.apiKeyPrefix})`}
                  </label>
                  <input
                    type="password"
                    value={apiKeys[provider.id] || ''}
                    onChange={(e) =>
                      setApiKeys(prev => ({
                        ...prev,
                        [provider.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveKey(provider.id);
                      }
                    }}
                    placeholder="Paste your API key here"
                    className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.08] rounded-md text-white placeholder:text-white/30 focus:outline-none focus:border-white/[0.16] focus:bg-white/[0.04] transition-colors text-sm"
                  />

                  {/* Validation Feedback */}
                  {apiKeys[provider.id] &&
                    provider.apiKeyPrefix &&
                    !validateApiKey(provider.id, apiKeys[provider.id]) && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded bg-blush-400/10 border border-blush-400/25">
                        <span className="text-xs text-blush-300 leading-tight flex-1">
                          Key must start with {provider.apiKeyPrefix}
                        </span>
                      </div>
                    )}

                  {/* Error Display */}
                  {error && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded bg-blush-400/10 border border-blush-400/25">
                      <span className="text-xs text-blush-300 leading-tight flex-1">{error}</span>
                    </div>
                  )}

                  {/* Save Button */}
                  <button
                    onClick={() => handleSaveKey(provider.id)}
                    disabled={savingProvider === provider.id || !apiKeys[provider.id]}
                    className="w-full px-3 py-2 bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.12] rounded-md flex items-center justify-center gap-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingProvider === provider.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-4 h-4" />
                        <span>Save API Key</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
