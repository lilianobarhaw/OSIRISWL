// Dit à la page casting si le formulaire est ouvert (dates dans lib/casting.js).
// Pour un membre du canal 17 connecté, l'ouverture est 17 minutes plus tôt.
import { json, readSession } from "../lib/discord.js";
import { etatPour } from "../lib/casting.js";

export async function GET(req) {
  let user = null;
  try { user = await readSession(req); } catch {}
  return json(await etatPour(user), 200, { "Cache-Control": "no-store" });
}
