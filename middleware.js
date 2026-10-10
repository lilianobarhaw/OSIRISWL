// Avant l'ouverture officielle du projet (samedi 31 octobre 2026, 21 h, heure de Paris), le public ne voit que le décompte :
// toutes les pages du site affichent bientot.html. Les comptes de CASTING_TESTEURS, connectés avec Discord, voient tout.
// Pour se connecter en testeur : le lien « Équipe » en bas du décompte (ou /api/auth/login?retour=accueil).
// Restent ouverts : les mentions légales (/legal), les images, polices, sons et vidéos, et les adresses /api/…
// À 21 h, le décompte recharge la page et le site apparaît. Après l'ouverture, ce fichier ne fait plus rien
// (on peut le supprimer) ; /bientot renvoie alors vers l'accueil.

import { createHmac, timingSafeEqual } from "node:crypto";

export const config = {
  matcher: ["/((?!api/|img/|fonts/|audio/|video/|favicon).*)"],
  runtime: "nodejs",
};

const OUVERTURE = Date.parse("2026-10-31T21:00:00+01:00");
const OUVERTS = new Set(["/legal", "/legal.html", "/bientot", "/bientot.html"]);

// Même session que le reste du site (lib/discord.js) : charge.signature, signée avec SESSION_SECRET, valable 6 heures.
function testeur(request) {
  try {
    const brut = (request.headers.get("cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith("osiris_session="));
    if (!brut) return false;
    const [charge, sig] = decodeURIComponent(brut.slice("osiris_session=".length)).split(".");
    const secret = (process.env.SESSION_SECRET || "").trim();
    if (!charge || !sig || !secret) return false;
    const attendu = Buffer.from(createHmac("sha256", secret).update(charge).digest("base64url")), recu = Buffer.from(sig);
    if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return false;
    const user = JSON.parse(Buffer.from(charge, "base64url").toString());
    if (!(user.exp > Date.now())) return false;
    return (process.env.CASTING_TESTEURS || "").split(/[\s,;]+/).includes(String(user.id));
  } catch {
    return false;
  }
}

export default function middleware(request) {
  const url = new URL(request.url), chemin = url.pathname;
  if (Date.now() >= OUVERTURE) {
    if (chemin === "/bientot" || chemin === "/bientot.html") return Response.redirect(new URL("/", request.url), 302);
    return; // le site est ouvert : rien à faire
  }
  if (/\.[a-z0-9]+$/i.test(chemin) && !/\.html$/i.test(chemin)) return; // un fichier (script, style, image…) : il passe
  if (OUVERTS.has(chemin) || testeur(request)) return;
  // Une page : on sert le décompte à sa place (l'adresse reste la même dans le navigateur).
  return new Response(null, { headers: { "x-middleware-rewrite": new URL("/bientot", request.url).href, "Cache-Control": "private, no-store" } });
}
