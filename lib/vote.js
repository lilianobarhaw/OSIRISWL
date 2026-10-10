// Le vote du jour (accueil, section Mécènes) : une question chaque soir à 21 h, réservée aux Mécènes.
// Servi par api/rangs.js (le site est au maximum de 12 fonctions Vercel) :
//   GET  /api/rangs?vote=1                 → la question en cours, l'état du visiteur, le résultat de la veille
//   POST /api/rangs?vote=1  {jour, choix}  → vote (connexion Discord + rôle Mécène, un seul vote par question)
//   GET  /api/rangs?vote=tick              → publie dans la Loge la question du jour et le résultat de la veille
//                                            (cron de 21 h ; aussi déclenché par la première visite après 21 h)
// Questions : api/_vote/_questions.js. Votes : notés dans un salon privé (DISCORD_VOTES_REGISTRE_ID).
// Annonce : DISCORD_VOTES_ANNONCE_ID (un salon des Mécènes), une fois par jour. Ping facultatif : DISCORD_VOTES_ROLE_ID.
// Le canal 17 voit chaque question 17 minutes avant tout le monde. Les comptes de CASTING_TESTEURS voient la question
// suivante en avance quand aucune n'est ouverte (aperçu : leur vote n'est pas noté).
// Les résultats ne sont montrés qu'aux Mécènes : les candidats ne doivent pas savoir ce qui les attend.
//
// Le registre des décisions : à chaque résultat, le bot poste un « À faire » dans le salon du staff
// (DISCORD_VOTES_STAFF_ID). Ce salon sert aussi de mémoire : le site y lit l'état de chaque décision.
// Quand c'est fait, /decision-realisee jour:AAAA-MM-JJ marque la décision « Réalisée » sur le site et l'annonce dans la Loge.

import { json, readSession, bot, optEnv, keepAlive, cookie, parseCookies } from "./discord.js";
import { AVANCE_MS } from "./canal17.js";
import { QUESTIONS } from "../api/_vote/_questions.js";

const HEURE = 21;
const COULEUR = 0xc4a265;
const MECENES = ["DISCORD_MECENE_ROLE_ID", "DISCORD_MECENE_ARGENT_ROLE_ID", "DISCORD_MECENE_OR_ROLE_ID", "DISCORD_GRAND_MECENE_ROLE_ID"];
const site = () => optEnv("SITE_URL") || "https://osiriswl.vercel.app";

// ---------- Le calendrier ----------

// 21 h à Paris le jour donné (heure d'été comme d'hiver), en millisecondes.
const FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
function heureParis(jour) {
  const [y, m, d] = jour.split("-").map(Number);
  const voulu = Date.UTC(y, m - 1, d, HEURE, 0);
  let t = voulu;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(FORMAT.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    t -= Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - voulu;
  }
  return t;
}
const lendemain = (jour) => { const [y, m, d] = jour.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); };
// « 10 octobre »
const dateFr = (jour) => new Date(heureParis(jour)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const aujourdhui = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now()));

const LISTE = QUESTIONS
  .filter((q) => /^\d{4}-\d{2}-\d{2}$/.test(q.jour || "") && q.question && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4)
  .map((q) => ({ ...q, ouverture: heureParis(q.jour), fermeture: heureParis(lendemain(q.jour)) }))
  .sort((a, b) => a.ouverture - b.ouverture);

const debutPour = (q, c17) => q.ouverture - (c17 ? AVANCE_MS : 0);
// La question ouverte pour ce visiteur (la plus récente, pour que le canal 17 passe à la suivante en avance).
const enCours = (c17, t = Date.now()) => [...LISTE].reverse().find((q) => t >= debutPour(q, c17) && t < q.fermeture);
const derniereClose = (t = Date.now()) => [...LISTE].reverse().find((q) => q.fermeture <= t);
const suivante = (t = Date.now()) => LISTE.find((q) => q.ouverture > t);
const iso = (t) => new Date(t).toISOString();

// ---------- Qui vote ----------

async function session(req) { try { return await readSession(req); } catch { return null; } }
const testeur = (user) => !!user && optEnv("CASTING_TESTEURS").split(/[\s,;]+/).includes(String(user.id));
const aRole = (roles, cle) => { const id = optEnv(cle); return !!id && roles.includes(id); };

