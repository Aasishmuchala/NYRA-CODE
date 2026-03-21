/**
 * Model Selector — Claude-inspired dropdown with real provider models,
 * availability states, and cost multipliers.
 *
 * Shows all models from connected providers (GitHub Copilot, Gemini, OpenAI, OpenRouter).
 * Unavailable models appear dimmed and are non-selectable.
 * Cost multiplier badges (1x, 3x, 0.2x) help users understand relative pricing.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Sparkles, Zap, Crown, Gauge } from 'lucide-react';
// ── Provider SVG logos ───────────────────────────────────────────────────────
const OpenAILogo = ({ size = 14, className }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.612-1.5z"/>
  </svg>);
const CopilotLogo = ({ size = 14, className }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 16.303c-.156.252-.437.412-.744.412H6.85c-.307 0-.588-.16-.744-.412a.867.867 0 0 1-.023-.846l2.378-4.752c.2-.4.6-.652 1.044-.652h5.09c.444 0 .844.252 1.044.652l2.278 4.552c.178.356.134.688-.023.846zm-.19-6.303H6.296c-.614 0-1.114-.5-1.114-1.114V7.114C5.182 6.5 5.682 6 6.296 6h11.408c.614 0 1.114.5 1.114 1.114v1.772c0 .614-.5 1.114-1.114 1.114z"/>
  </svg>);
const GeminiLogo = ({ size = 14, className }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 0C5.907 5.907 5.907 5.907 0 12c5.907 6.093 5.907 6.093 12 12 6.093-5.907 6.093-5.907 12-12C18.093 5.907 18.093 5.907 12 0z"/>
  </svg>);
const AnthropicLogo = ({ size = 14, className }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.257 0L0 20.48h3.603l1.377-3.68h6.57l1.377 3.68h3.603L10.173 3.52H6.57zM6.903 13.36L8.4 9.2l1.497 4.16H6.903z"/>
  </svg>);
const OpenRouterLogo = ({ size = 14, className }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
const OllamaLogo = ({ size = 14, className }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
  </svg>);
// Map provider names to logo components
const PROVIDER_LOGOS = {
    OpenAI: OpenAILogo,
    Copilot: CopilotLogo,
    Gemini: GeminiLogo,
    Anthropic: AnthropicLogo,
    OpenRouter: OpenRouterLogo,
    Local: OllamaLogo,
};
// ── Provider model catalogs ──────────────────────────────────────────────────
// Availability is determined by provider connection status (passed via props).
const OPENAI_MODELS = [
    // ── Latest (March 2026) ──
    { id: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI', providerIcon: '◐', description: 'Latest flagship model', costMultiplier: 5, tier: 'flagship', contextWindow: '1M' },
    { id: 'openai/gpt-5.4-pro', name: 'GPT-5.4 Pro', provider: 'OpenAI', providerIcon: '◐', description: 'Extended thinking, max capability', costMultiplier: 10, tier: 'flagship', contextWindow: '1M' },
    { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'OpenAI', providerIcon: '◐', description: 'Optimized for code generation', costMultiplier: 3, tier: 'premium', contextWindow: '1M' },
    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI', providerIcon: '◐', description: 'Fast and affordable', costMultiplier: 0.5, tier: 'fast', contextWindow: '1M' },
    // ── Reasoning ──
    { id: 'openai/o4-mini', name: 'o4 Mini', provider: 'OpenAI', providerIcon: '◐', description: 'Latest reasoning, compact', costMultiplier: 2, tier: 'standard', contextWindow: '200K' },
    { id: 'openai/o3', name: 'o3', provider: 'OpenAI', providerIcon: '◐', description: 'Advanced reasoning', costMultiplier: 10, tier: 'flagship', contextWindow: '200K' },
    { id: 'openai/o3-mini', name: 'o3 Mini', provider: 'OpenAI', providerIcon: '◐', description: 'Fast reasoning', costMultiplier: 1.5, tier: 'standard', contextWindow: '200K' },
    // ── Previous generation ──
    { id: 'openai/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', providerIcon: '◐', description: 'Previous gen flagship', costMultiplier: 3, tier: 'premium', contextWindow: '1M' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', providerIcon: '◐', description: 'Multimodal, fast reasoning', costMultiplier: 2, tier: 'premium', contextWindow: '128K' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', providerIcon: '◐', description: 'Compact multimodal', costMultiplier: 0.3, tier: 'fast', contextWindow: '128K' },
];
const COPILOT_MODELS = [
    // ── Latest (March 2026) ──
    { id: 'copilot/gpt-5.4', name: 'GPT-5.4', provider: 'Copilot', providerIcon: '⬡', description: 'OpenAI flagship via Copilot', costMultiplier: 1, tier: 'flagship', contextWindow: '1M' },
    { id: 'copilot/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'Copilot', providerIcon: '⬡', description: 'Anthropic via Copilot', costMultiplier: 1, tier: 'premium', contextWindow: '200K' },
    { id: 'copilot/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Copilot', providerIcon: '⬡', description: 'Anthropic flagship via Copilot', costMultiplier: 1, tier: 'flagship', contextWindow: '200K' },
    { id: 'copilot/gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'Copilot', providerIcon: '⬡', description: 'Code-optimized via Copilot', costMultiplier: 1, tier: 'premium', contextWindow: '1M' },
    { id: 'copilot/gemini-3.1-pro', name: 'Gemini 3.1 Pro', provider: 'Copilot', providerIcon: '⬡', description: 'Google flagship via Copilot', costMultiplier: 1, tier: 'flagship', contextWindow: '1M' },
    // ── Other available models ──
    { id: 'copilot/claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'Copilot', providerIcon: '⬡', description: 'Fast Anthropic via Copilot', costMultiplier: 0.2, tier: 'fast', contextWindow: '200K' },
    { id: 'copilot/gpt-5-mini', name: 'GPT-5 Mini', provider: 'Copilot', providerIcon: '⬡', description: 'Fast OpenAI via Copilot', costMultiplier: 0.3, tier: 'fast', contextWindow: '1M' },
    { id: 'copilot/o4-mini', name: 'o4 Mini', provider: 'Copilot', providerIcon: '⬡', description: 'Reasoning via Copilot', costMultiplier: 1, tier: 'standard', contextWindow: '200K' },
];
const GEMINI_MODELS = [
    // ── Latest (March 2026) ──
    { id: 'gemini/gemini-3.1-pro', name: 'Gemini 3.1 Pro', provider: 'Gemini', providerIcon: '◆', description: 'Latest flagship with thinking', costMultiplier: 3, tier: 'flagship', contextWindow: '1M' },
    { id: 'gemini/gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Gemini', providerIcon: '◆', description: 'Fast with thinking', costMultiplier: 0.3, tier: 'fast', contextWindow: '1M' },
    { id: 'gemini/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', provider: 'Gemini', providerIcon: '◆', description: 'Ultra-fast, cheapest option', costMultiplier: 0.05, tier: 'fast', contextWindow: '1M' },
    // ── Previous generation (retiring June 2026) ──
    { id: 'gemini/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Gemini', providerIcon: '◆', description: 'Previous gen flagship', costMultiplier: 2, tier: 'premium', contextWindow: '1M' },
    { id: 'gemini/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Gemini', providerIcon: '◆', description: 'Previous gen flash', costMultiplier: 0.2, tier: 'fast', contextWindow: '1M' },
];
const ANTHROPIC_MODELS = [
    { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'Anthropic', providerIcon: '✦', description: 'Most capable, extended thinking', costMultiplier: 5, tier: 'flagship', contextWindow: '200K' },
    { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', providerIcon: '✦', description: 'Balanced performance', costMultiplier: 1, tier: 'premium', contextWindow: '200K' },
    { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic', providerIcon: '✦', description: 'Fast and lightweight', costMultiplier: 0.2, tier: 'fast', contextWindow: '200K' },
];
const OPENROUTER_MODELS = [
    // ── Smart routing ──
    { id: 'openrouter/auto', name: 'Auto (Best)', provider: 'OpenRouter', providerIcon: '⊕', description: 'Auto-routes to best model', costMultiplier: 1, tier: 'standard', contextWindow: 'varies' },
    // ── Flagship paid (latest, March 2026) ──
    { id: 'openrouter/anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'OpenRouter', providerIcon: '⊕', description: 'Anthropic flagship, extended thinking', costMultiplier: 5, tier: 'flagship', contextWindow: '200K' },
    { id: 'openrouter/anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'OpenRouter', providerIcon: '⊕', description: 'Balanced Anthropic', costMultiplier: 1, tier: 'premium', contextWindow: '200K' },
    { id: 'openrouter/openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenRouter', providerIcon: '⊕', description: 'OpenAI flagship', costMultiplier: 5, tier: 'flagship', contextWindow: '1M' },
    { id: 'openrouter/google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'OpenRouter', providerIcon: '⊕', description: 'Google flagship with thinking', costMultiplier: 3, tier: 'flagship', contextWindow: '1M' },
    // ── Kimi (Moonshot AI) ──
    { id: 'openrouter/moonshotai/kimi-k2.5', name: 'Kimi K2.5', provider: 'OpenRouter', providerIcon: '⊕', description: 'Moonshot AI, 256K context', costMultiplier: 0.5, tier: 'premium', contextWindow: '256K' },
    { id: 'openrouter/moonshotai/kimi-k2', name: 'Kimi K2', provider: 'OpenRouter', providerIcon: '⊕', description: 'Moonshot AI reasoning', costMultiplier: 0.3, tier: 'standard', contextWindow: '128K' },
    // ── MiniMax ──
    { id: 'openrouter/minimax/minimax-m1', name: 'MiniMax M1', provider: 'OpenRouter', providerIcon: '⊕', description: '1M context powerhouse', costMultiplier: 0.5, tier: 'premium', contextWindow: '1M' },
    // ── Reasoning ──
    { id: 'openrouter/deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'OpenRouter', providerIcon: '⊕', description: 'DeepSeek reasoning model', costMultiplier: 0.5, tier: 'premium', contextWindow: '128K' },
    // ── Open-weight / strong ──
    { id: 'openrouter/deepseek/deepseek-v3-0324', name: 'DeepSeek V3', provider: 'OpenRouter', providerIcon: '⊕', description: 'DeepSeek flagship chat', costMultiplier: 0.3, tier: 'standard', contextWindow: '128K' },
    { id: 'openrouter/meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', provider: 'OpenRouter', providerIcon: '⊕', description: 'Meta open-source flagship', costMultiplier: 1, tier: 'flagship', contextWindow: '1M' },
    { id: 'openrouter/meta-llama/llama-4-scout', name: 'Llama 4 Scout', provider: 'OpenRouter', providerIcon: '⊕', description: 'Meta efficient model', costMultiplier: 0.5, tier: 'standard', contextWindow: '512K' },
    { id: 'openrouter/qwen/qwen-3-235b-a22b', name: 'Qwen 3 235B', provider: 'OpenRouter', providerIcon: '⊕', description: 'Alibaba flagship, MoE', costMultiplier: 0.5, tier: 'premium', contextWindow: '128K' },
    { id: 'openrouter/qwen/qwen-3-32b', name: 'Qwen 3 32B', provider: 'OpenRouter', providerIcon: '⊕', description: 'Alibaba efficient model', costMultiplier: 0.1, tier: 'standard', contextWindow: '128K' },
    { id: 'openrouter/mistralai/mistral-large-2', name: 'Mistral Large 2', provider: 'OpenRouter', providerIcon: '⊕', description: 'Mistral AI flagship', costMultiplier: 1.5, tier: 'premium', contextWindow: '128K' },
    // ── Free models (community tier, $0) ──
    { id: 'openrouter/deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', provider: 'OpenRouter', providerIcon: '⊕', description: 'Free reasoning model', costMultiplier: 0, tier: 'fast', contextWindow: '128K' },
    { id: 'openrouter/deepseek/deepseek-v3-0324:free', name: 'DeepSeek V3 (Free)', provider: 'OpenRouter', providerIcon: '⊕', description: 'Free DeepSeek chat', costMultiplier: 0, tier: 'fast', contextWindow: '128K' },
    { id: 'openrouter/meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (Free)', provider: 'OpenRouter', providerIcon: '⊕', description: 'Free Meta flagship', costMultiplier: 0, tier: 'fast', contextWindow: '256K' },
    { id: 'openrouter/qwen/qwen-3-32b:free', name: 'Qwen 3 32B (Free)', provider: 'OpenRouter', providerIcon: '⊕', description: 'Free Qwen model', costMultiplier: 0, tier: 'fast', contextWindow: '128K' },
    { id: 'openrouter/google/gemma-3-27b-it:free', name: 'Gemma 3 27B (Free)', provider: 'OpenRouter', providerIcon: '⊕', description: 'Free Google model', costMultiplier: 0, tier: 'fast', contextWindow: '96K' },
    { id: 'openrouter/mistralai/mistral-small-3.2:free', name: 'Mistral Small 3.2 (Free)', provider: 'OpenRouter', providerIcon: '⊕', description: 'Free Mistral model', costMultiplier: 0, tier: 'fast', contextWindow: '128K' },
];
// ── Tier styling ─────────────────────────────────────────────────────────────
const TIER_ICON = {
    fast: <Zap size={11}/>,
    standard: <Gauge size={11}/>,
    premium: <Sparkles size={11}/>,
    flagship: <Crown size={11}/>,
};
const TIER_COLOR = {
    fast: 'text-sage-400',
    standard: 'text-gold-400',
    premium: 'text-terra-300',
    flagship: 'text-gold-400',
};
function formatCost(mult) {
    if (mult === 0)
        return 'Free';
    if (mult >= 1)
        return `${mult}x`;
    if (mult >= 0.1)
        return `${mult}x`;
    return `${mult}x`;
}
function costColor(mult) {
    if (mult === 0)
        return 'text-sage-400/70 bg-sage-400/10';
    if (mult <= 0.3)
        return 'text-sage-400/70 bg-sage-400/10';
    if (mult <= 1)
        return 'text-gold-400/70 bg-gold-400/10';
    if (mult <= 3)
        return 'text-terra-300/70 bg-terra-300/10';
    return 'text-blush-400/70 bg-blush-400/10';
}
// ── Gateway catalog entry type ──────────────────────────────────────────────
export const GatewayCatalogEntry = {
};
// ── Component ────────────────────────────────────────────────────────────────
export const ModelSelector = ({ value, onChange, connectedProviders = [], compact = false, ollamaModels = [], gatewayCatalog = [] }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);
    const searchRef = useRef(null);
    // Convert Ollama models to ModelDef format
    const ollamaModelDefs = useMemo(() => ollamaModels.map(m => {
        // Show base name as label, but keep full tag for disambiguation
        const baseName = m.name.split(':')[0].replace(/^.*\//, '');
        const tag = m.name.includes(':') ? m.name.split(':')[1] : 'latest';
        const displayName = tag && tag !== 'latest' ? `${baseName} (${tag})` : baseName;
        // Format file size for description
        const sizeStr = m.size > 0
            ? `${(m.size / (1024 * 1024 * 1024)).toFixed(1)}GB`
            : undefined;
        return {
            id: `ollama/${m.name}`,
            name: displayName,
            provider: 'Local',
            providerIcon: '🦙',
            description: [m.parameterSize, m.quantization, sizeStr].filter(Boolean).join(' · ') || 'Local model',
            costMultiplier: 0,
            tier: 'standard',
            available: true,
            contextWindow: undefined,
        };
    }), [ollamaModels]);
    // Build full model list with availability
    const gatewayModels = useMemo(() => {
        if (!gatewayCatalog || gatewayCatalog.length === 0) return [];
        // Map OpenClaw provider names to UI-friendly names
        const PROVIDER_DISPLAY = {
            'openai-codex': 'OpenAI', openai: 'OpenAI',
            anthropic: 'Anthropic',
            'google-gemini': 'Gemini', google: 'Gemini',
            'github-copilot': 'Copilot',
            openrouter: 'OpenRouter',
            ollama: 'Local',
        };
        const PROVIDER_ICON = {
            'openai-codex': '◐', openai: '◐', anthropic: '✦',
            'google-gemini': '◆', google: '◆', 'github-copilot': '⬡',
            openrouter: '⊕', ollama: '🦙',
        };
        return gatewayCatalog.map(m => {
            const providerKey = m.provider?.toLowerCase() ?? '';
            const displayName = m.name || m.id.split('/').pop() || m.id;
            return {
                id: m.id,
                name: displayName,
                provider: PROVIDER_DISPLAY[providerKey] ?? m.provider ?? 'Unknown',
                providerIcon: PROVIDER_ICON[providerKey] ?? '●',
                description: m.reasoning ? 'Reasoning model' : 'Chat model',
                costMultiplier: 1,
                tier: (m.reasoning ? 'premium' : 'standard'),
                available: true,
                contextWindow: m.contextWindow ? (m.contextWindow >= 1_000_000 ? '1M' : `${Math.round(m.contextWindow / 1000)}K`) : undefined,
            };
        });
    }, [gatewayCatalog]);
    const allModels = useMemo(() => {
        const connected = new Set(connectedProviders.map(p => p.toLowerCase()));
        const auto = {
            id: 'auto', name: 'Auto', provider: 'Nyra', providerIcon: '✧',
            description: 'Automatically picks the best model', costMultiplier: 1,
            tier: 'standard', available: true, contextWindow: 'varies',
        };
        const withAvailability = (models, providerKey) => models.map(m => ({ ...m, available: connected.has(providerKey) }));
        return [
            auto,
            ...withAvailability(COPILOT_MODELS, 'copilot'),
            ...withAvailability(OPENAI_MODELS, 'openai'),
            ...withAvailability(GEMINI_MODELS, 'gemini'),
            ...withAvailability(ANTHROPIC_MODELS, 'anthropic'),
            ...withAvailability(OPENROUTER_MODELS, 'openrouter'),
            ...ollamaModelDefs,
            ...gatewayModels,
        ];
    }, [connectedProviders, ollamaModelDefs, gatewayModels]);
    // Group by provider
    const grouped = useMemo(() => {
        const q = search.toLowerCase();
        const filtered = q
            ? allModels.filter(m => m.name.toLowerCase().includes(q) ||
                m.provider.toLowerCase().includes(q) ||
                m.description.toLowerCase().includes(q))
            : allModels;
        const groups = [];
        const providerOrder = ['Nyra', 'Copilot', 'OpenAI', 'Gemini', 'Anthropic', 'OpenRouter', 'Local'];
        for (const p of providerOrder) {
            const models = filtered.filter(m => m.provider === p);
            if (models.length > 0) {
                groups.push({ provider: p, icon: models[0].providerIcon, models });
            }
        }
        return groups;
    }, [allModels, search]);
    const current = allModels.find(m => m.id === value) ?? allModels[0];
    // Click outside to close
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target))
                setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    // Focus search on open
    useEffect(() => {
        if (open) {
            setSearch('');
            setTimeout(() => searchRef.current?.focus(), 50);
        }
    }, [open]);
    // ── Compact mode (for inline in chat input) ─────────────────────────────
    if (compact) {
        return (<div ref={ref} className="relative">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-white/[0.06] text-[13px] text-white/50 hover:text-white/80 transition-all">
          {PROVIDER_LOGOS[current.provider]
                ? React.createElement(PROVIDER_LOGOS[current.provider], { size: 11, className: 'text-white/30' })
                : <span className="text-white/30 text-[11px]">{current.providerIcon}</span>}
          <span className="font-medium">{current.name}</span>
          <ChevronDown size={11} className={`text-white/25 transition-transform ${open ? 'rotate-180' : ''}`}/>
        </button>

        {open && <ModelDropdown grouped={grouped} value={value} search={search} onSearch={setSearch} searchRef={searchRef} onSelect={(id) => { onChange(id); setOpen(false); }} alignRight/>}
      </div>);
    }
    // ── Full mode (for header) ──────────────────────────────────────────────
    return (<div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[12px] text-white/60 hover:text-white/90 transition-all">
        {PROVIDER_LOGOS[current.provider]
            ? React.createElement(PROVIDER_LOGOS[current.provider], { size: 11, className: 'text-white/30' })
            : <span className="text-white/30 text-[11px]">{current.providerIcon}</span>}
        <span className="font-medium">{current.name}</span>
        <ChevronDown size={11} className={`text-white/25 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>

      {open && <ModelDropdown grouped={grouped} value={value} search={search} onSearch={setSearch} searchRef={searchRef} onSelect={(id) => { onChange(id); setOpen(false); }}/>}
    </div>);
};
// ── Dropdown panel ───────────────────────────────────────────────────────────
const ModelDropdown = ({ grouped, value, search, onSearch, searchRef, onSelect, alignRight }) => (<div className={`absolute bottom-full ${alignRight ? 'right-0' : 'left-0'} mb-2 w-[340px] bg-[#141210] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50`}>
    {/* Search */}
    <div className="px-3 pt-3 pb-2">
      <input ref={searchRef} value={search} onChange={e => onSearch(e.target.value)} placeholder="Search models…" className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[12px] text-white/80 placeholder-white/20 outline-none focus:border-white/[0.12] transition-colors"/>
    </div>

    {/* Model list */}
    <div className="max-h-[380px] overflow-y-auto scrollbar-thin pb-2">
      {grouped.map(g => (<div key={g.provider}>
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
            {PROVIDER_LOGOS[g.provider]
            ? React.createElement(PROVIDER_LOGOS[g.provider], { size: 11, className: 'text-white/25' })
            : <span className="text-[10px] text-white/25">{g.icon}</span>}
            <span className="text-[10px] font-semibold text-white/25 uppercase tracking-widest">
              {g.provider}
            </span>
          </div>
          {g.models.map(m => (<button key={m.id} onClick={() => m.available && onSelect(m.id)} disabled={!m.available} className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${m.available
                ? m.id === value
                    ? 'bg-white/[0.06]'
                    : 'hover:bg-white/[0.04]'
                : 'opacity-35 cursor-not-allowed'}`}>
              {/* Tier icon */}
              <div className={`flex-shrink-0 ${TIER_COLOR[m.tier]}`}>
                {TIER_ICON[m.tier]}
              </div>

              {/* Name + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-medium ${m.id === value ? 'text-white' : m.available ? 'text-white/75' : 'text-white/30'}`}>
                    {m.name}
                  </span>
                  {m.contextWindow && (<span className="text-[10px] text-white/15 font-mono">{m.contextWindow}</span>)}
                </div>
                <p className="text-[11px] text-white/25 truncate">{m.description}</p>
              </div>

              {/* Cost multiplier badge */}
              <span className={`flex-shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${costColor(m.costMultiplier)}`}>
                {formatCost(m.costMultiplier)}
              </span>

              {/* Selected indicator */}
              {m.id === value && (<Check size={13} className="text-terra-400 flex-shrink-0"/>)}
            </button>))}
        </div>))}

      {grouped.length === 0 && (<p className="text-center text-[12px] text-white/20 py-6">No models found</p>)}
    </div>
  </div>);
