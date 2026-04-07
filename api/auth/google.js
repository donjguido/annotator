import { Google } from "arctic";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const google = new Google(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URL + "?provider=google"
  );

  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secure}`,
    `oauth_verifier=${codeVerifier}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secure}`,
  ]);

  res.writeHead(302, { Location: url.toString() });
  res.end();
}
