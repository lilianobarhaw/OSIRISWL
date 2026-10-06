// Modération du serveur Osiris par commandes slash (réservées aux fondateurs et aux admins).
//   /warn /unwarn /sanctions /mute /unmute /kick /ban /unban /clear /slowmode
// Chaque sanction : message privé au membre avec la raison, action sur Discord, trace dans le salon des sanctions.
// Le salon des sanctions (DISCORD_SANCTIONS_CHANNEL_ID) sert aussi de mémoire : le bot y relit les avertissements.

import { bot, optEnv, isTeam } from "./discord.js";

// ---------- Réglages (modifiables) ----------

// Sanctions automatiques selon le nombre d'avertissements.
export const SEUILS = [
  { avertissements: 3, action: "mute", minutes: 60 },
  { avertissements: 5, action: "mute", minutes: 1440 },
  { avertissements: 7, action: "ban" },
];

const DUREES = [
  { name: "10 minutes", value: 10 },
  { name: "1 heure", value: 60 },
  { name: "6 heures", value: 360 },
  { name: "24 heures", value: 1440 },
  { name: "3 jours", value: 4320 },
  { name: "7 jours", value: 10080 },
];

const LENTEURS = [
  { name: "Désactivé", value: 0 },
  { name: "5 secondes", value: 5 },
  { name: "10 secondes", value: 10 },
  { name: "30 secondes", value: 30 },
  { name: "1 minute", value: 60 },
  { name: "5 minutes", value: 300 },
  { name: "15 minutes", value: 900 },
  { name: "1 heure", value: 3600 },
];

// ---------- Les commandes ----------

const DIRECTION = "8"; // visibles seulement par ceux qui ont la permission Administrateur (fondateurs, admins)
const membre = { type: 6, name: "membre", description: "Le membre concerné", required: true };
const raison = { type: 3, name: "raison", description: "La raison (envoyée au membre en message privé)", required: true, max_length: 500 };
const raisonFacultative = { ...raison, required: false };

export const MOD_COMMANDS = [
  { name: "warn", description: "Avertir un membre (message privé, compteur, sanction automatique aux paliers)", options: [membre, raison] },
  { name: "unwarn", description: "Retirer un avertissement à un membre", options: [membre, raisonFacultative] },
  { name: "sanctions", description: "Voir l'historique des sanctions d'un membre", options: [membre] },
  { name: "mute", description: "Rendre un membre muet pendant une durée", options: [membre, { type: 4, name: "duree", description: "Durée", required: true, choices: DUREES }, raison] },
  { name: "unmute", description: "Rendre la parole à un membre", options: [membre] },
  { name: "kick", description: "Expulser un membre du serveur (il peut revenir)", options: [membre, raison] },
  { name: "ban", description: "Bannir un membre du serveur", options: [membre, raison, { type: 5, name: "supprimer_messages", description: "Supprimer ses messages des dernières 24 h", required: false }] },
  { name: "unban", description: "Lever le bannissement d'un membre", options: [{ type: 3, name: "identifiant", description: "Identifiant Discord du membre banni", required: true, min_length: 17, max_length: 20 }, raisonFacultative] },
  { name: "clear", description: "Supprimer les derniers messages du salon", options: [{ type: 4, name: "nombre", description: "Nombre de messages (1 à 100)", required: true, min_value: 1, max_value: 100 }, { type: 6, name: "membre", description: "Seulement les messages de ce membre", required: false }] },
  { name: "slowmode", description: "Mode lent : délai imposé entre deux messages dans ce salon", options: [{ type: 4, name: "delai", description: "Délai", required: true, choices: LENTEURS }] },
].map((c) => ({ ...c, default_member_permissions: DIRECTION }));

export const isModCommand = (name) => MOD_COMMANDS.some((c) => c.name === name);

// ---------- Outils ----------

const COLOR = { warn: 0xc4a265, unwarn: 0x5a9a6e, mute: 0xd98a3a, unmute: 0x5a9a6e, kick: 0xd4553a, ban: 0x9b1d1d, unban: 0x5a9a6e };
const LABEL = { warn: "Avertissement", unwarn: "Avertissement retiré", mute: "Mute", unmute: "Fin du mute", kick: "Expulsion", ban: "Bannissement", unban: "Débannissement" };
const duree = (min) => DUREES.find((d) => d.value === min)?.name || `${min} minutes`;
const palier = (s) => (s.action === "ban" ? "bannissement" : `mute ${duree(s.minutes)}`);
const mp = (ok) => (ok ? "Message privé envoyé." : "Message privé impossible (ses MP sont fermés).");
const audit = (s) => ({ "X-Audit-Log-Reason": encodeURIComponent(String(s || "—").slice(0, 150)) });