// Rôles Discord du visiteur, gardés une minute en mémoire.
const memoire = new Map();
async function rolesDe(userId, frais = false) {
  const guild = optEnv("DISCORD_GUILD_ID");
  if (!guild || !userId) return [];
  const m = memoire.get(userId);
  if (!frais && m && Date.now() - m.at < 60_000) return m.roles;
  let roles = [];
  try {
    const r = await bot(`/guilds/${guild}/members/${userId}`);
    if (r.ok) roles = (await r.json()).roles || [];
  } catch {}
  memoire.set(userId, { roles, at: Date.now() });
  if (memoire.size > 500) memoire.clear();
  return roles;
}

async function profil(req, frais) {
  const user = await session(req);
  const roles = user ? await rolesDe(user.id, frais) : [];
  return { user, c17: aRole(roles, "DISCORD_CANAL17_ROLE_ID"), mecene: MECENES.some((k) => aRole(roles, k)), test: testeur(user) };
}

// ---------- Le registre : un salon privé où le bot note chaque vote ----------
// 🗳 vote 2026-10-10 · <@id> · 2 · pseudo        un vote (seul le premier vote d'une personne compte)
// 📣 question 2026-10-10 / 📣 resultat 2026-10-10  ce qui a déjà été annoncé dans la Loge

const tempsDe = (id) => Number(BigInt(id) >> 22n) + 1420070400000;
let cache = { at: 0, votes: [], marques: [] };

async function lireRegistre(force) {
  const salon = optEnv("DISCORD_VOTES_REGISTRE_ID");
  if (!salon) return cache;
  if (!force && Date.now() - cache.at < 30_000) return cache;
  const limite = Date.now() - 4 * 24 * 3600e3; // les quatre derniers jours suffisent
  const votes = [], marques = [];
  let avant = "";
  for (let page = 0; page < 40; page++) {
    const r = await bot(`/channels/${salon}/messages?limit=100${avant ? "&before=" + avant : ""}`);
    if (!r.ok) break;
    const lot = await r.json();
    for (const m of lot) {
      const c = m.content || "";
      const v = /^🗳 vote (\d{4}-\d{2}-\d{2}) · <@(\d+)> · (\d)/.exec(c);
      if (v) { votes.push({ jour: v[1], id: v[2], choix: +v[3], msg: m.id }); continue; }
      const a = /^📣 (question|resultat) (\d{4}-\d{2}-\d{2})/.exec(c);
      if (a) marques.push({ quoi: a[1], jour: a[2], msg: m.id });
    }
    if (lot.length < 100 || tempsDe(lot.at(-1).id) < limite) break;
    avant = lot.at(-1).id;
  }
  const ordre = (a, b) => (BigInt(a.msg) < BigInt(b.msg) ? -1 : 1);
  votes.sort(ordre); marques.sort(ordre);
  cache = { at: Date.now(), votes, marques };
  return cache;
}

// Le décompte d'une question : le premier vote de chaque personne.
function compter(votes, q) {
  const vus = new Map();
  for (const v of votes) if (v.jour === q.jour && !vus.has(v.id) && v.choix >= 1 && v.choix <= q.options.length) vus.set(v.id, v.choix);
  const voix = q.options.map(() => 0);
  for (const c of vus.values()) voix[c - 1]++;
  const total = vus.size;
  const max = Math.max(...voix);
  return {
    vus,
    public: {
      total,
      options: q.options.map((texte, i) => ({ texte, voix: voix[i], pourcent: total ? Math.round((voix[i] * 100) / total) : 0, gagnant: total > 0 && voix[i] === max })),
    },
  };
}

// Le vote noté dans un cookie : la page le retrouve même si le registre n'a pas encore été relu.
function voteCookie(req, jour) {
  const [j, c] = String(parseCookies(req).osiris_vote || "").split(":");
  return j === jour ? Number(c) || 0 : 0;
}

// ---------- Le registre des décisions : le salon du staff (DISCORD_VOTES_STAFF_ID) ----------
// 📌 décision 2026-10-10 · choix 2                              à faire
// 📌 décision 2026-10-10 · égalité 1+2                          à trancher par la régie
// 📌 décision 2026-10-10 · aucun vote                           rien à faire
// 📌 décision 2026-10-10 · choix 2 · ✅ réalisée 2027-04-03      fait (/decision-realisee)

let decisionsCache = { at: 0, liste: [] };

