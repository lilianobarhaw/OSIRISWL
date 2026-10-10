// Le mot du jour : un mot par soir, dans l'ordre, à partir du n° 1 (le soir d'Halloween, 31 octobre 2026 à 21 h).
// 318 mots : la liste tient jusqu'au 13 septembre 2027. Ensuite elle recommence au début : ajouter des mots à la fin.
// Règles : 5 lettres, des mots connus de tous (pas de pluriel ni de verbe conjugué), et rien qui dévoile un secret du Programme.
// Les accents sont permis (« forêt ») : on joue sans, et le mot s'affiche avec à la fin.
// Ne pas changer l'ordre des mots déjà passés : le registre et les partages y font référence par leur numéro.
// Ce fichier n'est jamais servi aux visiteurs (redirection dans vercel.json) : le mot reste sur le serveur.

export const MOTS = [
  "ombre", "neige", "givre", "radio", "lueur", "filon", "lampe", "halte", "danse", "câble", "seuil", "porte",
  "métal", "pouce", "livre", "verre", "nuage", "lutte", "roman", "wagon", "tribu", "pluie", "doigt", "monde",
  "mètre", "drôle", "brave", "vague", "étang", "sable", "selle", "fille", "pince", "phare", "masse", "honte",
  "pente", "décor", "singe", "pause", "odeur", "torse", "fonte", "loupe", "arène", "doute", "grâce", "boîte",
  "océan", "envie", "passe", "alibi", "chaud", "table", "toile", "boule", "cargo", "venin", "grain", "dîner",
  "franc", "baril", "rampe", "canne", "hiver", "rouge", "pompe", "merle", "tarif", "hache", "opéra", "vigne",
  "étude", "effet", "thème", "homme", "flash", "vache", "roche", "badge", "arbre", "sabre", "rival", "canot",
  "guide", "train", "nuque", "sujet", "tapis", "melon", "ferme", "idéal", "totem", "piège", "siège", "bâton",
  "pivot", "forme", "linge", "enfer", "mèche", "conte", "trace", "sauce", "usine", "quête", "poème", "école",
  "avion", "paire", "bière", "piano", "titre", "veuve", "prose", "douce", "peine", "frite", "lèvre", "veste",
  "poche", "savon", "voile", "berge", "brise", "tente", "sapin", "plaie", "jaune", "barbe", "taupe", "saule",
  "point", "fleur", "lourd", "angle", "reste", "stade", "asile", "perle", "farce", "plage", "champ", "acier",
  "herbe", "poule", "zèbre", "hibou", "clair", "crêpe", "scène", "essai", "fusée", "sorte", "pêche", "image",
  "micro", "délai", "glace", "poire", "laine", "épave", "bidon", "cadre", "reine", "atlas", "bible", "puits",
  "riche", "tarte", "rayon", "match", "étage", "forge", "crâne", "année", "temps", "autel", "étape", "tasse",
  "colle", "coton", "aigre", "ruine", "cycle", "canal", "niche", "drame", "hôtel", "cible", "tâche", "blanc",
  "bande", "flûte", "fibre", "début", "pomme", "pitié", "malle", "jambe", "larme", "tuile", "orgue", "foule",
  "chant", "verbe", "arche", "lasso", "marin", "volet", "proie", "ligne", "lance", "route", "piste", "stylo",
  "tiède", "fruit", "bocal", "texte", "soupe", "élève", "olive", "nappe", "voyou", "maire", "salon", "pièce",
  "tronc", "gamin", "crème", "motif", "plein", "trait", "brume", "tuyau", "ongle", "vidéo", "globe", "plomb",
  "quart", "neveu", "talon", "geste", "fable", "léger", "frère", "magie", "chute", "chien", "poids", "prime",
  "suite", "pelle", "sourd", "forêt", "foire", "orage", "ville", "sirop", "cours", "coude", "balle", "panne",
  "marge", "ordre", "patte", "garde", "vitre", "désir", "store", "botte", "signe", "écran", "somme", "jouet",
  "jeton", "vieux", "offre", "trêve", "heure", "femme", "huile", "chose", "oncle", "place", "songe", "jeune",
  "sucre", "poste", "ronde", "nœud", "genou", "tigre", "poing", "noble", "coupe", "froid", "sueur", "gorge",
  "corde", "valse", "logis", "carte", "salle", "folie", "force", "index", "règle", "motel", "terre", "prise",
  "libre", "calme", "faune", "sonde", "photo", "ruche",
];

// Mots d'entraînement : pour les comptes de CASTING_TESTEURS avant l'ouverture (rien n'est noté).
export const ENTRAINEMENT = ["melba", "gland", "cidre", "caban", "pagne", "lilas", "radar", "sauna", "tango", "rugby", "fjord", "quota", "yacht", "kayak", "jeans", "tulle", "nylon"];
