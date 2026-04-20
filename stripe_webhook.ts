// Webhook Stripe pour Deno Deploy
// À déployer sur https://dash.deno.com

const STRIPE_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const BASE44_API_KEY = Deno.env.get("BASE44_API_KEY");
const BASE44_APP_ID = Deno.env.get("BASE44_APP_ID");

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  // Vérifier la signature Stripe
  if (!verifyStripeSignature(body, signature!, STRIPE_SECRET!)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(body);

  // Traiter les événements de souscription
  if (event.type === "customer.subscription.created" || 
      event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    await updateUserPremium(subscription.metadata.email, true, subscription.id);
  } else if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    await updateUserPremium(subscription.metadata.email, false, subscription.id);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}

function verifyStripeSignature(body: string, signature: string, secret: string): boolean {
  // Implémentation simple (en prod, utiliser crypto.subtle)
  const crypto = require("crypto");
  const [timestamp, hash] = signature.split(",")[1].split("=")[1].split(".");
  const signed = `${timestamp}.${body}`;
  const computed = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return computed === hash;
}

async function updateUserPremium(email: string, isPremium: boolean, subscriptionId: string) {
  const response = await fetch("https://api.base44.com/v1/entities/User/filter", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${BASE44_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { email },
      app_id: BASE44_APP_ID,
    }),
  });

  const users = await response.json();
  if (!users[0]) return;

  const userId = users[0].id;

  // Mettre à jour l'utilisateur
  await fetch(`https://api.base44.com/v1/entities/User/${userId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${BASE44_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      is_premium: isPremium,
      subscription_id: subscriptionId,
      subscription_status: isPremium ? "active" : "cancelled",
      app_id: BASE44_APP_ID,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.pathname === "/webhooks/stripe") {
    return await handleWebhook(req);
  }
  return new Response("Not found", { status: 404 });
});