async function lireDecisions(force) {
  const salon = optEnv("DISCORD_VOTES_STAFF_ID");
  if (!salon) return [];
  if (!force && Date.now() - decisionsCache.at < 60_000) return decisionsCache.liste;
  const liste = [];
  let avant = "";
  for (let page = 0; page < 10; page++) {
    const r = await bot(`/channels/${salon}/messages?limit=100${avant ? "&before=" + avant : ""}`);
    if (!r.ok) break;
    const lot = await r.json();
    for (const m of lot) { // du plus récent au plus ancien : on garde le dernier message de chaque jour
      const d = /^📌 décision (\d{4}-\d{2}-\d{2}) · (?:choix (\d)|égalité ([\d+]+)|(aucun vote))(?: · ✅ réalisée (\d{4}-\d{2}-\d{2}))?/.exec(m.content || "");
      if (!d || liste.some((x) => x.jour === d[1])) continue;
      liste.push({ jour: d[1], choix: d[2] ? [+d[2]] : d[3] ? d[3].split("+").map(Number) : [], aucun: !!d[4], realise: d[5] || null, msg: m });
    }
    if (lot.length < 100) break;
    avant = lot.at(-1).id;
  }
  decisionsCache = { at: Date.now(), liste };
  return liste;
}

// Ce que voient les Mécènes dans le registre du site.
function decisionsPubliques(liste) {
  return liste.map((d) => {
    const q = LISTE.find((x) => x.jour === d.jour);
    if (!q) return null;
    return { jour: d.jour, date: dateFr(d.jour), question: q.question, choix: d.choix.map((i) => q.options[i - 1]).filter(Boolean), aucun: d.aucun, quand: q.quand || "", realise: d.realise ? dateFr(d.realise) : null };
  }).filter(Boolean).sort((a, b) => (a.jour < b.jour ? 1 : -1));
}

function carteAFaire(q, r) {
  const g = r.options.filter((o) => o.gagnant);
  const egalite = g.length > 1;
  return {
    author: { name: !r.total ? "DÉCISION DES MÉCÈNES · AUCUN VOTE" : egalite ? "À TRANCHER · DÉCISION DES MÉCÈNES" : "À FAIRE · DÉCISION DES MÉCÈNES" },
    title: (!r.total ? "Rien à faire" : egalite ? `Égalité : ${g.map((o) => o.texte).join(" ou ")}` : g[0].texte).slice(0, 256),
    description: [
      `*${q.question}*`,
      q.quand ? `**Quand :** ${q.quand}` : "",
      q.usage ? `**Promis aux Mécènes :** ${q.usage}` : "",
      "",
      ...r.options.map((o) => `${o.gagnant ? "◆" : "◇"} ${o.texte} · ${o.pourcent} % (${o.voix})`),
    ].filter((x, i) => x || i === 3).join("\n"),
    footer: { text: r.total ? `Une fois fait : /decision-realisee jour:${q.jour}${egalite ? " choix:<le numéro retenu>" : ""}` : `Vote du ${dateFr(q.jour)}` },
    color: COULEUR,
  };
}

