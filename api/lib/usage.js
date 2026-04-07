import { Redis } from "@upstash/redis";
import {
  getSubscription,
  getAvailableCredits,
  deductCredit,
  incrementDailyUsage,
} from "./db.js";
import { FREE_DAILY_LIMIT } from "./models.js";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function todayKey(userId) {
  const d = new Date().toISOString().slice(0, 10);
  return `usage:${userId}:${d}`;
}

function endOfDaySeconds() {
  const now = new Date();
  const eod = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((eod - now) / 1000);
}

// Returns { allowed, tier, remaining, resetAt, reason }
export async function checkAndConsumeUsage(userId) {
  // 1. Active subscription — allow, track, return paid tier
  const sub = await getSubscription(userId);
  if (sub) {
    const key = todayKey(userId);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, endOfDaySeconds());
    incrementDailyUsage(userId).catch(() => {});
    return { allowed: true, tier: "paid", remaining: null, resetAt: null };
  }

  // 2. Credit pack — deduct one, allow
  const credits = await getAvailableCredits(userId);
  if (credits > 0) {
    await deductCredit(userId);
    return { allowed: true, tier: "paid", remaining: credits - 1, resetAt: null };
  }

  // 3. Free daily limit
  const key = todayKey(userId);
  const currentCount = (await redis.get(key)) ?? 0;

  if (currentCount >= FREE_DAILY_LIMIT) {
    const resetAt = new Date();
    resetAt.setUTCHours(24, 0, 0, 0);
    return {
      allowed: false,
      tier: "free",
      remaining: 0,
      resetAt: resetAt.toISOString(),
      reason: "Daily free limit reached. Upgrade to Pro or buy a credit pack to continue.",
    };
  }

  const newCount = await redis.incr(key);
  if (newCount === 1) await redis.expire(key, endOfDaySeconds());
  incrementDailyUsage(userId).catch(() => {});

  return {
    allowed: true,
    tier: "free",
    remaining: FREE_DAILY_LIMIT - newCount,
    resetAt: null,
  };
}

// Read-only: get usage info without consuming a call
export async function getUsageInfo(userId) {
  const [sub, credits] = await Promise.all([
    getSubscription(userId),
    getAvailableCredits(userId),
  ]);
  const key = todayKey(userId);
  const dailyUsed = (await redis.get(key)) ?? 0;

  return {
    tier: sub ? "paid" : "free",
    subscriptionStatus: sub?.status ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    credits,
    dailyUsed: Number(dailyUsed),
    dailyLimit: sub ? null : FREE_DAILY_LIMIT,
    dailyRemaining: sub ? null : Math.max(0, FREE_DAILY_LIMIT - Number(dailyUsed)),
  };
}
