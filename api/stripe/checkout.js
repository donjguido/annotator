import Stripe from "stripe";
import { getUserFromRequest } from "../lib/auth.js";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = await getUserFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { type } = req.body; // "subscription" or "credits"

  const users = await sql`SELECT email FROM users WHERE id = ${userId}`;
  const user = users[0];
  if (!user) return res.status(404).json({ error: "User not found" });

  const subs = await sql`SELECT stripe_customer_id FROM subscriptions WHERE user_id = ${userId} LIMIT 1`;
  let customerId = subs[0]?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: userId } });
    customerId = customer.id;
  }

  const origin = req.headers.origin || process.env.APP_URL;

  let sessionConfig;
  if (type === "subscription") {
    sessionConfig = {
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      metadata: { user_id: userId },
    };
  } else if (type === "credits") {
    sessionConfig = {
      customer: customerId,
      mode: "payment",
      line_items: [{ price: process.env.STRIPE_CREDITS_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      metadata: { user_id: userId, type: "credits" },
    };
  } else {
    return res.status(400).json({ error: "Invalid checkout type. Use 'subscription' or 'credits'." });
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return res.status(200).json({ url: session.url });
}
