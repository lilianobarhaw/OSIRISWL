// Déconnecte le candidat et le ramène au formulaire.
import { env, cookie } from "../../lib/discord.js";

export function GET() {
  const headers = new Headers({ Location: env("SITE_URL") + "/casting#candidature" });
  headers.append("Set-Cookie", cookie("osiris_session", "", 0));
  return new Response(null, { status: 302, headers });
}
