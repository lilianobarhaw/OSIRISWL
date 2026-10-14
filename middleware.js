// Avant l'ouverture officielle du projet (samedi 26 décembre 2026, 21 h, heure de Paris), le public ne voit que le décompte :
// toutes les pages du site affichent bientot.html. Les comptes de CASTING_TESTEURS, connectés avec Discord, voient tout.
// Pour se connecter en testeur : le lien « Équipe » en bas du décompte (ou /api/auth/login?retour=accueil).
// Le bouton « Filtre » (filtre.js) permet à un testeur de voir le site comme le public : cookie osiris_vue=public.
// Restent ouverts : les mentions légales (/legal), les images, polices, sons et vidéos, et les adresses /api/…
// À 21 h, le décompte recharge la page et le site apparaît ; /bientot renvoie alors vers l'accueil.
// La page Saison 2 (/saison2) reste réservée aux testeurs jusqu'au mercredi 1er septembre 2027, 20 h :
// les autres visiteurs sont renvoyés vers l'accueil. Après cette date, ce fichier ne fait plus rien (on peut le supprimer).

import { createHmac, timingSafeEqual } from "node:crypto";

export const config = {
  matcher: ["/((?!api/|img/|fonts/|audio/|video/|favicon).*)"],
  runtime: "nodejs",
};

const OUVERTURE = Date.parse("2026-12-26T21:00:00+01:00");
const SAISON2 = Date.parse("2027-09-01T20:00:00+02:00");
const OUVERTS = new Set(["/legal", "/legal.html", "/bientot", "/bientot.html"]);
const PAGES_SAISON2 = new Set(["/saison2", "/saison2.html"]);

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

// Le testeur a choisi « Filtre : public » : il voit le décompte comme tout le monde.
const vuePublique = (request) => /(?:^|;\s*)osiris_vue=public(?:;|$)/.test(request.headers.get("cookie") || "");

export default function middleware(request) {
  const url = new URL(request.url), chemin = url.pathname;
  // La saison 2 : seulement les testeurs (en mode testeur) avant le 1er septembre 2027, 20 h.
  if (PAGES_SAISON2.has(chemin) && Date.now() < SAISON2) {
    if (testeur(request) && !vuePublique(request)) return; // la page s'affiche
    return new Response(null, { status: 302, headers: { Location: new URL("/", request.url).href, "Cache-Control": "private, no-store" } });
  }
  if (Date.now() >= OUVERTURE) {
    if (chemin === "/bientot" || chemin === "/bientot.html") return Response.redirect(new URL("/", request.url), 302);
    return; // le site est ouvert : rien à faire
  }
  if (/\.[a-z0-9]+$/i.test(chemin) && !/\.html$/i.test(chemin)) return; // un fichier (script, style, image…) : il passe
  if (OUVERTS.has(chemin) || (testeur(request) && !vuePublique(request))) return;
  // Une page : on sert le décompte à sa place (l'adresse reste la même dans le navigateur).
  return new Response(null, { headers: { "x-middleware-rewrite": new URL("/bientot", request.url).href, "Cache-Control": "private, no-store" } });
}
