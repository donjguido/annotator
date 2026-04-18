import { GitHub, Google } from "arctic";
import { createUser } from "../lib/db.js";
import { createSessionToken, setSessionCookie, getOAuthStateCookie } from "../lib/auth.js";

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

async function handleGitHub(code) {
  const github = new GitHub(
    process.env.GITHUB_CLIENT_ID,
    process.env.GITHUB_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URL + "?provider=github"
  );
  const tokens = await github.validateAuthorizationCode(code);
  const accessToken = tokens.accessToken();
  const [userRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "annotator" },
    }),
    fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "annotator" },
    }),
  ]);
  const userData = await userRes.json();
  const emails = await emailsRes.json();
  const primaryEmail = emails.find((e) => e.primary)?.email || emails[0]?.email || `${userData.id}@github.noreply`;
  return {
    email: primaryEmail,
    name: userData.name || userData.login,
    avatarUrl: userData.avatar_url,
    provider: "github",
    providerId: String(userData.id),
  };
}

async function handleGoogle(code, codeVerifier) {
  const google = new Google(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URL + "?provider=google"
  );
  const tokens = await google.validateAuthorizationCode(code, codeVerifier);
  const accessToken = tokens.accessToken();
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return {
    email: data.email,
    name: data.name,
    avatarUrl: data.picture,
    provider: "google",
    providerId: String(data.id),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { code, state, provider } = req.query;
  const storedState = getOAuthStateCookie(req);

  if (!code || !state || !storedState || state !== storedState) {
    return res.status(400).json({ error: "Invalid OAuth state" });
  }

  try {
    let profile;
    if (provider === "github") {
      profile = await handleGitHub(code);
    } else if (provider === "google") {
      const codeVerifier = getCookie(req, "oauth_verifier");
      if (!codeVerifier) return res.status(400).json({ error: "Missing OAuth verifier" });
      profile = await handleGoogle(code, codeVerifier);
    } else {
      return res.status(400).json({ error: "Unknown provider" });
    }

    const user = await createUser(profile);
    const token = await createSessionToken(user.id);
    setSessionCookie(res, token);
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.writeHead(302, { Location: "/?auth_error=1" });
    res.end();
  }
}
