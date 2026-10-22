// La Sélection : la cérémonie de l'annonce des 35 (samedi 24 avril 2027, 21 h), en direct.
//
// 1. Avant : /selection preparer → coller la liste des retenus, dans l'ordre de l'annonce
//    (une ligne par personne : « pseudo Discord ; catégorie ; nom du personnage », le personnage est facultatif).
// 2. Pendant : /selection regie → un panneau avec le bouton « Nom suivant » dans un salon staff.
//    Chaque clic : le nom apparaît à l'écran (page /selection dans OBS), il est publié dans #la-sélection
//    avec la photo de profil, et la personne reçoit le rôle Candidat (les rôles de Mécène lui sont retirés).
// 3. À la fin : « Introduction en Bourse » → les retenus sont cotés au même prix de départ, les Mécènes peuvent miser.
// Mode test (/selection preparer test:oui) : pas de rôles, publications dans le salon de la régie.

import { bot, json, optEnv, isDirection, keepAlive, editOriginal } from "./discord.js";
import { redis, objet, verrou, liberer, baseConfiguree } from "./redis.js";
import { introduireEnBourse, PRIX_DEPART } from "./cote.js";

const P = "osiris:selection:";
const K = { liste: P + "liste", etat: P + "etat" };
const EPHEMERAL = 64;
const OR = 0xc4a265;
const PROG = () => String(optEnv("COTE_PROGRAMME") || "01").padStart(2, "0");
const reponse = (content, extra = {}) => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });

export const numeroDe = (id) => String(100 + Number(BigInt(id) % 900n)); // le même numéro que /casting
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function avatarDe(m, guild) {
  const u = m.user || {};
  if (m.avatar) return `https://cdn.discordapp.com/guilds/${guild}/users/${u.id}/avatars/${m.avatar}.png?size=256`;
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
}

async function lire() {
  const [liste, etat] = await Promise.all([redis("GET", K.liste), redis("HGETALL", K.etat).then(objet)]);
  return { liste: liste ? JSON.parse(liste) : [], etat };
}

// ---------- /selection ----------

export const COMMANDE = {
  name: "selection",
  description: "La Sélection : la cérémonie de l'annonce des retenus (régie)",
  options: [
    { type: 1, name: "preparer", description: "Coller la liste des retenus, dans l'ordre de l'annonce", options: [
      { type: 5, name: "test", description: "Répétition : pas de rôles donnés, publications dans le salon de la régie", required: false },
    ] },
    { type: 1, name: "regie", description: "Publier ici le panneau de la régie (bouton « Nom suivant »)" },
    { type: 1, name: "remise-a-zero", description: "Après une répétition : tout recommencer (la liste est gardée)", options: [
      { type: 3, name: "confirmer", description: "Taper EFFACER pour confirmer", required: true, max_length: 20 },
    ] },
  ],
};

export async function commande(i) {
  const sous = i.data.options?.[0] || {};
  const opt = (k) => (sous.options || []).find((o) => o.name === k)?.value;
  if (!baseConfiguree()) return { reponse: reponse("La base n'est pas branchée : Vercel → Storage → Upstash Redis, puis redéployer (voir le README).") };

  if (sous.name === "preparer") {
    const { liste, etat } = await lire();
    if (Number(etat.index || 0) > 0 && etat.test !== "1") return { reponse: reponse("La cérémonie a déjà commencé : la liste ne peut plus changer.") };
    const valeur = liste.map((p) => [p.saisie || p.pseudo, p.categorie, p.personnage].filter((x, k) => k < 2 || x).join(" ; ")).join("\n");
    return { reponse: json({ type: 9, data: { custom_id: `selection_liste:${opt("test") ? 1 : 0}`, title: "La Sélection · les retenus", components: [{ type: 1, components: [{
      type: 4, custom_id: "liste", label: "pseudo ; catégorie ; personnage (facultatif)", style: 2, required: true, max_length: 4000,
      placeholder: "liliano ; Les héritiers ; Thomas Hale\nmoode ; Le bureau du shérif\n…", ...(valeur ? { value: valeur.slice(0, 4000) } : {}),
    }] }] } }) };
  }

  if (sous.name === "regie") {
    const { liste, etat } = await lire();
    if (!liste.length) return { reponse: reponse("Aucune liste : /selection preparer d'abord.") };
    return { travail: bot(`/channels/${i.channel_id}/messages`, { method: "POST", body: JSON.stringify(panneau(liste, etat)) })
      .then((r) => (r.ok ? "Panneau de la régie publié. Chaque clic sur « Nom suivant » annonce le nom suivant, à l'écran et sur Discord." : `Impossible de publier ici (code ${r.status}).`)) };
  }

  if (sous.name === "remise-a-zero") {
    if (String(opt("confirmer") || "").trim().toUpperCase() !== "EFFACER") return { reponse: reponse("Rien n'a été effacé : tape EFFACER dans l'option « confirmer ».") };
    const { etat } = await lire();
    await redis("HSET", K.etat, "index", "0", "bourse", "0", "test", etat.test || "0");
    return { reponse: reponse("La cérémonie repart de zéro (la liste est gardée). Les messages déjà publiés et les rôles déjà donnés restent : à défaire à la main si besoin. Si l'introduction en Bourse a été faite pendant la répétition : /cote remise-a-zero.") };
  }
  return { reponse: reponse("Sous-commande inconnue.") };
}

