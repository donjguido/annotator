export const SHARED_KEY_PROVIDERS = ["anthropic", "openai", "google"];

const MODEL_CONFIG = {
  anthropic: {
    free: { model: "claude-haiku-4-5-20251001", url: "https://api.anthropic.com/v1/messages" },
    paid: { model: "claude-sonnet-4-6", url: "https://api.anthropic.com/v1/messages" },
  },
  openai: {
    free: { model: "gpt-4o-mini", url: "https://api.openai.com/v1/chat/completions" },
    paid: { model: "gpt-4o", url: "https://api.openai.com/v1/chat/completions" },
  },
  google: {
    free: { model: "gemini-2.0-flash-lite", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models" },
    paid: { model: "gemini-2.5-pro", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models" },
  },
};

export function getModelConfig(provider, tier) {
  const providerConfig = MODEL_CONFIG[provider];
  if (!providerConfig) return null;
  return providerConfig[tier] ?? providerConfig.free;
}

export function getServerApiKey(provider) {
  switch (provider) {
    case "anthropic": return process.env.ANTHROPIC_API_KEY;
    case "openai":    return process.env.OPENAI_API_KEY;
    case "google":    return process.env.GOOGLE_API_KEY;
    default:          return null;
  }
}

export const FREE_DAILY_LIMIT = 20;
