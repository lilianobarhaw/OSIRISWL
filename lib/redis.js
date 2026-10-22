// Petite base de données de la Cote et de la Bourse : Upstash Redis, par son API REST (aucun module à installer).
// Variables (ajoutées toutes seules par Vercel quand on crée la base dans l'onglet Storage) :
//   KV_REST_API_URL et KV_REST_API_TOKEN, ou UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN.

import { optEnv } from "./discord.js";

const url = () => (optEnv("KV_REST_API_URL") || optEnv("UPSTASH_REDIS_REST_URL")).replace(/\/$/, "");
const token = () => optEnv("KV_REST_API_TOKEN") || optEnv("UPSTASH_REDIS_REST_TOKEN");

export const baseConfiguree = () => !!(url() && token());

async function appel(chemin, corps) {
  if (!baseConfiguree()) throw new Error("La base de la Cote n'est pas branchée (Vercel → Storage → Upstash Redis, voir le README).");
  const r = await fetch(url() + chemin, {
    method: "POST",
    headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Base de la Cote : ${d.error || "code " + r.status}`);
  return d;
}

// Une commande : await redis("HGET", "cle", "champ")
export async function redis(...args) {
  const d = await appel("", args.map(String));
  if (d.error) throw new Error("Base de la Cote : " + d.error);
  return d.result;
}

// Plusieurs commandes en un seul aller-retour : await lot([["HGET", "a", "b"], ["GET", "c"]]) → [résultats]
export async function lot(commandes) {
  if (!commandes.length) return [];
  const d = await appel("/pipeline", commandes.map((c) => c.map(String)));
  return d.map((x) => {
    if (x.error) throw new Error("Base de la Cote : " + x.error);
    return x.result;
  });
}

// HGETALL rend une liste [champ, valeur, champ, valeur…] : on la transforme en objet.
export const objet = (liste) => {
  const o = {};
  for (let k = 0; liste && k < liste.length; k += 2) o[liste[k]] = liste[k + 1];
  return o;
};

// Verrou court (une action à la fois pour une même personne, un seul calcul à la fois).
export async function verrou(cle, ms = 8000) {
  const ok = await redis("SET", cle, String(Date.now()), "NX", "PX", ms);
  return ok === "OK";
}
export const liberer = (cle) => redis("DEL", cle).catch(() => {});
