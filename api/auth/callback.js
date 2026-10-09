// Retour de Discord : récupère le compte, ajoute le candidat au serveur Osiris, ouvre la session.
import { API, env, parseCookies, cookie, makeSession, bot } from "../../lib/discord.js";

function back(query, retour) {
  const page = retour === "archives" ? "/archives" + query : "/casting" + query + "#candidature";
  const headers = new Headers({ Location: env("SITE_URL") + page });
  headers.append("Set-Cookie", cookie("osiris_retour", "", 0));
  return { headers, res: () => new Response(null, { status: 302, headers }) };
}

export async function GET(req) {
  const url = new URL(req.url);
  const retour = parseCookies(req).osiris_retour;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fail = back("?login=erreur", retour);
  fail.headers.append("Set-Cookie", cookie("osiris_state", "", 0));

  if (!code || !state || parseCookies(req).osiris_state !== state) return fail.res();

  const tokenRes = await fetch(API + "/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("DISCORD_CLIENT_ID"),
      client_secret: env("DISCORD_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: env("SITE_URL") + "/api/auth/callback",
    }),
  });
  if (!tokenRes.ok) return fail.res();
  const token = await tokenRes.json();

  const userRes = await fetch(API + "/users/@me", { headers: { Authorization: "Bearer " + token.access_token } });
  if (!userRes.ok) return fail.res();
  const user = await userRes.json();

  // Ajoute le candidat au serveur Osiris s'il n'y est pas déjà (201 = ajouté, 204 = déjà membre).
  const join = await bot(`/guilds/${env("DISCORD_GUILD_ID")}/members/${user.id}`, {
    method: "PUT",
    body: JSON.stringify({ access_token: token.access_token }),
  });

  const ok = back(join.ok ? "" : "?login=serveur", retour);
  ok.headers.append("Set-Cookie", cookie("osiris_state", "", 0));
  ok.headers.append(
    "Set-Cookie",
    cookie("osiris_session", await makeSession({ id: user.id, username: user.username, name: user.global_name || user.username }), 6 * 3600)
  );
  return ok.res();
}
