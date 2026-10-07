// Rangs des Mécènes : le bot compte les sondages votés dans #offrandes et donne le rôle du rang atteint.
// Lancé chaque nuit par Vercel (vercel.json → crons) et à la demande : /api/rangs?key=<SETUP_KEY>
// Un sondage compte une fois par personne, quelle que soit la réponse. On ne redescend jamais de rang.

import { bot, optEnv } from "./discord.js";

// Paliers (modifiables). Le premier rang est le rôle Mécène lui-même, qui donne accès à la Loge.
export const RANGS = [
  { nom: "Mécène", votes: 0, env: "DISCORD_MECENE_ROLE_ID" },
  { nom: "Mécène d'argent", votes: 6, env: "DISCORD_MECENE_ARGENT_ROLE_ID", emoji: "🥈" },
  { nom: "Mécène d'or", votes: 12, env: "DISCORD_MECENE_OR_ROLE_ID", emoji: "🥇" },
  { nom: "Grand Mécène", votes: 18, env: "DISCORD_GRAND_MECENE_ROLE_ID", emoji: "👁" },
];

const SEMAINE = 7 * 24 * 3600 * 1000;

async function get(path) {
  const r = await bot(path);
  if (!r.ok) throw new Error(`Discord a refusé ${path.split("?")[0]} (code ${r.status})`);
  return r.json();
}

// Lance fn sur chaque élément, n à la fois (pour ne pas dépasser les limites de Discord).
async function parLots(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k]); }
  }));
}

// Retourne { sondages, votes: Map(id → { total, semaine, nom }) }
export async function compterVotes(salon) {
  const sondages = [];
  let avant = "";
  for (let page = 0; page < 30; page++) {
    const msgs = await get(`/channels/${salon}/messages?limit=100${avant ? "&before=" + avant : ""}`);
    for (const m of msgs) if (m.poll) sondages.push(m);
    if (msgs.length < 100) break;
    avant = msgs.at(-1).id;
  }
  const parPersonne = new Map(); // id → { polls: Set, semaine: Set, nom }
  const depuis = Date.now() - SEMAINE;
  const taches = sondages.flatMap((m) => (m.poll.answers || []).map((a) => ({ m, a })));
  await parLots(taches, 4, async ({ m, a }) => {
    let apres = "";
    for (let page = 0; page < 50; page++) {
      const r = await get(`/channels/${salon}/polls/${m.id}/answers/${a.answer_id}?limit=100${apres ? "&after=" + apres : ""}`);
      const users = r.users || [];
      for (const u of users) {
        if (u.bot) continue;
        const p = parPersonne.get(u.id) || { polls: new Set(), semaine: new Set(), nom: u.global_name || u.username };
        p.polls.add(m.id);
        if (Date.parse(m.timestamp) >= depuis) p.semaine.add(m.id);
        parPersonne.set(u.id, p);
      }
      if (users.length < 100) break;
      apres = users.at(-1).id;
    }
  });
  const votes = new Map([...parPersonne].map(([id, p]) => [id, { total: p.polls.size, semaine: p.semaine.size, nom: p.nom }]));
  return { sondages: sondages.length, votes };
}

async function membres(guild) {
  const out = [];
  let apres = "0";
  for (let page = 0; page < 50; page++) {
    const lot = await get(`/guilds/${guild}/members?limit=1000&after=${apres}`);
    out.push(...lot);
    if (lot.length < 1000) break;
    apres = lot.at(-1).user.id;
  }
  return out;
}

async function envoyerMP(uid, embed) {
  try {
    const ch = await bot("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: uid }) });
    if (!ch.ok) return false;
    const { id } = await ch.json();
    return (await bot(`/channels/${id}/messages`, { method: "POST", body: JSON.stringify({ embeds: [embed] }) })).ok;
  } catch { return false; }
}

async function poster(salon, payload) {
  if (!salon) return;
  try { await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify({ allowed_mentions: { parse: [] }, ...payload }) }); } catch {}
}

