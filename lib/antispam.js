// Antispam d'Osiris : des règles AutoMod installées sur le serveur par le bot.
// AutoMod tourne chez Discord, 24 h sur 24 : il bloque le message, prévient le staff et rend muet automatiquement,
// même quand le bot ne fait rien. Après installation, tout reste modifiable dans
// Paramètres du serveur → AutoMod (ajouter des mots, changer une durée, désactiver une règle).
// Pour réinstaller ou mettre à jour : ouvrir /api/antispam?key=<SETUP_KEY>

const BLOCK = (msg) => ({ type: 1, metadata: { custom_message: msg.slice(0, 150) } });
const MUTE = (secondes) => ({ type: 3, metadata: { duration_seconds: secondes } });

export function antispamRules({ alertChannel }) {
  const alert = alertChannel ? [{ type: 2, metadata: { channel_id: alertChannel } }] : [];
  return [
    {
      name: "Osiris · Mentions en masse",
      trigger_type: 5, // trop de mentions dans un message, et alerte en cas de raid de mentions
      trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true },
      actions: [BLOCK("Osiris : trop de mentions dans un seul message. Tu es rendu muet 10 minutes."), ...alert, MUTE(600)],
    },
    {
      name: "Osiris · Liens d'invitation",
      trigger_type: 1,
      trigger_metadata: { regex_patterns: ["(?i)(discord(app)?\\.(gg|com/invite|me)|dsc\\.gg|invite\\.gg)/[a-z0-9-]+"] },
      actions: [BLOCK("Osiris : la publicité pour d'autres serveurs est interdite. Tu es rendu muet 10 minutes."), ...alert, MUTE(600)],
    },
    {
      name: "Osiris · Arnaques",
      trigger_type: 1,
      trigger_metadata: {
        keyword_filter: [
          "free nitro", "nitro free", "nitro gratuit", "nitro offert", "free discord nitro",
          "steam gift", "*dlscord*", "*discorcl*", "*dlsc0rd*", "*steamcommunlty*", "*stearncommunity*", "*steamcomunity*",
        ],
      },
      actions: [BLOCK("Osiris : message bloqué (lien ou offre suspecte). Le staff est prévenu."), ...alert, MUTE(3600)],
    },
    {
      name: "Osiris · Spam détecté",
      trigger_type: 3, // détection de spam de Discord (pas de mute automatique possible sur ce type)
      actions: [BLOCK("Osiris : ce message ressemble à du spam, il est bloqué."), ...alert],
    },
    {
      name: "Osiris · Insultes graves",
      trigger_type: 4, // liste de Discord : insultes racistes, homophobes, etc.
      trigger_metadata: { presets: [3] },
      actions: [BLOCK("Osiris : ce message contient une insulte interdite sur le serveur."), ...alert],
    },
  ];
}

// Un seul de ces types est autorisé par serveur : on met à jour celui qui existe déjà.
export const UNIQUE_TYPES = [3, 4, 5];
