// Dit à la page casting si le formulaire est ouvert (dates dans lib/casting.js).
// Pour un membre du canal 17 connecté, l'ouverture est 17 minutes plus tôt.
import { json, readSession } from "../lib/discord.js";
import { etatPour } from "../lib/casting.js";

export async function GET(req) {
  let user = null;
  try { user = await readSession(req); } catch {}
  // user : le candidat connecté (remplace l'ancien /api/me, pour rester sous la limite de 12 fonctions de Vercel Hobby)
  const moi = user ? { id: user.id, username: user.username, name: user.name } : null;
  return json({ ...(await etatPour(user)), user: moi }, 200, { "Cache-Control": "no-store" });
}
