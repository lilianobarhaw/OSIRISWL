// Indique à la page si le candidat est connecté.
import { json, readSession } from "../lib/discord.js";

export async function GET(req) {
  const user = await readSession(req);
  if (!user) return json({ user: null }, 401);
  return json({ user: { id: user.id, username: user.username, name: user.name } });
}
