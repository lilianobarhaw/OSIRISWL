// Le vote du jour : une question par soir, ouverte à 21 h (heure de Paris) et close le lendemain à 21 h.
// Réservé aux Mécènes (rôle Discord). Le résultat est annoncé dans la Loge le lendemain soir.
// Le premier vote s'ouvre le soir d'Halloween : avant la première question, le bloc reste caché sur l'accueil.
//
// Pour ajouter une question : copier un bloc, changer la date (AAAA-MM-JJ), la question, les choix (2 à 4),
// « usage » (ce que le résultat changera vraiment) et « quand » (le moment où ça se verra : affiché dans le registre
// des décisions et dans le « À faire » du staff). Un jour sans question = pas de vote ce soir-là.
// Ne jamais promettre un usage qu'on ne tiendra pas : c'est tout l'intérêt du vote.

export const QUESTIONS = [
  {
    jour: "2026-10-31",
    question: "Le premier soir du Programme 01, quel temps tombe sur Ludendorff ?",
    options: ["Une neige calme, sans un bruit", "Un blizzard qui coupe la ville du monde", "Un brouillard qui avale les lampadaires"],
    usage: "La régie appliquera ce temps le 3 avril au soir.",
    quand: "le 3 avril au soir",
  },
  {
    jour: "2026-11-01",
    question: "Qu'est-ce que la neige rend en premier ?",
    options: ["Une lampe de mineur, encore allumée", "Une poupée de chiffon", "Une alliance gravée"],
    usage: "L'objet sera posé quelque part dans Ludendorff, le premier soir.",
    quand: "le 3 avril",
  },
  {
    jour: "2026-11-02",
    question: "Que joue le juke-box du diner quand les candidats arrivent ?",
    options: ["Un vieux slow", "Du rock'n'roll des années 50", "Rien : il grésille sur un air que personne ne reconnaît"],
    usage: "Ce sera l'ambiance du diner, le premier soir.",
    quand: "le 3 avril",
  },
  {
    jour: "2026-11-03",
    question: "Quel bruit les candidats entendent-ils au loin, la première nuit ?",
    options: ["Une cloche", "Le sifflet d'un train, alors que la gare est fermée", "Des chiens qui hurlent tous en même temps"],
    usage: "La régie jouera ce son pendant la première soirée.",
    quand: "le 3 avril",
  },
  {
    jour: "2026-11-04",
    question: "Sur quel plan s'ouvre la cinématique du 20 février ?",
    options: ["Un mur d'écrans de surveillance", "Une route enneigée, de nuit", "Le visage de Cassius Vale, dans l'ombre"],
    usage: "Ce sera le premier plan de la cinématique d'ouverture du casting.",
    quand: "le 20 février",
  },
  {
    jour: "2026-11-05",
    question: "Quel objet trône sur le bureau de Cassius Vale ?",
    options: ["Un sablier", "Un échiquier, en pleine partie", "Une boîte à musique"],
    usage: "Il apparaîtra dans une prochaine cinématique.",
    quand: "dans une prochaine cinématique",
  },
  {
    jour: "2026-11-06",
    question: "Combien de lampadaires restent allumés sur Main Street, le premier soir ?",
    options: ["Tous", "Un sur deux", "Un seul, au bout de la rue"],
    usage: "La régie réglera l'éclairage de Main Street ainsi.",
    quand: "le 3 avril",
  },
];
