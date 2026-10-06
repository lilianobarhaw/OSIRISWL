// Redirige le candidat vers Discord pour se connecter.
import { env, cookie } from "../../lib/discord.js";

export function GET() {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env("DISCORD_CLIENT_ID"),
    response_type: "code",
    redirect_uri: env("SITE_URL") + "/api/auth/callback",
    scope: "identify guilds.join",
    state,
  });
  const headers = new Headers({ Location: "https://discord.com/oauth2/authorize?" + params });
  headers.append("Set-Cookie", cookie("osiris_state", state, 600));
  return new Response(null, { status: 302, headers });
}
