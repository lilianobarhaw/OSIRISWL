// Dit à la page casting si le formulaire est ouvert (dates dans lib/casting.js).
import { json, readSession } from "../lib/discord.js";
import { etatCasting } from "../lib/casting.js";

export async function GET(req) {
  let user = null;
  try { user = await readSession(req); } catch {}
  return json(etatCasting(user?.id), 200, { "Cache-Control": "no-store" });
}