async function noterDecision(q, r) {
  const salon = optEnv("DISCORD_VOTES_STAFF_ID");
  if (!salon) return false;
  const g = r.options.map((o, i) => (o.gagnant ? i + 1 : 0)).filter(Boolean);
  const statut = !r.total ? "aucun vote" : g.length > 1 ? `égalité ${g.join("+")}` : `choix ${g[0]}`;
  const w = await bot(`/channels/${salon}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: `📌 décision ${q.jour} · ${statut}`, allowed_mentions: { parse: [] }, embeds: [carteAFaire(q, r)] }),
  });
  decisionsCache.at = 0;
  return w.ok;
}

// /decision-realisee : marque une décision comme réalisée et l'annonce dans la Loge. Renvoie la réponse à afficher.
export async function realiserDecision({ jour, choix, note, user }) {
  const salon = optEnv("DISCORD_VOTES_STAFF_ID");
  if (!salon) return "Il manque DISCORD_VOTES_STAFF_ID sur Vercel (le salon des décisions).";
  jour = String(jour || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return "Écris la date comme dans le message « À faire » : AAAA-MM-JJ (par exemple 2026-10-10).";
  const q = LISTE.find((x) => x.jour === jour);
  const d = (await lireDecisions(true)).find((x) => x.jour === jour);
  if (!q || !d) return `Aucune décision du ${jour} dans <#${salon}>.`;
  if (d.aucun) return "Personne n'avait voté ce jour-là : il n'y a rien à réaliser.";
  if (d.realise) return `Cette décision est déjà marquée réalisée (le ${dateFr(d.realise)}).`;
  let final = d.choix[0];
  if (d.choix.length > 1) {
    if (!d.choix.includes(Number(choix))) return `Égalité entre ${d.choix.map((i) => `**${i}.** ${q.options[i - 1]}`).join(" et ")}. Relance la commande avec l'option choix (${d.choix.join(" ou ")}).`;
    final = Number(choix);
  }
  const texte = q.options[final - 1];
  const fait = aujourdhui();
  note = String(note || "").trim().slice(0, 300);

  const r1 = await bot(`/channels/${salon}/messages/${d.msg.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      content: `📌 décision ${jour} · choix ${final} · ✅ réalisée ${fait}`,
      embeds: [{
        author: { name: "RÉALISÉE · DÉCISION DES MÉCÈNES" },
        title: texte.slice(0, 256),
        description: d.msg.embeds?.[0]?.description || `*${q.question}*`,
        footer: { text: `Réalisée le ${dateFr(fait)} · ${user?.username || "la régie"}${note ? " · " + note : ""}`.slice(0, 2048) },
        color: 0xe9cf78,
      }],
    }),
  });
  if (!r1.ok) return `Impossible de modifier le message dans <#${salon}> : le bot doit pouvoir y écrire.`;
  decisionsCache.at = 0;

  const loge = optEnv("DISCORD_VOTES_ANNONCE_ID");
  let annonce = false;
  if (loge) {
    const r2 = await bot(`/channels/${loge}/messages`, {
      method: "POST",
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          author: { name: "OSIRIS · DÉCISION RÉALISÉE" },
          title: `La décision du ${dateFr(jour)} s'est réalisée`,
          url: site() + "/#vote",
          description: [`*${q.question}*`, d.choix.length > 1 ? `Les Mécènes étaient partagés, la régie a tranché : **${texte}**.` : `Les Mécènes avaient choisi : **${texte}**.`, note ? `\n${note}` : "", "\nToutes vos décisions sont dans le registre, sur le site."].filter(Boolean).join("\n"),
          color: COULEUR,
        }],
      }),
    }).catch(() => null);
    annonce = !!r2?.ok;
  }
  return `✅ Décision du ${dateFr(jour)} marquée réalisée : « ${texte} ».`
    + (annonce ? ` Annonce postée dans <#${loge}>.` : loge ? " ⚠️ L'annonce dans la Loge n'a pas pu partir." : " (Pas d'annonce : DISCORD_VOTES_ANNONCE_ID manquant.)");
}

// ---------- Lecture ----------

export async function voteGET(req) {
  const url = new URL(req.url);
  if (url.searchParams.get("vote") === "tick") {
    try { return json({ ok: true, ...(await publierSiBesoin()) }, 200, { "Cache-Control": "no-store" }); }
    catch (e) { return json({ ok: false, erreur: e.message }, 500); }
  }

  const { user, c17, mecene, test } = await profil(req, false);
  let reg = cache;
  try { reg = await lireRegistre(false); } catch {}
  const voitResultats = mecene || test;

  let q = enCours(c17);
  let apercu = false;
  if (!q && test) { q = suivante(); apercu = !!q; }

  let question = null;
  if (q) {
    const r = compter(reg.votes, q);
    const monChoix = apercu ? 0 : (user ? r.vus.get(user.id) || voteCookie(req, q.jour) : 0);
    question = {
      jour: q.jour,
      texte: q.question,
      usage: q.usage || "",
      options: q.options,
      ouverture: iso(debutPour(q, c17)),
      fermeture: iso(q.fermeture),
      apercu,
      avance: c17 && Date.now() < q.ouverture, // le canal 17 la voit avant les autres
      monChoix,
      resultats: voitResultats && monChoix ? r.public : undefined,
    };
  }

  const p = derniereClose();
  const veille = p ? { jour: p.jour, texte: p.question, usage: p.usage || "", resultats: voitResultats ? compter(reg.votes, p).public : undefined } : null;
  const s = suivante();

  // Le registre des décisions : en entier pour les Mécènes, seulement le nombre pour les autres.
  let decisions = [];
  try { decisions = decisionsPubliques(await lireDecisions(false)); } catch {}
  const prises = decisions.filter((d) => !d.aucun).length;

  // La première visite après 21 h publie la question dans la Loge, si le cron ne l'a pas déjà fait.
  if (enCours(false)) keepAlive(publierSiBesoin().catch(() => {}));

  // Avant la toute première question (le soir d'Halloween), le bloc reste caché sur l'accueil (sauf pour les testeurs).
  const lance = test || (LISTE.length > 0 && Date.now() >= debutPour(LISTE[0], c17));

  return json({
    maintenant: iso(Date.now()),
    lance,
    connecte: user ? { name: user.name || user.username } : null,
    mecene,
    canal17: c17,
    testeur: test,
    question,
    veille,
    prochaine: s ? iso(debutPour(s, c17)) : null,
    decisionsPrises: prises,
    decisions: voitResultats ? decisions : undefined,
  }, 200, { "Cache-Control": "no-store" });
}

