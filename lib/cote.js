// La Cote et la Bourse d'Osiris.
//
// La Cote : après chaque soirée, les Mécènes votent pour leurs 3 favoris (bouton « Voter » dans #la-cote),
// jusqu'au lendemain midi. La régie ajoute une note de spectacle (0 à 10) avec /cote notes. Le score d'une séance
// = moitié votes, moitié spectacle ; la Cote suit ce score (moitié l'ancienne Cote, moitié la nouvelle séance).
//
// La Bourse : chaque Mécène a 10 000 crédits fictifs (jamais d'argent réel) et achète des parts des candidats
// avec les boutons du panneau de #la-cote. Le prix d'une part = 20 + 2 × Cote, recalculé après chaque vote de la Cote.
// Un mort = une faillite (prix 0). La Sortie = cotation suspendue : les parts restent, gelées, pour la suite.
//
// Commandes de la régie (/cote, fondateurs et admins) : panneau, candidats, ouvrir, notes, calculer, mort, sortie,
// bandeau, etat. Le bandeau du stream lit /api/bourse (rien n'en sort tant que /cote bandeau n'est pas activé).

import { bot, json, optEnv, isDirection, readSession } from "./discord.js";
import { redis, lot, objet, verrou, liberer, baseConfiguree } from "./redis.js";

const P = "osiris:";
const K = {
  candidats: P + "cote:candidats",        // id → JSON { nom, court, etat, prog, n, prixAvant, coteAvant }
  etat: P + "cote:etat",                  // seance, ouvert, fin, calculee, bandeau, devise, dimanche
  votes: (s) => P + `cote:votes:${s}`,    // membre → "id.id.id"
  notes: (s) => P + `cote:notes:${s}`,    // id → note de spectacle (0 à 10)
  avant: (s) => P + `cote:avant:${s}`,    // la Cote et les prix juste avant le calcul de la séance (pour pouvoir le refaire)
  valeurs: P + "cote:valeurs",            // id → Cote (0 à 100)
  prix: P + "bourse:prix",                // id → prix d'une part
  prec: P + "bourse:prec",                // id → prix avant le dernier calcul (pour la variation)
  credits: P + "bourse:credits",          // membre → crédits
  parts: (u) => P + `bourse:parts:${u}`,  // id → parts, et « i:id » → crédits investis
  noms: P + "bourse:noms",                // membre → nom affiché
  hist: P + "cote:historique",            // une ligne par calcul
};
export const DEPART = 10000;
export const PRIX_DEPART = 120; // le prix de chaque candidat à l'introduction en Bourse (Cote de départ : 50)
const EPHEMERAL = 64;
const OR = 0xc4a265, ROUGE = 0xb5564a;
const DEVISE = "Le premier sortira.";
const PROG = () => String(optEnv("COTE_PROGRAMME") || "01").padStart(2, "0");
const salonCote = (i) => optEnv("DISCORD_COTE_CHANNEL_ID") || i?.channel_id || "";

export const prixDe = (cote) => Math.round(20 + 2 * Number(cote || 0));
const fr = (n) => Math.round(n).toLocaleString("fr-FR");
const pct = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const variation = (prix, prec) => (prec > 0 ? ((prix - prec) / prec) * 100 : 0);
const fleche = (v) => (v > 0.05 ? "▲" : v < -0.05 ? "▼" : "=");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nomDe = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || i.user?.username || "?";

const reponse = (content, extra = {}) => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const maj = (content, extra = {}) => json({ type: 7, data: { content, allowed_mentions: { parse: [] }, embeds: [], components: [], ...extra } });

// ---------- qui peut jouer ----------

const aRole = (m, k) => { const id = optEnv(k); return !!id && (m?.roles || []).includes(id); };
const ROLES_MECENE = ["DISCORD_MECENE_ROLE_ID", "DISCORD_MECENE_ARGENT_ROLE_ID", "DISCORD_MECENE_OR_ROLE_ID", "DISCORD_GRAND_MECENE_ROLE_ID"];
export function peutJouer(m) {
  if (isDirection(m)) return true;
  if (aRole(m, "DISCORD_CANDIDAT_ROLE_ID")) return false;
  if (!optEnv("DISCORD_MECENE_ROLE_ID")) return true;
  return ROLES_MECENE.some((k) => aRole(m, k));
}
const REFUS = "La Cote et la Bourse sont réservées aux Mécènes.";

// ---------- lecture ----------

export async function lireCandidats() {
  const h = objet(await redis("HGETALL", K.candidats));
  return Object.entries(h)
    .map(([id, v]) => ({ id, ...JSON.parse(v) }))
    .sort((a, b) => a.prog.localeCompare(b.prog) || a.n - b.n);
}
const enJeu = (cands) => cands.filter((c) => c.prog === PROG() && c.etat === "actif");
const lireEtat = async () => objet(await redis("HGETALL", K.etat));

// ---------- heures (Paris) ----------

const jourParis = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(t));
function midiParis(jour) {
  const [y, m, d] = jour.split("-").map(Number);
  const essai = Date.UTC(y, m - 1, d, 12, 0);
  const [hh, mm] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(new Date(essai)).split(":").map(Number);
  return essai - ((hh * 60 + mm) - 12 * 60) * 60000;
}
// Le prochain midi (heure de Paris) au moins 6 heures plus tard : après une soirée qui finit à 1 h, c'est le midi du jour même.
export function prochainMidi(maintenant = Date.now()) {
  for (let j = 0; j < 3; j++) {
    const t = midiParis(jourParis(maintenant + j * 86400000));
    if (t - maintenant >= 6 * 3600000) return t;
  }
  return maintenant + 24 * 3600000;
}
const estDimanche = (t = Date.now()) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" }).format(new Date(t)) === "Sun";

// ---------- le vote de la Cote ----------

// Les candidats en jeu, en groupes de 25 au plus (un menu Discord ne propose pas plus de 25 choix).
function groupes(cands) {
  const a = enJeu(cands);
  if (a.length <= 25) return [a];
  const moitie = Math.ceil(a.length / 2);
  return [a.slice(0, moitie), a.slice(moitie)];
}

function ecranVote(seance, choix, cands, fin, message = "") {
  const g = groupes(cands);
  const noms = choix.map((id) => cands.find((c) => c.id === id)?.nom || "?");
  const lignes = g.map((groupe, k) => ({
    type: 1,
    components: [{
      type: 3,
      custom_id: `cote:s:${seance}:${k}:${choix.join(".")}`,
      placeholder: g.length > 1 ? `Candidats ${groupe[0].n} à ${groupe.at(-1).n}` : "Tes favoris",
      min_values: 0,
      max_values: Math.min(3, groupe.length),
      options: groupe.map((c) => ({ label: c.nom.slice(0, 100), value: c.id, default: choix.includes(c.id) })),
    }],
  }));
  lignes.push({ type: 1, components: [{ type: 2, style: 3, label: `Valider (${choix.length}/3)`, custom_id: `cote:ok:${seance}:${choix.join(".")}`, disabled: !choix.length }] });
  const texte = `**La Cote · séance ${seance}**\nChoisis jusqu'à trois favoris de la soirée${fin ? `, avant <t:${Math.floor(fin / 1000)}:t>` : ""}.`
    + (noms.length ? `\nTon choix : **${noms.join("**, **")}**` : "")
    + (message ? `\n${message}` : "");
  return { content: texte, components: lignes };
}

async function voteOuvert(seance) {
  const e = await lireEtat();
  const ouvert = e.ouvert === "1" && String(e.seance) === String(seance) && Number(e.fin) > Date.now();
  return { e, ouvert };
}

