import { getUserFromRequest } from "./lib/auth.js";
import { checkAndConsumeUsage } from "./lib/usage.js";
import { getModelConfig, getServerApiKey, SHARED_KEY_PROVIDERS } from "./lib/models.js";

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, headers, body, provider, useSharedKey } = req.body;

  // === BYOK mode ===
  if (!useSharedKey) {
    if (!url) return res.status(400).json({ error: "Missing url" });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers || { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  // === Shared-key mode ===
  const userId = await getUserFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Sign in to use shared AI access." });
  }

  if (!provider || !SHARED_KEY_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Shared key not available for provider: ${provider}. Use your own API key.` });
  }

  const usage = await checkAndConsumeUsage(userId);
  if (!usage.allowed) {
    res.setHeader("X-RateLimit-Remaining", "0");
    if (usage.resetAt) res.setHeader("X-RateLimit-Reset", usage.resetAt);
    return res.status(429).json({ error: usage.reason });
  }

  if (usage.remaining !== null) {
    res.setHeader("X-RateLimit-Remaining", String(usage.remaining));
  }

  const modelConfig = getModelConfig(provider, usage.tier);
  const apiKey = getServerApiKey(provider);
  if (!apiKey) {
    return res.status(500).json({ error: `Server API key not configured for ${provider}.` });
  }

  try {
    let proxyUrl, proxyHeaders, proxyBody;

    if (provider === "anthropic") {
      proxyUrl = modelConfig.url;
      proxyHeaders = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      proxyBody = { ...body, model: modelConfig.model };
    } else if (provider === "openai") {
      proxyUrl = modelConfig.url;
      proxyHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      proxyBody = { ...body, model: modelConfig.model };
    } else if (provider === "google") {
      proxyUrl = `${modelConfig.baseUrl}/${modelConfig.model}:generateContent?key=${apiKey}`;
      proxyHeaders = { "Content-Type": "application/json" };
      proxyBody = body;
    }

    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify(proxyBody),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
