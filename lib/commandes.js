// Les commandes slash du bot Osiris, et les messages de résultat du casting.
// Après toute modification de cette liste, ouvrir une fois /api/commands?key=<SETUP_KEY> pour la renvoyer à Discord.
// Toutes les commandes sont réservées aux fondateurs et aux admins :
//   - Discord ne les montre qu'aux membres qui ont la permission Administrateur
//     (pour un rôle sans cette permission : Paramètres du serveur → Intégrations → Osiris → autoriser le rôle) ;
//   - le bot vérifie en plus le rôle Fondateur ou Admin (DISCORD_FONDATEUR_ROLE_ID, DISCORD_ADMIN_ROLE_ID).

import { MOD_COMMANDS } from "./moderation.js";

const DIRECTION = "8";

const BASE = [
  {
    name: "annonce",
    description: "Publier une annonce d'Osiris dans ce salon",
    options: [{ type: 5, name: "ping", description: "Mentionner @everyone", required: false }],
  },
  {
    name: "aide-panneau",
    description: "Publier le bouton « Créer un ticket » dans ce salon",
  },
  {
    name: "fermer",
    description: "Fermer ce ticket (aide ou candidature)",
  },
  {
    name: "casting",
    description: "Donner le résultat du casting dans ce ticket de candidature",
    options: [{
      type: 3, name: "resultat", description: "Le résultat", required: true,
      choices: [
        { name: "Retenu", value: "retenu" },
        { name: "Liste d'attente", value: "attente" },
        { name: "Non retenu", value: "refuse" },
      ],
    }],
  },
];

export const COMMANDS = [...BASE.map((c) => ({ ...c, default_member_permissions: DIRECTION })), ...MOD_COMMANDS];

// Textes postés dans le ticket du candidat. {numero} est remplacé par son numéro de candidat.
export const CASTING = {
  retenu: {
    title: "Candidat n° {numero} · Osiris vous a choisi",
    text: "Vous ferez partie du Programme 01.\n\nVotre rôle, votre fiche et la Gazette d'ouverture vous seront remis ici avant le 26 mars. D'ici là, gardez votre sélection pour vous jusqu'à l'annonce officielle.\n\nRendez-vous le samedi 3 avril, 20h30.",
    role: "DISCORD_CANDIDAT_ROLE_ID",
  },
  attente: {
    title: "Candidat n° {numero} · Liste d'attente",
    text: "Votre dossier a retenu l'attention d'Osiris. Vous êtes sur la liste d'attente du Programme 01 : si une place se libère avant le 27 mars, nous viendrons vous chercher.\n\nEn attendant, votre place est parmi les Mécènes.",
    role: "DISCORD_REMPLACANT_ROLE_ID",
  },
  refuse: {
    title: "Candidat n° {numero} · Programme 01",
    text: "Osiris ne vous a pas retenu pour le Programme 01.\n\nCe n'est pas une fin : votre place est de l'autre côté de l'écran. Les Mécènes votent les Offrandes, suivent les candidats et décident de ce qui leur arrive. Et ils ont la priorité au casting du Programme suivant.\n\n*Les candidats vivent le Programme. Les Mécènes l'écrivent.*",
    role: "DISCORD_MECENE_ROLE_ID",
  },
};