// Enregistre le vote d'un Mécène, depuis Discord ou depuis le site. Renvoie { erreur } ou { noms, fin }.
export async function voter(uid, nom, seance, liste) {
  seance = String(seance);
  const [{ e, ouvert }, cands] = await Promise.all([voteOuvert(seance), lireCandidats()]);
  if (!ouvert) return { erreur: `Le vote de la séance ${seance} est fermé.` };
  const valides = enJeu(cands);
  const choix = [...new Set((liste || []).map(String).filter((x) => valides.some((c) => c.id === x)))].slice(0, 3);
  if (!choix.length) return { erreur: "Choisis au moins un candidat." };
  await lot([["HSET", K.votes(seance), String(uid), choix.join(".")], ["HSET", K.noms, String(uid), nom]]);
  return { noms: choix.map((x) => valides.find((c) => c.id === x).nom), fin: Number(e.fin) };
}

// ---------- calcul de la Cote ----------

export async function calculer(seance, { publier = true, salon = "" } = {}) {
  seance = String(seance);
  if (!(await verrou(P + "verrou:calcul", 25000))) return { erreur: "Un calcul est déjà en cours, réessaie dans quelques secondes." };
  try {
    const etatAvant = await lireEtat();
    if (etatAvant.calculee && Number(seance) < Number(etatAvant.calculee)) return { erreur: `La séance ${etatAvant.calculee} est déjà calculée : on ne peut refaire que la dernière.` };
    const cands = await lireCandidats();
    const [vh, nh, avantBrut, valeurs, prix] = await lot([
      ["HGETALL", K.votes(seance)], ["HGETALL", K.notes(seance)], ["GET", K.avant(seance)],
      ["HGETALL", K.valeurs], ["HGETALL", K.prix],
    ]);
    let avant = avantBrut ? JSON.parse(avantBrut) : null;
    if (!avant) { avant = { cote: objet(valeurs), prix: objet(prix) }; await redis("SET", K.avant(seance), JSON.stringify(avant)); }
    const votes = objet(vh), notes = objet(nh);
    const actifs = enJeu(cands);
    const compte = Object.fromEntries(actifs.map((c) => [c.id, 0]));
    for (const liste of Object.values(votes)) for (const id of new Set(String(liste).split(".").filter(Boolean))) if (id in compte) compte[id]++;
    const max = Math.max(0, ...Object.values(compte));
    const avecNotes = Object.keys(notes).length > 0;
    const nouvelles = {}, nouveauxPrix = {}, precedents = {}, lignes = [];
    for (const c of actifs) {
      const vn = max ? (10 * compte[c.id]) / max : 0;
      const sp = avecNotes ? Math.min(10, Math.max(0, Number(notes[c.id] ?? 5))) : vn;
      const score = 5 * vn + 5 * sp;
      const ancienne = avant.cote[c.id];
      const cote = Math.round((ancienne === undefined ? score : 0.5 * Number(ancienne) + 0.5 * score) * 10) / 10;
      nouvelles[c.id] = cote;
      nouveauxPrix[c.id] = prixDe(cote);
      precedents[c.id] = avant.prix[c.id] !== undefined ? Number(avant.prix[c.id]) : nouveauxPrix[c.id];
      lignes.push({ c, cote, ancienne: ancienne === undefined ? null : Number(ancienne), votes: compte[c.id], spectacle: avecNotes ? sp : null });
    }
    const ecritures = [];
    if (actifs.length) {
      ecritures.push(["HSET", K.valeurs, ...Object.entries(nouvelles).flat()]);
      ecritures.push(["HSET", K.prix, ...Object.entries(nouveauxPrix).flat()]);
      ecritures.push(["HSET", K.prec, ...Object.entries(precedents).flat()]);
    }
    const e = await lireEtat();
    ecritures.push(["HSET", K.etat, "calculee", seance, ...(String(e.seance) === seance ? ["ouvert", "0"] : [])]);
    ecritures.push(["RPUSH", K.hist, JSON.stringify({ seance, t: Date.now(), votants: Object.keys(votes).length, cote: nouvelles })]);
    await lot(ecritures);
    lignes.sort((a, b) => b.cote - a.cote);
    let publie = false;
    const cible = salon || optEnv("DISCORD_COTE_CHANNEL_ID");
    if (publier && cible && lignes.length) {
      const r = await bot(`/channels/${cible}/messages`, { method: "POST", body: JSON.stringify(carteCote(seance, lignes, cands, nouveauxPrix, precedents, e)) });
      publie = r.ok;
    }
    return { seance, votants: Object.keys(votes).length, avecNotes, lignes, publie, salon: cible };
  } finally {
    await liberer(P + "verrou:calcul");
  }
}

function carteCote(seance, lignes, cands, prix, prec, e) {
  const ecart = (l) => (l.ancienne === null ? "nouveau" : Math.round(l.cote) - Math.round(l.ancienne) === 0 ? "=" : (Math.round(l.cote) > Math.round(l.ancienne) ? "+" : "−") + Math.abs(Math.round(l.cote) - Math.round(l.ancienne)));
  const texte = lignes.map((l, k) => {
    const v = variation(prix[l.c.id], prec[l.c.id]);
    return `**${k + 1}** · ${l.c.nom} — ${Math.round(l.cote)} (${ecart(l)}) · ${fr(prix[l.c.id])} cr${l.ancienne === null ? "" : ` ${fleche(v)} ${pct(v)}`}`;
  });
  const morts = cands.filter((c) => c.prog === PROG() && c.etat === "mort").map((c) => `~~${c.nom}~~ · faillite`);
  const sortis = cands.filter((c) => c.etat === "sorti").map((c) => `${c.nom} · cotation suspendue`);
  const fin = (e.bandeau === "1" ? `*${e.devise || DEVISE}* ` : "") + "L'Œil d'Osiris vous remercie.";
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `OSIRIS · PROGRAMME ${PROG()} · LA COTE`,
      description: (`Après la séance ${seance} · ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" })}\n\nChers Mécènes, voici vos favoris.\n\n`
        + [...texte, ...(morts.length || sortis.length ? [""] : []), ...sortis, ...morts].join("\n") + `\n\n${fin}`).slice(0, 4096),
      color: OR,
      footer: { text: "Cours en crédits fictifs · Bourse d'Osiris" },
    }],
  };
}

// Ferme le vote et calcule la Cote si l'heure est passée (appelé par le cron, le bandeau et les boutons).
export async function calculerSiBesoin() {
  if (!baseConfiguree()) return { rien: "base non branchée" };
  const e = await lireEtat();
  if (e.ouvert === "1" && Number(e.fin) <= Date.now() && e.calculee !== e.seance) {
    const r = await calculer(e.seance);
    return { calcul: r.erreur || `séance ${e.seance}, ${r.votants} votants` };
  }
  return { rien: "aucun vote à fermer" };
}

// ---------- la Bourse ----------

async function lireMarche() {
  const [cands, prix, prec] = await Promise.all([lireCandidats(), redis("HGETALL", K.prix).then(objet), redis("HGETALL", K.prec).then(objet)]);
  return { cands, prix, prec };
}
const cotes = (m) => m.cands.filter((c) => m.prix[c.id] !== undefined && (c.prog === PROG() || c.etat === "sorti") && c.etat !== "retire");

function ligneCours(c, m) {
  if (c.etat === "mort") return `~~${c.nom}~~ · FAILLITE`;
  if (c.etat === "sorti") return `${c.nom} · ${fr(m.prix[c.id])} cr · ⏸ cotation suspendue`;
  const v = variation(Number(m.prix[c.id]), Number(m.prec[c.id] ?? m.prix[c.id]));
  return `${c.nom} · **${fr(m.prix[c.id])} cr** ${fleche(v)} ${pct(v)}`;
}

async function portefeuille(uid) {
  await redis("HSETNX", K.credits, uid, DEPART);
  const [credits, parts] = await lot([["HGET", K.credits, uid], ["HGETALL", K.parts(uid)]]);
  return { credits: Number(credits), parts: objet(parts) };
}

