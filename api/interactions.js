// Osiris : tickets d'aide.
// Discord envoie ici les clics sur les boutons et les menus (Interactions Endpoint URL de l'application).
//   1. « Créer un ticket »  → menu des catégories (visible seulement par la personne)
//   2. Choix d'une catégorie → petite fenêtre « Explique ton problème »
//   3. Envoi                 → salon privé créé, staff (ou admins) mentionnés
//   4. « Fermer le ticket »  → salon supprimé (staff ou auteur du ticket)
// Et les commandes slash, réservées aux fondateurs et aux admins :
//   /annonce, /aide-panneau, /fermer, /casting, /offrande (lib/commandes.js)
//   /canal17, /canal17-voix : la récompense du jeu de piste (lib/canal17.js)
//   /warn, /unwarn, /sanctions, /mute, /unmute, /kick, /ban, /unban, /clear, /slowmode (lib/moderation.js)

import { createPublicKey, verify } from "node:crypto";
import { env, json, bot, optEnv, isDirection, isTeam, editOriginal, keepAlive, sleep } from "../lib/discord.js";
import { CATEGORIES, panelMessage } from "../lib/aide.js";
import { CASTING } from "../lib/commandes.js";
import { moderation, isModCommand } from "../lib/moderation.js";
import { logEvent, logCommand } from "../lib/logs.js";
import { offrandeModal, publierOffrande } from "../lib/offrande.js";
import * as canal17 from "../lib/canal17.js";

const VIEW = 1024n, SEND = 2048n, EMBED = 16384n, ATTACH = 32768n, HISTORY = 65536n;
const bits = (...p) => p.reduce((a, b) => a | b, 0n).toString();
const EPHEMERAL = 64;
const COLOR = 0xc4a265;

function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "membre";
}

