// Outils partagés : sessions signées, cookies et appels à l'API Discord.

export const API = "https://discord.com/api/v10";

export function env(name) {
  // trim() : un espace copié-collé avant ou après la valeur casse les mentions Discord.
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error("Variable d'environnement manquante : " + name);
  return value;
}

export function json(body, status = 200, headers) {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function parseCookies(req) {
  const out = {};
  (req.headers.get("cookie") || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const enc = new TextEncoder();

async function sign(data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(env("SESSION_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return Buffer.from(await crypto.subtle.sign("HMAC", key, enc.encode(data))).toString("base64url");
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Session : { id, username, name, exp }, valable 6 heures.
export async function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 6 * 3600 * 1000 })).toString("base64url");
  return payload + "." + (await sign(payload));
}

export async function readSession(req) {
  const raw = parseCookies(req).osiris_session;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  if (!sameString(await sign(payload), sig)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString());
    return user.exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Appel à l'API Discord avec le token du bot. Si Discord demande de ralentir (429), on attend et on réessaie une fois.
export async function bot(path, init = {}) {
  const go = () => fetch(API + path, {
    ...init,
    headers: { Authorization: "Bot " + env("DISCORD_BOT_TOKEN"), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  let res = await go();
  if (res.status === 429) {
    let wait = 1;
    try { wait = Number((await res.clone().json()).retry_after) || 1; } catch {}
    if (wait <= 3) { await sleep(wait * 1000 + 100); res = await go(); }
  }
  return res;
}

// ---------- Qui a le droit de faire quoi ----------

export const optEnv = (k) => (process.env[k] || "").trim();
const hasRole = (m, key) => { const id = optEnv(key); return !!id && (m?.roles || []).includes(id); };
const isAdministrator = (m) => (BigInt(m?.permissions || "0") & 8n) === 8n;

// Fondateurs et admins : les seuls qui peuvent utiliser les commandes du bot.
export const isDirection = (m) => isAdministrator(m) || hasRole(m, "DISCORD_FONDATEUR_ROLE_ID") || hasRole(m, "DISCORD_ADMIN_ROLE_ID");

// Toute l'équipe (direction + staff) : ferme les tickets, ne peut pas être sanctionnée par le bot.
export const isTeam = (m) => isDirection(m) || hasRole(m, "DISCORD_STAFF_ROLE_ID");

// Remplace la réponse « Osiris réfléchit… » d'une commande par le résultat.
export async function editOriginal(i, content) {
  const send = () => fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: String(content).slice(0, 2000), allowed_mentions: { parse: [] } }),
  });
  let r = await send();
  if (r.status === 404) { await sleep(1000); r = await send(); }
  return r;
}

// Laisse une tâche finir après la réponse à Discord (Vercel), quand c'est possible.
export function keepAlive(promise) {
  const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(promise);
}
