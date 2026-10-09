// Les Archives d'Osiris (page /archives) : une enquête tous les 15 jours, des pièces à fouiller, un mot de passe.
//   GET  /api/archives                     → la liste des dossiers (le contenu seulement s'ils sont ouverts)
//   GET  /api/archives?d=01&ref=REG-2930   → l'image d'une pièce (si le dossier est ouvert et la référence existe)
//   POST /api/archives {action:"consulter", d, ref}      → ouvre une pièce cachée à partir de sa référence
//   POST /api/archives {action:"repondre", d, reponse}   → vérifie le mot de passe (connexion Discord obligatoire)
// Bonne réponse : rôle « Enquêteur » (DISCORD_ENQUETEUR_ROLE_ID), une ligne dans le registre privé
// (DISCORD_ARCHIVES_REGISTRE_ID), et pour les 3 premiers, une annonce sur Discord (DISCORD_ARCHIVES_ANNONCE_ID).
// Les comptes de CASTING_TESTEURS voient les dossiers avant leur date, en mode test : rien n'est noté, et un aperçu
// de l'annonce part dans le salon privé du registre.
// Le canal 17 (rôle DISCORD_CANAL17_ROLE_ID) voit chaque dossier 17 minutes avant tout le monde, pour de vrai.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { json, readSession, bot, optEnv, sleep } from "../lib/discord.js";
import { DOSSIERS } from "./_archives/_dossiers.js";
import { estMembre, AVANCE_MS } from "../lib/canal17.js";

const COULEUR = 0xc4a265;
const MEDAILLES = ["🥇", "🥈", "🥉"];
const PLACES = ["le premier", "le deuxième", "le troisième"];

const normaliser = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const empreinte = (s) => createHash("sha256").update("osiris-archives:" + normaliser(s)).digest("hex");
const ouverture = (d, c17) => Date.parse(d.ouverture) - (c17 ? AVANCE_MS : 0); // l'heure d'ouverture de ce visiteur
const ouvert = (d, c17) => Date.now() >= ouverture(d, c17);
const pret = (d) => !!(d.titre && d.pieces?.length && d.reponses?.length);
const testeur = (user) => !!user && optEnv("CASTING_TESTEURS").split(/[\s,;]+/).includes(String(user.id));
const visible = (d, user, c17) => pret(d) && (ouvert(d, c17) || testeur(user));
const canal17 = async (user) => (user ? estMembre(optEnv("DISCORD_GUILD_ID"), user.id) : false);
const urlPiece = (d, p) => `/api/archives?d=${d.num}&ref=${encodeURIComponent(p.ref)}`;
const trouver = (num) => DOSSIERS.find((d) => d.num === String(num || "").padStart(2, "0"));

// Le fragment de lore débloqué par un dossier.
const fragment = (d) => (d.recompense ? { titre: d.recompense.titre, texte: d.recompense.texte, url: `/api/archives?d=${d.num}&fragment=1` } : undefined);

// L'annonce Discord d'un podium (rang 1, 2 ou 3).
function carteAnnonce(d, user, rang) {
  return {
    author: { name: "OSIRIS · LES ARCHIVES" },
    title: `Dossier ${d.num} · ${d.titre}`,
    url: (optEnv("SITE_URL") || "https://osiriswl.vercel.app") + "/archives",
    description: `${MEDAILLES[rang - 1]} <@${user.id}> est ${PLACES[rang - 1]} à résoudre l'enquête.${rang === 3 ? "\n\nLe podium est complet. Le dossier reste ouvert à tous." : ""}`,
    color: COULEUR,
  };
}

async function session(req) { try { return await readSession(req); } catch { return null; } }

// ---------- Le registre : un salon privé où le bot note chaque dossier résolu ----------
// Lu au plus une fois par minute (mémoire de l'instance), pour ne pas solliciter Discord à chaque visite.
let cache = { at: 0, lignes: [] };