async function fortunes(m) {
  const credits = objet(await redis("HGETALL", K.credits));
  const ids = Object.keys(credits);
  const [parts, noms] = await Promise.all([lot(ids.map((u) => ["HGETALL", K.parts(u)])), redis("HGETALL", K.noms).then(objet)]);
  return ids.map((u, k) => {
    const p = objet(parts[k]);
    let total = Number(credits[u]);
    for (const [id, n] of Object.entries(p)) if (!id.startsWith("i:")) total += Number(n) * Number(m.prix[id] || 0);
    return { uid: u, nom: noms[u] || "Mécène", total };
  }).sort((a, b) => b.total - a.total);
}

function menuCandidats(prefixe, liste, m, etiquette) {
  const lignes = [];
  for (let k = 0; k < liste.length && lignes.length < 4; k += 25) {
    const g = liste.slice(k, k + 25);
    lignes.push({
      type: 1,
      components: [{
        type: 3, custom_id: `${prefixe}:${k / 25}`, placeholder: liste.length > 25 ? `Candidats ${k + 1} à ${k + g.length}` : "Choisis un candidat",
        options: g.map((c) => ({ label: c.nom.slice(0, 100), value: c.id, description: etiquette(c).slice(0, 100) })),
      }],
    });
  }
  return lignes;
}

export function panneau() {
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: "BOURSE D'OSIRIS",
      description: "Chaque Mécène dispose de **10 000 crédits** pour acheter des parts des candidats en qui il croit. Le cours suit la Cote : il est recalculé après chaque vote. Un candidat mort, c'est une faillite.\n\n📦 **Colis** : mettez vos crédits en commun pour envoyer un colis marqué de l'Œil à un candidat.\n\n*Crédits fictifs : rien ne s'achète ni ne se gagne en argent réel.*",
      color: OR,
      footer: { text: "Les réponses ne sont visibles que de toi." },
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 2, label: "Cours", emoji: { name: "📈" }, custom_id: "bourse:cours" },
        { type: 2, style: 2, label: "Mon portefeuille", emoji: { name: "💼" }, custom_id: "bourse:pf" },
        { type: 2, style: 3, label: "Acheter", emoji: { name: "🛒" }, custom_id: "bourse:achat" },
        { type: 2, style: 4, label: "Vendre", emoji: { name: "💸" }, custom_id: "bourse:vente" },
        { type: 2, style: 1, label: "Fortunes", emoji: { name: "🏆" }, custom_id: "bourse:top" },
      ],
    }, {
      type: 1,
      components: [{ type: 2, style: 2, label: "Colis", emoji: { name: "📦" }, custom_id: "bourse:colis" }],
    }],
  };
}

// ---------- les boutons et les menus (Mécènes) ----------

export async function composant(i, user) {
  const id = i.data.custom_id;
  if (!baseConfiguree()) return reponse("La Bourse n'est pas encore branchée.");
  if (!peutJouer(i.member)) return reponse(REFUS);
  const [, quoi, ...reste] = id.split(":");

  // La Cote : le bouton « Voter »
  if (id.startsWith("cote:voter:")) {
    const seance = reste[0];
    const [{ e, ouvert }, cands, deja] = await Promise.all([voteOuvert(seance), lireCandidats(), redis("HGET", K.votes(seance), user.id)]);
    if (!ouvert) return reponse(`Le vote de la séance ${seance} est fermé.${e.ouvert === "1" ? "" : " Le prochain s'ouvrira après la prochaine soirée."}`);
    const choix = deja ? deja.split(".").filter((x) => enJeu(cands).some((c) => c.id === x)) : [];
    const ecran = ecranVote(seance, choix, cands, Number(e.fin), deja ? "Tu as déjà voté : tu peux changer ton choix." : "");
    return reponse(ecran.content, { components: ecran.components });
  }
  // La Cote : un des menus de candidats
  if (id.startsWith("cote:s:")) {
    const [seance, g, avant = ""] = reste;
    const [{ e, ouvert }, cands] = await Promise.all([voteOuvert(seance), lireCandidats()]);
    if (!ouvert) return maj(`Le vote de la séance ${seance} est fermé.`);
    const groupe = groupes(cands)[Number(g)] || [];
    const dansGroupe = new Set(groupe.map((c) => c.id));
    const precedents = avant.split(".").filter(Boolean);
    const choix = [...precedents.filter((x) => !dansGroupe.has(x)), ...(i.data.values || []).filter((x) => dansGroupe.has(x))];
    if (choix.length > 3) {
      const ecran = ecranVote(seance, precedents, cands, Number(e.fin), "⚠️ Trois favoris au plus : retire quelqu'un avant d'en ajouter un autre.");
      return maj(ecran.content, { components: ecran.components });
    }
    const ecran = ecranVote(seance, choix, cands, Number(e.fin));
    return maj(ecran.content, { components: ecran.components });
  }
  // La Cote : « Valider »
  if (id.startsWith("cote:ok:")) {
    const [seance, liste = ""] = reste;
    const r = await voter(user.id, nomDe(i), seance, liste.split("."));
    if (r.erreur) return maj(r.erreur);
    return maj(`✅ Vote enregistré pour la séance ${seance} : **${r.noms.join("**, **")}**.\nTu peux le changer jusqu'à <t:${Math.floor(r.fin / 1000)}:t> avec le bouton « Voter » (ou sur le site, onglet La Cote).`);
  }

  // La Bourse
  const m = await lireMarche();
  const marche = cotes(m);
  const ouverte = marche.length > 0;
  if (quoi === "cours") {
    if (!ouverte) return reponse("La Bourse n'est pas encore ouverte : les premiers cours arrivent avec l'introduction en Bourse ou le premier vote de la Cote.");
    const tri = [...marche].sort((a, b) => Number(m.prix[b.id]) - Number(m.prix[a.id]));
    return reponse(`📈 **Cours de la Cité**\n${tri.map((c) => ligneCours(c, m)).join("\n")}`.slice(0, 2000));
  }
  if (quoi === "pf") {
    const pf = await portefeuille(user.id);
    await redis("HSET", K.noms, user.id, nomDe(i));
    const lignes = [];
    let total = pf.credits;
    for (const [cid, n] of Object.entries(pf.parts)) {
      if (cid.startsWith("i:") || Number(n) <= 0) continue;
      const c = m.cands.find((x) => x.id === cid);
      const valeur = Number(n) * Number(m.prix[cid] || 0), investi = Number(pf.parts["i:" + cid] || 0);
      total += valeur;
      const gain = investi > 0 ? pct(((valeur - investi) / investi) * 100) : "";
      lignes.push(`${c?.nom || cid} · ${fr(n)} part${Number(n) > 1 ? "s" : ""} · ${fr(valeur)} cr${c?.etat === "mort" ? " · faillite" : c?.etat === "sorti" ? " · ⏸ suspendue" : gain ? ` (${gain})` : ""}`);
    }
    const classement = await fortunes(m);
    const rang = classement.findIndex((f) => f.uid === user.id) + 1;
    return reponse(`💼 **Ton portefeuille**\nCrédits : **${fr(pf.credits)} cr**\n${lignes.length ? lignes.join("\n") : "Aucune part pour l'instant."}\n\nFortune totale : **${fr(total)} cr**${rang ? ` · ${rang}e sur ${classement.length}` : ""}`.replace(" · 1e sur", " · 1re sur"));
  }
  if (quoi === "top") {
    if (!ouverte) return reponse("Le classement des fortunes commencera à l'ouverture de la Bourse.");
    const classement = await fortunes(m);
    if (!classement.length) return reponse("Personne n'a encore ouvert de portefeuille.");
    const medailles = ["🥇", "🥈", "🥉"];
    const rang = classement.findIndex((f) => f.uid === user.id) + 1;
    return reponse(`🏆 **Les plus grandes fortunes de la Cité**\n${classement.slice(0, 10).map((f, k) => `${medailles[k] || `**${k + 1}.**`} ${f.nom} · ${fr(f.total)} cr`).join("\n")}${rang > 10 ? `\n…\n**${rang}.** toi · ${fr(classement[rang - 1].total)} cr` : ""}`);
  }
  if (quoi === "achat") {
    if (!ouverte) return reponse("La Bourse n'est pas encore ouverte.");
    const achetables = marche.filter((c) => c.etat === "actif").sort((a, b) => Number(m.prix[b.id]) - Number(m.prix[a.id]));
    const pf = await portefeuille(user.id);
    return reponse(`🛒 **Acheter** · tu as **${fr(pf.credits)} cr**. Choisis un candidat :`, { components: menuCandidats("bourse:a", achetables, m, (c) => `${fr(m.prix[c.id])} cr la part`) });
  }
  if (quoi === "vente") {
    const pf = await portefeuille(user.id);
    const tenus = Object.entries(pf.parts).filter(([cid, n]) => !cid.startsWith("i:") && Number(n) > 0).map(([cid]) => m.cands.find((c) => c.id === cid)).filter(Boolean);
    if (!tenus.length) return reponse("Tu n'as aucune part à vendre.");
    return reponse("💸 **Vendre** · choisis un candidat :", { components: menuCandidats("bourse:v", tenus, m, (c) => `${fr(pf.parts[c.id])} parts · ${c.etat === "actif" ? fr(m.prix[c.id]) + " cr la part" : c.etat === "mort" ? "faillite" : "cotation suspendue"}`) });
  }
  if (quoi === "a" || quoi === "v") {
    const cid = (i.data.values || [])[0];
    const c = m.cands.find((x) => x.id === cid);
    if (!c) return maj("Candidat introuvable.");
    if (c.etat === "sorti") return maj(`⏸ ${c.nom} · cotation suspendue. Transfert en cours.`);
    if (c.etat === "mort") return maj(`📉 ${c.nom} · faillite. Ces parts ne valent plus rien.`);
    const pf = await portefeuille(user.id);
    const achat = quoi === "a";
    const champ = achat
      ? { custom_id: "montant", label: `Combien de crédits ? (tu en as ${fr(pf.credits)})`.slice(0, 45), style: 1, required: true, max_length: 9, placeholder: `Une part = ${fr(m.prix[cid])} cr` }
      : { custom_id: "montant", label: `Combien de parts ? (tu en as ${fr(pf.parts[cid] || 0)})`.slice(0, 45), style: 1, required: true, max_length: 9, value: String(pf.parts[cid] || 0) };
    return json({ type: 9, data: { custom_id: `bourse_${achat ? "achat" : "vente"}:${cid}`, title: `${achat ? "Acheter" : "Vendre"} · ${c.court}`.slice(0, 45), components: [{ type: 1, components: [{ type: 4, ...champ }] }] } });
  }
  return reponse("Action inconnue.");
}

