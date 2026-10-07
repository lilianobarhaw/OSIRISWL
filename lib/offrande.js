// /offrande : une carte Osiris (bannière, description de chaque Offrande, heure de fin) puis le sondage Discord juste
// en dessous, dans #offrandes. Le vote reste un sondage Discord : il compte pour les rangs des Mécènes.

import { bot, optEnv } from "./discord.js";

const EMOJIS = ["❄️", "🕯️", "🗝️"];
// Rôles notifiés à chaque Offrande (pas pour un test) : tous les rangs de Mécène et le staff.
const A_NOTIFIER = ["DISCORD_GRAND_MECENE_ROLE_ID", "DISCORD_MECENE_OR_ROLE_ID", "DISCORD_MECENE_ARGENT_ROLE_ID", "DISCORD_MECENE_ROLE_ID", "DISCORD_STAFF_ROLE_ID"];
const CHIFFRES = ["I", "II", "III"];

// La fenêtre qui s'ouvre quand on tape /offrande (5 champs au maximum).
export function offrandeModal(salonTest) {
  const champ = (custom_id, label, style, required, max_length, placeholder, value) => ({
    type: 1, components: [{ type: 4, custom_id, label, style, required, max_length, ...(placeholder ? { placeholder } : {}), ...(value ? { value } : {}) }],
  });
  return {
    type: 9,
    data: {
      custom_id: "offrande_envoi" + (salonTest ? ":" + salonTest : ""),
      title: "Nouvelle Offrande",
      components: [
        champ("titre", "Titre du vote", 1, true, 100, "Offrande de 22h", "Offrande de 22h"),
        champ("duree", "Durée du vote, en heures", 1, true, 3, "1", "1"),
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
export async function publierOffrande(i, salonTest) {
  const titre = lire(i, "titre").slice(0, 100) || "Offrande";
  const heures = Math.round(Number(lire(i, "duree").replace(",", ".")));
  if (!(heures >= 1 && heures <= 168)) return { erreur: "La durée doit être un nombre d'heures entre 1 et 168 (une semaine)." };
  const offrandes = ["o1", "o2", "o3"].map((k) => lire(i, k)).filter(Boolean).map((t) => {
    const [nom, ...reste] = t.split("\n");
    return { nom: nom.trim().slice(0, 55), texte: reste.join("\n").trim().slice(0, 1000) };
  });
  if (offrandes.length < 2) return { erreur: "Il faut au moins deux Offrandes." };

  const officiel = optEnv("DISCORD_OFFRANDES_CHANNEL_ID");
  const salon = (/^\d{5,25}$/.test(salonTest || "") && salonTest) || officiel || i.channel_id;
  const test = salon !== officiel;
  const site = optEnv("SITE_URL").replace(/\/$/, "");
  const fin = Math.floor(Date.now() / 1000) + heures * 3600;
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
        description: `Les candidats ne savent rien. Vous, si.\nLe vote se ferme à **<t:${fin}:t>** (<t:${fin}:R>). Un seul choix par Mécène.`,
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
  return { ok: true, salon, test, notifies: roles.length, titre, heures, offrandes: offrandes.map((o) => o.nom) };
}
