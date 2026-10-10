// Le mot du jour (page /mot) : un mot de 5 lettres à trouver en 6 essais, un nouveau chaque soir à 21 h (heure de Paris).
// Servi par api/rangs.js (le site est au maximum de 12 fonctions Vercel) :
//   GET  /api/rangs?mot=1              → le mot en cours (jamais la réponse), la partie du visiteur, les classements
//   POST /api/rangs?mot=1 {essai}      → un essai : le serveur répond lettre par lettre ; le mot ne quitte jamais le serveur
// Il faut être connecté avec Discord pour jouer : une seule partie par personne et par mot.
//
// Registre (salon privé DISCORD_MOT_REGISTRE_ID) : une ligne par joueur et par mot, posée au premier essai, complétée à la fin.
//   🔤 mot 2026-11-01 · <@id> · en cours · pseudo
//   🔤 mot 2026-11-01 · <@id> · trouvé 3 · NEIGE,MINES,GIVRE · 2026-11-01T20:04:12.000Z · série 4 · pseudo
// Classement du soir : le moins d'essais, puis le plus rapide. Classement de la semaine : 7 − essais par mot trouvé
// (en 1 essai = 6 points, en 6 = 1 point), remis à zéro chaque lundi à 21 h (quand le mot du dimanche se ferme).
// Annonce (facultative, DISCORD_MOT_ANNONCE_ID) : chaque soir à 21 h, le mot de la veille et le premier à l'avoir trouvé ;
// le lundi, le podium de la semaine, et le rôle DISCORD_MOT_ROLE_ID (facultatif) pour le premier.
// Le canal 17 a chaque mot 17 minutes avant. Les comptes de CASTING_TESTEURS s'entraînent avant l'ouverture (rien n'est noté).
// Pour retirer une partie suspecte : supprimer sa ligne dans le registre.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { json, readSession, bot, optEnv, env, keepAlive, cookie, parseCookies } from "./discord.js";
import { estMembre, AVANCE_MS } from "./canal17.js";
import { MOTS, ENTRAINEMENT } from "../api/_mot/_mots.js";
import { DICO } from "../api/_mot/_dico.js";

const HEURE = 21;
const ESSAIS = 6;
const COULEUR = 0xc4a265;
const MEDAILLES = ["🥇", "🥈", "🥉"];
const COOKIE = "osiris_mot";
const site = () => optEnv("SITE_URL") || "https://osiriswl.vercel.app";
const iso = (t) => new Date(t).toISOString();

// ---------- Les mots ----------

