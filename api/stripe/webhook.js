import Stripe from "stripe";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata.user_id;
      if (session.mode === "subscription") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await sql`
          INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, plan_id)
          VALUES (gen_random_uuid(), ${userId}, ${session.customer}, ${session.subscription}, 'active',
                  ${new Date(subscription.current_period_end * 1000).toISOString()}, 'pro')
          ON CONFLICT (stripe_subscription_id) DO UPDATE SET
            status = 'active',
            current_period_end = ${new Date(subscription.current_period_end * 1000).toISOString()}
        `;
      } else if (session.metadata.type === "credits") {
        const creditsAmount = parseInt(process.env.CREDITS_PACK_AMOUNT || "100", 10);
        await sql`
          INSERT INTO credit_packs (id, user_id, credits_remaining, stripe_payment_id)
          VALUES (gen_random_uuid(), ${userId}, ${creditsAmount}, ${session.payment_intent})
        `;
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        await sql`
          UPDATE subscriptions SET
            status = 'active',
            current_period_end = ${new Date(subscription.current_period_end * 1000).toISOString()}
          WHERE stripe_subscription_id = ${invoice.subscription}
        `;
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await sql`UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = ${subscription.id}`;
      break;
    }
  }

  return res.status(200).json({ received: true });
}