// ---------- Vote ----------

export async function votePOST(req) {
  let b;
  try { b = await req.json(); } catch { return json({ erreur: "Requête invalide." }, 400); }
  const { user, c17, mecene, test } = await profil(req, true);
  if (!user) return json({ erreur: "Connecte-toi avec Discord pour voter.", connexion: true }, 401);
  const choix = Number(b.choix);

  const q = enCours(c17);
  // Aperçu des testeurs : la question suivante, rien n'est noté.
  if (!q && test) {
    const s = suivante();
    if (!s || s.jour !== b.jour) return json({ erreur: "Aucun vote ouvert pour l'instant." }, 403);
    if (!Number.isInteger(choix) || choix < 1 || choix > s.options.length) return json({ erreur: "Choix invalide." }, 400);
    const faux = { total: 1, options: s.options.map((texte, i) => ({ texte, voix: i === choix - 1 ? 1 : 0, pourcent: i === choix - 1 ? 100 : 0, gagnant: i === choix - 1 })) };
    return json({ ok: true, apercu: true, monChoix: choix, resultats: faux });
  }
  if (!q) return json({ erreur: "Aucun vote ouvert pour l'instant." }, 403);
  if (b.jour !== q.jour) return json({ erreur: "Cette question est close. Recharge la page pour voir la nouvelle.", recharger: true }, 409);
  if (!mecene) return json({ erreur: "Le vote est réservé aux Mécènes.", mecene: false }, 403);
  if (!Number.isInteger(choix) || choix < 1 || choix > q.options.length) return json({ erreur: "Choix invalide." }, 400);

  const salon = optEnv("DISCORD_VOTES_REGISTRE_ID");
  if (!salon) return json({ erreur: "Le vote n'est pas encore branché. Reviens un peu plus tard." }, 503);

  let reg = await lireRegistre(true);
  let r = compter(reg.votes, q);
  const deja = r.vus.has(user.id);
  if (!deja) {
    const w = await bot(`/channels/${salon}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: `🗳 vote ${q.jour} · <@${user.id}> · ${choix} · ${user.username}`, allowed_mentions: { parse: [] } }),
    });
    if (!w.ok) return json({ erreur: "Le vote n'a pas pu être noté. Réessaie dans un instant." }, 502);
    reg = await lireRegistre(true);
    r = compter(reg.votes, q);
  }
  const monChoix = r.vus.get(user.id) || choix;
  const headers = new Headers({ "Set-Cookie": cookie("osiris_vote", `${q.jour}:${monChoix}`, 2 * 24 * 3600) });
  return json({ ok: true, deja, monChoix, resultats: r.public }, 200, headers);
}

// ---------- L'annonce dans la Loge ----------

function carteQuestion(q) {
  return {
    author: { name: "OSIRIS · LE VOTE DU JOUR" },
    title: q.question,
    url: site() + "/#vote",
    description: [
      q.options.map((o, i) => `**${i + 1}.** ${o}`).join("\n"),
      q.usage ? `\n*Ce que ça change : ${q.usage}*` : "",
      "\nLes Mécènes votent sur le site jusqu'à demain, 21 h.",
    ].join("\n"),
    color: COULEUR,
  };
}

function carteResultat(q, r) {
  const gagnants = r.options.filter((o) => o.gagnant);
  const tete = !r.total ? "Aucun Mécène n'a voté."
    : gagnants.length > 1 ? `Égalité entre ${gagnants.map((o) => `**${o.texte}**`).join(" et ")} : la régie tranchera.`
    : `Les Mécènes ont choisi : **${gagnants[0].texte}** (${gagnants[0].pourcent} %).`;
  return {
    author: { name: "OSIRIS · RÉSULTAT DU VOTE" },
    title: q.question,
    description: [tete, q.usage && r.total ? `*${q.usage}*` : "", "", ...r.options.map((o) => `${o.gagnant ? "◆" : "◇"} ${o.texte} · ${o.pourcent} % (${o.voix})`)].filter((x, i) => x || i === 2).join("\n"),
    footer: { text: `${r.total} Mécène${r.total > 1 ? "s ont" : " a"} voté` },
    color: COULEUR,
  };
}

let fait = { question: "", resultat: "" }; // ce que cette instance sait déjà annoncé

// Publie ce qui n'a pas encore été annoncé : le résultat de la dernière question close (depuis moins de 3 jours)
// et la question ouverte. Une marque dans le registre évite de l'annoncer deux fois.
export async function publierSiBesoin() {
  const salon = optEnv("DISCORD_VOTES_ANNONCE_ID");
  const registre = optEnv("DISCORD_VOTES_REGISTRE_ID");
  if (!salon || !registre) return { publie: false, raison: "DISCORD_VOTES_ANNONCE_ID ou DISCORD_VOTES_REGISTRE_ID manquant" };
  const q = enCours(false);
  const p = derniereClose();
  const aFaire = [];
  if (p && Date.now() - p.fermeture < 3 * 24 * 3600e3 && fait.resultat !== p.jour) aFaire.push({ quoi: "resultat", q: p });
  if (q && fait.question !== q.jour) aFaire.push({ quoi: "question", q });
  if (!aFaire.length) return { publie: false, raison: "rien de nouveau" };

  let reg = await lireRegistre(true);
  const dejaMarque = (quoi, jour) => reg.marques.some((m) => m.quoi === quoi && m.jour === jour);
  const restant = aFaire.filter((x) => { if (dejaMarque(x.quoi, x.q.jour)) { fait[x.quoi] = x.q.jour; return false; } return true; });
  if (!restant.length) return { publie: false, raison: "déjà annoncé" };

  // On pose les marques d'abord ; si une autre instance l'a fait en même temps, seule la première marque publie.
  const miennes = [];
  for (const x of restant) {
    const w = await bot(`/channels/${registre}/messages`, { method: "POST", body: JSON.stringify({ content: `📣 ${x.quoi} ${x.q.jour}`, allowed_mentions: { parse: [] } }) });
    if (w.ok) miennes.push({ ...x, msg: (await w.json()).id });
  }
  reg = await lireRegistre(true);
  const aPublier = miennes.filter((x) => {
    const premiere = reg.marques.find((m) => m.quoi === x.quoi && m.jour === x.q.jour);
    fait[x.quoi] = x.q.jour;
    return !premiere || premiere.msg === x.msg;
  });
  if (!aPublier.length) return { publie: false, raison: "déjà annoncé par une autre instance" };

  const rangDe = (x) => (x.quoi === "resultat" ? 0 : 1); // le résultat d'hier d'abord, puis la question du jour
  const embeds = aPublier
    .sort((a, b) => rangDe(a) - rangDe(b))
    .map((x) => (x.quoi === "resultat" ? carteResultat(x.q, compter(reg.votes, x.q).public) : carteQuestion(x.q)));
  const ping = aPublier.some((x) => x.quoi === "question") ? optEnv("DISCORD_VOTES_ROLE_ID") : "";
  const w = await bot(`/channels/${salon}/messages`, {
    method: "POST",
    body: JSON.stringify({ ...(ping ? { content: `<@&${ping}>` } : {}), allowed_mentions: { parse: [], roles: ping ? [ping] : [] }, embeds }),
  });
  // Le « À faire » du staff, pour ne jamais oublier une promesse faite aux Mécènes.
  let staff = false;
  for (const x of aPublier.filter((x) => x.quoi === "resultat")) staff = (await noterDecision(x.q, compter(reg.votes, x.q).public).catch(() => false)) || staff;
  return { publie: w.ok, staff, annonce: aPublier.map((x) => `${x.quoi} ${x.q.jour}`) };
}
