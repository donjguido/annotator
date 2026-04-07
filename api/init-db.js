import { initSchema } from "./lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = req.headers["x-init-secret"];
  if (secret !== process.env.DB_INIT_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    await initSchema();
    return res.status(200).json({ ok: true, message: "Schema initialized" });
  } catch (err) {
    console.error("Schema init error:", err);
    return res.status(500).json({ error: err.message });
  }
}