async function lireRegistre(force) {
  const salon = optEnv("DISCORD_ARCHIVES_REGISTRE_ID");
  if (!salon) return [];
  if (!force && Date.now() - cache.at < 60_000) return cache.lignes;
  const lignes = [];
  let avant = "";
  for (let page = 0; page < 10; page++) {
    const r = await bot(`/channels/${salon}/messages?limit=100${avant ? "&before=" + avant : ""}`);
    if (!r.ok) break;
    const lot = await r.json();
    for (const m of lot) {
      const x = /dossier (\d+) · <@(\d+)>/.exec(m.content || "");
      if (x) lignes.push({ num: x[1], id: x[2], msg: m.id });
    }
    if (lot.length < 100) break;
    avant = lot.at(-1).id;
  }
  lignes.sort((a, b) => (BigInt(a.msg) < BigInt(b.msg) ? -1 : 1)); // ordre d'arrivée
  cache = { at: Date.now(), lignes };
  return lignes;
}

// Les enquêteurs d'un dossier, dans l'ordre (une personne ne compte qu'une fois).
function enqueteurs(lignes, num) {
  const vus = [];
  for (const l of lignes) if (l.num === num && !vus.includes(l.id)) vus.push(l.id);
  return vus;
}

// ---------- Lecture ----------

