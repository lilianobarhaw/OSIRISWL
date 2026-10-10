// Le décompte de l'ouverture officielle du projet : samedi 31 octobre 2026, 21 h (heure de Paris).
// Ce soir-là s'ouvrent le Discord, le site et la première cinématique (le teaser).
//
// 1. Le salon du décompte (DISCORD_DECOMPTE_SALON_ID) : un salon vocal fermé, en haut du serveur. Le bot le renomme
//    « ⏳ Ouverture du projet · J-21 », puis J-20… ; le jour même « ⏳ Ouverture du projet · ce soir 21 h » ;
//    après 21 h, « 👁 Osiris est ouvert ».
//    Il le renomme chaque nuit (cron de vercel.json, entre 3 h et 4 h), vers 21 h (cron du soir), et à chaque /decompte.
//    Une semaine après l'ouverture, il n'y touche plus : le salon peut être supprimé.
// 2. /decompte (fondateurs et admins) : publie l'annonce de l'ouverture, avec un compte à rebours que Discord
//    met à jour tout seul (« dans 21 jours », puis « dans 3 heures »…), à l'heure de chacun.
// À 21 h, le bot ne publie rien : l'annonce de l'ouverture est faite à la main.

import { bot, optEnv } from "./discord.js";
import { logEvent } from "./logs.js";

export const OUVERTURE = "2026-10-31T21:00:00+01:00";
const T = Date.parse(OUVERTURE);
const COULEUR = 0xc4a265;
const site = () => optEnv("SITE_URL") || "https://osiriswl.vercel.app";

// Le jour à Paris (AAAA-MM-JJ).
const jourParis = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(t));
const ecartJours = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

export function nomDuSalon(t = Date.now()) {
  if (t >= T) return "👁 Osiris est ouvert";
  const j = ecartJours(jourParis(t), jourParis(T));
  return j <= 0 ? "⏳ Ouverture du projet · ce soir 21 h" : `⏳ Ouverture du projet · J-${j}`;
}

let dernier = { id: "", nom: "" }; // ce que cette instance a déjà mis : pas d'appel à Discord pour rien
export async function majSalon(t = Date.now()) {
  const id = optEnv("DISCORD_DECOMPTE_SALON_ID");
  if (!id) return { salon: false, raison: "DISCORD_DECOMPTE_SALON_ID manquant" };
  if (t > T + 7 * 864e5) return { salon: true, raison: "ouverture passée depuis une semaine : le salon n'est plus renommé" };
  const voulu = nomDuSalon(t);
  if (dernier.id === id && dernier.nom === voulu) return { salon: true, nom: voulu, change: false };
  const r = await bot(`/channels/${id}`);
  if (!r.ok) return { salon: true, erreur: `salon introuvable ou invisible pour le bot (code ${r.status})` };
  const actuel = (await r.json()).name;
  if (actuel !== voulu) {
    // Discord limite à 2 renommages toutes les 10 minutes par salon : ici, c'est au plus une fois par jour.
    const p = await bot(`/channels/${id}`, { method: "PATCH", headers: { "X-Audit-Log-Reason": encodeURIComponent("Décompte de l'ouverture") }, body: JSON.stringify({ name: voulu }) });
    if (!p.ok) return { salon: true, erreur: `le bot n'a pas pu renommer le salon (code ${p.status}) : il lui faut la permission Gérer les salons` };
  }
  dernier = { id, nom: voulu };
  return { salon: true, nom: voulu, change: actuel !== voulu };
}

export function annonce(ping) {
  const ts = Math.floor(T / 1000), url = site();
  return {
    ...(ping ? { content: "@everyone" } : {}),
    allowed_mentions: { parse: ping ? ["everyone"] : [] },
    embeds: [{
      author: { name: "OSIRIS" },
      title: "Ouverture officielle du projet",
      description: [
        "Le **samedi 31 octobre à 21 h**, ouverture officielle du projet Osiris : le Discord, le site et la première cinématique.",
        "",
        `⏳ Ouverture **<t:${ts}:R>**`,
        `📅 <t:${ts}:F>`,
        "",
        `[${url.replace(/^https?:\/\//, "")}](${url})`,
      ].join("\n"),
      color: COULEUR,
      footer: { text: "Tous les regards sont enregistrés." },
    }],
  };
}

// /decompte : l'annonce dans le salon choisi, puis le salon du décompte renommé tout de suite.
export async function publier({ salon, ping, user }) {
  if (Date.now() >= T) return "L'ouverture est passée : il n'y a plus rien à décompter.";
  const r = await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify(annonce(ping)) });
  if (!r.ok) return `Impossible de publier dans <#${salon}> (code ${r.status}) : le bot doit pouvoir y voir, écrire et intégrer des liens.`;
  await logEvent({ title: "Décompte publié", description: `<@${user.id}> a publié l'annonce de l'ouverture du projet dans <#${salon}>${ping ? " (avec @everyone)" : ""}`, user }).catch(() => {});
  const s = await majSalon().catch((e) => ({ erreur: e.message }));
  const suite = !s.salon ? "\nPour le salon qui affiche « ⏳ Ouverture du projet · J-21 », ajoute `DISCORD_DECOMPTE_SALON_ID` sur Vercel."
    : s.erreur ? `\nLe salon du décompte n'a pas pu être renommé : ${s.erreur}.`
    : `\nLe salon du décompte s'appelle maintenant « ${s.nom} ».`;
  return `Annonce publiée dans <#${salon}>.` + suite;
}
