// Les colis payés en crédits : les Mécènes mettent en commun les crédits de la Bourse pour envoyer un colis marqué de l'Œil
// à un candidat (comme les sponsors de Hunger Games). Quand la cagnotte est pleine, la régie est prévenue et livre le colis en jeu.
//
// - Le catalogue (nom, prix, ce qu'il contient) se règle avec /colis catalogue ; par défaut : Chaleur, Vivres, Soins, Une clé.
// - Les dons sortent du portefeuille : dépenser pour son favori, c'est moins de fortune au classement.
// - Une cagnotte par candidat et par sorte de colis à la fois ; une fois pleine, une nouvelle peut commencer.
// - Colis prêt : message dans le salon de la régie (DISCORD_COLIS_CHANNEL_ID) avec « Livré » et « Annuler », et annonce dans #la-cote.
// - Candidat mort ou sorti avant la livraison : les donateurs sont remboursés.
// - Les dons ne sont possibles que quand la régie a ouvert les colis (/colis ouvrir actif:oui).
// Les candidats ne voient rien : tout se passe dans la Loge (#la-cote) et sur l'onglet La Cote du site (Mécènes connectés).

import { bot, json, optEnv, isDirection } from "./discord.js";
import { redis, lot, objet, verrou, liberer, baseConfiguree } from "./redis.js";
import { lireCandidats, peutJouer, portefeuille, CLES, PROG } from "./cote.js";

const P = "osiris:colis:"; // même préfixe que la Cote (lib/cote.js)
const VERROU_U = (uid) => `osiris:verrou:u:${uid}`; // le même verrou que les achats et ventes de la Bourse
const K = {
  catalogue: P + "catalogue",                // JSON [{ id, nom, prix, texte }]
  etat: P + "etat",                          // ouvert
  cagnottes: P + "cagnottes",                // id → JSON { id, cand, type, nom, prix, total, etat, cree, prete, livree }
  dons: (id) => P + `dons:${id}`,            // membre → crédits donnés à cette cagnotte
  offert: P + "offert",                      // membre → total donné à tous les colis
  n: P + "n",                                // compteur des cagnottes
};
const EPHEMERAL = 64, OR = 0xc4a265, VERT = 0x5a9a6e, ROUGE = 0xb5564a;
const fr = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR");
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "colis";
const reponse = (content, extra = {}) => json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const maj = (content, extra = {}) => json({ type: 7, data: { content, allowed_mentions: { parse: [] }, embeds: [], components: [], ...extra } });
const nomDe = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || i.user?.username || "Mécène";

export const CATALOGUE_DEFAUT = [
  { id: "chaleur", nom: "Chaleur", prix: 1500, texte: "Du bois sec, des allumettes, une couverture de laine." },
  { id: "vivres", nom: "Vivres", prix: 1500, texte: "De quoi tenir trois jours sans sortir." },
  { id: "soins", nom: "Soins", prix: 2500, texte: "Une trousse de secours complète." },
  { id: "cle", nom: "Une clé", prix: 6000, texte: "Elle ouvre une porte. La régie choisit laquelle." },
];

// ---------- lecture ----------

export async function catalogue() {
  const v = await redis("GET", K.catalogue);
  try { return v ? JSON.parse(v) : CATALOGUE_DEFAUT; } catch { return CATALOGUE_DEFAUT; }
}
export const colisOuverts = async () => (await redis("HGET", K.etat, "ouvert")) === "1";

async function cagnottes() {
  return Object.values(objet(await redis("HGETALL", K.cagnottes))).map((v) => JSON.parse(v)).sort((a, b) => b.cree - a.cree);
}

// Un candidat mort, sorti ou retiré avant la livraison : on rembourse ses cagnottes en cours ou prêtes.
async function rembourserSiBesoin(liste, cands) {
  const touchees = liste.filter((g) => (g.etat === "ouverte" || g.etat === "prete") && cands.find((c) => c.id === g.cand)?.etat !== "actif");
  for (const g of touchees) await annuler(g.id, "candidat").catch(() => {});
  return touchees.length;
}

