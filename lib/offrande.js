// /offrande : une carte Osiris (bannière, description de chaque Offrande, heure de fin) puis le sondage Discord juste
// en dessous, dans #offrandes. Le vote reste un sondage Discord : il compte pour les rangs des Mécènes.
// Durée en minutes (10 par défaut). Discord impose au moins 1 heure à un sondage : il est donc créé pour l'heure
// entière, et le journal Osiris (sur le VPS) le ferme à l'heure annoncée sur la carte.
//
// Les Offrandes à l'écran (base Upstash nécessaire) :
// - l'Offrande en cours est gardée dans la base ; les Mécènes connectés votent aussi depuis le site (Salle de contrôle) ;
// - le compte réunit le sondage Discord et le site, sans doublon (si quelqu'un a voté aux deux endroits, son vote Discord compte) ;
// - GET /api/rangs?offrande=1 : le vote en cours (pour l'écran OBS /offrande et la Salle), POST : voter depuis le site ;
// - à l'heure de fin, le résultat réuni est publié sous le sondage (c'est lui qui compte, pas l'affichage de Discord) ;
// - les votes du site comptent pour les rangs des Mécènes, comme un vote au sondage (lib/rangs.js).

import { bot, optEnv, json } from "./discord.js";
import { redis, lot, objet, verrou, liberer, baseConfiguree } from "./redis.js";
import { visiteur, requeteRefusee, PRIVE, CLES } from "./cote.js";

const EMOJIS = ["❄️", "🕯️", "🗝️"];
// Rôles notifiés à chaque Offrande (pas pour un test) : tous les rangs de Mécène et le staff.
const A_NOTIFIER = ["DISCORD_GRAND_MECENE_ROLE_ID", "DISCORD_MECENE_OR_ROLE_ID", "DISCORD_MECENE_ARGENT_ROLE_ID", "DISCORD_MECENE_ROLE_ID", "DISCORD_STAFF_ROLE_ID"];
const CHIFFRES = ["I", "II", "III"];

// La fenêtre qui s'ouvre quand on tape /offrande (5 champs au maximum).
export function offrandeModal(salonTest, ecran = true) {
  const champ = (custom_id, label, style, required, max_length, placeholder, value) => ({
    type: 1, components: [{ type: 4, custom_id, label, style, required, max_length, ...(placeholder ? { placeholder } : {}), ...(value ? { value } : {}) }],
  });
  return {
    type: 9,
    data: {
      custom_id: `offrande_envoi:${salonTest || ""}:${ecran ? 1 : 0}`,
      title: "Nouvelle Offrande",
      components: [
        champ("titre", "Titre du vote", 1, true, 100, "Offrande de 22h", "Offrande de 22h"),
        champ("duree", "Durée du vote (minutes, ou 2h)", 1, true, 6, "10", "10"),
        champ("o1", "Offrande I", 2, true, 600, "1re ligne : le nom. En dessous : ce qui se passera."),
        champ("o2", "Offrande II", 2, true, 600, "1re ligne : le nom. En dessous : ce qui se passera."),
        champ("o3", "Offrande III (facultatif)", 2, false, 600, "Laisser vide pour un vote à deux choix."),
      ],
    },
  };
}

function lire(i, k) {
  return (i.data.components || []).flatMap((r) => r.components).find((c) => c.custom_id === k)?.value?.trim() || "";
}

