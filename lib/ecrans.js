// Les écrans : qui est en direct sur Twitch parmi les streamers du Programme.
//   GET /api/rangs?ecrans=1&c=chaine1,chaine2,…   (la liste vient de la page d'accueil, bloc « À REMPLIR »)
// Servi par api/rangs.js : le site reste sous la limite de 12 fonctions de l'offre gratuite de Vercel.
// Twitch est interrogé depuis le serveur : le navigateur du visiteur ne contacte pas Twitch.
// La réponse est gardée 60 secondes par Vercel, donc Twitch n'est appelé qu'une fois par minute au plus.
// Sans TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET, la page fonctionne quand même, sans l'état des directs.

import { json, optEnv } from "./discord.js";

let jeton = "", expire = 0, enCours = null;

// Un seul jeton demandé à la fois, même si plusieurs requêtes partent en même temps
function token(id, secret) {
  if (jeton && Date.now() < expire - 60_000) return Promise.resolve(jeton);
  return (enCours ||= nouveauJeton(id, secret).finally(() => { enCours = null; }));
}

async function nouveauJeton(id, secret) {
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`Twitch a refusé les identifiants (code ${r.status})`);
  const d = await r.json();
  jeton = d.access_token;
  expire = Date.now() + (d.expires_in || 3600) * 1000;
  return jeton;
}

async function helix(chemin, id, secret) {
  for (let essai = 0; essai < 2; essai++) {
    const r = await fetch("https://api.twitch.tv/helix/" + chemin, { headers: { "Client-Id": id, Authorization: "Bearer " + (await token(id, secret)) } });
    if (r.status === 401 && essai === 0) { jeton = ""; continue; } // jeton expiré : on en redemande un
    if (!r.ok) throw new Error(`Twitch a répondu ${r.status} à ${chemin.split("?")[0]}`);
    return (await r.json()).data || [];
  }
  return [];
}

export async function ecransGET(req) {
  const url = new URL(req.url);
  const chaines = [...new Set((url.searchParams.get("c") || "").toLowerCase().split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9_]{3,25}$/.test(s)))].slice(0, 30);
  const id = optEnv("TWITCH_CLIENT_ID"), secret = optEnv("TWITCH_CLIENT_SECRET");
  const cache = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };
  if (!id || !secret || !chaines.length) return json({ ok: true, configure: !!(id && secret), live: {}, noms: {} }, 200, cache);
  try {
    const [streams, users] = await Promise.all([
      helix("streams?first=100&" + chaines.map((c) => "user_login=" + c).join("&"), id, secret),
      helix("users?" + chaines.map((c) => "login=" + c).join("&"), id, secret).catch(() => []),
    ]);
    const live = {}, noms = {};
    for (const s of streams) if (s.type === "live" || !s.type) live[s.user_login] = { titre: s.title, jeu: s.game_name, spectateurs: s.viewer_count, depuis: s.started_at };
    for (const u of users) noms[u.login] = u.display_name;
    return json({ ok: true, configure: true, live, noms, maj: new Date().toISOString() }, 200, cache);
  } catch (e) {
    return json({ ok: false, configure: true, erreur: e.message, live: {}, noms: {} }, 200, { "Cache-Control": "public, s-maxage=20" });
  }
}