// Tout ce que la page et le panneau affichent. uid : pour « ta part ».
export async function etatColis(uid) {
  const [liste0, cands, cat, ouvert] = await Promise.all([cagnottes(), lireCandidats(), catalogue(), colisOuverts()]);
  const rembourses = await rembourserSiBesoin(liste0, cands);
  const liste = rembourses ? await cagnottes() : liste0;
  const visibles = [...liste.filter((g) => g.etat === "ouverte"), ...liste.filter((g) => g.etat === "prete"), ...liste.filter((g) => g.etat === "livree").slice(0, 6)];
  const [mesDons, offert] = uid
    ? await Promise.all([visibles.length ? lot(visibles.map((g) => ["HGET", K.dons(g.id), uid])) : [], redis("HGET", K.offert, uid)])
    : [[], 0];
  return {
    ouvert, catalogue: cat, offert: Number(offert || 0),
    cagnottes: visibles.map((g, k) => ({
      id: g.id, cand: g.cand, candNom: cands.find((c) => c.id === g.cand)?.nom || "?", type: g.type, nom: g.nom, prix: g.prix,
      total: g.total, etat: g.etat, donateurs: g.donateurs || 0, cree: g.cree, prete: g.prete || null, livree: g.livree || null,
      moi: Number(mesDons[k] || 0),
    })),
  };
}

// ---------- donner ----------

export async function contribuer(uid, nom, cid, type, montant) {
  uid = String(uid);
  const non = (message) => ({ ok: false, message });
  if (!baseConfiguree()) return non("La Bourse n'est pas branchée.");
  if (!(await colisOuverts())) return non("Les colis ne sont pas ouverts pour l'instant : la régie les ouvre pendant le Programme.");
  if (!Number.isSafeInteger(montant) || montant < 1) return non("Indique un nombre de crédits, par exemple 500.");
  const [cands, cat] = await Promise.all([lireCandidats(), catalogue()]);
  const c = cands.find((x) => x.id === cid);
  if (!c || c.prog !== PROG()) return non("Candidat introuvable.");
  if (c.etat !== "actif") return non(`${c.nom} ne peut plus recevoir de colis.`);
  const sorte = cat.find((x) => x.id === type);
  if (!sorte) return non("Ce colis n'existe pas.");
  // un seul mouvement à la fois sur ce portefeuille (comme à la Bourse) et sur cette cagnotte
  const cleU = VERROU_U(uid), cleG = P + `verrou:${cid}:${type}`;
  if (!(await verrou(cleU, 8000))) return non("Une opération est déjà en cours sur ton portefeuille, réessaie dans un instant.");
  if (!(await verrou(cleG, 8000))) { await liberer(cleU); return non("Un autre Mécène donne au même colis, réessaie dans un instant."); }
  try {
    const liste = await cagnottes();
    let g = liste.find((x) => x.cand === cid && x.type === type && x.etat === "ouverte");
    if (!g) g = { id: `${cid}~${type}~${await redis("INCR", K.n)}`, cand: cid, type, nom: sorte.nom, prix: sorte.prix, total: 0, donateurs: 0, etat: "ouverte", cree: Date.now() };
    const pf = await portefeuille(uid);
    const reste = g.prix - g.total;
    const don = Math.min(montant, reste, pf.credits);
    if (don < 1) return non(pf.credits < 1 ? "Tu n'as plus de crédits." : "Cette cagnotte est déjà pleine.");
    const dejaDonne = Number((await redis("HGET", K.dons(g.id), uid)) || 0);
    g.total += don;
    if (!dejaDonne) g.donateurs = (g.donateurs || 0) + 1;
    const pleine = g.total >= g.prix;
    if (pleine) { g.etat = "prete"; g.prete = Date.now(); }
    await lot([
      ["HINCRBY", CLES.credits, uid, -don],
      ["HINCRBY", K.dons(g.id), uid, don],
      ["HINCRBY", K.offert, uid, don],
      ["HSET", K.cagnottes, g.id, JSON.stringify(g)],
      ["HSET", CLES.noms, uid, nom],
    ]);
    if (pleine) await annoncerPret(g, c).catch(() => {});
    const message = pleine
      ? `📦 Tu as donné **${fr(don)} cr** : la cagnotte « ${g.nom} » pour ${c.nom} est **pleine**. La régie va faire livrer le colis.`
      : `📦 Tu as donné **${fr(don)} cr** pour « ${g.nom} » à ${c.nom}. Cagnotte : ${fr(g.total)} / ${fr(g.prix)} cr. Il te reste ${fr(pf.credits - don)} cr.`;
    return { ok: true, message, pleine, cagnotte: g };
  } finally {
    await Promise.all([liberer(cleG), liberer(cleU)]);
  }
}

