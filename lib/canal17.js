// Canal 17 : la récompense du jeu de piste du casting (le terminal « canal 17 » de la page /casting).
// Quand un joueur envoie le code final dans un ticket, la direction tape /canal17 membre:@joueur dans ce ticket :
//   - le joueur reçoit le rôle Canal 17 et un numéro d'ordre (n° 1, n° 2… jusqu'à 17) ;
//   - une voix inconnue lui répond dans le ticket et l'accueille dans le salon caché #canal-17 ;
//   - après 17 personnes, le canal est complet : la voix répond qu'il est trop tard.
// /canal17 sans membre : la liste de ceux qui ont trouvé.
// /canal17-voix : écrire un message au nom de la voix (dans #canal-17, ou dans un autre salon pour semer le doute),
//   avec en option un document joint (image, PDF, audio…) : le document part au nom de la voix, pas du compte de l'admin.
// Accès anticipé : les membres du canal 17 peuvent envoyer leur dossier de casting 17 minutes avant l'ouverture.
//
// Variables Vercel : DISCORD_CANAL17_ROLE_ID (le rôle) et DISCORD_CANAL17_CHANNEL_ID (le salon caché).
// La voix ne dit jamais qui elle est.

import { bot, optEnv, env, API, sleep } from "./discord.js";

export const PLACES = 17;
export const AVANCE_MINUTES = 17; // accès anticipé au casting
const MAX_OCTETS = 10 * 1024 * 1024; // limite d'envoi de fichiers des bots Discord
const VOIX = 0x8e7747; // laiton éteint, comme les réponses du terminal sur le site

const carte = (description) => ({
  author: { name: "CANAL 17 · TRANSMISSION" },
  ...(description ? { description } : {}),
  color: VOIX,
  footer: { text: "signal non identifié" },
});

const config = () => ({ role: optEnv("DISCORD_CANAL17_ROLE_ID"), salon: optEnv("DISCORD_CANAL17_CHANNEL_ID") });

export function manque() {
  const c = config();
  const m = [];
  if (!c.role) m.push("DISCORD_CANAL17_ROLE_ID");
  if (!c.salon) m.push("DISCORD_CANAL17_CHANNEL_ID");
  return m;
}

// Tous ceux qui ont le rôle Canal 17 (le serveur est petit : quelques pages de 1000 membres au plus).
async function porteurs(guild, role) {
  const liste = [];
  let apres = "0";
  for (let page = 0; page < 10; page++) {
    const r = await bot(`/guilds/${guild}/members?limit=1000&after=${apres}`);
    if (!r.ok) throw new Error(`liste des membres refusée (code ${r.status}) : active « Server Members Intent » pour le bot Osiris`);
    const lot = await r.json();
    for (const m of lot) if ((m.roles || []).includes(role)) liste.push(m);
    if (lot.length < 1000) break;
    apres = lot.at(-1).user.id;
  }
  return liste;
}

async function poster(salon, corps) {
  const r = await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify(corps) });
  return r.ok;
}

// /canal17 sans membre : où on en est.
export async function liste(i) {
  const c = config();
  if (manque().length) return `Il manque sur Vercel : ${manque().join(", ")}.`;
  const p = await porteurs(i.guild_id, c.role);
  if (!p.length) return `Personne n'a encore trouvé le canal 17 (0/${PLACES}).`;
  return `**Canal 17 · ${p.length}/${PLACES}**\n` + p.map((m) => `• <@${m.user.id}>`).join("\n");
}

