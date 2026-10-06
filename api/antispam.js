// Installe (ou met à jour) l'antispam d'Osiris sur le serveur. À ouvrir une fois dans le navigateur :
//   https://<ton-site>/api/antispam?key=<SETUP_KEY>
// Le bot a besoin de « Gérer le serveur » (pour créer les règles AutoMod)
// et de « Exclure temporairement des membres » (pour le mute automatique).

import { env, json, bot, optEnv } from "../lib/discord.js";
import { antispamRules, UNIQUE_TYPES } from "../lib/antispam.js";

export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== env("SETUP_KEY")) return json({ error: "Clé invalide" }, 403);
  const guild = env("DISCORD_GUILD_ID");

  const listRes = await bot(`/guilds/${guild}/auto-moderation/rules`);
  if (!listRes.ok) {
    return json({ error: `Discord a refusé (code ${listRes.status}). Donne au rôle du bot la permission « Gérer le serveur », puis réessaie.` }, 502);
  }
  const existing = await listRes.json();

  // L'équipe n'est jamais bloquée par l'antispam (les administrateurs ne le sont jamais de toute façon).
  const exempt_roles = ["DISCORD_FONDATEUR_ROLE_ID", "DISCORD_ADMIN_ROLE_ID", "DISCORD_STAFF_ROLE_ID"].map(optEnv).filter(Boolean);
  const alertChannel = optEnv("DISCORD_SANCTIONS_CHANNEL_ID");
  const resultat = {};

  for (const rule of antispamRules({ alertChannel })) {
    const found = existing.find((r) => r.name === rule.name)
      || (UNIQUE_TYPES.includes(rule.trigger_type) && existing.find((r) => r.trigger_type === rule.trigger_type));
    const body = { ...rule, event_type: 1, enabled: true, exempt_roles };
    let res;
    if (found) {
      delete body.trigger_type; // ne peut pas être modifié
      res = await bot(`/guilds/${guild}/auto-moderation/rules/${found.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      res = await bot(`/guilds/${guild}/auto-moderation/rules`, { method: "POST", body: JSON.stringify(body) });
    }
    if (res.ok) {
      resultat[rule.name] = found ? (found.name === rule.name ? "mise à jour" : `remplace la règle « ${found.name} »`) : "créée";
    } else {
      let detail = "";
      try { detail = JSON.stringify(await res.json()); } catch {}
      resultat[rule.name] = `refusée (code ${res.status}) ${detail}`.trim()
        + (res.status === 403 ? " → le bot doit avoir « Gérer le serveur » et « Exclure temporairement des membres »." : "");
    }
  }

  const ok = Object.values(resultat).every((v) => !v.startsWith("refusée"));
  return json({
    ok,
    regles: resultat,
    alertes: alertChannel ? "envoyées dans le salon des sanctions" : "ATTENTION : DISCORD_SANCTIONS_CHANNEL_ID absent, le staff n'est pas prévenu",
    equipe_exemptee: exempt_roles.length ? `${exempt_roles.length} rôle(s)` : "aucun rôle configuré (seuls les administrateurs sont exemptés)",
    suite: "Tout est modifiable dans Paramètres du serveur → AutoMod.",
  }, ok ? 200 : 502);
}