async function annoncerPret(g, c) {
  const regie = optEnv("DISCORD_COLIS_CHANNEL_ID"), loge = optEnv("DISCORD_COTE_CHANNEL_ID");
  const taches = [];
  if (regie) taches.push(bot(`/channels/${regie}/messages`, { method: "POST", body: JSON.stringify({
    allowed_mentions: { parse: [] },
    embeds: [{ title: `📦 COLIS PRÊT · ${g.nom.toUpperCase()}`, description: `Pour **${c.nom}** · ${fr(g.prix)} cr réunis par ${g.donateurs} Mécène${g.donateurs > 1 ? "s" : ""}.\nÀ déposer à la poste ou sur son perron : lui seul peut l'ouvrir. Clique sur « Livré » une fois en jeu.`, color: OR, footer: { text: `Colis ${g.id}` } }],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: "Livré", emoji: { name: "✅" }, custom_id: `colis:livre:${g.id}` },
      { type: 2, style: 4, label: "Annuler et rembourser", custom_id: `colis:annule:${g.id}` },
    ] }],
  }) }));
  if (loge) taches.push(bot(`/channels/${loge}/messages`, { method: "POST", body: JSON.stringify({
    allowed_mentions: { parse: [] },
    embeds: [{ title: `📦 UN COLIS ATTEND ${c.court}`, description: `La Cité a réuni **${fr(g.prix)} cr** : « ${g.nom} » pour ${c.nom}. Un colis marqué de l'Œil va apparaître.`, color: OR, footer: { text: "Bourse d'Osiris · crédits fictifs" } }],
  }) }));
  await Promise.all(taches);
}

// ---------- la régie : livrer, annuler ----------

export async function livrer(id) {
  const brut = await redis("HGET", K.cagnottes, id);
  if (!brut) return { erreur: "Colis introuvable." };
  const g = JSON.parse(brut);
  if (g.etat === "livree") return { erreur: "Ce colis est déjà livré." };
  if (g.etat !== "prete") return { erreur: `Ce colis n'est pas prêt (${fr(g.total)} / ${fr(g.prix)} cr).` };
  const c = (await lireCandidats()).find((x) => x.id === g.cand);
  if (c?.etat !== "actif") {
    const r = await annuler(id, "candidat");
    return { erreur: `${c?.nom || "Ce candidat"} n'est plus en jeu : colis annulé${r.rembourses ? `, ${r.rembourses} Mécène(s) remboursé(s)` : ""}.` };
  }
  g.etat = "livree"; g.livree = Date.now();
  await redis("HSET", K.cagnottes, id, JSON.stringify(g));
  const loge = optEnv("DISCORD_COTE_CHANNEL_ID");
  if (loge) await bot(`/channels/${loge}/messages`, { method: "POST", body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [{ title: `📦 COLIS LIVRÉ · ${c?.court || "?"}`, description: `« ${g.nom} » a été déposé pour ${c?.nom || "?"}. Les Mécènes ont tenu parole.`, color: VERT }] }) }).catch(() => {});
  return { g, c };
}

export async function annuler(id, raison = "regie") {
  const cle = P + "verrou:annule:" + id;
  if (!(await verrou(cle, 15000))) return { erreur: "Annulation déjà en cours." };
  try {
    const brut = await redis("HGET", K.cagnottes, id);
    if (!brut) return { erreur: "Colis introuvable." };
    const g = JSON.parse(brut);
    if (g.etat === "livree") return { erreur: "Ce colis est déjà livré : on ne rembourse pas." };
    if (g.etat === "annulee") return { erreur: "Ce colis est déjà annulé." };
    const dons = objet(await redis("HGETALL", K.dons(id)));
    const ops = Object.entries(dons).flatMap(([uid, v]) => [["HINCRBY", CLES.credits, uid, Number(v)], ["HINCRBY", K.offert, uid, -Number(v)]]);
    g.etat = "annulee"; g.annulee = Date.now(); g.raison = raison;
    ops.push(["HSET", K.cagnottes, id, JSON.stringify(g)]);
    await lot(ops);
    return { g, rembourses: Object.keys(dons).length, total: Object.values(dons).reduce((a, b) => a + Number(b), 0) };
  } finally {
    await liberer(cle);
  }
}

// ---------- Discord : le bouton « Colis » du panneau de la Bourse, les menus, la fenêtre ----------

function barre(total, prix) {
  const n = Math.round(Math.min(1, total / prix) * 10);
  return "▰".repeat(n) + "▱".repeat(10 - n);
}

