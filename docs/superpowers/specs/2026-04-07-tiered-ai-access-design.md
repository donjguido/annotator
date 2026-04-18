# Tiered AI Access — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Branch:** ai-calls

## Overview

Add a free/paid tier system so users can access AI features without bringing their own API keys. The app provides a shared API key with usage limits: free users get ~20 calls/day with cheaper models, paid users (subscription or credit packs) get premium models and higher limits. The existing bring-your-own-key mode is fully preserved for users who prefer it.

## Goals

- Let new users try AI features instantly — no API key setup required
- Monetize via Stripe subscriptions and one-time credit packs
- Preserve the current BYOK experience for power users
- Keep all infrastructure on Vercel (Postgres, KV, serverless functions)

## Non-Goals

- Mobile app or native clients
- Team/organization accounts
- Per-model pricing granularity
- Analytics dashboard for usage trends

---

## 1. Authentication

### Flow

Users land on the app unauthenticated (current behavior). A "Sign In" button in the header opens an OAuth flow with Google or GitHub. On success, a session token (JWT) is set via HTTP-only cookie.

### Endpoints

| Route | Purpose |
|-------|---------|
| `/api/auth/github` | Initiate GitHub OAuth |
| `/api/auth/google` | Initiate Google OAuth |
| `/api/auth/callback` | Handle OAuth redirect, create/find user, set session cookie |
| `/api/auth/session` | Return current user info (or null) |
| `/api/auth/logout` | Clear session cookie |

### Key Principles

- Auth is optional. Unauthenticated users get the full current experience (BYOK only).
- OAuth state parameter used for CSRF protection (random token in short-lived cookie, verified on callback).
- JWTs signed with a secret in Vercel env vars. 7-day expiry with refresh on activity.
- HTTP-only, Secure, SameSite=Lax cookies.

---

## 2. Usage Tracking & Rate Limiting

### Rate Limit Check Flow (in `/api/chat`)

1. Authenticate the request (session cookie).
2. Check subscription status — active subscriber gets paid-tier limits.
3. If not subscribed, check credit pack balance — if credits remain, deduct one and allow.
4. If no credits, check daily free usage — if under cap (~20 calls/day), allow and increment.
5. If over cap, return 429 with a message prompting upgrade.

### Caching

Vercel KV (Redis) is the fast layer for rate-limit checks:
- Key: `usage:{user_id}:{YYYY-MM-DD}` — current daily count
- Avoids hitting Postgres on every AI call
- Synced to Postgres periodically or on session end

### Response Headers

Include `X-RateLimit-Remaining` and `X-RateLimit-Reset` so the client can display usage status.

---

## 3. Payments (Stripe)

### Subscription

- One plan to start: "Pro" (monthly recurring)
- Unlocks premium models and higher daily cap

### Credit Packs

- One-time Stripe Checkout sessions (e.g., 100 credits for $X)
- On successful payment, credits added to user's credit pack balance

### Endpoints

| Route | Purpose |
|-------|---------|
| `/api/stripe/checkout` | Create Checkout session (subscription or credit pack), return URL |
| `/api/stripe/portal` | Create Stripe Customer Portal session for subscription management |
| `/api/stripe/webhook` | Receive Stripe events |

### Webhook Events Handled

- `checkout.session.completed` — activate subscription or add credits
- `invoice.paid` — renew subscription period
- `customer.subscription.deleted` — mark subscription inactive

### Security

All webhook requests verified using Stripe's webhook signature (`stripe-signature` header) against the webhook secret.

---

## 4. API Proxy Changes

The current `/api/chat.js` (dumb CORS proxy) becomes the central gatekeeper.

### New Flow

1. Parse the request, check for session cookie.
2. **No session:** Check for a user-provided API key in the request headers. If present, proxy directly (no metering). If absent, return 401.
3. **Session exists:** Run rate limit check (Section 2), select server-side API key based on tier, override model to match allowed tier, proxy the request.

### Server-Side API Keys

Stored as Vercel environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`). Never exposed to the client.

### Model Mapping

| Provider | Free Tier | Paid Tier |
|----------|-----------|-----------|
| Anthropic | claude-haiku-4-5-20251001 | claude-sonnet-4-6 |
| OpenAI | gpt-4o-mini | gpt-4o |
| Google | gemini-2.0-flash-lite | gemini-2.5-pro |

- Ollama and custom endpoints remain client-side only (BYOK, no metering).

---

## 5. Client-Side UI Changes

### Header

- Add a user avatar / "Sign In" button to the right of the header.
- Signed-in state: avatar with dropdown showing usage stats, "Manage Subscription", "Sign Out".

### Settings Panel

- New toggle at top of AI settings: **"Use shared key"** vs **"Use my own key"**.
- "Shared key" mode: API key fields hidden, provider/model dropdowns limited to allowed models for user's tier.
- Usage bar: "12/20 free calls today" or "Pro — 847 calls today".

### Upgrade Prompt

- When a free user hits daily cap, the AI response area shows: "You've used your free calls for today. Upgrade to Pro or buy a credit pack to continue."
- Includes buttons triggering Stripe Checkout.
- Not a hard block — user can switch to BYOK mode.

### First-Time Experience

- Unauthenticated users see a subtle banner: "Sign in for free AI calls — no API key needed".
- On sign-in, auto-switch to shared key mode.

---

## 6. Database Schema

### Vercel Postgres

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  avatar_url      TEXT,
  provider        TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT now(),
  UNIQUE(provider, provider_id)
);

CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES users(id),
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  status                  TEXT NOT NULL,
  current_period_end      TIMESTAMP,
  plan_id                 TEXT
);

CREATE TABLE credit_packs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id),
  credits_remaining   INT NOT NULL,
  purchased_at        TIMESTAMP DEFAULT now(),
  stripe_payment_id   TEXT UNIQUE
);

CREATE TABLE daily_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  date        DATE NOT NULL,
  call_count  INT DEFAULT 0,
  UNIQUE(user_id, date)
);
```

### Vercel KV (Redis)

- `usage:{user_id}:{YYYY-MM-DD}` — int (daily call count)
- `session:{token}` — user_id (optional, for fast session lookups)

---

## 7. Security

- **API key protection:** Provider keys in Vercel env vars only. Client never sees them.
- **Session security:** HTTP-only, Secure, SameSite=Lax cookies. JWTs signed with env var secret. 7-day expiry with refresh.
- **Stripe webhooks:** Verified via `stripe-signature` header.
- **Rate limiting is server-side only.** Client shows usage for UX, but the gate is in `/api/chat`.
- **OAuth CSRF:** State parameter in short-lived cookie, verified on callback.
- **No sensitive data in localStorage.** Auth in cookies. Only a shared-vs-own-key preference flag in localStorage.

---

## 8. Infrastructure Summary

| Component | Purpose |
|-----------|---------|
| Vercel Postgres | Users, subscriptions, credit packs, daily usage |
| Vercel KV | Fast rate-limit cache |
| Stripe | Subscriptions + one-time credit pack payments |
| Vercel Serverless Functions | ~8 new API routes |
| Vercel Environment Variables | API keys, JWT secret, Stripe keys, OAuth secrets |

---

## 9. Scope Summary

- **New API routes:** 4 auth + 3 Stripe + 1 upgraded chat proxy = 8 routes
- **New infrastructure:** Vercel Postgres, Vercel KV, Stripe account
- **Client changes:** Auth UI, settings toggle, usage display, upgrade prompts
- **Preserved:** Entire current BYOK experience for unauthenticated users and users who prefer their own keys
