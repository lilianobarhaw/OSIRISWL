// Dit à la page casting si le formulaire est ouvert (dates dans lib/casting.js).
// Pour un membre du canal 17 connecté, l'ouverture est 17 minutes plus tôt.
import { json, readSession, keepAlive } from "../lib/discord.js";
import { majSalon } from "../lib/decompte.js";
import { etatPour, estMembre } from "../lib/casting.js";

export async function GET(req) {
  let user = null;
  try { user = await readSession(req); } catch {}
  // user : le candidat connecté (remplace l'ancien /api/me, pour rester sous la limite de 12 fonctions de Vercel Hobby)
  const moi = user ? { id: user.id, username: user.username, name: user.name } : null;
  // canal17 : le visiteur connecté a le rôle Canal 17 → 17 minutes d'avance sur les décomptes du site
  const canal17 = user ? await estMembre((process.env.DISCORD_GUILD_ID || "").trim(), user.id) : false;
  // Le salon du décompte sur Discord change de nom au passage d'une étape : la première visite qui suit s'en charge.
  keepAlive(majSalon().catch(() => {}));
  return json({ ...(await etatPour(user, canal17)), user: moi, canal17 }, 200, { "Cache-Control": "no-store" });
}