function menusCandidats(actifs, enCours) {
  const lignes = [];
  for (let k = 0; k < actifs.length && lignes.length < 2; k += 25) {
    const g = actifs.slice(k, k + 25);
    lignes.push({ type: 1, components: [{
      type: 3, custom_id: `colis:c:${k / 25}`, placeholder: actifs.length > 25 ? `Candidats ${k + 1} à ${k + g.length}` : "À qui envoyer un colis ?",
      options: g.map((c) => ({ label: c.nom.slice(0, 100), value: c.id, description: (enCours[c.id] ? `${enCours[c.id]} cagnotte${enCours[c.id] > 1 ? "s" : ""} en cours` : "Aucune cagnotte en cours").slice(0, 100) })),
    }] });
  }
  return lignes;
}

export async function composant(i, user) {
  const id = i.data.custom_id;
  if (!baseConfiguree()) return reponse("La Bourse n'est pas encore branchée.");

  // La régie : Livré / Annuler (message du salon de la régie)
  if (id.startsWith("colis:livre:") || id.startsWith("colis:annule:")) {
    if (!isDirection(i.member)) return reponse("Réservé à la régie.");
    const gid = id.split(":").slice(2).join(":");
    if (id.startsWith("colis:livre:")) {
      const r = await livrer(gid);
      if (r.erreur) return reponse(r.erreur);
      return json({ type: 7, data: { embeds: [{ title: `✅ COLIS LIVRÉ · ${r.g.nom.toUpperCase()}`, description: i.message?.embeds?.[0]?.description || "", color: VERT, footer: { text: `Livré par ${nomDe(i)} · colis ${gid}` } }], components: [] } });
    }
    const r = await annuler(gid);
    if (r.erreur) return reponse(r.erreur);
    return json({ type: 7, data: { embeds: [{ title: `✖ COLIS ANNULÉ · ${r.g.nom.toUpperCase()}`, description: i.message?.embeds?.[0]?.description || "", color: ROUGE, footer: { text: `Annulé par ${nomDe(i)} · ${r.rembourses} Mécène(s) remboursé(s), ${fr(r.total)} cr` } }], components: [] } });
  }

  if (!peutJouer(i.member)) return reponse("Les colis sont envoyés par les Mécènes.");
  const cands = (await lireCandidats()).filter((c) => c.prog === PROG() && c.etat === "actif");

  // Le bouton du panneau : les cagnottes en cours et le choix du candidat
  if (id === "bourse:colis") {
    const e = await etatColis(user.id);
    if (!e.ouvert) return reponse("📦 Les colis ne sont pas ouverts pour l'instant : la régie les ouvre pendant le Programme.");
    if (!cands.length) return reponse("Aucun candidat en jeu.");
    const ouvertes = e.cagnottes.filter((g) => g.etat === "ouverte");
    const enCours = {};
    for (const g of ouvertes) enCours[g.cand] = (enCours[g.cand] || 0) + 1;
    const texte = `📦 **Les colis**\nMettez vos crédits en commun : quand la cagnotte est pleine, un colis marqué de l'Œil apparaît pour le candidat. Les crédits donnés sortent de ta fortune.`
      + (ouvertes.length ? `\n\n**En cours**\n${ouvertes.slice(0, 12).map((g) => `${g.candNom} · ${g.nom} ${barre(g.total, g.prix)} ${fr(g.total)} / ${fr(g.prix)} cr${g.moi ? ` (dont ${fr(g.moi)} de toi)` : ""}`).join("\n")}` : "\n\nAucune cagnotte en cours : lance la première.")
      + `\n\nTu as donné ${fr(e.offert)} cr en tout.`;
    return reponse(texte.slice(0, 2000), { components: menusCandidats(cands, enCours) });
  }

  // Un candidat choisi : la sorte de colis
  if (id.startsWith("colis:c:")) {
    const cid = (i.data.values || [])[0];
    const c = cands.find((x) => x.id === cid);
    if (!c) return maj("Ce candidat ne peut plus recevoir de colis.");
    const [cat, e] = await Promise.all([catalogue(), etatColis(user.id)]);
    const enCours = Object.fromEntries(e.cagnottes.filter((g) => g.cand === cid && g.etat === "ouverte").map((g) => [g.type, g]));
    return maj(`📦 **Un colis pour ${c.nom}**\nChoisis ce qu'il contient.`, { components: [{ type: 1, components: [{
      type: 3, custom_id: `colis:t:${cid}`, placeholder: "Quel colis ?",
      options: cat.slice(0, 25).map((s) => ({ label: `${s.nom} · ${fr(s.prix)} cr`.slice(0, 100), value: s.id, description: (enCours[s.id] ? `Cagnotte : ${fr(enCours[s.id].total)} / ${fr(s.prix)} cr` : s.texte).slice(0, 100) })),
    }] }] });
  }

  // La sorte choisie : la fenêtre du montant
  if (id.startsWith("colis:t:")) {
    const cid = id.slice("colis:t:".length), type = (i.data.values || [])[0];
    const c = cands.find((x) => x.id === cid);
    const [cat, e, pf] = await Promise.all([catalogue(), etatColis(user.id), portefeuille(String(user.id))]);
    const s = cat.find((x) => x.id === type);
    if (!c || !s) return maj("Ce colis n'est plus disponible.");
    const g = e.cagnottes.find((x) => x.cand === cid && x.type === type && x.etat === "ouverte");
    const reste = s.prix - (g?.total || 0);
    return json({ type: 9, data: { custom_id: `colis_don:${cid}:${type}`, title: `${s.nom} pour ${c.court}`.slice(0, 45), components: [{ type: 1, components: [{
      type: 4, custom_id: "montant", style: 1, required: true, max_length: 9,
      label: `Crédits à donner (tu as ${fr(pf.credits)})`.slice(0, 45),
      placeholder: `Il manque ${fr(reste)} cr`, value: String(Math.max(0, Math.min(reste <= 1000 ? reste : 500, pf.credits))),
    }] }] } });
  }
  return reponse("Action inconnue.");
}

