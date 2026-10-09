// Dates du casting (heure de Paris). C'est ici, et seulement ici, que le site décide si le casting est ouvert.
// On peut aussi les changer sans toucher au code, avec des variables Vercel :
//   CASTING_OUVERTURE   ex. 2027-02-20T23:30:00+01:00   (heure d'hiver : +01:00)
//   CASTING_FERMETURE   ex. 2027-03-14T23:59:59+01:00
//   CASTING_TESTEURS    identifiants Discord séparés par des virgules : ces comptes peuvent
//                       tester le formulaire même quand le casting est fermé au public.

export const OUVERTURE = "2027-02-20T23:30:00+01:00"; // finale du TOURNOI BARHAW, première cinématique
export const FERMETURE = "2027-03-14T23:59:59+01:00";

const read = (k) => (process.env[k] || "").trim();

// Le canal 17 (récompense du jeu de piste) peut envoyer son dossier quelques minutes avant tout le monde.
import { estMembre, AVANCE_MINUTES } from "./canal17.js";

export function etatCasting(userId) {
  const ouverture = new Date(read("CASTING_OUVERTURE") || OUVERTURE).getTime();
  const fermeture = new Date(read("CASTING_FERMETURE") || FERMETURE).getTime();
  const now = Date.now();
  const testeur = !!userId && read("CASTING_TESTEURS").split(/[\s,;]+/).includes(String(userId));
  const etat = now < ouverture ? "bientot" : now > fermeture ? "ferme" : "ouvert";
  return {
    etat,
    testeur,
    ouverture: new Date(ouverture).toISOString(),
    fermeture: new Date(fermeture).toISOString(),
    maintenant: new Date(now).toISOString(),
  };
}

export function dateFr(iso) {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const heure = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  return heure === "00:00" ? jour : `${jour} à ${heure.replace(":", "h")}`;
}

// Comme etatCasting, mais tient compte de l'accès anticipé du canal 17 (une vérification sur Discord).
// Pour un membre du canal 17, « ouverture » devient son heure à lui : 17 minutes plus tôt.
export async function etatPour(user) {
  const c = etatCasting(user?.id);
  if (c.etat !== "bientot" || !user) return c;
  if (!(await estMembre(read("DISCORD_GUILD_ID"), user.id))) return c;
  const avance = new Date(c.ouverture).getTime() - AVANCE_MINUTES * 60 * 1000;
  return { ...c, etat: Date.now() >= avance ? "ouvert" : "bientot", ouverture: new Date(avance).toISOString(), canal17: true };
}