export async function GET(req) {
  const url = new URL(req.url);
  const user = await session(req);
  const c17 = await canal17(user);

  // Le fragment de lore d'un dossier : seulement pour ceux qui l'ont résolu (et les testeurs)
  if (url.searchParams.get("fragment")) {
    const d = trouver(url.searchParams.get("d"));
    let ok = false;
    if (d?.recompense && user) {
      if (testeur(user)) ok = true;
      else { try { ok = enqueteurs(await lireRegistre(false), d.num).includes(user.id) || enqueteurs(await lireRegistre(true), d.num).includes(user.id); } catch {} }
    }
    if (!ok) return new Response("Fragment scellé", { status: 403 });
    try {
      const data = await readFile(new URL(`./_archives/pieces/${d.recompense.fichier}`, import.meta.url));
      return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=600" } });
    } catch { return new Response("Fragment introuvable", { status: 404 }); }
  }

  // Une pièce (image)
  if (url.searchParams.get("ref")) {
    const d = trouver(url.searchParams.get("d"));
    const ref = String(url.searchParams.get("ref")).toUpperCase().trim();
    const p = d && visible(d, user, c17) && d.pieces.find((x) => x.ref === ref);
    if (!p) return new Response("Pièce introuvable", { status: 404 });
    try {
      const data = await readFile(new URL(`./_archives/pieces/${p.fichier}`, import.meta.url));
      return new Response(data, { headers: { "Content-Type": p.fichier.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=600" } });
    } catch {
      return new Response("Pièce introuvable", { status: 404 });
    }
  }

  let lignes = [];
  try { lignes = await lireRegistre(false); } catch {}
  const dossiers = DOSSIERS.map((d) => {
    const base = { num: d.num, ouverture: new Date(ouverture(d, c17)).toISOString(), ouvert: ouvert(d, c17) };
    // Les 17 dernières minutes avant l'ouverture, les autres voient que le canal 17 est déjà dedans.
    const dedans = pret(d) && !c17 && Date.now() >= ouverture(d, true) && !ouvert(d, false);
    if (!visible(d, user, c17)) return { ...base, pret: false, titre: null, canal17Dedans: dedans || undefined }; // ouvert mais pas prêt = « en préparation »
    const qui = enqueteurs(lignes, d.num);
    return {
      ...base,
      pret: true,
      test: !ouvert(d, c17),
      titre: d.titre,
      intro: d.intro,
      pieces: d.pieces.filter((p) => p.visible).map((p) => ({ ref: p.ref, titre: p.titre, url: urlPiece(d, p) })),
      resolus: qui.length,
      resolu: !!user && qui.includes(user.id),
      fin: user && qui.includes(user.id) ? d.fin : undefined,
      recompense: user && qui.includes(user.id) ? fragment(d) : undefined,
    };
  });
  return json({
    maintenant: new Date().toISOString(),
    connecte: user ? { name: user.name || user.username } : null,
    testeur: testeur(user),
    canal17: c17,
    dossiers,
  }, 200, { "Cache-Control": "no-store" });
}

// ---------- Actions ----------

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return json({ erreur: "Requête invalide." }, 400); }
  const user = await session(req);
  const c17 = await canal17(user);
  const d = trouver(b.d);
  if (!d || !visible(d, user, c17)) return json({ erreur: "Ce dossier est encore scellé." }, 403);

  // Consulter une référence trouvée dans une pièce
  if (b.action === "consulter") {
    const ref = String(b.ref || "").toUpperCase().replace(/\s+/g, "").slice(0, 20);
    const p = d.pieces.find((x) => x.ref.replace(/\s+/g, "") === ref);
    if (!p) { await sleep(400); return json({ erreur: "Aucune pièce à cette référence." }, 404); }
    return json({ ok: true, piece: { ref: p.ref, titre: p.titre, url: urlPiece(d, p) } });
  }

  if (b.action !== "repondre") return json({ erreur: "Action inconnue." }, 400);
  if (!user) return json({ erreur: "Connecte-toi avec Discord pour valider ta réponse.", connexion: true }, 401);

  const essai = String(b.reponse || "").slice(0, 80);
  if (!normaliser(essai) || !d.reponses.includes(empreinte(essai))) {
    await sleep(1200); // ralentit ceux qui essaient tous les mots
    return json({ ok: false, erreur: "Ce n'est pas le bon mot de passe." });
  }

  // Mode test (comptes de CASTING_TESTEURS avant l'ouverture) : rien n'est noté, pas de rôle, pas d'annonce publique.
  // Un aperçu de l'annonce part dans le salon privé du registre, pour voir à quoi elle ressemblera.
  if (!ouvert(d, c17)) {
    const prive = optEnv("DISCORD_ARCHIVES_REGISTRE_ID") || optEnv("DISCORD_LOGS_CHANNEL_ID");
    let apercu = false;
    if (prive) {
      const r = await bot(`/channels/${prive}/messages`, {
        method: "POST",
        body: JSON.stringify({
          allowed_mentions: { parse: [] },
          embeds: [{ ...carteAnnonce(d, user, 1), footer: { text: "🧪 Aperçu de test · rien n'est noté · la vraie annonce partira dans le salon des annonces" } }],
        }),
      }).catch(() => null);
      apercu = !!r?.ok;
    }
    return json({ ok: true, test: true, apercu, rang: 0, fin: d.fin, recompense: fragment(d) });
  }

  const guild = optEnv("DISCORD_GUILD_ID");
  const role = optEnv("DISCORD_ENQUETEUR_ROLE_ID");
  if (role && guild) {
    await bot(`/guilds/${guild}/members/${user.id}/roles/${role}`, { method: "PUT", headers: { "X-Audit-Log-Reason": encodeURIComponent(`Archives : dossier ${d.num} résolu`) } }).catch(() => {});
  }

  // Le registre décide du rang (ordre d'arrivée des messages).
  const registre = optEnv("DISCORD_ARCHIVES_REGISTRE_ID");
  let rang = 0, total = 0;
  if (registre) {
    let lignes = await lireRegistre(true);
    if (!enqueteurs(lignes, d.num).includes(user.id)) {
      await bot(`/channels/${registre}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: `🗂 dossier ${d.num} · <@${user.id}> · ${user.username}`, allowed_mentions: { parse: [] } }),
      });
      lignes = await lireRegistre(true);
      const qui = enqueteurs(lignes, d.num);
      rang = qui.indexOf(user.id) + 1;
      total = qui.length;
      const annonce = optEnv("DISCORD_ARCHIVES_ANNONCE_ID");
      if (annonce && rang >= 1 && rang <= 3) {
        await bot(`/channels/${annonce}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `<@${user.id}>`,
            allowed_mentions: { users: [user.id] },
            embeds: [carteAnnonce(d, user, rang)],
          }),
        }).catch(() => {});
      }
    } else {
      const qui = enqueteurs(lignes, d.num);
      rang = qui.indexOf(user.id) + 1;
      total = qui.length;
    }
  }
  return json({ ok: true, rang, total, fin: d.fin, recompense: fragment(d) });
}