export async function fenetre(i, user) {
  const id = i.data.custom_id;
  if (id.startsWith("colis_don:")) {
    if (!peutJouer(i.member)) return reponse("Les colis sont envoyés par les Mécènes.");
    const [, cid, type] = id.split(":");
    const brut = (i.data.components || []).flatMap((r) => r.components || [r.component]).find((c) => c?.custom_id === "montant")?.value || "";
    const montant = Math.floor(Number(String(brut).replace(/[\s  .]/g, "").replace(",", ".")));
    return reponse((await contribuer(user.id, nomDe(i), cid, type, montant)).message);
  }
  if (id === "colis_catalogue") {
    if (!isDirection(i.member)) return reponse("Réservé à la régie.");
    const brut = (i.data.components || []).flatMap((r) => r.components || [r.component]).find((c) => c?.custom_id === "liste")?.value || "";
    const lignes = brut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 25);
    const cat = [], erreurs = [];
    for (const l of lignes) {
      const [nom, prix, ...texte] = l.split("|").map((x) => x.trim());
      const p = Math.round(Number(String(prix || "").replace(/[\s  .]/g, "")));
      if (!nom || !(p > 0)) { erreurs.push(l); continue; }
      let sid = slug(nom); while (cat.some((x) => x.id === sid)) sid += "-2";
      cat.push({ id: sid, nom: nom.slice(0, 40), prix: p, texte: texte.join(" | ").slice(0, 90) });
    }
    if (!cat.length) return reponse("Aucun colis valable. Une ligne par colis : `Nom | prix | ce qu'il contient`.");
    await redis("SET", K.catalogue, JSON.stringify(cat));
    return reponse(`Catalogue enregistré : ${cat.map((s) => `${s.nom} (${fr(s.prix)} cr)`).join(", ")}.${erreurs.length ? `\n⚠️ Lignes ignorées : ${erreurs.join(" · ")}` : ""}\nLes cagnottes déjà commencées gardent leur prix.`);
  }
  return reponse("Fenêtre inconnue.");
}

// ---------- /colis (régie) ----------

export const COMMANDE = {
  name: "colis",
  description: "Les colis payés en crédits par les Mécènes (régie)",
  options: [
    { type: 1, name: "ouvrir", description: "Ouvrir ou fermer les dons aux colis", options: [
      { type: 5, name: "actif", description: "Les Mécènes peuvent donner", required: true },
    ] },
    { type: 1, name: "catalogue", description: "Écrire le catalogue des colis (nom | prix | contenu)" },
    { type: 1, name: "etat", description: "Les cagnottes en cours, les colis prêts et livrés" },
    { type: 1, name: "livrer", description: "Marquer un colis prêt comme livré en jeu", options: [
      { type: 3, name: "colis", description: "Le colis", required: true, autocomplete: true },
    ] },
    { type: 1, name: "annuler", description: "Annuler une cagnotte et rembourser les Mécènes", options: [
      { type: 3, name: "colis", description: "Le colis", required: true, autocomplete: true },
    ] },
  ],
};