// ---------- la liste (fenêtre de /selection preparer) ----------

async function membres(guild) {
  const tous = [];
  let apres = "0";
  for (let page = 0; page < 20; page++) {
    const r = await bot(`/guilds/${guild}/members?limit=1000&after=${apres}`);
    if (!r.ok) throw new Error(`Discord refuse la liste des membres (code ${r.status}) : il faut l'intent « Server Members » du bot`);
    const lot = await r.json();
    tous.push(...lot);
    if (lot.length < 1000) break;
    apres = lot.at(-1).user.id;
  }
  return tous;
}

export async function fenetre(i) {
  if (!isDirection(i.member)) return reponse("Réservé aux fondateurs et aux admins.");
  const test = i.data.custom_id.endsWith(":1");
  const texte = (i.data.components || []).flatMap((r) => r.components || [r.component]).find((c) => c?.custom_id === "liste")?.value || "";
  const work = (async () => {
    const guild = optEnv("DISCORD_GUILD_ID") || i.guild_id;
    const tous = await membres(guild);
    const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
    const liste = [], inconnus = [], doublons = [];
    for (const l of lignes) {
      const [saisie, categorie = "", personnage = ""] = l.split(/\s*[;|]\s*/);
      const brut = saisie.replace(/^<@!?(\d+)>$/, "$1").replace(/^@/, "");
      const cle = norm(brut);
      let m = /^\d{17,20}$/.test(brut) ? tous.find((x) => x.user.id === brut) : null;
      if (!m) {
        const exacts = tous.filter((x) => [x.user.username, x.user.global_name, x.nick].some((n) => n && norm(n) === cle));
        m = exacts.length === 1 ? exacts[0] : null;
      }
      if (!m) { inconnus.push(saisie); continue; }
      if (liste.some((p) => p.id === m.user.id)) { doublons.push(saisie); continue; }
      liste.push({
        id: m.user.id, saisie,
        pseudo: (m.nick || m.user.global_name || m.user.username).slice(0, 40),
        avatar: avatarDe(m, guild), categorie: categorie.slice(0, 40), personnage: personnage.slice(0, 60), numero: numeroDe(m.user.id),
      });
    }
    await redis("SET", K.liste, JSON.stringify(liste));
    await redis("HSET", K.etat, "index", "0", "bourse", "0", "test", test ? "1" : "0");
    const parCategorie = [...new Set(liste.map((p) => p.categorie || "sans catégorie"))].map((c) => `${c} : ${liste.filter((p) => (p.categorie || "sans catégorie") === c).length}`);
    return `${test ? "🧪 Répétition · " : ""}**${liste.length} retenus prêts**, dans l'ordre de la liste.\n${parCategorie.join(" · ")}`
      + (inconnus.length ? `\n⚠️ Introuvables sur le serveur (vérifie le pseudo, ou mets l'identifiant Discord) : ${inconnus.join(", ")}` : "")
      + (doublons.length ? `\n⚠️ En double : ${doublons.join(", ")}` : "")
      + "\nEnsuite : /selection regie dans un salon staff.";
  })().catch((e) => "Erreur : " + (e?.message || "inconnue"));
  keepAlive(work.then((content) => editOriginal(i, content)));
  return json({ type: 5, data: { flags: EPHEMERAL } });
}

// ---------- le panneau de la régie ----------

function panneau(liste, etat, message = "") {
  const n = Number(etat.index || 0), total = liste.length, fini = n >= total;
  const dernier = n > 0 ? liste[n - 1] : null, prochain = liste[n];
  const lignes = [
    `**${n} / ${total}**${etat.test === "1" ? " · 🧪 répétition" : ""}`,
    dernier ? `Annoncé : **${dernier.pseudo}** (${dernier.categorie || "—"})` : "Rien d'annoncé pour l'instant.",
    prochain ? `Prochain : **${prochain.pseudo}** (${prochain.categorie || "—"})` : "Tous les noms sont annoncés.",
    etat.bourse === "1" ? `📈 La Bourse est ouverte (${PRIX_DEPART} cr la part).` : "",
    message,
  ].filter(Boolean);
  return {
    allowed_mentions: { parse: [] },
    embeds: [{ title: "LA SÉLECTION · RÉGIE", description: lignes.join("\n"), color: OR, footer: { text: "Visible seulement par ceux qui voient ce salon." } }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: "Nom suivant", emoji: { name: "▶️" }, custom_id: "sel:suivant", disabled: fini },
        { type: 2, style: 2, label: "Liste", emoji: { name: "📋" }, custom_id: "sel:liste" },
        { type: 2, style: 3, label: "Introduction en Bourse", emoji: { name: "📈" }, custom_id: "sel:bourse", disabled: !fini || etat.bourse === "1" },
      ],
    }],
  };
}