// Publie la carte et le sondage. Renvoie { ok, salon, test } ou { erreur }.
// salonTest : identifiant d'un autre salon (option « salon » de /offrande), pour essayer sans fausser les rangs.
export async function publierOffrande(i, salonTest, ecran = true) {
  const titre = lire(i, "titre").slice(0, 100) || "Offrande";
  const brut = lire(i, "duree").toLowerCase().replace(",", ".").replace(/\s+/g, "");
  const h = /^(\d+(?:\.\d+)?)h(\d+)?$/.exec(brut);
  const minutes = Math.round(h ? Number(h[1]) * 60 + Number(h[2] || 0) : Number(brut.replace(/min$/, "")));
  if (!(minutes >= 2 && minutes <= 10080)) return { erreur: "La durée doit être un nombre de minutes entre 2 et 10080 (une semaine), par exemple 10, ou 2h." };
  const heures = Math.max(1, Math.ceil(minutes / 60)); // durée du sondage côté Discord (au moins 1 h)
  const duree = minutes % 60 === 0 ? `${minutes / 60} h` : minutes > 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
  const offrandes = ["o1", "o2", "o3"].map((k) => lire(i, k)).filter(Boolean).map((t) => {
    const [nom, ...reste] = t.split("\n");
    return { nom: nom.trim().slice(0, 55), texte: reste.join("\n").trim().slice(0, 1000) };
  });
  if (offrandes.length < 2) return { erreur: "Il faut au moins deux Offrandes." };

  const officiel = optEnv("DISCORD_OFFRANDES_CHANNEL_ID");
  const salon = (/^\d{5,25}$/.test(salonTest || "") && salonTest) || officiel || i.channel_id;
  const test = salon !== officiel;
  const site = optEnv("SITE_URL").replace(/\/$/, "");
  const fin = Math.floor(Date.now() / 1000) + minutes * 60;
  const roles = test ? [] : [...new Set(A_NOTIFIER.map(optEnv).filter(Boolean))];

  const carte = await bot(`/channels/${salon}/messages`, {
    method: "POST",
    body: JSON.stringify({
      ...(roles.length ? { content: roles.map((r) => `<@&${r}>`).join(" ") } : {}),
      allowed_mentions: { parse: [], roles },
      embeds: [{
        color: 0xc4a265,
        author: { name: "OSIRIS · LA LOGE DES MÉCÈNES", ...(site ? { icon_url: `${site}/img/apple-touch-icon.png` } : {}) },
        title: titre.toUpperCase(),
        description: `Les candidats ne savent rien. Vous, si.\nLe vote se ferme à **<t:${fin}:t>** (<t:${fin}:R>). Un seul choix par Mécène.`
          + (baseConfiguree() && site ? `\nVous pouvez aussi voter sur le site, dans la [Salle de contrôle](${site}/salle).` : ""),
        fields: offrandes.map((o, k) => ({ name: `${EMOJIS[k]}  ${CHIFFRES[k]} · ${o.nom}`, value: o.texte || "​" })),
        ...(site ? { image: { url: `${site}/img/offrande.png` } } : {}),
        footer: { text: "Osiris · ce qui se décide ici ne doit jamais atteindre les candidats" },
      }],
    }),
  });
  if (!carte.ok) return { erreur: `Impossible de publier la carte (code ${carte.status}). Le bot doit pouvoir écrire et intégrer des liens dans #offrandes.` };

  const sondage = await bot(`/channels/${salon}/messages`, {
    method: "POST",
    body: JSON.stringify({
      poll: {
        question: { text: titre.slice(0, 300) },
        answers: offrandes.map((o, k) => ({ poll_media: { text: o.nom, emoji: { name: EMOJIS[k] } } })),
        duration: heures,
        allow_multiselect: false,
        layout_type: 1,
      },
    }),
  });
  if (!sondage.ok) {
    let detail = ""; try { detail = (await sondage.json()).message || ""; } catch {}
    return { erreur: `La carte est publiée, mais pas le sondage (code ${sondage.status}${detail ? " : " + detail : ""}). Le bot doit avoir « Créer des sondages » dans #offrandes.` };
  }
  // L'Offrande en cours, pour l'écran et le vote du site
  let enBase = false;
  if (baseConfiguree()) {
    try {
      const msg = await sondage.json();
      await redis("SET", K.courante, JSON.stringify({ id: msg.id, salon, titre, debut: Date.now(), fin: fin * 1000, options: offrandes, ecran: !!ecran, test }));
      enBase = true;
    } catch {}
  }
  return { ok: true, salon, test, notifies: roles.length, titre, minutes, duree, ferme: minutes % 60 !== 0, offrandes: offrandes.map((o) => o.nom), ecran: enBase && !!ecran, enBase };
}

// ---------- les Offrandes à l'écran ----------

const P = "osiris:offrande:";
const K = {
  courante: P + "courante",                 // l'Offrande en cours (JSON)
  votes: (id) => P + `votes:${id}`,         // membre → n° du choix (0, 1, 2), votes du site
  compte: (id) => P + `compte:${id}`,       // le dernier compte des votes Discord (JSON, quelques secondes)
  resultat: (id) => P + `resultat:${id}`,   // le résultat final (JSON)
};
export const CLE_VOTES_SITE = K.votes;
const RESULTAT_VISIBLE = 10 * 60 * 1000; // le résultat reste lisible 10 minutes après la fin