// ---------- acheter et vendre (Discord et site) ----------

// achat : nombre = crédits à dépenser ; vente : nombre = parts à vendre. Renvoie { ok, message }.
export async function operer(uid, nom, achat, cid, nombre) {
  uid = String(uid);
  const non = (message) => ({ ok: false, message });
  if (!(nombre > 0) || !Number.isSafeInteger(nombre)) return non(achat ? "Indique un nombre de crédits, par exemple 1000." : "Indique un nombre de parts.");
  const cle = P + "verrou:u:" + uid;
  if (!(await verrou(cle, 8000))) return non("Une opération est déjà en cours sur ton portefeuille, réessaie dans un instant.");
  try {
    const m = await lireMarche();
    const c = m.cands.find((x) => x.id === cid);
    if (!c || c.etat === "retire") return non("Candidat introuvable.");
    if (c.etat === "sorti") return non(`⏸ ${c.nom} · cotation suspendue. Transfert en cours.`);
    if (c.etat !== "actif") return non(`📉 ${c.nom} · faillite. Ces parts ne valent plus rien.`);
    const prix = Number(m.prix[cid] || 0);
    if (!(prix > 0)) return non("Ce candidat n'est pas encore coté.");
    const pf = await portefeuille(uid);
    if (achat) {
      const n = Math.floor(Math.min(nombre, pf.credits) / prix);
      if (n < 1) return non(`Il faut au moins ${fr(prix)} cr pour une part de ${c.nom}. Tu as ${fr(pf.credits)} cr.`);
      const cout = n * prix;
      await lot([["HINCRBY", K.credits, uid, -cout], ["HINCRBY", K.parts(uid), cid, n], ["HINCRBY", K.parts(uid), "i:" + cid, cout], ["HSET", K.noms, uid, nom]]);
      return { ok: true, message: `🛒 Tu as acheté **${fr(n)} part${n > 1 ? "s" : ""} de ${c.nom}** à ${fr(prix)} cr, soit ${fr(cout)} cr. Il te reste **${fr(pf.credits - cout)} cr**.` };
    }
    const tenues = Number(pf.parts[cid] || 0);
    if (tenues < 1) return non(`Tu n'as aucune part de ${c.nom}.`);
    const n = Math.min(nombre, tenues), gain = n * prix;
    const investi = Number(pf.parts["i:" + cid] || 0), retire = Math.round((investi * n) / tenues);
    const ops = [["HINCRBY", K.credits, uid, gain], ["HSET", K.noms, uid, nom]];
    if (n === tenues) ops.push(["HDEL", K.parts(uid), cid, "i:" + cid]);
    else ops.push(["HINCRBY", K.parts(uid), cid, -n], ["HINCRBY", K.parts(uid), "i:" + cid, -retire]);
    await lot(ops);
    return { ok: true, message: `💸 Tu as vendu **${fr(n)} part${n > 1 ? "s" : ""} de ${c.nom}** à ${fr(prix)} cr, soit ${fr(gain)} cr. Tu as maintenant **${fr(pf.credits + gain)} cr**.` };
  } finally {
    await liberer(cle);
  }
}

// ---------- les fenêtres (Mécènes : achat, vente ; régie : notes, candidats) ----------

const lireChamp = (i, k) => (i.data.components || []).flatMap((r) => r.components || [r.component]).find((c) => c?.custom_id === k)?.value?.trim() || "";