export async function mettreAJourRangs({ simulation = false } = {}) {
  const guild = optEnv("DISCORD_GUILD_ID"), salon = optEnv("DISCORD_OFFRANDES_CHANNEL_ID");
  const ids = RANGS.map((r) => optEnv(r.env));
  const manque = ["DISCORD_GUILD_ID", "DISCORD_OFFRANDES_CHANNEL_ID", ...RANGS.map((r) => r.env)].filter((k) => !optEnv(k));
  if (manque.length) throw new Error("Variables manquantes : " + manque.join(", "));
  const candidat = optEnv("DISCORD_CANDIDAT_ROLE_ID");
  const rangsIds = ids.slice(1); // argent, or, grand

  const { sondages, votes } = await compterVotes(salon);
  const liste = await membres(guild);
  const actions = [], eligibles = new Set();

  for (const m of liste) {
    if (m.user.bot) continue;
    const roles = m.roles || [];
    const aMecene = roles.includes(ids[0]);
    const estCandidat = !!candidat && roles.includes(candidat);
    const rangsActuels = rangsIds.filter((r) => roles.includes(r));

    // Un candidat ne garde ni le rôle Mécène ni un rang ; sans le rôle Mécène, pas de rang.
    if (estCandidat || !aMecene) {
      const retirer = [...(estCandidat && aMecene ? [ids[0]] : []), ...rangsActuels];
      if (retirer.length) actions.push({ type: "retrait", m, retirer, raison: estCandidat ? "candidat" : "plus Mécène" });
      continue;
    }

    eligibles.add(m.user.id);
    const v = votes.get(m.user.id)?.total || 0;
    let cible = 0;
    RANGS.forEach((r, k) => { if (v >= r.votes) cible = k; });
    const actuel = Math.max(0, ...rangsActuels.map((r) => rangsIds.indexOf(r) + 1));
    const final = Math.max(cible, actuel); // on ne redescend jamais
    const garder = final > 0 ? rangsIds[final - 1] : null;
    const retirer = rangsActuels.filter((r) => r !== garder);
    const ajouter = garder && !roles.includes(garder) ? garder : null;
    if (ajouter || retirer.length) actions.push({ type: "rang", m, ajouter, retirer, rang: final, votes: v, promotion: final > actuel });
  }

  const raison = { "X-Audit-Log-Reason": encodeURIComponent("Rangs des Mécènes (votes dans #offrandes)") };
  const promotions = [], retraits = [], erreurs = [];
  await parLots(actions, 3, async (a) => {
    const uid = a.m.user.id, nom = a.m.nick || a.m.user.global_name || a.m.user.username;
    if (!simulation) {
      for (const r of a.ajouter ? [a.ajouter] : []) {
        const res = await bot(`/guilds/${guild}/members/${uid}/roles/${r}`, { method: "PUT", headers: raison });
        if (!res.ok) { erreurs.push(`${nom} : ajout refusé (code ${res.status})`); return; }
      }
      for (const r of a.retirer) {
        const res = await bot(`/guilds/${guild}/members/${uid}/roles/${r}`, { method: "DELETE", headers: raison });
        if (!res.ok) erreurs.push(`${nom} : retrait refusé (code ${res.status})`);
      }
    }
    if (a.type === "retrait") { retraits.push(`${nom} (${a.raison})`); return; }
    if (a.promotion) {
      const rang = RANGS[a.rang];
      promotions.push({ id: uid, nom, rang: rang.nom, votes: a.votes });
      if (!simulation) {
        await envoyerMP(uid, {
          title: `${rang.emoji || "👁"} Tu es désormais ${rang.nom}`,
          description: `Osiris a remarqué ta fidélité : **${a.votes} votes** dans #offrandes.\n${a.rang >= 2 ? "Le Cercle t'est désormais ouvert." : "Continue de voter : Osiris observe ceux qui l'observent."}`,
          color: 0xc4a265,
          footer: { text: "Osiris · La Loge des Mécènes" },
        });
        await poster(optEnv("DISCORD_LOGE_SALON_ID"), { content: `${rang.emoji || "👁"} <@${uid}> devient **${rang.nom}** (${a.votes} votes). Osiris remercie ses fidèles.` });
      }
    }
  });

  const top = [...votes].filter(([id, p]) => p.semaine > 0 && eligibles.has(id)).sort((a, b) => b[1].semaine - a[1].semaine || b[1].total - a[1].total).slice(0, 3)
    .map(([id, p]) => ({ id, nom: p.nom, votes_semaine: p.semaine, votes_total: p.total }));

  if (!simulation && (promotions.length || retraits.length || erreurs.length || top.length)) {
    await poster(optEnv("DISCORD_LOGS_CHANNEL_ID"), {
      embeds: [{
        title: "Rangs des Mécènes · mise à jour",
        color: 0xc4a265,
        fields: [
          { name: "Sondages comptés", value: String(sondages), inline: true },
          { name: "Votants", value: String(votes.size), inline: true },
          { name: "Promotions", value: promotions.map((p) => `<@${p.id}> → ${p.rang} (${p.votes})`).join("\n").slice(0, 1024) || "Aucune" },
          ...(retraits.length ? [{ name: "Rôles retirés", value: retraits.join("\n").slice(0, 1024) }] : []),
          { name: "Les plus fidèles des 7 derniers jours", value: top.map((t, k) => `${k + 1}. <@${t.id}> · ${t.votes_semaine} votes`).join("\n") || "Personne" },
          ...(erreurs.length ? [{ name: "⚠️ Erreurs", value: erreurs.join("\n").slice(0, 1024) }] : []),
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  }

  return {
    simulation,
    sondages_comptes: sondages,
    votants: votes.size,
    paliers: RANGS.map((r) => `${r.nom} : ${r.votes} votes`),
    promotions: promotions.map((p) => `${p.nom} → ${p.rang} (${p.votes} votes)`),
    roles_retires: retraits,
    plus_fideles_7_jours: top.map((t) => `${t.nom} · ${t.votes_semaine} votes`),
    erreurs,
  };
}