const lireCourante = async () => { const v = await redis("GET", K.courante); return v ? JSON.parse(v) : null; };

// Qui a voté quoi sur le sondage Discord : membre → n° du choix.
async function votantsDiscord(o) {
  const parQui = {};
  await Promise.all(o.options.map(async (_, k) => {
    let apres = "";
    for (let page = 0; page < 30; page++) {
      const r = await bot(`/channels/${o.salon}/polls/${o.id}/answers/${k + 1}?limit=100${apres ? "&after=" + apres : ""}`);
      if (!r.ok) throw new Error(`Discord ne donne pas les votes (code ${r.status})`);
      const users = (await r.json()).users || [];
      for (const u of users) if (!u.bot) parQui[u.id] = k;
      if (users.length < 100) break;
      apres = users.at(-1).id;
    }
  }));
  return parQui;
}

// Les votes Discord, relus au plus toutes les 4 secondes (l'écran et la Salle interrogent souvent).
async function discordRecent(o, frais = false) {
  const brut = await redis("GET", K.compte(o.id));
  const cache = brut ? JSON.parse(brut) : null;
  if (!frais && cache && Date.now() - cache.t < 4000) return cache.parQui;
  const verrouille = !frais && cache;
  if (verrouille && !(await verrou(K.compte(o.id) + ":verrou", 5000))) return cache.parQui; // quelqu'un d'autre recompte
  try {
    const parQui = await votantsDiscord(o);
    await redis("SET", K.compte(o.id), JSON.stringify({ t: Date.now(), parQui }));
    return parQui;
  } catch (e) {
    if (cache) return cache.parQui;
    throw e;
  } finally {
    if (verrouille) await liberer(K.compte(o.id) + ":verrou");
  }
}

function compter(o, parQuiDiscord, site) {
  const votes = o.options.map(() => 0);
  for (const k of Object.values(parQuiDiscord)) if (votes[k] !== undefined) votes[k]++;
  for (const [uid, k] of Object.entries(site)) if (!(uid in parQuiDiscord) && votes[Number(k)] !== undefined) votes[Number(k)]++;
  const total = votes.reduce((a, b) => a + b, 0);
  return { votes, total };
}

const EMOJI = (k) => EMOJIS[k] || "•";

// Après l'heure de fin : le compte final, gardé, et publié une seule fois sous le sondage.
async function cloturer(o) {
  const deja = await redis("GET", K.resultat(o.id));
  if (deja) return JSON.parse(deja);
  if (!(await verrou(K.resultat(o.id) + ":verrou", 20000))) return null; // un autre appel s'en occupe
  const [parQui, site] = await Promise.all([discordRecent(o, true), redis("HGETALL", K.votes(o.id)).then(objet)]);
  const { votes, total } = compter(o, parQui, site);
  const max = Math.max(...votes);
  const premiers = votes.map((v, k) => (v === max ? k : -1)).filter((k) => k >= 0);
  const r = { votes, total, gagnant: total && premiers.length === 1 ? premiers[0] : null, egalite: total > 0 && premiers.length > 1 ? premiers : null, t: Date.now() };
  await redis("SET", K.resultat(o.id), JSON.stringify(r));
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  const titreRes = r.gagnant !== null ? `L'OFFRANDE EST CHOISIE · ${o.options[r.gagnant].nom.toUpperCase()}` : total ? "ÉGALITÉ · LA RÉGIE TRANCHE" : "AUCUN VOTE";
  await bot(`/channels/${o.salon}/messages`, { method: "POST", body: JSON.stringify({
    allowed_mentions: { parse: [] },
    message_reference: { message_id: o.id, fail_if_not_exists: false },
    embeds: [{
      color: 0xc4a265,
      title: titreRes.slice(0, 256),
      description: o.options.map((x, k) => `${EMOJI(k)} ${CHIFFRES[k]} · ${k === r.gagnant ? `**${x.nom}**` : x.nom} — ${pct(votes[k])} % (${votes[k]})`).join("\n")
        + `\n\n${total} Mécène${total > 1 ? "s" : ""} · votes Discord et site réunis. C'est ce résultat qui compte.`,
      footer: { text: "Osiris · ce qui se décide ici ne doit jamais atteindre les candidats" },
    }],
  }) }).catch(() => {});
  return r;
}