export async function fenetre(i, user) {
  const id = i.data.custom_id;
  if (id.startsWith("bourse_achat:") || id.startsWith("bourse_vente:")) {
    if (!peutJouer(i.member)) return reponse(REFUS);
    const achat = id.startsWith("bourse_achat:");
    const cid = id.split(":")[1];
    const nombre = Math.floor(Number(lireChamp(i, "montant").replace(/[\s .]/g, "").replace(",", ".")));
    return reponse((await operer(user.id, nomDe(i), achat, cid, nombre)).message);
  }

  if (!isDirection(i.member)) return reponse("Réservé aux fondateurs et aux admins.");

  if (id.startsWith("cote_notes:")) {
    const seance = id.split(":")[1];
    const cands = enJeu(await lireCandidats());
    const notes = [], inconnus = [];
    for (const ligne of lireChamp(i, "notes").split(/\r?\n/)) {
      const x = ligne.match(/^\s*(.+?)\s*[:=]\s*(\d+(?:[.,]\d+)?)?\s*$/);
      if (!x || x[2] === undefined) continue;
      const c = cands.find((c) => norm(c.nom) === norm(x[1]) || norm(c.court) === norm(x[1]) || String(c.n) === x[1].trim());
      if (!c) { inconnus.push(x[1]); continue; }
      notes.push([c.id, Math.min(10, Math.max(0, Number(x[2].replace(",", "."))))]);
    }
    await redis("DEL", K.notes(seance));
    if (notes.length) await redis("HSET", K.notes(seance), ...notes.flat());
    const e = await lireEtat();
    const sans = cands.filter((c) => !notes.some(([id]) => id === c.id)).map((c) => c.nom);
    return reponse(`Notes de la séance ${seance} enregistrées : ${notes.length} sur ${cands.length}.`
      + (sans.length && notes.length ? `\nSans note (comptés 5/10) : ${sans.join(", ")}.` : "")
      + (inconnus.length ? `\n⚠️ Noms non reconnus : ${inconnus.join(", ")}.` : "")
      + (e.calculee === seance ? `\nLa Cote de cette séance est déjà calculée : \`/cote calculer seance:${seance}\` pour la refaire avec ces notes.` : ""));
  }

  if (id === "cote_candidats") {
    const lignes = lireChamp(i, "liste").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
    if (!lignes.length) return reponse("La liste est vide.");
    const tous = await lireCandidats();
    const prog = PROG();
    const miens = tous.filter((c) => c.prog === prog);
    let suivant = Math.max(0, ...miens.map((c) => c.n)) + 1;
    const vus = new Set(), ecritures = [];
    const courts = new Map();
    for (const l of lignes) {
      // « #7 Nom » garde le candidat n° 7 (et ses parts) même si on change son nom
      const ref = l.match(/^#(\d+)\s+(.*)$/);
      const [nomBrut, courtBrut] = (ref ? ref[2] : l).split("|").map((x) => x.trim());
      const nom = nomBrut.slice(0, 80);
      if (!nom) continue;
      const court = (courtBrut || nom.split(/\s+/).at(-1)).toLocaleUpperCase("fr-FR").slice(0, 24);
      courts.set(court, (courts.get(court) || 0) + 1);
      const deja = (ref && miens.find((c) => c.n === Number(ref[1]))) || miens.find((c) => norm(c.nom) === norm(nom));
      const c = deja ? { ...deja, nom, court } : { id: `${prog}-${suivant}`, nom, court, etat: "actif", prog, n: suivant++ };
      if (deja && deja.etat === "retire") c.etat = "actif";
      vus.add(c.id);
      ecritures.push(c);
    }
    for (const c of ecritures) if (courts.get(c.court) > 1) c.court = c.nom.toLocaleUpperCase("fr-FR").slice(0, 24);
    const retires = miens.filter((c) => !vus.has(c.id) && c.etat === "actif");
    for (const c of retires) ecritures.push({ ...c, etat: "retire" });
    await redis("HSET", K.candidats, ...ecritures.flatMap(({ id, ...c }) => [id, JSON.stringify(c)]));
    const nouveaux = ecritures.filter((c) => !miens.some((x) => x.id === c.id)).length;
    return reponse(`Liste du Programme ${prog} enregistrée : ${vus.size} candidats (${nouveaux} nouveaux).${retires.length ? `\nRetirés de la liste : ${retires.map((c) => c.nom).join(", ")}.` : ""}`);
  }
  return reponse("Fenêtre inconnue.");
}

// ---------- /cote (régie) ----------

export const COMMANDE = {
  name: "cote",
  description: "La Cote et la Bourse d'Osiris (régie)",
  options: [
    { type: 1, name: "panneau", description: "Publier le panneau de la Bourse (boutons des Mécènes) dans ce salon" },
    { type: 1, name: "candidats", description: "Écrire ou corriger la liste des candidats (un par ligne)" },
    { type: 1, name: "ouvrir", description: "Ouvrir le vote de la Cote après la soirée (jusqu'au prochain midi)", options: [
      { type: 4, name: "heures", description: "Facultatif : durée du vote en heures (sinon jusqu'au prochain midi)", required: false, min_value: 1, max_value: 72 },
    ] },
    { type: 1, name: "notes", description: "Donner les notes de spectacle de la séance (0 à 10 par candidat)", options: [
      { type: 4, name: "seance", description: "Facultatif : une autre séance que la dernière", required: false, min_value: 1, max_value: 99 },
    ] },
    { type: 1, name: "calculer", description: "Calculer (ou recalculer) la Cote et les cours tout de suite, et les publier", options: [
      { type: 4, name: "seance", description: "Facultatif : une autre séance que la dernière", required: false, min_value: 1, max_value: 99 },
    ] },
    { type: 1, name: "mort", description: "Un candidat est mort : faillite à la Bourse", options: [
      { type: 3, name: "candidat", description: "Le candidat", required: true, autocomplete: true },
      { type: 5, name: "annuler", description: "Annuler une faillite donnée par erreur", required: false },
    ] },
    { type: 1, name: "sortie", description: "Le vainqueur part : cotation suspendue, parts gelées", options: [
      { type: 3, name: "candidat", description: "Le candidat", required: true, autocomplete: true },
    ] },
    { type: 1, name: "bandeau", description: "Afficher ou cacher le bandeau des cours (stream et télés), à partir de la révélation", options: [
      { type: 5, name: "actif", description: "Afficher le bandeau", required: true },
      { type: 3, name: "devise", description: "Facultatif : la phrase à droite (« Le premier sortira. » par défaut)", required: false, max_length: 60 },
    ] },
    { type: 1, name: "etat", description: "Où en sont la Cote et la Bourse" },
    { type: 1, name: "remise-a-zero", description: "Après des tests : tout effacer (candidats, votes, cours, portefeuilles)", options: [
      { type: 3, name: "confirmer", description: "Taper EFFACER pour confirmer", required: true, max_length: 20 },
    ] },
  ],
};

export async function autocomplete(i) {
  if (!isDirection(i.member) || !baseConfiguree()) return json({ type: 8, data: { choices: [] } });
  const sous = i.data.options?.[0];
  const tape = norm(sous?.options?.find((o) => o.focused)?.value || "");
  const cands = (await lireCandidats()).filter((c) => c.prog === PROG() || c.etat === "sorti");
  const choix = cands.filter((c) => !tape || norm(c.nom).includes(tape)).slice(0, 25).map((c) => ({ name: `${c.nom}${c.etat === "actif" ? "" : ` (${c.etat})`}`.slice(0, 100), value: c.id }));
  return json({ type: 8, data: { choices: choix } });
}

// Renvoie { reponse } (une réponse immédiate) ou { travail } (une promesse de texte, pour « Osiris réfléchit… »).
export async function commande(i, user) {
  const sous = i.data.options?.[0] || {};
  const opt = (k) => (sous.options || []).find((o) => o.name === k)?.value;
  if (!baseConfiguree()) return { reponse: reponse("La base de la Cote n'est pas branchée : Vercel → Storage → Upstash Redis, puis redéployer (voir le README).") };

  if (sous.name === "panneau") {
    return { travail: bot(`/channels/${i.channel_id}/messages`, { method: "POST", body: JSON.stringify(panneau()) }).then((r) => r.ok ? "Le panneau de la Bourse est publié." : `Impossible de publier ici (code ${r.status}).`) };
  }

  if (sous.name === "candidats") {
    const actuels = (await lireCandidats()).filter((c) => c.prog === PROG() && c.etat !== "retire");
    const valeur = actuels.map((c) => `#${c.n} ${c.nom}${c.court === c.nom.split(/\s+/).at(-1).toLocaleUpperCase("fr-FR") ? "" : ` | ${c.court}`}`).join("\n");
    return { reponse: json({ type: 9, data: { custom_id: "cote_candidats", title: `Candidats du Programme ${PROG()}`, components: [{ type: 1, components: [{
      type: 4, custom_id: "liste", label: "Un par ligne · Nom | NOM COURT · garde les #", style: 2, required: true, max_length: 4000,
      placeholder: "Martha Kessler\nThomas Hale\nEleanor Voss | VOSS", ...(valeur ? { value: valeur.slice(0, 4000) } : {}),
    }] }] } }) };
  }

  if (sous.name === "notes") {
    const e = await lireEtat();
    const seance = String(opt("seance") || e.seance || "");
    if (!seance) return { reponse: reponse("Aucune séance pour l'instant : ouvre d'abord un vote avec /cote ouvrir.") };
    const [cands, notes] = await Promise.all([lireCandidats(), redis("HGETALL", K.notes(seance)).then(objet)]);
    const actifs = enJeu(cands);
    if (!actifs.length) return { reponse: reponse("Aucun candidat en jeu : /cote candidats d'abord.") };
    const valeur = actifs.map((c) => `${c.nom} : ${notes[c.id] ?? ""}`).join("\n");
    return { reponse: json({ type: 9, data: { custom_id: `cote_notes:${seance}`, title: `Notes de spectacle · séance ${seance}`.slice(0, 45), components: [{ type: 1, components: [{
      type: 4, custom_id: "notes", label: "Une note de 0 à 10 après chaque nom", style: 2, required: true, max_length: 4000, value: valeur.slice(0, 4000),
    }] }] } }) };
  }

  if (sous.name === "ouvrir") {
    return { travail: (async () => {
      const cands = await lireCandidats();
      if (!enJeu(cands).length) return "Aucun candidat en jeu : /cote candidats d'abord.";
      let e = await lireEtat();
      let avant = "";
      if (e.ouvert === "1" && e.calculee !== e.seance) {
        const r = await calculer(e.seance);
        avant = r.erreur ? `⚠️ La séance ${e.seance} n'a pas pu être calculée : ${r.erreur}\n` : `La séance ${e.seance} est close et calculée (${r.votants} votants).\n`;
      }
      const seance = String(Number(e.seance || 0) + 1);
      const fin = opt("heures") ? Date.now() + Number(opt("heures")) * 3600000 : prochainMidi();
      const salon = salonCote(i);
      const r = await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title: `OSIRIS · LA COTE · SÉANCE ${seance}`,
          description: `Chers Mécènes, qui vous a le plus diverti ce soir ?\nChoisissez vos **trois favoris**. Le vote se ferme <t:${Math.floor(fin / 1000)}:F> (<t:${Math.floor(fin / 1000)}:R>).`,
          color: OR,
          footer: { text: "La Cote décide aussi des cours de la Bourse." },
        }],
        components: [{ type: 1, components: [{ type: 2, style: 1, label: "Voter", emoji: { name: "👁" }, custom_id: `cote:voter:${seance}` }] }],
      }) });
      if (!r.ok) return `${avant}Impossible de publier le vote dans <#${salon}> (code ${r.status}). Vérifie DISCORD_COTE_CHANNEL_ID et les droits du bot.`;
      await redis("HSET", K.etat, "seance", seance, "ouvert", "1", "fin", String(fin));
      return `${avant}Vote de la séance ${seance} ouvert dans <#${salon}>, jusqu'à <t:${Math.floor(fin / 1000)}:F>. Pense aux notes de spectacle : \`/cote notes\`.`;
    })() };
  }

  if (sous.name === "calculer") {
    return { travail: (async () => {
      const e = await lireEtat();
      const seance = String(opt("seance") || e.seance || "");
      if (!seance) return "Aucune séance à calculer.";
      const r = await calculer(seance, { salon: optEnv("DISCORD_COTE_CHANNEL_ID") ? "" : i.channel_id });
      if (r.erreur) return r.erreur;
      const top = r.lignes.slice(0, 3).map((l, k) => `${k + 1}. ${l.c.nom} (${Math.round(l.cote)})`).join(" · ");
      return `Cote de la séance ${seance} calculée : ${r.votants} votants, ${r.avecNotes ? "avec" : "sans"} notes de spectacle.${top ? `\n${top}` : ""}${r.publie ? `\nPubliée dans <#${r.salon}>.` : "\n⚠️ Rien n'a été publié (salon de la Cote manquant ou refusé)."}`;
    })() };
  }

  if (sous.name === "mort" || sous.name === "sortie") {
    return { travail: (async () => {
      const cands = await lireCandidats();
      const c = cands.find((x) => x.id === opt("candidat")) || cands.find((x) => norm(x.nom) === norm(opt("candidat")));
      if (!c) return "Candidat introuvable : choisis-le dans la liste proposée.";
      const { id, ...rec } = c;
      const [prix, cote] = await lot([["HGET", K.prix, id], ["HGET", K.valeurs, id]]);
      let message, annonce;
      if (sous.name === "mort" && opt("annuler")) {
        if (rec.etat !== "mort") return `${c.nom} n'est pas en faillite.`;
        const ops = [["HSET", K.candidats, id, JSON.stringify({ ...rec, etat: "actif" })]];
        if (rec.prixAvant !== undefined) ops.push(["HSET", K.prix, id, rec.prixAvant], ["HSET", K.valeurs, id, rec.coteAvant ?? 0]);
        await lot(ops);
        message = `Faillite de ${c.nom} annulée : cours rétabli à ${fr(rec.prixAvant ?? 0)} cr.`;
      } else if (sous.name === "mort") {
        if (rec.etat === "mort") return `${c.nom} est déjà en faillite.`;
        await lot([["HSET", K.candidats, id, JSON.stringify({ ...rec, etat: "mort", prixAvant: Number(prix || 0), coteAvant: Number(cote || 0) })], ["HSET", K.prix, id, 0], ["HSET", K.valeurs, id, 0], ["HSET", K.prec, id, Number(prix || 0)]]);
        message = `${c.nom} : faillite. Ses parts ne valent plus rien.`;
        annonce = { title: `📉 FAILLITE · ${c.court}`, description: `${c.nom} a quitté le Programme. Ses parts ne valent plus rien.`, color: ROUGE };
      } else {
        if (rec.etat === "sorti") return `${c.nom} est déjà sorti.`;
        await redis("HSET", K.candidats, id, JSON.stringify({ ...rec, etat: "sorti" }));
        message = `${c.nom} : cotation suspendue, parts gelées au cours de ${fr(prix || 0)} cr.`;
        annonce = { title: `⏸ ${c.court} · COTATION SUSPENDUE`, description: "Transfert en cours.", color: OR };
      }
      const salon = optEnv("DISCORD_COTE_CHANNEL_ID");
      if (annonce && salon) await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [annonce] }) });
      return message;
    })() };
  }

  if (sous.name === "bandeau") {
    const actif = !!opt("actif");
    await redis("HSET", K.etat, "bandeau", actif ? "1" : "0", ...(opt("devise") ? ["devise", opt("devise")] : []));
    return { reponse: reponse(actif ? `Bandeau affiché : il apparaît dans OBS (et sur les télés) d'ici une minute.${opt("devise") ? ` Phrase : « ${opt("devise")} »` : ""}` : "Bandeau caché.") };
  }

  if (sous.name === "etat") {
    const [e, cands, credits] = await Promise.all([lireEtat(), lireCandidats(), redis("HLEN", K.credits)]);
    const seance = e.seance || "";
    const votants = seance ? await redis("HLEN", K.votes(seance)) : 0;
    const mine = cands.filter((c) => c.prog === PROG());
    const parEtat = (x) => mine.filter((c) => c.etat === x).length;
    return { reponse: reponse([
      `**La Cote · Programme ${PROG()}**`,
      `Candidats : ${parEtat("actif")} en jeu, ${parEtat("mort")} mort${parEtat("mort") > 1 ? "s" : ""}, ${parEtat("sorti")} sorti${parEtat("sorti") > 1 ? "s" : ""}`,
      seance ? `Séance ${seance} : vote ${e.ouvert === "1" && Number(e.fin) > Date.now() ? `ouvert jusqu'à <t:${Math.floor(Number(e.fin) / 1000)}:F>` : "fermé"}, ${votants} votants, ${e.calculee === seance ? "calculée" : "pas encore calculée"}` : "Aucune séance pour l'instant.",
      `Bourse : ${credits} portefeuilles`,
      `Bandeau : ${e.bandeau === "1" ? "affiché" : "caché"}${e.devise ? ` · « ${e.devise} »` : ""}`,
      `Salon de la Cote : ${optEnv("DISCORD_COTE_CHANNEL_ID") ? `<#${optEnv("DISCORD_COTE_CHANNEL_ID")}>` : "⚠️ DISCORD_COTE_CHANNEL_ID manquant"}`,
    ].join("\n")) };
  }

  // Après des essais : on efface tout ce que la Cote et la Bourse ont enregistré. Jamais pendant ni après une vraie saison
  // (les parts gelées du vainqueur disparaîtraient avec).
  if (sous.name === "remise-a-zero") {
    if (String(opt("confirmer") || "").trim().toUpperCase() !== "EFFACER") return { reponse: reponse("Rien n'a été effacé : tape EFFACER dans l'option « confirmer ».") };
    return { travail: (async () => {
      const e = await lireEtat();
      const uids = Object.keys(objet(await redis("HGETALL", K.credits)));
      const cles = [K.candidats, K.etat, K.valeurs, K.prix, K.prec, K.credits, K.noms, K.hist, ...uids.map(K.parts)];
      for (let s = 1; s <= Number(e.seance || 0); s++) cles.push(K.votes(s), K.notes(s), K.avant(s));
      for (let k = 0; k < cles.length; k += 100) await redis("DEL", ...cles.slice(k, k + 100));
      return `Tout est effacé : candidats, ${Number(e.seance || 0)} séance(s) de votes et de notes, cours et ${uids.length} portefeuille(s). La prochaine séance sera la séance 1. Les messages déjà publiés dans Discord restent : supprime-les à la main.`;
    })() };
  }

  return { reponse: reponse("Sous-commande inconnue.") };
}