// /canal17 membre:@joueur — à taper dans le ticket où il a envoyé le code.
export async function valider(i, user, cible) {
  const c = config();
  if (manque().length) return `Il manque sur Vercel : ${manque().join(", ")}. Crée le rôle et le salon, puis ajoute leurs identifiants.`;
  const guild = i.guild_id;
  const p = await porteurs(guild, c.role);

  if (p.some((m) => m.user.id === cible)) return `<@${cible}> a déjà trouvé le canal 17.`;

  // Complet : la voix répond quand même dans le ticket.
  if (p.length >= PLACES) {
    await poster(i.channel_id, {
      content: `<@${cible}>`,
      allowed_mentions: { users: [cible] },
      embeds: [carte(`Code reçu.\n\nTrop tard : les ${PLACES} places du canal sont prises.\nMais je me souviendrai de ton nom.`)],
    });
    return `Le canal 17 est complet (${PLACES}/${PLACES}) : la voix a répondu à <@${cible}> qu'il était trop tard.`;
  }

  const numero = p.length + 1;
  const reste = PLACES - numero;
  const r = await bot(`/guilds/${guild}/members/${cible}/roles/${c.role}`, {
    method: "PUT",
    headers: { "X-Audit-Log-Reason": `Canal 17 : n° ${numero}, validé par @${user.username}` },
  });
  if (!r.ok) return `Impossible de donner le rôle Canal 17 (code ${r.status}). Le rôle du bot Osiris doit être au-dessus de Canal 17.`;

  await poster(i.channel_id, {
    content: `<@${cible}>`,
    allowed_mentions: { users: [cible] },
    embeds: [carte(`Code reçu.\n\nTu es le **n° ${numero}** sur ${PLACES}.\nUn canal vient de s'ouvrir pour toi : <#${c.salon}>.\n\nN'en parle à personne. Ils écoutent toujours.`)],
  });

  const fin = reste === 0
    ? `\n\nLe canal est complet. Vous êtes ${PLACES}.`
    : `\nIl reste ${reste} place${reste > 1 ? "s" : ""}.`;
  const accueil = await poster(c.salon, {
    content: `<@${cible}>`,
    allowed_mentions: { users: [cible] },
    embeds: [carte(`<@${cible}> a trouvé le chemin. **N° ${numero}** sur ${PLACES}.${fin}`)],
  });

  return `<@${cible}> est le n° ${numero}/${PLACES} du canal 17.${accueil ? "" : ` ⚠️ Message d'accueil impossible dans <#${c.salon}> : le bot doit voir ce salon et pouvoir y écrire.`}`;
}

// Le membre a-t-il le rôle Canal 17 ? (17 minutes d'avance sur le casting, les Archives et les annonces du site)
// Réponse gardée une minute en mémoire, pour ne pas interroger Discord à chaque visite.
const memoire = new Map();
export async function estMembre(guild, userId) {
  const role = config().role;
  if (!role || !guild || !userId) return false;
  const m = memoire.get(userId);
  if (m && Date.now() - m.at < 60_000) return m.oui;
  let oui = false;
  try {
    const r = await bot(`/guilds/${guild}/members/${userId}`);
    oui = r.ok && ((await r.json()).roles || []).includes(role);
  } catch {}
  memoire.set(userId, { oui, at: Date.now() });
  if (memoire.size > 500) memoire.clear();
  return oui;
}
export const AVANCE_MS = AVANCE_MINUTES * 60 * 1000;

// ---------- La voix ----------

// Un document joint à /canal17-voix ne survit pas à la fenêtre de saisie : le bot le dépose d'abord dans le salon
// des logs (réservé à l'équipe), puis le reprend de là quand le message est envoyé.
const nomPropre = (n) => String(n || "document").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "document";
const ref = (id) => `réf. ${id}`;

export function verifierDocument(att) {
  if (!optEnv("DISCORD_LOGS_CHANNEL_ID")) return "Pour joindre un document, il faut la variable DISCORD_LOGS_CHANNEL_ID sur Vercel.";
  if (att.size > MAX_OCTETS) return "Ce fichier est trop lourd : 10 Mo maximum.";
  return "";
}

async function telecharger(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`document illisible (code ${r.status})`);
  return await r.blob();
}

async function envoyerAvecFichier(salon, payload, nom, blob) {
  for (let essai = 0; essai < 2; essai++) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ ...payload, attachments: [{ id: 0, filename: nom }] }));
    form.append("files[0]", blob, nom);
    const r = await fetch(`${API}/channels/${salon}/messages`, { method: "POST", headers: { Authorization: "Bot " + env("DISCORD_BOT_TOKEN") }, body: form });
    if (r.status === 429) { let w = 1; try { w = Number((await r.json()).retry_after) || 1; } catch {} await sleep(w * 1000 + 100); continue; }
    return r;
  }
  throw new Error("Discord demande de ralentir, réessaie dans une minute");
}