async function refus(r, quoi, perm) {
  let detail = "";
  try { detail = (await r.json()).message || ""; } catch {}
  return `${quoi} refusé (code ${r.status}${detail ? " : " + detail : ""}). Le bot doit avoir « ${perm} » et son rôle doit être au-dessus de celui du membre.`;
}

async function sendDM(uid, embed) {
  const ch = await bot("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: uid }) });
  if (!ch.ok) return false;
  const { id } = await ch.json();
  const r = await bot(`/channels/${id}/messages`, { method: "POST", body: JSON.stringify({ embeds: [embed] }) });
  return r.ok;
}

function dmEmbed(type, raisonTxt, extra = []) {
  const titres = {
    warn: "Tu as reçu un avertissement sur le serveur Osiris",
    mute: "Tu es rendu muet sur le serveur Osiris",
    unmute: "Tu peux de nouveau parler sur le serveur Osiris",
    kick: "Tu as été expulsé du serveur Osiris",
    ban: "Tu as été banni du serveur Osiris",
  };
  return {
    title: titres[type],
    color: COLOR[type],
    fields: [{ name: "Raison", value: raisonTxt || "—" }, ...extra],
    footer: { text: "Osiris · pour contester, ouvre un ticket d'aide (catégorie « Problème avec le staff »)" },
    timestamp: new Date().toISOString(),
  };
}

// Relit le salon des sanctions (500 derniers messages) et garde les lignes du membre, de la plus récente à la plus ancienne.
async function readLog(uid) {
  const ch = optEnv("DISCORD_SANCTIONS_CHANNEL_ID");
  if (!ch) return null;
  const out = [];
  let before = "";
  for (let page = 0; page < 5; page++) {
    const r = await bot(`/channels/${ch}/messages?limit=100${before ? "&before=" + before : ""}`);
    if (!r.ok) return null;
    const msgs = await r.json();
    for (const m of msgs) for (const e of m.embeds || []) {
      const f = e.footer?.text || "";
      if (f.startsWith(`uid:${uid} `)) out.push({ type: (f.match(/type:(\w+)/) || [])[1], e, date: m.timestamp });
    }
    if (msgs.length < 100) break;
    before = msgs.at(-1).id;
  }
  return out;
}

const countWarns = (list) => Math.max(0, list.filter((x) => x.type === "warn").length - list.filter((x) => x.type === "unwarn").length);

async function log(type, target, by, raisonTxt, extra = []) {
  const ch = optEnv("DISCORD_SANCTIONS_CHANNEL_ID");
  if (!ch) return;
  await bot(`/channels/${ch}/messages`, {
    method: "POST",
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [{
        title: `${LABEL[type]} · @${target.username}`,
        color: COLOR[type],
        fields: [
          { name: "Membre", value: `<@${target.id}>`, inline: true },
          { name: "Par", value: by, inline: true },
          ...extra,
          { name: "Raison", value: raisonTxt || "—" },
        ],
        footer: { text: `uid:${target.id} · type:${type}` },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}

const timeout = (guild, uid, minutes, reason) => bot(`/guilds/${guild}/members/${uid}`, {
  method: "PATCH",
  headers: audit(reason),
  body: JSON.stringify({ communication_disabled_until: minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null }),
});

const banUser = (guild, uid, reason, seconds = 0) => bot(`/guilds/${guild}/bans/${uid}`, {
  method: "PUT",
  headers: audit(reason),
  body: JSON.stringify({ delete_message_seconds: seconds }),
});

// ---------- Exécution : renvoie le texte de réponse (visible seulement par l'auteur de la commande) ----------

export async function moderation(i, user) {
  const name = i.data.name;
  const opt = (k) => (i.data.options || []).find((o) => o.name === k)?.value;
  const guild = i.guild_id, by = `<@${user.id}>`;
  const noLog = optEnv("DISCORD_SANCTIONS_CHANNEL_ID") ? "" : "\n⚠️ Aucun salon des sanctions configuré (DISCORD_SANCTIONS_CHANNEL_ID) : rien n'est enregistré et les avertissements ne sont pas comptés.";

  if (name === "slowmode") {
    const s = opt("delai");
    const r = await bot(`/channels/${i.channel_id}`, { method: "PATCH", body: JSON.stringify({ rate_limit_per_user: s }) });
    if (!r.ok) return `Mode lent refusé (code ${r.status}). Le bot doit avoir « Gérer les salons ».`;
    return s ? `Mode lent activé : ${LENTEURS.find((l) => l.value === s)?.name} entre deux messages.` : "Mode lent désactivé.";
  }

  if (name === "clear") {
    const n = opt("nombre"), who = opt("membre");
    const r = await bot(`/channels/${i.channel_id}/messages?limit=${who ? 100 : n}`);
    if (!r.ok) return `Impossible de lire ce salon (code ${r.status}).`;
    const limite = Date.now() - 13.9 * 24 * 3600 * 1000;
    const ids = (await r.json())
      .filter((m) => Date.parse(m.timestamp) > limite && (!who || m.author?.id === who))
      .slice(0, n)
      .map((m) => m.id);
    if (!ids.length) return "Aucun message à supprimer (Discord bloque la suppression des messages de plus de 14 jours).";
    const d = ids.length === 1
      ? await bot(`/channels/${i.channel_id}/messages/${ids[0]}`, { method: "DELETE" })
      : await bot(`/channels/${i.channel_id}/messages/bulk-delete`, { method: "POST", body: JSON.stringify({ messages: ids }) });
    return d.ok ? `${ids.length} message(s) supprimé(s)${who ? ` de <@${who}>` : ""}.` : `Suppression refusée (code ${d.status}). Le bot doit avoir « Gérer les messages ».`;
  }

  if (name === "unban") {
    const uid = String(opt("identifiant") || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return "Identifiant invalide (clic droit sur le membre → Copier l'identifiant).";
    const r = await bot(`/guilds/${guild}/bans/${uid}`, { method: "DELETE", headers: audit(`Débanni par @${user.username}`) });
    if (r.status === 404) return "Ce membre n'est pas banni.";
    if (!r.ok) return `Débannissement refusé (code ${r.status}). Le bot doit avoir « Bannir des membres ».`;
    const u = await bot(`/users/${uid}`);
    const target = u.ok ? await u.json() : { id: uid, username: uid };
    await log("unban", target, by, opt("raison") || "Bannissement levé");
    return `<@${uid}> est débanni. Il peut revenir avec une invitation.${noLog}`;
  }

  // Toutes les autres commandes visent un membre du serveur.
  const uid = opt("membre");
  const target = i.data.resolved?.users?.[uid];
  const tMember = i.data.resolved?.members?.[uid];
  if (!target) return "Membre introuvable.";
  if (target.bot || uid === user.id) return "Impossible de viser ce compte.";
  if (tMember && isTeam(tMember) && !["sanctions", "unmute", "unwarn"].includes(name)) return "Impossible de sanctionner un membre de l'équipe avec le bot.";
  const raisonTxt = opt("raison") || "";

  if (name === "sanctions") {
    const list = await readLog(uid);
    if (list === null) return "Configure DISCORD_SANCTIONS_CHANNEL_ID (et vérifie que le bot voit ce salon) pour garder l'historique.";
    if (!list.length) return `Aucune sanction pour <@${uid}>.`;
    const total = countWarns(list), prochain = SEUILS.find((s) => s.avertissements > total);
    const lignes = list.slice(0, 15).map((x) => {
      const r = x.e.fields?.find((f) => f.name === "Raison")?.value || "—";
      return `• <t:${Math.floor(Date.parse(x.date) / 1000)}:d> **${LABEL[x.type] || x.type}** · ${r.slice(0, 90)}`;
    });
    return `**Sanctions de <@${uid}>** · ${total} avertissement(s) actif(s)${prochain ? ` · prochain palier à ${prochain.avertissements} : ${palier(prochain)}` : ""}\n${lignes.join("\n")}${list.length > 15 ? `\n… et ${list.length - 15} plus ancienne(s).` : ""}`;
  }

  if (name === "warn") {
    const list = await readLog(uid);
    const total = list === null ? null : countWarns(list) + 1;
    const seuil = total ? SEUILS.find((s) => s.avertissements === total) : null;
    const prochain = total ? SEUILS.find((s) => s.avertissements > total) : null;
    const extra = [
      ...(total ? [{ name: "Avertissements", value: String(total), inline: true }] : []),
      ...(seuil ? [{ name: "Sanction automatique", value: palier(seuil), inline: true }] : []),
      ...(!seuil && prochain ? [{ name: "Au prochain palier", value: `${prochain.avertissements} avertissements : ${palier(prochain)}`, inline: true }] : []),
    ];
    // Le message privé part avant la sanction : un membre banni ne peut plus recevoir de MP du bot.
    const [dm] = await Promise.all([
      sendDM(uid, dmEmbed("warn", raisonTxt, extra)),
      log("warn", target, by, raisonTxt, total ? [{ name: "Total", value: String(total), inline: true }] : []),
    ]);
    let auto = "";
    if (seuil) {
      const motif = `Sanction automatique : ${total} avertissements`;
      const isBan = seuil.action === "ban";
      const r = isBan ? await banUser(guild, uid, motif) : await timeout(guild, uid, seuil.minutes, motif);
      if (r.ok) {
        await log(seuil.action, target, "Osiris (automatique)", motif, isBan ? [] : [{ name: "Durée", value: duree(seuil.minutes), inline: true }]);
        auto = `\nPalier atteint : ${palier(seuil)} appliqué.`;
      } else {
        auto = "\nPalier atteint, mais : " + (await refus(r, isBan ? "Bannissement" : "Mute", isBan ? "Bannir des membres" : "Exclure temporairement des membres"));
      }
    }
    return `Avertissement donné à <@${uid}>${total ? ` (${total} au total)` : ""}. ${mp(dm)}${auto}${noLog}`;
  }

  if (name === "unwarn") {
    const list = await readLog(uid);
    if (list === null) return "Configure DISCORD_SANCTIONS_CHANNEL_ID pour gérer les avertissements.";
    const total = countWarns(list);
    if (!total) return `<@${uid}> n'a aucun avertissement actif.`;
    await log("unwarn", target, by, raisonTxt || "Avertissement retiré", [{ name: "Reste", value: String(total - 1), inline: true }]);
    return `Un avertissement retiré à <@${uid}> : il lui en reste ${total - 1}.`;
  }

  if (name === "mute") {
    const min = opt("duree");
    const r = await timeout(guild, uid, min, raisonTxt);
    if (!r.ok) return refus(r, "Mute", "Exclure temporairement des membres");
    const [dm] = await Promise.all([
      sendDM(uid, dmEmbed("mute", raisonTxt, [{ name: "Durée", value: duree(min), inline: true }])),
      log("mute", target, by, raisonTxt, [{ name: "Durée", value: duree(min), inline: true }]),
    ]);
    return `<@${uid}> est muet pendant ${duree(min)}. ${mp(dm)}${noLog}`;
  }

  if (name === "unmute") {
    const r = await timeout(guild, uid, 0, `Fin du mute par @${user.username}`);
    if (!r.ok) return refus(r, "Fin du mute", "Exclure temporairement des membres");
    await Promise.all([sendDM(uid, dmEmbed("unmute", "Ton mute a été levé par le staff.")), log("unmute", target, by, "Mute levé")]);
    return `<@${uid}> peut de nouveau parler.`;
  }

  if (name === "kick") {
    const dm = await sendDM(uid, dmEmbed("kick", raisonTxt));
    const r = await bot(`/guilds/${guild}/members/${uid}`, { method: "DELETE", headers: audit(raisonTxt) });
    if (!r.ok) return refus(r, "Expulsion", "Expulser des membres");
    await log("kick", target, by, raisonTxt);
    return `<@${uid}> a été expulsé. ${mp(dm)}${noLog}`;
  }

  if (name === "ban") {
    const dm = await sendDM(uid, dmEmbed("ban", raisonTxt));
    const r = await banUser(guild, uid, raisonTxt, opt("supprimer_messages") ? 86400 : 0);
    if (!r.ok) return refus(r, "Bannissement", "Bannir des membres");
    await log("ban", target, by, raisonTxt);
    return `<@${uid}> a été banni. ${mp(dm)}${noLog}`;
  }

  return "Commande inconnue.";
}