function checkSignature(body, signature, timestamp) {
  try {
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(env("DISCORD_PUBLIC_KEY"), "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const reply = (content, extra = {}) => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const update = (content) => json({ type: 7, data: { content, components: [], embeds: [] } });
const DIRECTION_ONLY = "Les commandes d'Osiris sont réservées aux fondateurs et aux admins.";

// Ferme un ticket d'aide (staff ou auteur) ou de candidature (staff seulement).
async function closeTicket(i, user) {
  const chRes = await bot(`/channels/${i.channel_id}`);
  const ch = chRes.ok ? await chRes.json() : {};
  const topic = ch.topic || "";
  const aide = topic.includes("[aide:"), candidature = topic.startsWith("Candidature de");
  if (!aide && !candidature) return reply("Ce salon n'est pas un ticket.");
  const auteur = aide && topic.includes(user.id);
  if (!isTeam(i.member) && !auteur) return reply(candidature ? "Seul le staff peut fermer un ticket de candidature." : "Seuls le staff et l'auteur du ticket peuvent le fermer.");
  const del = await bot(`/channels/${i.channel_id}`, { method: "DELETE", headers: { "X-Audit-Log-Reason": `Ticket fermé par @${user.username}` } });
  if (del.ok) {
    const owner = (topic.match(/\b(\d{17,20})\b/) || [])[1]; // l'identifiant de l'auteur est noté dans le sujet du salon
    await logEvent({
      title: "Ticket fermé",
      description: `<@${user.id}> a fermé le ticket **#${ch.name || "?"}**${owner ? ` (ticket de <@${owner}>)` : ""}`,
      color: 0x5a9a6e,
      user,
    });
  }
  return null;
}

async function command(i, user) {
  const name = i.data.name;
  const opt = (k) => (i.data.options || []).find((o) => o.name === k)?.value;
  if (!isDirection(i.member)) return reply(DIRECTION_ONLY);

  // Modération : si c'est rapide (presque toujours), réponse directe ;
  // sinon Discord affiche « Osiris réfléchit… » et la réponse arrive dès que c'est fini.
  if (isModCommand(name)) {
    const work = moderation(i, user).catch((e) => "Erreur : " + (e?.message || "inconnue"));
    const fast = await Promise.race([work, sleep(2200).then(() => null)]);
    if (fast !== null) return reply(fast);
    keepAlive(work.then((content) => editOriginal(i, content)));
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  // Canal 17 (jeu de piste) : plusieurs appels à Discord, donc même principe que la modération.
  if (name === "canal17") {
    const cible = opt("membre");
    const work = (cible ? canal17.valider(i, user, cible) : canal17.liste(i)).catch((e) => "Erreur : " + (e?.message || "inconnue"));
    const fast = await Promise.race([work, sleep(2200).then(() => null)]);
    if (fast !== null) return reply(fast);
    keepAlive(work.then((content) => editOriginal(i, content)));
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (name === "canal17-voix") return json(canal17.voixModal(opt("mention"), opt("salon")));

  if (name === "aide-panneau") {
    const r = await bot(`/channels/${i.channel_id}/messages`, { method: "POST", body: JSON.stringify(panelMessage()) });
    return reply(r.ok ? "Le panneau d'aide est publié." : `Impossible de publier ici (code ${r.status}).`);
  }

  if (name === "annonce") {
    return json({
      type: 9,
      data: {
        custom_id: "annonce_envoi:" + (opt("ping") ? "1" : "0"),
        title: "Annonce d'Osiris",
        components: [
          { type: 1, components: [{ type: 4, custom_id: "titre", label: "Titre", style: 1, max_length: 200, required: true }] },
          { type: 1, components: [{ type: 4, custom_id: "texte", label: "Message", style: 2, max_length: 3500, required: true }] },
        ],
      },
    });
  }

  if (name === "fermer") return (await closeTicket(i, user)) || reply("Ticket fermé.");

  if (name === "offrande") return json(offrandeModal(opt("salon")));

  if (name === "casting") {
    const chRes = await bot(`/channels/${i.channel_id}`);
    const topic = chRes.ok ? (await chRes.json()).topic || "" : "";
    const m = topic.match(/^Candidature de .*\((\d{17,20})\)/);
    if (!m) return reply("Utilise cette commande dans le ticket de candidature du joueur.");
    const cid = m[1], res = CASTING[opt("resultat")];
    if (!res) return reply("Résultat inconnu.");
    const numero = String(100 + Number(BigInt(cid) % 900n));
    const guild = i.guild_id, warn = [];
    const setRole = async (envKey, method) => {
      const role = optEnv(envKey); if (!role) return;
      const r = await bot(`/guilds/${guild}/members/${cid}/roles/${role}`, { method, headers: { "X-Audit-Log-Reason": "Résultat du casting" } });
      if (!r.ok) warn.push(`${envKey} (code ${r.status})`);
    };
    await setRole(res.role, "PUT");
    // Un candidat retenu ne doit plus voir la Loge des Mécènes : on retire Postulant (et Aspirant), Mécène et les rangs.
    const retirer = ["DISCORD_POSTULANT_ROLE_ID", "DISCORD_ASPIRANT_ROLE_ID", ...(opt("resultat") === "retenu" ? ["DISCORD_MECENE_ROLE_ID", "DISCORD_MECENE_ARGENT_ROLE_ID", "DISCORD_MECENE_OR_ROLE_ID", "DISCORD_GRAND_MECENE_ROLE_ID"] : [])];
    await Promise.all(retirer.map((k) => setRole(k, "DELETE")));
    await bot(`/channels/${i.channel_id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: `<@${cid}>`,
        allowed_mentions: { users: [cid] },
        embeds: [{ title: res.title.replace("{numero}", numero), description: res.text, color: COLOR, footer: { text: "Osiris · Programme 01" } }],
      }),
    });
    return reply(`Résultat publié.${warn.length ? " Rôles non modifiés : " + warn.join(", ") + ". Vérifie la variable et la place du rôle du bot." : ""}`);
  }

  return reply("Commande inconnue.");
}

export async function POST(req) {
  const body = await req.text();
  const ok = checkSignature(body, req.headers.get("x-signature-ed25519") || "", req.headers.get("x-signature-timestamp") || "");
  if (!ok) return new Response("Signature invalide", { status: 401 });

  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 }); // PING de vérification de Discord

  const user = i.member?.user || i.user;
  const id = i.data?.custom_id || "";

  try {
    // Commandes slash
    if (i.type === 2) {
      const refused = !isDirection(i.member);
      const skip = i.data.name === "annonce" && !refused; // l'annonce est notée quand elle est publiée
      const [res] = await Promise.all([command(i, user), skip ? null : logCommand(i, user, refused)]);
      return res;
    }

    // Fenêtre de /offrande envoyée → carte Osiris + sondage dans #offrandes
    if (i.type === 5 && id.startsWith("offrande_envoi")) {
      if (!isDirection(i.member)) return reply(DIRECTION_ONLY);
      const r = await publierOffrande(i, id.split(":")[1]);
      if (r.erreur) return reply(r.erreur);
      await logEvent({ title: r.test ? "Offrande de test lancée" : "Offrande lancée", description: `<@${user.id}> a lancé **${r.titre}** dans <#${r.salon}> (${r.duree}) : ${r.offrandes.join(" · ")}`, user });
      return reply(`Offrande publiée dans <#${r.salon}>. Le vote se ferme dans ${r.duree}.${r.ferme ? " Discord affiche 1 h sur le sondage : le journal Osiris le fermera à l'heure annoncée sur la carte (il doit tourner sur le VPS)." : ""}${r.notifies ? " Mécènes (tous les rangs) et staff notifiés." : ""}${r.test ? "\nC'est un test : ce salon ne compte pas pour les rangs. Supprime les deux messages quand tu as fini." : ""}`);
    }

    // Fenêtre de /canal17-voix envoyée → message de la voix dans #canal-17 (ou le salon choisi)
    if (i.type === 5 && id.startsWith("canal17_voix:")) {
      if (!isDirection(i.member)) return reply(DIRECTION_ONLY);
      const r = await canal17.publierVoix(i, id);
      if (r.erreur) return reply(r.erreur);
      await logEvent({ title: "Voix du canal 17", description: `<@${user.id}> a fait parler la voix dans <#${r.salon}> : ${r.texte.slice(0, 300)}`, user });
      return reply(`La voix a parlé dans <#${r.salon}>.`);
    }

    // Fenêtre de /annonce envoyée → message publié dans le salon
    if (i.type === 5 && id.startsWith("annonce_envoi:")) {
      if (!isDirection(i.member)) return reply(DIRECTION_ONLY);
      const val = (k) => i.data.components.flatMap((r) => r.components).find((c) => c.custom_id === k)?.value || "";
      const ping = id.endsWith(":1");
      const r = await bot(`/channels/${i.channel_id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          ...(ping ? { content: "@everyone" } : {}),
          allowed_mentions: { parse: ping ? ["everyone"] : [] },
          embeds: [{ title: val("titre"), description: val("texte"), color: COLOR, footer: { text: "Osiris" } }],
        }),
      });
      if (r.ok) await logEvent({ title: "Annonce publiée", description: `<@${user.id}> a publié **${val("titre").slice(0, 200)}** dans <#${i.channel_id}>${ping ? " (avec @everyone)" : ""}`, user });
      return reply(r.ok ? "Annonce publiée." : `Impossible de publier ici (code ${r.status}).`);
    }

    // 1. Bouton « Créer un ticket » → menu des catégories
    if (i.type === 3 && id === "aide_ouvrir") {
      return reply("**Quel est le sujet de ton ticket ?**", {
        components: [{
          type: 1,
          components: [{
            type: 3,
            custom_id: "aide_categorie",
            placeholder: "Choisis une catégorie",
            options: CATEGORIES.map((c) => ({ label: c.label, value: c.key, description: c.description.slice(0, 100), emoji: { name: c.emoji } })),
          }],
        }],
      });
    }

    // 2. Catégorie choisie → fenêtre pour décrire le problème
    if (i.type === 3 && id === "aide_categorie") {
      const cat = CATEGORIES.find((c) => c.key === i.data.values?.[0]);
      if (!cat) return reply("Catégorie inconnue.");
      return json({
        type: 9,
        data: {
          custom_id: "aide_envoi:" + cat.key,
          title: cat.label.slice(0, 45),
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: "texte",
              label: "Explique ton problème",
              style: 2,
              min_length: 10,
              max_length: 1500,
              required: true,
              placeholder: "Ce qui se passe, quand, avec qui…",
            }],
          }],
        },
      });
    }

    // 3. Fenêtre envoyée → création du salon privé
    if (i.type === 5 && id.startsWith("aide_envoi:")) {
      const cat = CATEGORIES.find((c) => c.key === id.split(":")[1]);
      if (!cat) return reply("Catégorie inconnue.");
      const texte = i.data.components?.[0]?.components?.[0]?.value || "—";
      const guild = i.guild_id;
      const parent = (process.env.DISCORD_HELP_CATEGORY_ID || process.env.DISCORD_TICKET_CATEGORY_ID || "").trim();
      const staff = env("DISCORD_STAFF_ROLE_ID");
      const admin = (process.env.DISCORD_ADMIN_ROLE_ID || "").trim();
      const equipe = cat.admin && admin ? admin : staff;
      const botId = env("DISCORD_CLIENT_ID");
      const marque = `[aide:${cat.key}] ${user.id}`;

      // Un seul ticket ouvert par personne et par catégorie.
      const list = await bot(`/guilds/${guild}/channels`);
      if (list.ok) {
        const deja = (await list.json()).find((c) => (c.topic || "").includes(marque));
        if (deja) return reply(`Tu as déjà un ticket ouvert dans cette catégorie : <#${deja.id}>`);
      }

      const make = (extra) => bot(`/guilds/${guild}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: `${cat.key}-${slug(user.username)}`,
          type: 0,
          ...(parent ? { parent_id: parent } : {}),
          topic: `${cat.emoji} ${cat.label} · ticket de @${user.username} · ${marque}`,
          permission_overwrites: [
            { id: guild, type: 0, deny: bits(VIEW) },
            { id: user.id, type: 1, allow: bits(VIEW, SEND, HISTORY, ...extra) },
            { id: equipe, type: 0, allow: bits(VIEW, SEND, HISTORY, ...extra) },
            ...(equipe !== admin && admin ? [{ id: admin, type: 0, allow: bits(VIEW, SEND, HISTORY, ...extra) }] : []),
            { id: botId, type: 1, allow: bits(VIEW, SEND, HISTORY, EMBED, ...extra) },
          ],
        }),
      });

      // Avec l'envoi de captures d'écran ; sans, si le bot n'a pas « Joindre des fichiers ».
      let res = await make([ATTACH]);
      if (res.status === 403) res = await make([]);
      if (!res.ok) {
        let why = "";
        try { why = (await res.json()).message || ""; } catch {}
        return reply(`Impossible d'ouvrir le ticket (code ${res.status}${why ? " : " + why : ""}). Préviens un membre du staff.`);
      }
      const channel = await res.json();

      await bot(`/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: `<@${user.id}>, ton ticket est ouvert. <@&${equipe}>`,
          allowed_mentions: { users: [user.id], roles: [equipe] },
          embeds: [{
            title: `${cat.emoji} ${cat.label}`,
            description: texte.slice(0, 4000),
            color: COLOR,
            footer: { text: cat.admin ? "Osiris · ticket visible uniquement par la direction" : "Osiris · le staff te répond ici" },
            timestamp: new Date().toISOString(),
          }],
          components: [{ type: 1, components: [{ type: 2, style: 4, label: "Fermer le ticket", emoji: { name: "🔒" }, custom_id: "aide_fermer" }] }],
        }),
      });

      await logEvent({ title: "Ticket ouvert", description: `<@${user.id}> a ouvert un ticket **${cat.emoji} ${cat.label}** : <#${channel.id}>`, user });
      return reply(`Ton ticket est ouvert : <#${channel.id}>`);
    }

    // 4. Bouton « Fermer le ticket »
    if (i.type === 3 && id === "aide_fermer") return (await closeTicket(i, user)) || update("Ticket fermé.");

    return reply("Action inconnue.");
  } catch (e) {
    return reply("Erreur : " + (e?.message || "inconnue"));
  }
}

// Diagnostic : ouvrir /api/interactions dans le navigateur.
export function GET() {
  const need = ["DISCORD_PUBLIC_KEY", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_STAFF_ROLE_ID", "SETUP_KEY"];
  const has = (k) => !!optEnv(k);
  const missing = need.filter((k) => !(process.env[k] || "").trim());
  return json({
    fonction: "OK",
    variables: missing.length ? "MANQUANTES : " + missing.join(", ") : "OK",
    categorie_des_tickets: process.env.DISCORD_HELP_CATEGORY_ID ? "DISCORD_HELP_CATEGORY_ID" : "même catégorie que les candidatures",
    plaintes_staff: has("DISCORD_ADMIN_ROLE_ID") ? "réservées au rôle Admin" : "ATTENTION : DISCORD_ADMIN_ROLE_ID absent, tout le staff les verra",
    commandes: "réservées à la permission Administrateur" + (has("DISCORD_FONDATEUR_ROLE_ID") ? ", au rôle Fondateur" : "") + (has("DISCORD_ADMIN_ROLE_ID") ? " et au rôle Admin" : ""),
    salon_des_logs: has("DISCORD_LOGS_CHANNEL_ID") ? "OK" : "ATTENTION : DISCORD_LOGS_CHANNEL_ID absent, les commandes ne sont pas notées",
    salon_des_sanctions: has("DISCORD_SANCTIONS_CHANNEL_ID") ? "OK" : "ATTENTION : DISCORD_SANCTIONS_CHANNEL_ID absent, les avertissements ne sont pas comptés",
    canal_17: canal17.manque().length ? "désactivé : il manque " + canal17.manque().join(", ") : `OK (${canal17.PLACES} places)`,
  });
}
