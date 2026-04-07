import { GitHub } from "arctic";
import { setOAuthStateCookie } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const github = new GitHub(
    process.env.GITHUB_CLIENT_ID,
    process.env.GITHUB_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URL + "?provider=github"
  );

  const state = crypto.randomUUID();
  const url = github.createAuthorizationURL(state, ["user:email"]);

  setOAuthStateCookie(res, state);
  res.writeHead(302, { Location: url.toString() });
  res.end();
}