// ---------- l'introduction en Bourse (fin de la Sélection, lib/selection.js) ----------

// personnes : [{ id (Discord), nom, pseudo }] (pseudo : le nom est un pseudo Discord, on le garde entier sur le bandeau). Chacun devient un candidat du Programme, coté au même prix de départ.
export async function introduireEnBourse(personnes) {
  const prog = PROG();
  const miens = (await lireCandidats()).filter((c) => c.prog === prog);
  let suivant = Math.max(0, ...miens.map((c) => c.n)) + 1, deja = 0;
  const nouveaux = [];
  const connu = (p) => [...miens, ...nouveaux].some((c) => (p.id && c.discord === p.id) || norm(c.nom) === norm(p.nom));
  for (const p of personnes) {
    if (!p.nom || connu(p)) { deja++; continue; }
    nouveaux.push({ id: `${prog}-${suivant}`, nom: p.nom.slice(0, 80), court: (p.pseudo ? p.nom : p.nom.split(/\s+/).at(-1)).toLocaleUpperCase("fr-FR").slice(0, 24), etat: "actif", prog, n: suivant++, ...(p.id ? { discord: p.id } : {}) });
  }
  const courts = [...miens, ...nouveaux].map((c) => c.court);
  for (const c of nouveaux) if (courts.filter((x) => x === c.court).length > 1) c.court = c.nom.toLocaleUpperCase("fr-FR").slice(0, 24);
  if (nouveaux.length) {
    const cote = (PRIX_DEPART - 20) / 2;
    await lot([
      ["HSET", K.candidats, ...nouveaux.flatMap(({ id, ...c }) => [id, JSON.stringify(c)])],
      ["HSET", K.valeurs, ...nouveaux.flatMap((c) => [c.id, cote])],
      ["HSET", K.prix, ...nouveaux.flatMap((c) => [c.id, PRIX_DEPART])],
      ["HSET", K.prec, ...nouveaux.flatMap((c) => [c.id, PRIX_DEPART])],
    ]);
  }
  let publie = false;
  const salon = optEnv("DISCORD_COTE_CHANNEL_ID");
  if (salon && nouveaux.length) {
    const r = await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [{
        title: "📈 INTRODUCTION EN BOURSE",
        description: `Les ${miens.filter((c) => c.etat === "actif").length + nouveaux.length} sujets du Programme ${prog} sont cotés à **${PRIX_DEPART} cr** la part.\nLa Cité peut miser dès ce soir. Les cours bougeront après chaque vote de la Cote.`,
        color: OR,
        footer: { text: "Bourse d'Osiris · crédits fictifs" },
      }],
    }) });
    publie = r.ok;
  }
  return { nouveaux: nouveaux.length, deja, publie };
}

