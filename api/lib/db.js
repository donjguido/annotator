import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// ---------------------------------------------------------------------------
// Schema initialization
// ---------------------------------------------------------------------------

export async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email        TEXT UNIQUE NOT NULL,
      name         TEXT,
      avatar_url   TEXT,
      provider     TEXT NOT NULL,
      provider_id  TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT now(),
      UNIQUE (provider, provider_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                      UUID PRIMARY KEY,
      user_id                 UUID REFERENCES users(id),
      stripe_customer_id      TEXT UNIQUE,
      stripe_subscription_id  TEXT UNIQUE,
      status                  TEXT NOT NULL,
      current_period_end      TIMESTAMP,
      plan_id                 TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS credit_packs (
      id                 UUID PRIMARY KEY,
      user_id            UUID REFERENCES users(id),
      credits_remaining  INT NOT NULL,
      purchased_at       TIMESTAMP DEFAULT now(),
      stripe_payment_id  TEXT UNIQUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_usage (
      id         UUID PRIMARY KEY,
      user_id    UUID REFERENCES users(id),
      date       DATE NOT NULL,
      call_count INT DEFAULT 0,
      UNIQUE (user_id, date)
    )
  `;
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export async function findUserByProvider(provider, providerId) {
  const rows = await sql`
    SELECT * FROM users
    WHERE provider = ${provider} AND provider_id = ${providerId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createUser({ email, name, avatarUrl, provider, providerId }) {
  const rows = await sql`
    INSERT INTO users (email, name, avatar_url, provider, provider_id)
    VALUES (${email}, ${name}, ${avatarUrl}, ${provider}, ${providerId})
    ON CONFLICT (provider, provider_id) DO UPDATE
      SET email      = EXCLUDED.email,
          name       = EXCLUDED.name,
          avatar_url = EXCLUDED.avatar_url
    RETURNING *
  `;
  return rows[0];
}

// ---------------------------------------------------------------------------
// Subscription helpers
// ---------------------------------------------------------------------------

export async function getSubscription(userId) {
  const rows = await sql`
    SELECT * FROM subscriptions
    WHERE user_id = ${userId}
      AND status IN ('active', 'trialing')
    ORDER BY current_period_end DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Credit helpers
// ---------------------------------------------------------------------------

export async function getAvailableCredits(userId) {
  const rows = await sql`
    SELECT COALESCE(SUM(credits_remaining), 0) AS total
    FROM credit_packs
    WHERE user_id = ${userId}
  `;
  return parseInt(rows[0]?.total ?? 0, 10);
}

export async function deductCredit(userId) {
  // Deduct from the oldest pack that still has credits remaining.
  const rows = await sql`
    UPDATE credit_packs
    SET credits_remaining = credits_remaining - 1
    WHERE id = (
      SELECT id FROM credit_packs
      WHERE user_id = ${userId} AND credits_remaining > 0
      ORDER BY purchased_at ASC
      LIMIT 1
    )
    RETURNING id
  `;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Daily usage helpers
// ---------------------------------------------------------------------------

export async function getDailyUsage(userId) {
  const rows = await sql`
    SELECT call_count FROM daily_usage
    WHERE user_id = ${userId} AND date = CURRENT_DATE
    LIMIT 1
  `;
  return parseInt(rows[0]?.call_count ?? 0, 10);
}

export async function incrementDailyUsage(userId) {
  await sql`
    INSERT INTO daily_usage (id, user_id, date, call_count)
    VALUES (gen_random_uuid(), ${userId}, CURRENT_DATE, 1)
    ON CONFLICT (user_id, date) DO UPDATE
      SET call_count = daily_usage.call_count + 1
  `;
}