// Ce que fait l'annonce d'un nom sur Discord : la carte dans #la-sélection, et le rôle Candidat.
async function annoncer(p, rang, total, etat, salonRegie) {
  const test = etat.test === "1";
  const salon = test ? salonRegie : optEnv("DISCORD_SELECTION_CHANNEL_ID") || salonRegie;
  const guild = optEnv("DISCORD_GUILD_ID");
  const taches = [bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify({
    content: test ? "" : `<@${p.id}>`,
    allowed_mentions: test ? { parse: [] } : { users: [p.id] },
    embeds: [{
      title: `CANDIDAT N° ${p.numero}`,
      description: `**${p.pseudo}**${p.categorie ? `\n${p.categorie}` : ""}\n\n*Vous avez été choisi.*`,
      thumbnail: { url: p.avatar },
      color: OR,
      footer: { text: `La Sélection · Programme ${PROG()} · ${rang} / ${total}` },
    }],
  }) })];
  if (!test && guild) {
    const role = (k, method) => { const id = optEnv(k); return id ? bot(`/guilds/${guild}/members/${p.id}/roles/${id}`, { method, headers: { "X-Audit-Log-Reason": "La Sélection" } }) : null; };
    taches.push(role("DISCORD_CANDIDAT_ROLE_ID", "PUT"));
    for (const k of ["DISCORD_POSTULANT_ROLE_ID", "DISCORD_ASPIRANT_ROLE_ID", "DISCORD_MECENE_ROLE_ID", "DISCORD_MECENE_ARGENT_ROLE_ID", "DISCORD_MECENE_OR_ROLE_ID", "DISCORD_GRAND_MECENE_ROLE_ID"]) taches.push(role(k, "DELETE"));
  }
  await Promise.all(taches.filter(Boolean));
}

export async function composant(i) {
  if (!isDirection(i.member)) return reponse("Réservé aux fondateurs et aux admins.");
  if (!baseConfiguree()) return reponse("La base n'est pas branchée.");
  const id = i.data.custom_id;

  if (id === "sel:liste") {
    const { liste, etat } = await lire();
    const n = Number(etat.index || 0);
    return reponse(liste.map((p, k) => `${k < n ? "✅" : "▫️"} ${k + 1}. ${p.pseudo} · ${p.categorie || "—"}${p.personnage ? ` · ${p.personnage}` : ""}`).join("\n").slice(0, 2000) || "Liste vide.");
  }

  if (id === "sel:suivant") {
    if (!(await verrou(P + "verrou", 2500))) return reponse("Doucement : le nom précédent est encore en cours d'annonce.");
    try {
      const { liste, etat } = await lire();
      const n = Number(etat.index || 0);
      if (n >= liste.length) return json({ type: 7, data: panneau(liste, etat, "Tous les noms sont annoncés.") });
      const p = liste[n];
      await redis("HSET", K.etat, "index", String(n + 1), "depuis", String(Date.now()));
      const etat2 = { ...etat, index: String(n + 1) };
      keepAlive(annoncer(p, n + 1, liste.length, etat, i.channel_id).catch((e) => console.error("La Sélection :", e?.message)));
      return json({ type: 7, data: panneau(liste, etat2) });
    } finally {
      await liberer(P + "verrou");
    }
  }

  if (id === "sel:bourse") {
    const { liste, etat } = await lire();
    if (Number(etat.index || 0) < liste.length) return reponse("La Bourse s'ouvre quand tous les noms sont annoncés.");
    if (etat.bourse === "1") return reponse("La Bourse est déjà ouverte.");
    const r = await introduireEnBourse(liste.map((p) => ({ id: p.id, nom: p.personnage || p.pseudo, pseudo: !p.personnage })));
    await redis("HSET", K.etat, "bourse", "1");
    return json({ type: 7, data: panneau(liste, { ...etat, bourse: "1" }, `${r.nouveaux} candidats cotés à ${PRIX_DEPART} cr${r.deja ? ` (${r.deja} déjà cotés)` : ""}${r.publie ? ", annonce publiée dans #la-cote" : ""}.`) });
  }
  return reponse("Action inconnue.");
}

// ---------- pour l'écran (/api/selection) ----------

export async function selectionGET() {
  try {
    if (!baseConfiguree()) return json({ etat: "attente", total: 0 }, 200, { "Cache-Control": "no-store" });
    const { liste, etat } = await lire();
    const n = Math.min(Number(etat.index || 0), liste.length);
    const annonces = liste.slice(0, n).map((p) => ({ pseudo: p.pseudo, avatar: p.avatar, categorie: p.categorie, numero: p.numero }));
    return json({
      etat: n === 0 ? "attente" : n < liste.length ? "en_cours" : "fin",
      programme: PROG(),
      index: n,
      total: liste.length,
      courant: annonces.at(-1) || null,
      annonces,
      bourse: etat.bourse === "1",
      prix: PRIX_DEPART,
    }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    return json({ etat: "attente", total: 0, erreur: e.message }, 200, { "Cache-Control": "no-store" });
  }
}
