// Osiris : reçoit une candidature d'un candidat connecté avec Discord
// et ouvre un ticket privé (salon visible par lui et le staff) sur le serveur Osiris.

import { env, json, readSession, bot } from "../lib/discord.js";
import { etatCasting, dateFr } from "../lib/casting.js";

const LIMITS = { age: 3, exp: 40, stream: 120, name: 60, role: 60, story: 2000, q1: 1000, q2: 1000 };

// Permissions Discord (bits)
const VIEW = 1024n, SEND = 2048n, EMBED = 16384n, HISTORY = 65536n;
const bits = (...p) => p.reduce((a, b) => a | b, 0n).toString();

function clean(v, max) {
  return String(v ?? "").replace(/[\u0000-\u0008\u000B-\u001F]/g, "").trim().slice(0, max);
}

function chunks(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : ["—"];
}

function slug(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "candidat";
}

// Diagnostic : ouvrir /api/candidature dans le navigateur.
export function GET() {
  const need = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "DISCORD_TICKET_CATEGORY_ID", "DISCORD_STAFF_ROLE_ID", "SESSION_SECRET", "SITE_URL"];
  const missing = need.filter((k) => !process.env[k]);
  return json({
    fonction: "OK",
    variables: missing.length ? "MANQUANTES : " + missing.join(", ") : "OK : toutes les variables sont configurées",
    role_postulant: process.env.DISCORD_POSTULANT_ROLE_ID ? "activé" : "désactivé (variable DISCORD_POSTULANT_ROLE_ID absente)",
    casting: (() => { const c = etatCasting(); return `${c.etat} · ouverture ${dateFr(c.ouverture)} · fermeture ${dateFr(c.fermeture)}`; })(),
  });
}

export async function POST(req) {
  const user = await readSession(req);
  if (!user) return json({ error: "Connecte-toi avec Discord pour envoyer ta candidature." }, 401);

  // Le casting n'accepte des dossiers qu'entre son ouverture et sa fermeture (sauf comptes de test).
  const c = etatCasting(user.id);
  if (c.etat !== "ouvert" && !c.testeur) {
    const error = c.etat === "bientot" ? `Le casting n'est pas encore ouvert. Ouverture le ${dateFr(c.ouverture)}.` : "Le casting est fermé.";
    return json({ error, etat: c.etat }, 403);
  }

  let d;
  try { d = await req.json(); } catch { return json({ error: "Données invalides" }, 400); }
  if (d.site) return json({ ok: true }); // piège à robots

  const f = {};
  for (const [k, max] of Object.entries(LIMITS)) f[k] = clean(d[k], max);
  const dispo = Array.isArray(d.dispo) ? d.dispo.map((x) => clean(x, 12)).filter(Boolean).join(", ") : "";
  if (["age", "exp", "name", "role", "story", "q1", "q2"].some((k) => !f[k]) || !dispo) {
    return json({ error: "Dossier incomplet" }, 400);
  }

  const guild = env("DISCORD_GUILD_ID");
  const category = env("DISCORD_TICKET_CATEGORY_ID");
  const staff = env("DISCORD_STAFF_ROLE_ID");
  const botId = env("DISCORD_CLIENT_ID"); // l'identifiant du bot est celui de l'application
  const numero = String(100 + Number(BigInt(user.id) % 900n));

  // Un seul ticket par candidat : on cherche un salon de la catégorie qui porte son identifiant.
  const listRes = await bot(`/guilds/${guild}/channels`);
  if (!listRes.ok) return json({ error: `Le bot n'a pas accès au serveur (code ${listRes.status})` }, 502);
  const existing = (await listRes.json()).find((c) => c.parent_id === category && (c.topic || "").includes(user.id));
  if (existing) {
    return json({ error: "Tu as déjà un ticket de candidature ouvert.", numero, url: `https://discord.com/channels/${guild}/${existing.id}` }, 409);
  }

  const chanRes = await bot(`/guilds/${guild}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: `candidature-${numero}-${slug(user.username)}`,
      type: 0,
      parent_id: category,
      topic: `Candidature de @${user.username} (${user.id}) · Programme 01`,
      permission_overwrites: [
        { id: guild, type: 0, deny: bits(VIEW) },
        { id: user.id, type: 1, allow: bits(VIEW, SEND, HISTORY) },
        { id: staff, type: 0, allow: bits(VIEW, SEND, HISTORY) },
        { id: botId, type: 1, allow: bits(VIEW, SEND, HISTORY, EMBED) },
      ],
    }),
  });
  if (!chanRes.ok) {
    let why = "";
    try { const e = await chanRes.json(); why = e.message ? ` : ${e.message}` : ""; } catch {}
    return json({ error: `Impossible d'ouvrir le ticket (code ${chanRes.status}${why}). Vérifie les permissions du bot sur le serveur et sur la catégorie.` }, 502);
  }
  const channel = await chanRes.json();

  // Rôle « Postulant » donné automatiquement (facultatif : ignoré si la variable n'existe pas).
  let roleWarning = "";
  const postulant = (process.env.DISCORD_POSTULANT_ROLE_ID || "").trim();
  if (postulant) {
    const roleRes = await bot(`/guilds/${guild}/members/${user.id}/roles/${postulant}`, {
      method: "PUT",
      headers: { "X-Audit-Log-Reason": "Candidature envoyée depuis le site Osiris" },
    });
    if (!roleRes.ok) roleWarning = `\n⚠️ Le rôle Postulant n'a pas pu être donné (code ${roleRes.status}). Vérifie que le bot a « Gérer les rôles » et que son rôle est au-dessus de Postulant.`;
  }

  const embed = {
    title: `Candidat n° ${numero} · ${f.name}`,
    color: 0xc4a265,
    fields: [
      { name: "Compte Discord", value: `<@${user.id}> (@${user.username})`, inline: true },
      { name: "Âge", value: f.age, inline: true },
      { name: "Expérience RP", value: f.exp, inline: true },
      { name: "Disponibilités", value: dispo, inline: true },
      { name: "Rôle souhaité", value: f.role, inline: true },
      { name: "Stream", value: f.stream || "aucun", inline: true },
      ...chunks(f.story, 1000).map((p, i) => ({ name: i === 0 ? "Histoire du personnage" : "Histoire (suite)", value: p })),
      { name: "Mise en situation", value: f.q1 },
      { name: "Hors RP (vote et métagaming)", value: f.q2 },
    ],
    footer: { text: "Osiris · Programme 01 · engagements acceptés" },
    timestamp: new Date().toISOString(),
  };

  await bot(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: `<@${user.id}>, ta candidature est bien arrivée. Le staff te répondra ici. <@&${staff}>${roleWarning}`,
      embeds: [embed],
      allowed_mentions: { users: [user.id], roles: [staff] },
    }),
  });

  return json({ ok: true, numero, url: `https://discord.com/channels/${guild}/${channel.id}` });
}