// « Forêt » → « FORET » : on joue sans accents.
export const norm = (s) => String(s || "").replace(/œ/gi, "oe").replace(/æ/gi, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
const ACCEPTES = new Set(DICO.match(/[A-Z]{5}/g));
for (const m of [...MOTS, ...ENTRAINEMENT]) ACCEPTES.add(norm(m));

// Pour chaque lettre : 2 = bien placée, 1 = dans le mot mais ailleurs, 0 = absente (une lettre en double n'est comptée qu'autant de fois qu'elle est dans le mot).
export function marquer(essai, mot) {
  const r = ["0", "0", "0", "0", "0"], reste = {};
  for (let i = 0; i < 5; i++) {
    if (essai[i] === mot[i]) r[i] = "2";
    else reste[mot[i]] = (reste[mot[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) if (r[i] !== "2" && reste[essai[i]] > 0) { r[i] = "1"; reste[essai[i]]--; }
  return r.join("");
}
function partie(essais, affichage) {
  const mot = norm(affichage);
  const trouve = essais.at(-1) === mot;
  const fini = trouve || essais.length >= ESSAIS;
  return { essais: essais.map((e) => ({ mot: e, marques: marquer(e, mot) })), fini, trouve, mot: fini ? affichage.toUpperCase() : undefined };
}

// ---------- Le calendrier ----------

const PREMIER_PAR_DEFAUT = "2026-10-31"; // le soir d'Halloween
const premierJour = () => (/^\d{4}-\d{2}-\d{2}$/.test(optEnv("MOT_PREMIER_JOUR")) ? optEnv("MOT_PREMIER_JOUR") : PREMIER_PAR_DEFAUT);
const PARIS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const partsParis = (t) => Object.fromEntries(PARIS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
const ymd = (jour) => jour.split("-").map(Number);
const decaler = (jour, n) => { const [y, m, d] = ymd(jour); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const ecart = (a, b) => { const [y1, m1, d1] = ymd(a), [y2, m2, d2] = ymd(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5); };
// 21 h à Paris ce jour-là (heure d'été comme d'hiver), en millisecondes.
function aParis(jour, heure = HEURE) {
  const [y, m, d] = ymd(jour);
  const voulu = Date.UTC(y, m - 1, d, heure, 0);
  let t = voulu;
  for (let i = 0; i < 2; i++) { const p = partsParis(t); t -= Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - voulu; }
  return t;
}
// Le mot ouvert à l'instant t : celui du jour même après 21 h, celui de la veille avant.
function jourA(t) {
  const p = partsParis(t), date = `${p.year}-${p.month}-${p.day}`;
  return +p.hour >= HEURE ? date : decaler(date, -1);
}
const avance = (c17) => (c17 ? AVANCE_MS : 0);
const jourPour = (c17, t = Date.now()) => jourA(t + avance(c17));
const numero = (jour) => ecart(premierJour(), jour) + 1;
const lancement = (c17) => aParis(premierJour()) - avance(c17);
const motDu = (jour) => MOTS[(((numero(jour) - 1) % MOTS.length) + MOTS.length) % MOTS.length];
const finDu = (jour, c17) => aParis(decaler(jour, 1)) - avance(c17);

// Les semaines : du mot du lundi au mot du dimanche (qui se ferme le lundi à 21 h).
function semaineDe(jour) {
  const [y, m, d] = ymd(jour);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // lundi = 0
  const jeudi = new Date(Date.UTC(y, m - 1, d - dow + 3));
  const an = jeudi.getUTCFullYear();
  const num = Math.ceil(((jeudi - Date.UTC(an, 0, 1)) / 864e5 + 1) / 7);
  const lundi = decaler(jour, -dow);
  return { cle: `${an}-W${String(num).padStart(2, "0")}`, lundi, dimanche: decaler(lundi, 6), dow };
}
// La semaine du lancement (samedi soir) ne compte que deux mots : elle compte avec la suivante.
function semaineDeJeu(jour) {
  const s = semaineDe(jour), p = semaineDe(premierJour());
  if (s.cle === p.cle && p.dow >= 4) { const suivante = semaineDe(decaler(p.lundi, 7)); return { ...suivante, lundi: p.lundi }; }
  return s;
}
const finSemaine = (s) => aParis(decaler(s.dimanche, 1));
const semaineAvant = (s) => semaineDeJeu(decaler(s.lundi, -1));

// ---------- Qui joue ----------

async function session(req) { try { return await readSession(req); } catch { return null; } }
const testeur = (user) => !!user && optEnv("CASTING_TESTEURS").split(/[\s,;]+/).includes(String(user.id));
const canal17 = async (user) => (user ? estMembre(optEnv("DISCORD_GUILD_ID"), user.id) : false);
const nomDe = (user) => String(user.name || user.username || "Joueur").replace(/[\n\r·]/g, " ").trim().slice(0, 32) || "Joueur";

// ---------- La partie en cours : dans un cookie signé (les essais), le registre gardant le début et la fin ----------

const signer = (texte) => createHmac("sha256", env("SESSION_SECRET")).update("mot:" + texte).digest("base64url");
function ecrireJeton(o) {
  const base = [o.j, o.u, o.m, o.e.join("-")].join(".");
  return cookie(COOKIE, base + "." + signer(base), 30 * 3600);
}
function lireJeton(req, uid) {
  const [j, u, m, e, sig] = String(parseCookies(req)[COOKIE] || "").split(".");
  if (!sig || u !== String(uid)) return null;
  const attendu = Buffer.from(signer([j, u, m, e].join("."))), recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  return { j, u, m, e: e ? e.split("-").filter((x) => /^[A-Z]{5}$/.test(x)).slice(0, ESSAIS) : [] };
}
// Ce que cette instance a déjà vu de chaque partie : un vieux cookie remis en place ne permet pas de rejouer un essai.
const vus = new Map();
const cleVue = (uid, jour) => uid + ":" + jour;

// ---------- Le registre ----------

const tempsDe = (id) => Number(BigInt(id) >> 22n) + 1420070400000;
const flocon = (t) => String(BigInt(Math.max(0, Math.floor(t) - 1420070400000)) << 22n);
const ordre = (a, b) => (BigInt(a.msg) < BigInt(b.msg) ? -1 : 1);
const LIGNE = /^🔤 mot (\d{4}-\d{2}-\d{2}) · <@(\d+)> · (en cours|trouvé ([1-6])|perdu)(?: · ([A-Z,]*) · (\S+) · série (\d+))? · (.*)$/;

function analyser(lot, lignes, marques) {
  for (const m of lot) {
    const c = m.content || "";
    const l = LIGNE.exec(c);
    if (l) {
      const etat = l[3] === "en cours" ? "en cours" : l[3] === "perdu" ? "perdu" : "trouve";
      lignes.push({ jour: l[1], id: l[2], etat, essais: etat === "trouve" ? +l[4] : etat === "perdu" ? ESSAIS : 0, mots: (l[5] || "").split(",").filter(Boolean), fin: l[6] ? Date.parse(l[6]) || 0 : 0, serie: +(l[7] || 0), nom: l[8].slice(0, 40), msg: m.id });
      continue;
    }
    const a = /^📣 mot (\d{4}-\d{2}-\d{2})/.exec(c);
    if (a) marques.push({ jour: a[1], msg: m.id });
  }
}

let cache = { at: 0, lignes: [], marques: [] };
async function lireRegistre(force) {
  const salon = optEnv("DISCORD_MOT_REGISTRE_ID");
  if (!salon) return cache;
  if (!force && Date.now() - cache.at < 30_000) return cache;
  const limite = Date.now() - 17 * 864e5; // la semaine en cours et la précédente
  const lignes = [], marques = [];
  let avant = "";
  for (let page = 0; page < 60; page++) {
    const r = await bot(`/channels/${salon}/messages?limit=100${avant ? "&before=" + avant : ""}`);
    if (!r.ok) { if (!page) throw new Error("registre illisible (" + r.status + ")"); break; }
    const lot = await r.json();
    analyser(lot, lignes, marques);
    if (lot.length < 100 || tempsDe(lot.at(-1).id) < limite) break;
    avant = lot.at(-1).id;
  }
  lignes.sort(ordre); marques.sort(ordre);
  cache = { at: Date.now(), lignes, marques };
  return cache;
}
// Les lignes d'un seul mot, lues fraîchement (les messages postés depuis son ouverture).
async function lignesDu(jour) {
  const salon = optEnv("DISCORD_MOT_REGISTRE_ID");
  const lignes = [], marques = [];
  let apres = flocon(aParis(jour) - AVANCE_MS - 60_000);
  for (let page = 0; page < 30; page++) {
    const r = await bot(`/channels/${salon}/messages?limit=100&after=${apres}`);
    if (!r.ok) throw new Error("registre illisible (" + r.status + ")");
    const lot = await r.json();
    analyser(lot, lignes, marques);
    if (lot.length < 100) break;
    apres = lot.reduce((x, m) => (BigInt(m.id) > BigInt(x) ? m.id : x), apres);
  }
  return lignes.filter((l) => l.jour === jour).sort(ordre);
}
// Les messages juste autour d'un message : pour savoir qui a écrit le premier quand deux écrivent en même temps.
async function autourDe(msg) {
  const r = await bot(`/channels/${optEnv("DISCORD_MOT_REGISTRE_ID")}/messages?around=${msg}&limit=50`);
  const lignes = [], marques = [];
  if (r.ok) analyser(await r.json(), lignes, marques);
  return { lignes: lignes.sort(ordre), marques: marques.sort(ordre) };
}
// Garde le cache de cette instance à jour après une écriture.
function retenir(ligne) {
  const i = cache.lignes.findIndex((l) => l.msg === ligne.msg);
  if (i >= 0) cache.lignes[i] = ligne; else { cache.lignes.push(ligne); cache.lignes.sort(ordre); }
}

// Une ligne par joueur et par mot (la première ; une ligne finie l'emporte sur une ligne « en cours »).
function parJoueur(lignes, jour) {
  const m = new Map();
  for (const l of lignes) {
    if (l.jour !== jour) continue;
    const avant = m.get(l.id);
    if (!avant || (avant.etat === "en cours" && l.etat !== "en cours")) m.set(l.id, l);
  }
  return m;
}
function classementJour(lignes, jour) {
  const finis = [...parJoueur(lignes, jour).values()].filter((l) => l.etat !== "en cours");
  const liste = finis.filter((l) => l.etat === "trouve").sort((a, b) => a.essais - b.essais || a.fin - b.fin).map((x, i) => ({ ...x, rang: i + 1 }));
  return { liste, trouves: liste.length, joueurs: finis.length };
}
function classementSemaine(lignes, cle) {
  const total = new Map();
  for (const jour of new Set(lignes.map((l) => l.jour))) {
    if (semaineDeJeu(jour).cle !== cle) continue;
    for (const l of parJoueur(lignes, jour).values()) {
      if (l.etat !== "trouve") continue;
      const t = total.get(l.id) || { id: l.id, nom: l.nom, points: 0, mots: 0, derniere: 0, dernierMsg: "0" };
      t.points += 7 - l.essais; t.mots += 1; t.derniere = Math.max(t.derniere, l.fin);
      if (BigInt(l.msg) > BigInt(t.dernierMsg)) { t.nom = l.nom; t.dernierMsg = l.msg; } // le dernier pseudo connu
      total.set(l.id, t);
    }
  }
  return [...total.values()].sort((a, b) => b.points - a.points || a.derniere - b.derniere).map((x, i) => ({ ...x, rang: i + 1 }));
}
// La série d'un joueur : les mots trouvés d'affilée, jusqu'à celui d'aujourd'hui (ou d'hier s'il n'a pas encore joué).
function serieDe(lignes, jour, uid) {
  const auj = parJoueur(lignes, jour).get(uid);
  if (auj && auj.etat !== "en cours") return auj.etat === "trouve" ? auj.serie : 0;
  const hier = parJoueur(lignes, decaler(jour, -1)).get(uid);
  return hier && hier.etat === "trouve" ? hier.serie : 0;
}

const publicJour = (c, uid) => ({
  liste: c.liste.slice(0, 10).map((x) => ({ rang: x.rang, nom: x.nom, essais: x.essais, heure: iso(x.fin), moi: x.id === uid })),
  trouves: c.trouves,
  joueurs: c.joueurs,
  moi: (() => { const x = c.liste.find((y) => y.id === uid); return x ? { rang: x.rang, essais: x.essais, heure: iso(x.fin) } : null; })(),
});
const publicSemaine = (c, uid) => ({
  liste: c.slice(0, 10).map((x) => ({ rang: x.rang, nom: x.nom, points: x.points, mots: x.mots, moi: x.id === uid })),
  joueurs: c.length,
  moi: (() => { const x = c.find((y) => y.id === uid); return x ? { rang: x.rang, points: x.points, mots: x.mots } : null; })(),
});

// ---------- Lecture ----------

export async function motGET(req) {
  const user = await session(req);
  const uid = user ? String(user.id) : "";
  const c17 = await canal17(user);
  const test = testeur(user);
  const t = Date.now();
  const lance = t >= lancement(c17);
  const jour = lance ? jourPour(c17, t) : null;
  let reg = cache;
  try { reg = await lireRegistre(false); } catch {}

  let p = null, ailleurs = false, entrainement = false;
  if (lance && user) {
    const tok = lireJeton(req, uid);
    const ligne = parJoueur(reg.lignes, jour).get(uid);
    if (ligne && ligne.etat !== "en cours") p = partie(ligne.mots, motDu(jour));
    else if (tok && tok.j === jour) p = partie(tok.e, motDu(jour));
    else if (ligne) ailleurs = true;
  } else if (!lance && test) {
    entrainement = true;
    const tok = lireJeton(req, uid);
    if (tok && /^e\d+$/.test(tok.j) && ENTRAINEMENT[+tok.j.slice(1)]) p = partie(tok.e, ENTRAINEMENT[+tok.j.slice(1)]);
  }

  // Le mot d'hier, une fois fermé pour tout le monde.
  let hier = null;
  if (lance && numero(jour) > 1 && t >= aParis(jour)) {
    const h = decaler(jour, -1), c = classementJour(reg.lignes, h);
    hier = { numero: numero(h), mot: motDu(h).toUpperCase(), trouves: c.trouves, joueurs: c.joueurs, premier: c.liste[0] ? { nom: c.liste[0].nom, essais: c.liste[0].essais } : null };
  }
  const s = semaineDeJeu(jour || premierJour());
  const avant = numero(semaineAvant(s).dimanche) >= 1 ? classementSemaine(reg.lignes, semaineAvant(s).cle).slice(0, 3) : [];

  // La première visite après 21 h publie l'annonce du soir, si le cron ne l'a pas déjà fait.
  if (t >= aParis(premierJour()) + 864e5) keepAlive(publierMot().catch(() => {}));

  return json({
    maintenant: iso(t),
    lancement: iso(lancement(c17)),
    lance,
    connecte: user ? { name: nomDe(user) } : null,
    testeur: test,
    canal17: c17,
    entrainement,
    jour: lance ? { cle: jour, numero: numero(jour), fin: iso(finDu(jour, c17)), avance: c17 && t < aParis(jour) } : null,
    partie: p,
    ailleurs,
    essaisMax: ESSAIS,
    serie: lance && user ? serieDe(reg.lignes, jour, uid) : 0,
    soir: lance ? publicJour(classementJour(reg.lignes, jour), uid) : null,
    semaine: { cle: s.cle, fin: iso(finSemaine(s)), ...publicSemaine(classementSemaine(reg.lignes, s.cle), uid) },
    hier,
    podiumPrecedent: avant.map((x) => ({ nom: x.nom, points: x.points })),
  }, 200, { "Cache-Control": "no-store" });
}

// ---------- Un essai ----------

const verrous = new Map(); // un essai à la fois par joueur sur cette instance
async function unParUn(cle, f) {
  const avant = verrous.get(cle) || Promise.resolve();
  let liberer; const tour = new Promise((r) => (liberer = r));
  const suite = avant.then(() => tour);
  verrous.set(cle, suite);
  await avant;
  try { return await f(); } finally { liberer(); if (verrous.get(cle) === suite) verrous.delete(cle); }
}

export async function motPOST(req) {
  let b;
  try { b = await req.json(); } catch { return json({ erreur: "Requête invalide." }, 400); }
  const user = await session(req);
  if (!user) return json({ erreur: "Connecte-toi avec Discord pour jouer.", connexion: true }, 401);
  const uid = String(user.id);
  return unParUn(uid, () => essayer(req, b, user, uid));
}

async function essayer(req, b, user, uid) {
  const c17 = await canal17(user);
  const t = Date.now();

  // Avant l'ouverture : entraînement pour les testeurs, sur des mots qui ne sortiront jamais.
  if (t < lancement(c17)) {
    if (!testeur(user)) return json({ erreur: "Le mot du jour arrive le soir d'Halloween, à 21 h." }, 403);
    let tok = lireJeton(req, uid);
    if (!tok || !/^e\d+$/.test(tok.j) || !ENTRAINEMENT[+tok.j.slice(1)] || b.action === "nouveau") tok = { j: "e" + randomInt(ENTRAINEMENT.length), u: uid, m: "0", e: [] };
    const affichage = ENTRAINEMENT[+tok.j.slice(1)];
    if (b.action === "nouveau") return json({ ok: true, entrainement: true, partie: partie([], affichage) }, 200, { "Set-Cookie": ecrireJeton(tok) });
    const essai = norm(b.essai);
    if (essai.length !== 5) return json({ erreur: "Il faut un mot de 5 lettres." }, 400);
    if (!ACCEPTES.has(essai)) return json({ erreur: "Ce mot n'est pas dans le dictionnaire.", inconnu: true }, 422);
    if (partie(tok.e, affichage).fini) return json({ erreur: "Ce mot d'entraînement est fini.", fini: true }, 409);
    tok.e.push(essai);
    return json({ ok: true, entrainement: true, partie: partie(tok.e, affichage) }, 200, { "Set-Cookie": ecrireJeton(tok) });
  }

  const salon = optEnv("DISCORD_MOT_REGISTRE_ID");
  if (!salon) return json({ erreur: "Le mot du jour n'est pas encore branché sur Discord." }, 503);
  const essai = norm(b.essai);
  if (essai.length !== 5) return json({ erreur: "Il faut un mot de 5 lettres." }, 400);
  if (!ACCEPTES.has(essai)) return json({ erreur: "Ce mot n'est pas dans le dictionnaire.", inconnu: true }, 422);

  const jour = jourPour(c17, t), affichage = motDu(jour);
  // Le mot a pu changer pendant que le joueur tapait (21 h) : on le lui dit plutôt que de compter l'essai sur le nouveau mot.
  if (b.jour && b.jour !== jour) return json({ erreur: "Un nouveau mot vient d'arriver.", recharger: true }, 409);

  let tok = lireJeton(req, uid);
  if (tok && tok.j !== jour) tok = null;
  const cle = cleVue(uid, jour);
  if (tok && (vus.get(cle) || 0) > tok.e.length) return json({ erreur: "Cette partie a avancé dans un autre onglet.", recharger: true }, 409);
  if (tok && partie(tok.e, affichage).fini) return json({ erreur: "Tu as déjà joué le mot du jour. Le prochain arrive à 21 h.", fini: true, recharger: true }, 409);

  if (!tok) {
    // Premier essai : personne ne doit déjà avoir une ligne pour ce mot (autre navigateur, autre appareil).
    let deja;
    try { deja = (await lignesDu(jour)).filter((l) => l.id === uid); }
    catch { return json({ erreur: "Le registre ne répond pas. Réessaie dans un instant.", reessayer: true }, 503); }
    if (deja.length) {
      const finie = deja.some((l) => l.etat !== "en cours");
      return json({ erreur: finie ? "Tu as déjà joué le mot du jour. Le prochain arrive à 21 h." : "Tu as commencé ce mot sur un autre appareil ou un autre navigateur : termine-le là-bas.", fini: finie, ailleurs: !finie, recharger: true }, 409);
    }
    const r = await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify({ content: `🔤 mot ${jour} · <@${uid}> · en cours · ${nomDe(user)}`, allowed_mentions: { parse: [] } }) });
    if (!r.ok) return json({ erreur: "Le registre ne répond pas. Réessaie dans un instant.", reessayer: true }, 503);
    const msg = (await r.json()).id;
    // Deux premiers essais partis en même temps (deux onglets) : seule la première ligne compte.
    const premiere = (await autourDe(msg)).lignes.find((l) => l.jour === jour && l.id === uid);
    if (premiere && premiere.msg !== msg) {
      await bot(`/channels/${salon}/messages/${msg}`, { method: "DELETE" }).catch(() => {});
      return json({ erreur: "Tu as commencé ce mot dans un autre onglet : termine-le là-bas.", ailleurs: true, recharger: true }, 409);
    }
    retenir({ jour, id: uid, etat: "en cours", essais: 0, mots: [], fin: 0, serie: 0, nom: nomDe(user), msg });
    tok = { j: jour, u: uid, m: msg, e: [] };
  }

  tok.e.push(essai);
  vus.set(cle, tok.e.length);
  if (vus.size > 5000) vus.clear();
  const p = partie(tok.e, affichage);
  let fin = {};
  if (p.fini) fin = await terminer(user, uid, jour, tok, p);
  return json({ ok: true, jour, partie: p, ...fin }, 200, { "Set-Cookie": ecrireJeton(tok) });
}

async function terminer(user, uid, jour, tok, p) {
  const salon = optEnv("DISCORD_MOT_REGISTRE_ID");
  let reg = cache;
  try { reg = await lireRegistre(false); } catch {}
  const veille = parJoueur(reg.lignes, decaler(jour, -1)).get(uid);
  const serie = p.trouve ? (veille && veille.etat === "trouve" ? veille.serie + 1 : 1) : 0;
  const fin = Date.now();
  const etat = p.trouve ? "trouvé " + tok.e.length : "perdu";
  const w = await bot(`/channels/${salon}/messages/${tok.m}`, {
    method: "PATCH",
    body: JSON.stringify({ content: `🔤 mot ${jour} · <@${uid}> · ${etat} · ${tok.e.join(",")} · ${iso(fin)} · série ${serie} · ${nomDe(user)}`, allowed_mentions: { parse: [] } }),
  });
  if (w.ok) retenir({ jour, id: uid, etat: p.trouve ? "trouve" : "perdu", essais: p.trouve ? tok.e.length : ESSAIS, mots: [...tok.e], fin, serie, nom: nomDe(user), msg: tok.m });

  let lignes = null;
  try { lignes = await lignesDu(jour); } catch {}
  const c = classementJour(lignes || cache.lignes, jour);
  const moi = c.liste.find((x) => x.id === uid);
  return { note: w.ok, serie, points: p.trouve ? 7 - tok.e.length : 0, rang: moi ? moi.rang : 0, trouves: c.trouves, joueurs: c.joueurs };
}

// ---------- L'annonce du soir (et le podium du lundi) ----------

let annonceFaite = "";
export async function publierMot() {
  const salon = optEnv("DISCORD_MOT_ANNONCE_ID"), registre = optEnv("DISCORD_MOT_REGISTRE_ID");
  if (!salon || !registre) return { annonce: false, raison: "DISCORD_MOT_ANNONCE_ID ou DISCORD_MOT_REGISTRE_ID manquant" };
  const jour = jourA(Date.now()), hier = decaler(jour, -1);
  if (numero(hier) < 1) return { annonce: false, raison: "pas encore de mot fermé" };
  if (annonceFaite === hier) return { annonce: false, raison: "déjà fait" };
  let reg = await lireRegistre(true);
  if (reg.marques.some((m) => m.jour === hier)) { annonceFaite = hier; return { annonce: false, raison: "déjà fait" }; }

  // La marque d'abord ; si deux instances l'ont posée en même temps, seule la première annonce.
  const m = await bot(`/channels/${registre}/messages`, { method: "POST", body: JSON.stringify({ content: `📣 mot ${hier}`, allowed_mentions: { parse: [] } }) });
  if (!m.ok) return { annonce: false, raison: "registre inaccessible" };
  const mienne = (await m.json()).id;
  annonceFaite = hier;
  const premiere = (await autourDe(mienne)).marques.find((x) => x.jour === hier);
  if (premiere && premiere.msg !== mienne) return { annonce: false, raison: "déjà annoncé par une autre instance" };

  const c = classementJour(reg.lignes, hier);
  const premier = c.liste[0];
  const s = semaineDeJeu(hier);
  const podium = hier === s.dimanche ? classementSemaine(reg.lignes, s.cle).slice(0, 3) : [];
  const heure = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", " h ");
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const lignes = [
    c.joueurs ? `${c.trouves ? pluriel(c.trouves, "joueur") + (c.trouves > 1 ? " l'ont trouvé" : " l'a trouvé") : "Personne ne l'a trouvé"}, sur ${c.joueurs}.` : "Personne ne l'a tenté.",
    premier ? `Premier à le trouver : <@${premier.id}>, en ${pluriel(premier.essais, "essai")}, à ${heure(premier.fin)}.` : "",
  ];
  if (podium.length) {
    lignes.push("", "**Le podium de la semaine**", ...podium.map((x, i) => `${MEDAILLES[i]} <@${x.id}> · **${x.points}** points · ${pluriel(x.mots, "mot")}`), "Le classement repart de zéro.");
  }
  lignes.push("", `Le mot n° ${numero(jour)} t'attend.`);

  const w = await bot(`/channels/${salon}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: podium.length ? podium.map((x) => `<@${x.id}>`).join(" ") : "",
      allowed_mentions: { users: podium.map((x) => x.id) },
      embeds: [{
        author: { name: "OSIRIS · LE MOT DU JOUR" },
        title: `Le mot n° ${numero(hier)} était ${motDu(hier).toUpperCase()}`,
        url: site() + "/mot",
        description: lignes.filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim(),
        color: COULEUR,
      }],
    }),
  });

  // Le rôle du premier de la semaine (facultatif) : retiré au précédent, donné au nouveau.
  const role = optEnv("DISCORD_MOT_ROLE_ID"), guild = optEnv("DISCORD_GUILD_ID");
  if (podium.length && role && guild) {
    const ancien = classementSemaine(reg.lignes, semaineAvant(s).cle)[0];
    if (ancien && ancien.id !== podium[0].id) await bot(`/guilds/${guild}/members/${ancien.id}/roles/${role}`, { method: "DELETE" }).catch(() => {});
    await bot(`/guilds/${guild}/members/${podium[0].id}/roles/${role}`, { method: "PUT", headers: { "X-Audit-Log-Reason": encodeURIComponent("Le mot du jour : premier de la semaine") } }).catch(() => {});
  }
  return { annonce: w.ok, mot: hier, trouves: c.trouves, joueurs: c.joueurs, podium: podium.map((x) => `${x.nom} ${x.points}`) };
}
