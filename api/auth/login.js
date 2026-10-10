// Redirige le candidat vers Discord pour se connecter.
// ?sortir=1 : ferme la session et ramène au formulaire du casting (l'ancienne adresse /api/auth/logout renvoie ici).
// ?retour=archives, accueil, canal17 ou mot : où revenir après la connexion (sinon, sur /casting).
// canal17 : retour sur l'accueil, qui dit si le compte a le rôle Canal 17.
import { env, cookie } from "../../lib/discord.js";

export function GET(req) {
  if (new URL(req.url).searchParams.has("sortir")) {
    const headers = new Headers({ Location: env("SITE_URL") + "/casting#candidature" });
    headers.append("Set-Cookie", cookie("osiris_session", "", 0));
    return new Response(null, { status: 302, headers });
  }
  const voulu = new URL(req.url).searchParams.get("retour");
  const retour = ["archives", "accueil", "canal17", "mot"].includes(voulu) ? voulu : "casting";
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
  headers.append("Set-Cookie", cookie("osiris_retour", retour, 600));
  return new Response(null, { status: 302, headers });
}