// L'état du vote, pour un visiteur (ou pour l'écran OBS, sans session).
async function etatOffrande(req) {
  const o = await lireCourante();
  const maintenant = Date.now();
  if (!o || maintenant > o.fin + RESULTAT_VISIBLE) return { actif: false, maintenant };
  let qui = { user: null, m: null, acces: "invite" };
  try { qui = await visiteur(req); } catch {}
  const mecene = qui.acces === "mecene";
  // Sans l'option « écran », seuls les Mécènes connectés voient le vote (comme dans la Loge).
  if (!o.ecran && !mecene) return { actif: false, maintenant };
  const ferme = maintenant >= o.fin;
  const site = objet(await redis("HGETALL", K.votes(o.id)));
  let parQui = {}, resultat = null;
  if (ferme) resultat = await cloturer(o);
  if (!resultat) parQui = await discordRecent(o).catch(() => ({}));
  const { votes, total } = resultat ? { votes: resultat.votes, total: resultat.total } : compter(o, parQui, site);
  const d = {
    actif: true, maintenant, id: o.id, titre: o.titre, debut: o.debut, fin: o.fin, ferme, ecran: o.ecran, test: !!o.test, total,
    options: o.options.map((x, k) => ({ nom: x.nom, texte: mecene ? x.texte : "", emoji: EMOJI(k), chiffre: CHIFFRES[k], votes: votes[k], pct: total ? Math.round((votes[k] / total) * 1000) / 10 : 0 })),
    gagnant: resultat ? resultat.gagnant : null, egalite: resultat ? resultat.egalite : null,
    moi: { connecte: !!qui.user, acces: qui.acces },
  };
  if (qui.user && mecene) {
    const uid = String(qui.user.id);
    d.moi.choix = site[uid] !== undefined ? Number(site[uid]) : null;
    d.moi.discord = resultat ? null : (uid in parQui ? parQui[uid] : null);
  }
  return d;
}

export async function offrandeGET(req) {
  if (!baseConfiguree()) return json({ actif: false }, 200, PRIVE);
  try {
    return json(await etatOffrande(req), 200, PRIVE);
  } catch (e) {
    return json({ actif: false, erreur: e.message }, 200, PRIVE);
  }
}

export async function offrandePOST(req) {
  const refus = requeteRefusee(req);
  if (refus) return refus;
  if (!baseConfiguree()) return json({ erreur: "Le vote du site n'est pas branché." }, 503, PRIVE);
  let corps;
  try { corps = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400, PRIVE); }
  try {
    const { user, m, acces } = await visiteur(req);
    if (!user) return json({ erreur: "Connecte-toi avec Discord pour voter." }, 401, PRIVE);
    if (acces !== "mecene") return json({ erreur: "Les Offrandes sont votées par les Mécènes." }, 403, PRIVE);
    const o = await lireCourante();
    if (!o || Date.now() >= o.fin || String(corps.id || o.id) !== o.id) return json({ erreur: "Ce vote est fermé." }, 409, PRIVE);
    const k = Number(corps.choix);
    if (!Number.isInteger(k) || k < 0 || k >= o.options.length) return json({ erreur: "Choix inconnu." }, 400, PRIVE);
    const uid = String(user.id);
    const parQui = await discordRecent(o, true).catch(() => ({}));
    if (uid in parQui) return json({ ok: false, message: `Tu as déjà voté sur Discord (${o.options[parQui[uid]].nom}) : c'est ce vote qui compte.`, etat: await etatOffrande(req) }, 200, PRIVE);
    await lot([["HSET", K.votes(o.id), uid, String(k)], ["HSET", CLES.noms, uid, m.nom]]);
    return json({ ok: true, message: `Vote enregistré : ${o.options[k].nom}.`, etat: await etatOffrande(req) }, 200, PRIVE);
  } catch (e) {
    return json({ erreur: e.message }, 500, PRIVE);
  }
}

// Pour le cron du soir : publie le résultat d'une Offrande finie si personne n'a regardé l'écran.
export async function cloturerSiBesoin() {
  if (!baseConfiguree()) return { rien: "base non branchée" };
  const o = await lireCourante();
  if (!o || Date.now() < o.fin) return { rien: "aucune Offrande à clore" };
  const r = await cloturer(o);
  return { offrande: o.titre, resultat: r ? r.gagnant : "en cours ailleurs" };
}
