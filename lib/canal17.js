// Canal 17 : la récompense du jeu de piste du casting (le terminal « canal 17 » de la page /casting).
// Quand un joueur envoie le code final dans un ticket, la direction tape /canal17 membre:@joueur dans ce ticket :
//   - le joueur reçoit le rôle Canal 17 et un numéro d'ordre (n° 1, n° 2… jusqu'à 17) ;
//   - une voix inconnue lui répond dans le ticket et l'accueille dans le salon caché #canal-17 ;
//   - après 17 personnes, le canal est complet : la voix répond qu'il est trop tard.
// /canal17 sans membre : la liste de ceux qui ont trouvé.
// /canal17-voix : écrire un message au nom de la voix (dans #canal-17, ou dans un autre salon pour semer le doute).
//
// Variables Vercel : DISCORD_CANAL17_ROLE_ID (le rôle) et DISCORD_CANAL17_CHANNEL_ID (le salon caché).
// La voix ne dit jamais qui elle est.

import { bot, optEnv } from "./discord.js";

export const PLACES = 17;
const VOIX = 0x8e7747; // laiton éteint, comme les réponses du terminal sur le site

const carte = (description) => ({
  author: { name: "CANAL 17 · TRANSMISSION" },
  description,
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

// /canal17-voix : la fenêtre pour écrire au nom de la voix.
export function voixModal(mention, salon) {
  return {
    type: 9,
    data: {
      custom_id: `canal17_voix:${mention ? 1 : 0}:${salon || ""}`,
      title: "La voix du canal 17",
      components: [{
        type: 1,
        components: [{ type: 4, custom_id: "texte", label: "Message", style: 2, max_length: 2000, required: true, placeholder: "Ils ne savent pas que vous êtes là." }],
      }],
    },
  };
}

// Fenêtre envoyée : publication du message.
export async function publierVoix(i, customId) {
  const [, ping, autre] = customId.split(":");
  const c = config();
  const salon = autre || c.salon;
  if (!salon) return { erreur: "Il manque DISCORD_CANAL17_CHANNEL_ID sur Vercel." };
  const texte = (i.data.components || []).flatMap((x) => x.components).find((x) => x.custom_id === "texte")?.value?.trim() || "";
  if (!texte) return { erreur: "Message vide." };
  const mention = ping === "1" && c.role;
  const ok = await poster(salon, {
    ...(mention ? { content: `<@&${c.role}>` } : {}),
    allowed_mentions: { parse: [], roles: mention ? [c.role] : [] },
    embeds: [carte(texte)],
  });
  return ok ? { ok, salon, texte } : { erreur: `Impossible d'écrire dans <#${salon}> : le bot doit voir ce salon et pouvoir y écrire.` };
}
