import { getUserFromRequest } from "../lib/auth.js";
import { neon } from "@neondatabase/serverless";
import { getUsageInfo } from "../lib/usage.js";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getUserFromRequest(req);
  if (!userId) return res.status(200).json({ user: null });

  const rows = await sql`SELECT id, email, name, avatar_url FROM users WHERE id = ${userId}`;
  const user = rows[0];
  if (!user) return res.status(200).json({ user: null });

  const usage = await getUsageInfo(userId);

  return res.status(200).json({
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url },
    usage,
  });
}
