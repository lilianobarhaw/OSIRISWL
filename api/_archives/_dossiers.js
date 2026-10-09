// Les Archives d'Osiris : la liste des enquêtes (une tous les 15 jours, le samedi à 21 h, heure de Paris).
// Ce dossier commence par « _ » : Vercel n'en fait pas une page, et vercel.json bloque son accès direct.
// Le dépôt GitHub doit rester PRIVÉ : les pièces des enquêtes sont dans pieces/.
//
// Pour écrire une enquête : remplir intro, pieces, mot de passe (reponses), fin et recompense (un fragment du lore,
// une image dans pieces/, que seuls ceux qui ont résolu le dossier peuvent voir).
//   - pieces : chaque pièce a une référence (ref). visible: true = affichée tout de suite ;
//     visible: false = cachée, il faut trouver sa référence dans une autre pièce et la taper dans « Consulter une référence ».
//   - reponses : empreintes des mots de passe acceptés (jamais le mot en clair). Pour en calculer une :
//       node -e "const c=require('crypto');const n=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');console.log(c.createHash('sha256').update('osiris-archives:'+n(process.argv[1])).digest('hex'))" "LE MOT"
//     Majuscules, accents, espaces et tirets ne comptent pas.
// Une enquête sans contenu reste « en préparation » même après sa date.

export const DOSSIERS = [
  {
    num: "01",
    titre: "La bande de la CAM 12",
    ouverture: "2026-10-31T21:00:00+01:00",
    intro: [
      "Nuit du jeudi 29 au vendredi 30 octobre. La caméra de la laverie a filmé le sujet 0217 entrer à 23 h 40.",
      "Puis trente-deux minutes de bande ont été effacées. Quelqu'un, chez Osiris, ne voulait pas qu'on voie la suite.",
      "Deux pièces ont fuité. D'autres dorment encore dans les archives : si vous trouvez leur référence, consultez-les.",
    ],
    pieces: [
      { ref: "REG-2930", titre: "Registre de surveillance, nuit du 29 au 30", fichier: "01-registre.jpg", visible: true },
      { ref: "PAP-0004", titre: "Papier retrouvé dans un tambour", fichier: "01-papier.jpg", visible: true },
      { ref: "PIE-0412", titre: "Objet laissé sur le comptoir", fichier: "01-ticket.jpg", visible: false },
    ],
    reponses: ["9ce8b8ca1413d50149cca8d33d99f9b0f2c77411654d2e7c3fe166e7bf476070"],
    fin: "Dossier refermé. Cette nuit-là, la machine n° 4 a tourné pour rien… ou pour couvrir quelque chose. Osiris a noté votre nom.",
    // La récompense : un fragment du lore d'Osiris, visible seulement par ceux qui ont résolu le dossier.
    recompense: { titre: "Fragment 01 · Ordre d'effacement", fichier: "01-fragment.jpg", texte: "Ce document n'aurait jamais dû sortir des archives d'Osiris." },
  },
  { num: "02", ouverture: "2026-11-14T21:00:00+01:00" },
  { num: "03", ouverture: "2026-11-28T21:00:00+01:00" },
  { num: "04", ouverture: "2026-12-12T21:00:00+01:00" },
  { num: "05", ouverture: "2026-12-26T21:00:00+01:00" },
  { num: "06", ouverture: "2027-01-09T21:00:00+01:00" },
  { num: "07", ouverture: "2027-01-23T21:00:00+01:00" },
  { num: "08", ouverture: "2027-02-06T21:00:00+01:00" },
];