// ---------- pour le bandeau (/api/bourse) et le cron ----------

export async function donneesBandeau() {
  if (!baseConfiguree()) return { actif: false, cours: [] };
  await calculerSiBesoin().catch(() => {});
  const e = await lireEtat();
  if (e.bandeau !== "1") return { actif: false, cours: [] }; // rien ne sort avant la révélation
  const m = await lireMarche();
  const cours = cotes(m)
    .sort((a, b) => Number(m.prix[b.id]) - Number(m.prix[a.id]))
    .map((c) => ({
      nom: c.court,
      prix: Number(m.prix[c.id]),
      variation: c.etat === "mort" ? -100 : Math.round(variation(Number(m.prix[c.id]), Number(m.prec[c.id] ?? m.prix[c.id])) * 10) / 10,
      faillite: c.etat === "mort",
      suspendu: c.etat === "sorti",
    }));
  return { actif: true, seance: Number(e.calculee || 0), devise: e.devise || DEVISE, cours };
}

export async function bourseGET() {
  try {
    return json(await donneesBandeau(), 200, { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" });
  } catch (e) {
    return json({ actif: false, cours: [], erreur: e.message }, 200, { "Cache-Control": "no-store" });
  }
}

// ---------- le site : l'onglet La Cote (/cote) ----------
//   GET  /api/rangs?cote=1 → les cours (Mécènes connectés, ou tout le monde une fois le bandeau activé), le portefeuille,
//                            les fortunes et le vote de la séance (Mécènes connectés seulement)
//   POST /api/rangs?cote=1 → { action: "achat", candidat, nombre (crédits) } | { action: "vente", candidat, nombre (parts) }
//                            | { action: "vote", seance, choix: [id, id, id] }
// Même session Discord que le reste du site (cookie osiris_session) ; les rôles viennent du serveur Osiris, comme sur Discord :
// un Candidat n'a jamais accès à la Bourse.

const CLE_MEMBRE = (u) => P + `site:membre:${u}`;

// Le membre du serveur Osiris (rôles et nom), gardé 2 minutes pour ne pas interroger Discord à chaque clic.
async function membreDiscord(uid) {
  const cache = await redis("GET", CLE_MEMBRE(uid));
  if (cache) return JSON.parse(cache);
  let m = null;
  const guild = optEnv("DISCORD_GUILD_ID");
  if (guild) {
    const r = await bot(`/guilds/${guild}/members/${uid}`);
    if (r.ok) {
      const d = await r.json();
      m = { roles: d.roles || [], nom: (d.nick || d.user?.global_name || d.user?.username || "Mécène").slice(0, 40) };
    } else if (r.status !== 404) throw new Error(`Discord ne répond pas (code ${r.status}), réessaie dans un instant.`);
  }
  await redis("SET", CLE_MEMBRE(uid), JSON.stringify(m), "EX", 120);
  return m;
}

async function visiteur(req) {
  let user = null;
  try { user = await readSession(req); } catch {}
  if (!user) return { user: null, m: null, acces: "invite" };
  const m = await membreDiscord(String(user.id));
  if (!m) return { user, m, acces: "hors_serveur" };
  return { user, m, acces: peutJouer({ roles: m.roles, permissions: "0" }) ? "mecene" : "refuse" };
}

// La courbe d'un candidat : son prix après chaque séance (et 120 à l'introduction en Bourse).
function courbe(c, hist, prixActuel) {
  const pts = c.discord ? [PRIX_DEPART] : [];
  for (const h of hist) if (h.cote && h.cote[c.id] !== undefined) pts.push(prixDe(h.cote[c.id]));
  if (c.etat === "mort") pts.push(0);
  if (!pts.length || pts.at(-1) !== prixActuel) pts.push(prixActuel);
  return pts.slice(-20);
}

async function etatSite(req) {
  await calculerSiBesoin().catch(() => {});
  const { user, m: md, acces } = await visiteur(req);
  const [e, m, histBrut] = await Promise.all([lireEtat(), lireMarche(), redis("LRANGE", K.hist, -19, -1)]);
  const marche = cotes(m);
  const hist = (histBrut || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  const voteOuvertMaintenant = e.ouvert === "1" && Number(e.fin) > Date.now();
  const d = {
    base: true, programme: PROG(), acces,
    connecte: user ? { nom: md?.nom || user.name || user.username } : null,
    ouverte: marche.length > 0, depart: DEPART, prixDepart: PRIX_DEPART,
    seance: Number(e.calculee || 0), publique: e.bandeau === "1", devise: e.bandeau === "1" ? e.devise || DEVISE : null,
    vote: voteOuvertMaintenant ? { seance: Number(e.seance), fin: Number(e.fin) } : null,
  };
  // Avant la révélation (bandeau caché), les cours restent dans la Loge : Mécènes connectés seulement.
  if (acces !== "mecene" && !d.publique) { d.vote = null; return d; }
  const ordre = { actif: 0, sorti: 1, mort: 2 };
  d.cours = marche
    .map((c) => {
      const prix = Number(m.prix[c.id] || 0);
      return {
        id: c.id, n: c.n, nom: c.nom, court: c.court, etat: c.etat, prix,
        variation: c.etat === "mort" ? -100 : Math.round(variation(prix, Number(m.prec[c.id] ?? prix)) * 10) / 10,
        courbe: courbe(c, hist, prix),
      };
    })
    .sort((a, b) => ordre[a.etat] - ordre[b.etat] || b.prix - a.prix || a.n - b.n);
  if (acces !== "mecene") { d.vote = null; return d; }

  const uid = String(user.id);
  const [pf] = await Promise.all([portefeuille(uid), redis("HSET", K.noms, uid, md.nom)]);
  const lignes = [];
  let total = pf.credits;
  for (const [cid, n] of Object.entries(pf.parts)) {
    if (cid.startsWith("i:") || Number(n) <= 0) continue;
    const c = m.cands.find((x) => x.id === cid);
    const prix = Number(m.prix[cid] || 0), valeur = Number(n) * prix, investi = Number(pf.parts["i:" + cid] || 0);
    total += valeur;
    lignes.push({ id: cid, nom: c?.nom || cid, etat: c?.etat || "retire", parts: Number(n), prix, valeur, investi, gain: investi > 0 ? Math.round(((valeur - investi) / investi) * 1000) / 10 : 0 });
  }
  lignes.sort((a, b) => b.valeur - a.valeur);
  const classement = await fortunes(m);
  const rang = classement.findIndex((f) => f.uid === uid) + 1;
  d.portefeuille = { credits: pf.credits, lignes, total, rang, joueurs: classement.length };
  d.fortunes = classement.slice(0, 10).map((f, k) => ({ rang: k + 1, nom: f.nom, total: Math.round(f.total), moi: f.uid === uid }));
  if (rang > 10) d.fortunes.push({ rang, nom: md.nom, total: Math.round(classement[rang - 1].total), moi: true });
  // Les colis (lib/colis.js, chargé ici à la demande)
  try {
    const { etatColis } = await import("./colis.js");
    d.colis = await etatColis(uid);
    d.portefeuille.offert = d.colis.offert;
  } catch (e) { d.colis = { erreur: e.message }; }
  if (d.vote) {
    const deja = await redis("HGET", K.votes(e.seance), uid);
    const actifs = enJeu(m.cands);
    d.vote.choix = deja ? deja.split(".").filter((x) => actifs.some((c) => c.id === x)) : [];
    d.vote.candidats = actifs.map((c) => ({ id: c.id, n: c.n, nom: c.nom }));
  }
  return d;
}

const PRIVE = { "Cache-Control": "private, no-store" };

export async function siteGET(req) {
  if (!baseConfiguree()) return json({ base: false }, 200, PRIVE);
  try {
    return json(await etatSite(req), 200, PRIVE);
  } catch (e) {
    return json({ base: true, erreur: e.message }, 500, PRIVE);
  }
}

// Un POST du site n'est accepté que depuis le site lui-même, en JSON (le cookie de session est SameSite=Lax : il ne part pas
// d'un autre site, et un formulaire classique ne peut pas envoyer du JSON). Renvoie la réponse de refus, ou null.
export function requeteRefusee(req) {
  const origine = req.headers.get("origin");
  if (origine) {
    let hote = "";
    try { hote = new URL(origine).host; } catch {}
    const permis = [new URL(req.url).host];
    try { permis.push(new URL(optEnv("SITE_URL")).host); } catch {}
    if (!permis.includes(hote)) return json({ erreur: "Requête refusée." }, 403, PRIVE);
  }
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ erreur: "Requête refusée." }, 415, PRIVE);
  return null;
}

export async function sitePOST(req) {
  const refus = requeteRefusee(req);
  if (refus) return refus;
  if (!baseConfiguree()) return json({ erreur: "La Bourse n'est pas encore branchée." }, 503, PRIVE);
  let corps;
  try { corps = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400, PRIVE); }
  try {
    const { user, m: md, acces } = await visiteur(req);
    if (!user) return json({ erreur: "Connecte-toi avec Discord pour jouer." }, 401, PRIVE);
    if (acces === "hors_serveur") return json({ erreur: "Rejoins d'abord le Discord d'Osiris." }, 403, PRIVE);
    if (acces !== "mecene") return json({ erreur: REFUS }, 403, PRIVE);
    const uid = String(user.id);
    let r;
    if (corps.action === "achat" || corps.action === "vente") {
      r = await operer(uid, md.nom, corps.action === "achat", String(corps.candidat || ""), Math.floor(Number(corps.nombre)));
    } else if (corps.action === "colis") {
      const { contribuer } = await import("./colis.js");
      r = await contribuer(uid, md.nom, String(corps.candidat || ""), String(corps.type || ""), Math.floor(Number(corps.nombre)));
    } else if (corps.action === "vote") {
      const v = await voter(uid, md.nom, String(corps.seance || ""), Array.isArray(corps.choix) ? corps.choix.slice(0, 3) : []);
      r = v.erreur ? { ok: false, message: v.erreur } : { ok: true, message: `✅ Vote enregistré : **${v.noms.join("**, **")}**. Tu peux le changer jusqu'à la fermeture.` };
    } else {
      return json({ erreur: "Action inconnue." }, 400, PRIVE);
    }
    return json({ ok: r.ok, message: r.message, etat: await etatSite(req) }, 200, PRIVE);
  } catch (e) {
    return json({ erreur: e.message }, 500, PRIVE);
  }
}

