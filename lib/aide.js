// Tickets d'aide : les catégories proposées dans le menu, et le message du salon d'aide.
// Pour ajouter ou modifier une catégorie, il suffit de changer cette liste (25 au maximum).
//   key    : identifiant court (lettres minuscules), utilisé dans le nom du salon
//   admin  : true = ticket visible uniquement par le rôle Admin (et pas par tout le staff)

export const CATEGORIES = [
  { key: "casting", label: "Casting et candidature", emoji: "🎬", description: "Ta candidature, la WL, les rôles, les dates, la liste d'attente" },
  { key: "jeu", label: "Problème en jeu", emoji: "🎮", description: "Bug, crash, connexion, objet perdu, personnage bloqué" },
  { key: "joueur", label: "Problème avec un joueur", emoji: "⚠️", description: "Hors RP, métagaming, règlement non respecté, harcèlement" },
  { key: "staff", label: "Problème avec le staff", emoji: "🛡️", description: "Traité uniquement par la direction", admin: true },
  { key: "discord", label: "Discord ou site", emoji: "💻", description: "Rôle manquant, salon inaccessible, connexion au site" },
  { key: "mecenes", label: "Mécènes et votes", emoji: "👁️", description: "Vote non compté, Offrandes, rangs de Mécène" },
  { key: "autre", label: "Autre", emoji: "✉️", description: "Partenariat, stream, suggestion, autre demande" },
];

export const PANEL_TEXT = [
  "Une question, un problème, un souci avec quelqu'un ? Clique sur **Créer un ticket**, choisis la catégorie, et explique ton problème. Un salon privé s'ouvre entre toi et le staff.",
  "",
  CATEGORIES.map((c) => `${c.emoji} **${c.label}** · ${c.description}`).join("\n"),
  "",
  "**Pour être aidé plus vite :** ajoute une capture d'écran si possible, et pour un problème en jeu, indique le jour, l'heure et le nom de ton personnage.",
  "",
  "Pendant les soirées de Programme (mercredi, vendredi, samedi, de 20h30 à 1h), le staff est à la régie : la réponse peut attendre le lendemain, sauf urgence. Aucune information sur les secrets du Programme n'est donnée en ticket.",
].join("\n");

// Le message « Besoin d'aide ? » avec le bouton (utilisé par /api/commands?channel=… et la commande /aide-panneau).
export function panelMessage() {
  return {
    embeds: [{ title: "BESOIN D'AIDE ?", description: PANEL_TEXT, color: 0xc4a265, footer: { text: "Osiris vous écoute. Même quand vous ne parlez pas." } }],
    components: [{ type: 1, components: [{ type: 2, style: 1, label: "Créer un ticket", emoji: { name: "📩" }, custom_id: "aide_ouvrir" }] }],
  };
}