// Appelée dès qu'on tape /canal17-voix avec un document : le dépose dans les logs en attendant le message.
export async function preparerDocument(i, att) {
  const blob = await telecharger(att.url);
  const r = await envoyerAvecFichier(optEnv("DISCORD_LOGS_CHANNEL_ID"), {
    content: `📎 Document en attente pour la voix du canal 17 · ${ref(i.id)}`,
    allowed_mentions: { parse: [] },
  }, nomPropre(att.filename), blob);
  if (!r.ok) throw new Error(`dépôt du document impossible (code ${r.status})`);
}

// Retrouve le document déposé (le dépôt peut finir une ou deux secondes après l'ouverture de la fenêtre).
async function documentDepose(id) {
  const logs = optEnv("DISCORD_LOGS_CHANNEL_ID");
  for (let essai = 0; essai < 6; essai++) {
    const r = await bot(`/channels/${logs}/messages?limit=30`);
    if (r.ok) {
      const m = (await r.json()).find((x) => (x.content || "").includes(ref(id)) && x.attachments?.length);
      if (m) return { message: m, fichier: m.attachments[0] };
    }
    await sleep(1000);
  }
  return null;
}

// /canal17-voix : la fenêtre pour écrire au nom de la voix. refDoc = l'interaction qui a déposé un document.
export function voixModal(mention, salon, refDoc = "") {
  return {
    type: 9,
    data: {
      custom_id: `canal17_voix:${mention ? 1 : 0}:${salon || ""}:${refDoc}`,
      title: refDoc ? "La voix du canal 17 · document" : "La voix du canal 17",
      components: [{
        type: 1,
        components: [{ type: 4, custom_id: "texte", label: refDoc ? "Message (facultatif)" : "Message", style: 2, max_length: 2000, required: !refDoc, placeholder: "Ils ne savent pas que vous êtes là." }],
      }],
    },
  };
}

// Fenêtre envoyée : publication du message (et du document s'il y en a un).
export async function publierVoix(i, customId) {
  const [, ping, autre, refDoc] = customId.split(":");
  const c = config();
  const salon = autre || c.salon;
  if (!salon) return { erreur: "Il manque DISCORD_CANAL17_CHANNEL_ID sur Vercel." };
  const texte = (i.data.components || []).flatMap((x) => x.components).find((x) => x.custom_id === "texte")?.value?.trim() || "";
  if (!texte && !refDoc) return { erreur: "Message vide." };
  const mention = ping === "1" && c.role;
  const payload = {
    ...(mention ? { content: `<@&${c.role}>` } : {}),
    allowed_mentions: { parse: [], roles: mention ? [c.role] : [] },
    embeds: [carte(texte)],
  };
  const refus = { erreur: `Impossible d'écrire dans <#${salon}> : le bot doit voir ce salon, pouvoir y écrire et joindre des fichiers.` };

  if (!refDoc) return (await poster(salon, payload)) ? { ok: true, salon, texte } : refus;

  const depot = await documentDepose(refDoc);
  if (!depot) return { erreur: "Le document n'a pas été retrouvé (le dépôt a échoué ou a pris trop de temps). Relance /canal17-voix avec le document." };
  const nom = nomPropre(depot.fichier.filename);
  if (/^image\//.test(depot.fichier.content_type || "")) payload.embeds[0].image = { url: `attachment://${nom}` };
  const r = await envoyerAvecFichier(salon, payload, nom, await telecharger(depot.fichier.url));
  if (!r.ok) return refus;
  await bot(`/channels/${optEnv("DISCORD_LOGS_CHANNEL_ID")}/messages/${depot.message.id}`, {
    method: "PATCH",
    body: JSON.stringify({ content: `📎 Document publié par la voix dans <#${salon}> · ${ref(refDoc)}`, allowed_mentions: { parse: [] } }),
  }).catch(() => {});
  return { ok: true, salon, texte: texte || `(document ${nom})` };
}