// Chaque soir (cron de /api/rangs?tick=1) : ferme le vote si l'heure est passée et, le dimanche, publie les 3 plus grandes fortunes.
export async function tick(maintenant = Date.now()) {
  if (!baseConfiguree()) return { rien: "base non branchée" };
  const rapport = await calculerSiBesoin();
  if (estDimanche(maintenant)) {
    const e = await lireEtat();
    const jour = jourParis(maintenant);
    const salon = optEnv("DISCORD_COTE_CHANNEL_ID");
    if (e.dimanche !== jour && salon && e.calculee) {
      const m = await lireMarche();
      const classement = (await fortunes(m)).slice(0, 3);
      if (classement.length) {
        const medailles = ["🥇", "🥈", "🥉"];
        await bot(`/channels/${salon}/messages`, { method: "POST", body: JSON.stringify({
          allowed_mentions: { parse: [] },
          embeds: [{
            title: "LES PLUS GRANDES FORTUNES DE LA CITÉ",
            description: `${classement.map((f, k) => `${medailles[k]} **${f.nom}** · ${fr(f.total)} cr`).join("\n")}\n\n${classement[0].nom}, la régie attend votre Choix d'Osiris pour la semaine.`,
            color: OR,
            footer: { text: "Bourse d'Osiris · crédits fictifs" },
          }],
        }) });
        rapport.fortunes = classement.map((f) => f.nom);
      }
      await redis("HSET", K.etat, "dimanche", jour);
    }
  }
  return rapport;
}

// ---------- pour les colis (lib/colis.js) et les Offrandes (lib/offrande.js) ----------
export { K as CLES, P as PREFIXE, PRIVE, portefeuille, visiteur, PROG, enJeu, lireEtat };
