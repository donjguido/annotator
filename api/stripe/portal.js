import Stripe from "stripe";
import { getUserFromRequest } from "../lib/auth.js";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getUserFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const rows = await sql`SELECT stripe_customer_id FROM subscriptions WHERE user_id = ${userId} LIMIT 1`;
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return res.status(404).json({ error: "No subscription found" });

  const origin = req.headers.origin || process.env.APP_URL;
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: origin });
  return res.status(200).json({ url: session.url });
}