export async function autocomplete(i) {
  if (!isDirection(i.member) || !baseConfiguree()) return json({ type: 8, data: { choices: [] } });
  const sous = i.data.options?.[0];
  const tape = String(sous?.options?.find((o) => o.focused)?.value || "").toLowerCase();
  const e = await etatColis();
  const voulus = sous?.name === "livrer" ? ["prete"] : ["ouverte", "prete"];
  const choix = e.cagnottes.filter((g) => voulus.includes(g.etat))
    .map((g) => ({ name: `${g.candNom} · ${g.nom} · ${g.etat === "prete" ? "prêt" : `${fr(g.total)} / ${fr(g.prix)} cr`}`.slice(0, 100), value: g.id }))
    .filter((c) => !tape || c.name.toLowerCase().includes(tape)).slice(0, 25);
  return json({ type: 8, data: { choices: choix } });
}

// Renvoie { reponse } ou { travail } (comme /cote).
export async function commande(i) {
  const sous = i.data.options?.[0] || {};
  const opt = (k) => (sous.options || []).find((o) => o.name === k)?.value;
  if (!baseConfiguree()) return { reponse: reponse("La base n'est pas branchée : Vercel → Storage → Upstash Redis (voir le README).") };

  if (sous.name === "ouvrir") {
    const actif = !!opt("actif");
    await redis("HSET", K.etat, "ouvert", actif ? "1" : "0");
    return { reponse: reponse(actif ? "📦 Colis ouverts : les Mécènes peuvent donner (bouton « Colis » du panneau de la Bourse, et onglet La Cote du site)." : "Colis fermés : plus de nouveaux dons. Les cagnottes commencées restent, et les colis prêts peuvent toujours être livrés.") };
  }
  if (sous.name === "catalogue") {
    const cat = await catalogue();
    return { reponse: json({ type: 9, data: { custom_id: "colis_catalogue", title: "Catalogue des colis", components: [{ type: 1, components: [{
      type: 4, custom_id: "liste", label: "Un par ligne : Nom | prix | contenu", style: 2, required: true, max_length: 3000,
      value: cat.map((s) => `${s.nom} | ${s.prix} | ${s.texte}`).join("\n").slice(0, 3000),
    }] }] } }) };
  }
  if (sous.name === "etat") {
    return { travail: (async () => {
      const e = await etatColis();
      const par = (x) => e.cagnottes.filter((g) => g.etat === x);
      const ligne = (g) => `${g.candNom} · ${g.nom} · ${fr(g.total)} / ${fr(g.prix)} cr · ${g.donateurs} Mécène${g.donateurs > 1 ? "s" : ""}`;
      return [
        `**Les colis** · ${e.ouvert ? "ouverts" : "fermés"} · salon de la régie : ${optEnv("DISCORD_COLIS_CHANNEL_ID") ? `<#${optEnv("DISCORD_COLIS_CHANNEL_ID")}>` : "⚠️ DISCORD_COLIS_CHANNEL_ID manquant"}`,
        `Catalogue : ${e.catalogue.map((s) => `${s.nom} ${fr(s.prix)} cr`).join(" · ")}`,
        par("prete").length ? `\n**Prêts à livrer**\n${par("prete").map(ligne).join("\n")}` : "\nAucun colis prêt.",
        par("ouverte").length ? `\n**Cagnottes en cours**\n${par("ouverte").map(ligne).join("\n")}` : "Aucune cagnotte en cours.",
        par("livree").length ? `\n**Derniers livrés**\n${par("livree").map(ligne).join("\n")}` : "",
      ].filter(Boolean).join("\n").slice(0, 2000);
    })() };
  }
  if (sous.name === "livrer") {
    return { travail: livrer(String(opt("colis") || "")).then((r) => r.erreur || `✅ « ${r.g.nom} » pour ${r.c?.nom || "?"} : livré. Annoncé dans #la-cote.`) };
  }
  if (sous.name === "annuler") {
    return { travail: annuler(String(opt("colis") || "")).then((r) => r.erreur || `Cagnotte « ${r.g.nom} » annulée : ${r.rembourses} Mécène(s) remboursé(s), ${fr(r.total)} cr rendus.`) };
  }
  return { reponse: reponse("Sous-commande inconnue.") };
}
