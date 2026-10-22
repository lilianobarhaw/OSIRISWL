# Site Osiris — notes pour le dev (Vercel)

Site du serveur GTA RP Osiris. Page d'accueil qui présente Osiris (animation d'ouverture « OSIRIS RP » avec le logo de l'artiste, l'émission, les Programmes, les Mécènes, les cinématiques, le calendrier), et une page casting séparée : compte à rebours du Programme 01, jeu de piste (terminal « Accès candidat ») et casting. Pour candidater, le joueur se connecte avec Discord ; sa candidature ouvre un ticket privé sur le serveur Osiris.

## Fichiers

- `index.html` : la page d'accueil (HTML, CSS et JS dans un seul fichier). En haut du script, deux réglages à remplir :
  - `LIENS` : les liens Discord, Twitch et TikTok (un lien vide cache le bouton) ;
  - `FILMS` : les cinématiques ; coller l'identifiant YouTube de chaque vidéo quand elle est en ligne. Une cinématique reste verrouillée jusqu'à sa date de diffusion ;
  - `ECRANS` : les chaînes Twitch des streamers (voir « Les écrans »).
- `api/ecrans.js` : dit quelles chaînes sont en direct sur Twitch (voir « Les écrans »).
- `casting.html` : la page de candidature (compte à rebours, dossier, connexion Discord, terminal « Accès candidat »), à l'adresse `/casting`.
- `vercel.json` : `cleanUrls` pour que `/casting` ouvre `casting.html`.
- `video/osiris-rp.mp4` : le générique (animation de l'Œil), lu dans la salle de projection.
- `archives.html` (adresse `/archives`) + `api/archives.js` + `api/_archives/` : les Archives d'Osiris, une enquête tous les 15 jours (voir « Archives »).
- `convocation.html` (adresse `/convocation#…`) : la convocation personnelle d'un élu. L'enveloppe à son nom, l'œil qui s'ouvre, la lettre de Cassius Vale (avec un P.-S. facultatif), le compte à rebours du casting, et un bouton pour enregistrer sa convocation en image (format story). Le prénom, le numéro et le P.-S. sont écrits dans le lien, après le `#` : cette partie n'est jamais envoyée au serveur, rien n'est enregistré. Les liens se créent avec le générateur privé « Convocations Osiris ». Aperçu Discord : `img/convocation.png`. Page non référencée par les moteurs de recherche.
- `mot.html` (adresse `/mot`) + `lib/mot.js` + `api/_mot/` : le mot du jour, un jeu avec classement (voir « Le mot du jour »).
- `legal.html` (adresse `/legal`) : mentions légales, mention de fiction, données personnelles (RGPD), cookies, conditions d'utilisation, crédits. Liée en bas de toutes les pages et sous le formulaire de candidature. Mettre à jour la date en haut de la page à chaque changement.
- `fonts/` : les polices du site (Marcellus, IBM Plex Mono, Source Serif 4), hébergées sur le site pour ne rien envoyer à Google. Licences OFL dans le dossier.
- `son.js` + `audio/ambiance.mp3` : l'ambiance sonore (composition originale, libre de droits, boucle de 96 s). Elle démarre au premier clic du visiteur (les navigateurs interdisent le son automatique), à volume bas, avec un bouton « Ambiance » en bas à gauche pour la couper ; le choix est retenu. Pour changer de musique : remplacer `audio/ambiance.mp3` et mettre sa durée dans `BOUCLE` (son.js). Volume : `VOLUME` dans son.js.
- `img/` : le logo d'Osiris (dessin de l'artiste, non retouché) : `oeil.webp` / `oeil.png` pour la page, `favicon.png` et `apple-touch-icon.png` pour l'onglet et les téléphones, `og.png` pour l'aperçu des liens sur Discord et les réseaux. Si l'adresse du site change, modifier aussi la ligne `og:image` dans `index.html`.
- `lib/discord.js` : sessions signées (cookie HttpOnly), cookies, appels à l'API Discord.
- `api/auth/login.js` : redirige vers Discord (scopes `identify guilds.join`).
- `api/auth/callback.js` : récupère le compte, ajoute le joueur au serveur Osiris, ouvre la session (6 h).
- `api/auth/logout.js` : ferme la session.
- `api/casting.js` : dit à la page casting si le formulaire est ouvert et si le joueur est connecté (l'ancien `api/me.js` y est fusionné : l'offre Hobby de Vercel limite un site à 12 fonctions dans `api/`).
- `api/candidature.js` : `GET` = diagnostic des variables ; `POST` = crée le ticket.
- `api/interactions.js` : tickets d'aide (bouton, menu des catégories, fenêtre, salon privé, fermeture).
- `lib/aide.js` : la liste des catégories d'aide et le texte du panneau (à modifier ici).
- `lib/commandes.js` : les commandes slash et les textes de résultat du casting.
- `api/commands.js` : envoie la liste des commandes slash à Discord ; avec `&channel=…`, publie le message « Créer un ticket » dans le salon d'aide (l'ancienne adresse `/api/panel` renvoie ici).
- `filtre.js` : le bouton « Filtre » des testeurs (voir le site comme le public, puis revenir).
- `middleware.js` + `bientot.html` : avant l'ouverture officielle du projet, le public ne voit que le décompte (voir « Avant l'ouverture officielle »).
- `lib/decompte.js` : le décompte sur Discord (salon renommé chaque jour, commande `/decompte`).
- `lib/moderation.js` : les commandes de modération et les paliers de sanctions automatiques (à modifier ici).
- `lib/logs.js` : le journal des commandes (qui, quoi, où, quand).
- `lib/canal17.js` : la récompense du jeu de piste (commandes `/canal17` et `/canal17-voix`, voir « Canal 17 »).
- `lib/antispam.js` et `api/antispam.js` : les règles antispam (AutoMod de Discord) et leur installation.
- `lib/cote.js` + `lib/redis.js` + `bandeau.html` (adresse `/bandeau`) : la Cote et la Bourse d'Osiris (voir « La Cote et la Bourse »).
- `lib/selection.js` + `selection.html` (adresse `/selection`) : la cérémonie de la Sélection et l'introduction en Bourse (voir « La Sélection »).
- `cote.html` (adresse `/cote`) : l'onglet La Cote du site, la Bourse avec le même portefeuille que sur Discord (voir « La Bourse sur le site »).
- `salle.html` (adresse `/salle`) : la Salle de contrôle, tous les directs en mosaïque (voir « La Salle de contrôle »).
- `offrande.html` (adresse `/offrande`) : le vote des Offrandes en direct, pour OBS (voir « Les Offrandes à l'écran »).
- `lib/colis.js` : les colis payés en crédits par les Mécènes (voir « Les colis »).
- `package.json` : `"type": "module"`.

## Parcours du candidat

1. Il clique sur « Se connecter avec Discord » et accepte.
2. Il revient sur la page `/casting`, connecté, et il est ajouté au serveur Osiris s'il n'y était pas.
3. Il remplit le dossier et le soumet.
4. Un salon `candidature-<numéro>-<pseudo>` est créé dans la catégorie des tickets, visible seulement par lui, le staff et le bot. Le dossier y est posté, avec une mention du candidat et du rôle staff.
5. Il reçoit le rôle « Postulant » si la variable `DISCORD_POSTULANT_ROLE_ID` est configurée, et perd le rôle « Aspirant » si `DISCORD_ASPIRANT_ROLE_ID` est configurée. Le bot doit avoir la permission « Gérer les rôles », et son rôle doit être placé au-dessus de Postulant et d'Aspirant.
6. Un seul ticket par candidat : s'il en a déjà un, le site lui donne le lien vers celui-ci.

## Préparer Discord

1. Sur https://discord.com/developers/applications : **New Application** (« Osiris »).
2. Onglet **OAuth2** : copier le **Client ID** et le **Client Secret** ; ajouter la redirection `https://<ton-domaine>/api/auth/callback` (exactement l'adresse du site).
3. Onglet **Bot** : créer le bot, copier son **token**.
4. Inviter le bot sur le serveur Osiris avec les permissions : Voir les salons, Gérer les salons, Envoyer des messages, Intégrer des liens, Voir l'historique, Créer une invitation (nécessaire pour ajouter les candidats au serveur).
5. Sur le serveur : créer une catégorie « Candidatures » et un rôle « Staff ». Activer le mode développeur de Discord, puis clic droit → Copier l'identifiant sur le serveur, la catégorie et le rôle.
6. Le rôle du bot doit être placé au-dessus du rôle des candidats dans la liste des rôles.

## Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Valeur |
| --- | --- |
| `DISCORD_CLIENT_ID` | Client ID de l'application |
| `DISCORD_CLIENT_SECRET` | Client Secret de l'application |
| `DISCORD_BOT_TOKEN` | Token du bot |
| `DISCORD_GUILD_ID` | Identifiant du serveur Osiris |
| `DISCORD_TICKET_CATEGORY_ID` | Identifiant de la catégorie des tickets |
| `DISCORD_STAFF_ROLE_ID` | Identifiant du rôle staff |
| `SESSION_SECRET` | Une longue phrase aléatoire (32 caractères ou plus) |
| `SITE_URL` | Adresse du site sans `/` final, ex. `https://osiriswl.vercel.app` |
| `DISCORD_PUBLIC_KEY` | Public Key de l'application (onglet General Information), pour les tickets d'aide |
| `DISCORD_ADMIN_ROLE_ID` | Identifiant du rôle Admin : seuls les admins voient les tickets « Problème avec le staff » |
| `DISCORD_HELP_CATEGORY_ID` | Facultatif. Catégorie Discord des tickets d'aide (sinon, celle des candidatures) |
| `SETUP_KEY` | Un mot de passe de ton choix, pour publier le panneau d'aide |
| `DISCORD_CANDIDAT_ROLE_ID` | Facultatif. Rôle « Candidat », donné par `/casting resultat:Retenu` |
| `DISCORD_REMPLACANT_ROLE_ID` | Facultatif. Rôle « Remplaçant », donné par `/casting resultat:Liste d'attente` |
| `DISCORD_MECENE_ROLE_ID` | Facultatif. Rôle « Mécène », donné par `/casting resultat:Non retenu` |
| `DISCORD_POSTULANT_ROLE_ID` | Facultatif. Identifiant du rôle « Postulant », donné automatiquement à chaque candidat qui envoie un dossier |
| `DISCORD_ASPIRANT_ROLE_ID` | Facultatif. Identifiant du rôle « Aspirant » (pris dans le processus d'accueil du Discord) : retiré automatiquement quand le candidat envoie son dossier, et par `/casting` |
| `DISCORD_FONDATEUR_ROLE_ID` | Identifiant du rôle Fondateur : avec le rôle Admin, le seul autorisé à utiliser les commandes du bot |
| `DISCORD_LOGS_CHANNEL_ID` | Identifiant du salon privé `#logs-commandes` : qui a utilisé quelle commande du bot, tickets ouverts et fermés, annonces |
| `DISCORD_CANAL17_ROLE_ID` | Facultatif. Rôle « Canal 17 », donné par `/canal17` à ceux qui ont trouvé le code du jeu de piste |
| `DISCORD_CANAL17_CHANNEL_ID` | Facultatif. Salon caché `#canal-17`, visible seulement par le rôle Canal 17 (et le bot) |
| `DISCORD_SANCTIONS_CHANNEL_ID` | Identifiant du salon privé des sanctions : historique, compteur d'avertissements et alertes de l'antispam |
| `DISCORD_DECOMPTE_SALON_ID` | Facultatif. Le salon vocal du décompte, renommé chaque jour jusqu'à l'ouverture (« ⏳ Ouverture du projet · J-21 ») |
| `DISCORD_MOT_REGISTRE_ID` | Mot du jour : salon **privé** `#registre-mots`, où le bot note chaque partie (obligatoire pour jouer) |
| `DISCORD_MOT_ANNONCE_ID` | Facultatif. Mot du jour : salon où le bot donne chaque soir le mot de la veille, et le lundi le podium de la semaine |
| `DISCORD_MOT_ROLE_ID` | Facultatif. Rôle donné au premier de la semaine (et retiré au premier de la semaine d'avant) |
| `MOT_PREMIER_JOUR` | Facultatif. Pour déplacer le premier mot, au format `2026-12-26` (il s'ouvre ce jour-là à 21 h) |
| `DISCORD_COTE_CHANNEL_ID` | La Cote et la Bourse : le salon `#la-cote` de la Loge |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | La Cote et la Bourse : ajoutées toutes seules par Vercel quand on branche la base Upstash (Storage) |
| `COTE_PROGRAMME` | Facultatif. Le numéro du Programme de la Cote (`01` par défaut) |
| `DISCORD_SELECTION_CHANNEL_ID` | La Sélection : le salon public `#la-sélection` |
| `DISCORD_COLIS_CHANNEL_ID` | Les colis : un salon **staff** de la régie, qui reçoit « Colis prêt » avec les boutons Livré et Annuler |

Redéployer après chaque modification des variables. Vérification : ouvrir `https://<ton-domaine>/api/candidature` → doit afficher « toutes les variables sont configurées ».

L'ancienne variable `DISCORD_WEBHOOK` n'est plus utilisée.

## Avant l'ouverture officielle (samedi 26 décembre 2026, 21 h)

Le samedi 26 décembre à 21 h, c'est l'ouverture officielle du projet : le Discord, le site et la première cinématique (le teaser).

**Le site.** Jusque-là, le public ne voit que le décompte (`bientot.html`), quelle que soit la page demandée. C'est `middleware.js` qui s'en charge, côté serveur : le reste du site n'est pas envoyé, même en fouillant le code de la page.
1. Les comptes de `CASTING_TESTEURS` voient tout le site. Pour se connecter : le lien « Équipe » en bas du décompte (ou `/api/auth/login?retour=accueil`). La connexion dure 6 heures.
   Le bouton « Filtre », en bas à droite, n'apparaît que pour les testeurs : un appui montre le site comme le voit le public (le décompte), un autre ramène au mode testeur (`filtre.js`, cookie `osiris_vue`). Pour un visiteur qui n'est pas testeur, il n'existe pas.
2. Restent ouverts à tous : les mentions légales (`/legal`, obligatoires), les images, les polices, les sons, et les adresses `/api/…`.
3. À 21 h pile (heure du serveur), le décompte affiche « C'est l'heure. » et recharge la page : le site apparaît. Le canal 17 n'a pas d'avance sur l'ouverture officielle (ni sur le décompte de l'accueil, ni sur le teaser) : il la retrouve pour le casting et les étapes suivantes.
4. Sur l'accueil, un grand décompte (quatre cases) remplace la ligne « prochaine étape » : l'ouverture officielle, puis « C'est officiel. » pendant 24 h, puis tout seul l'ouverture du casting (20 février, 23 h 30), la fin du casting (20 mars), l'annonce des 35 (24 avril, 21 h) et l'ouverture du Programme 01 (samedi 15 mai, 20 h 30). Pendant le Programme, la petite ligne reprend. Les étapes sont dans `GRAND` (`index.html`).
5. Après l'ouverture, `middleware.js` ne fait plus rien (on peut le supprimer). Pour changer la date : `OUVERTURE` dans `middleware.js`, `bientot.html`, `index.html` et `lib/decompte.js`.

**La cinématique.** Le teaser est dans `FILMS` (`index.html`), verrouillé jusqu'à 21 h. Coller son identifiant YouTube dans `youtube`, et programmer la vidéo sur YouTube pour 21 h : avant cette heure, même avec l'identifiant dans la page, personne ne peut la regarder. Le titre « On vous regarde » est provisoire.

**Discord.**
1. Créer un salon **vocal** en haut du serveur (personne ne peut s'y connecter : @everyone sans « Se connecter »). Le bot doit avoir « Gérer les salons » dessus.
2. Sur Vercel : `DISCORD_DECOMPTE_SALON_ID` (l'identifiant de ce salon), puis redéployer. Renvoyer les commandes : `/api/commands?key=<SETUP_KEY>`.
3. Taper `/decompte` dans le salon de l'annonce (option `ping` pour @everyone). Le bot publie l'annonce, avec un compte à rebours que Discord met à jour tout seul (« dans 21 jours », puis « dans 3 heures »…), et renomme tout de suite le salon : « ⏳ Ouverture du projet · J-21 ».
4. Ensuite, le bot renomme le salon chaque nuit (J-20, J-19…, puis « ce soir 21 h » le jour même), et vers 21 h le 31 : « 👁 Osiris est ouvert » pendant 24 h. Puis il enchaîne tout seul : « ⏳ Casting · J-111 »…, « 📂 Casting ouvert · J-22 »…, « ⏳ Les 35 candidats · J-12 »…, « ⏳ Programme 01 · J-7 »…, et « 🔴 Programme 01 en cours » jusqu'à la dernière soirée. Le renommage se fait aussi à la première visite de l'accueil ou du casting après un changement. Les étapes sont dans `ETAPES` (`lib/decompte.js`).
5. À 21 h, le bot ne publie rien : l'annonce de l'ouverture se fait à la main.

## La Cote et la Bourse

Après chaque soirée, les Mécènes votent pour leurs **3 favoris** (bouton « Voter » dans #la-cote), jusqu'au prochain midi. La régie ajoute une **note de spectacle** de 0 à 10. Le classement qui en sort, c'est **la Cote**. Avec, la **Bourse d'Osiris** : chaque Mécène a 10 000 crédits fictifs (jamais d'argent réel) pour acheter des parts des candidats, et le cours suit la Cote. Tout se passe avec les boutons de #la-cote : les candidats ne voient aucune commande. La régie a `/cote` (fondateurs et admins).

### Mise en place (une fois)

1. **La base de données** (gratuite) : Vercel → le projet → **Storage** → **Create Database** → **Upstash for Redis** (offre gratuite, région Europe) → **Connect** au projet. Vercel ajoute tout seul `KV_REST_API_URL` et `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`, les deux marchent).
2. **Le salon** : `#la-cote` dans la catégorie 👁 LA LOGE (voir le guide de la Loge) : les Mécènes le voient sans pouvoir y écrire, le bot y écrit. Clic droit → Copier l'identifiant → variable `DISCORD_COTE_CHANNEL_ID`.
3. `DISCORD_MECENE_ROLE_ID` et `DISCORD_CANDIDAT_ROLE_ID` doivent être remplies : seuls les Mécènes (tous les rangs) jouent, jamais un candidat.
4. Redéployer, puis renvoyer les commandes : `/api/commands?key=<SETUP_KEY>`. Vérification : `/api/interactions` → `cote_et_bourse : OK`.
5. Dans #la-cote : `/cote panneau` (le panneau de la Bourse : Cours, Mon portefeuille, Acheter, Vendre, Fortunes).
6. Le soir de la Sélection : `/cote candidats`, coller les 35 noms (un par ligne ; `Nom | NOM COURT` pour choisir le nom du bandeau, sinon c'est le nom de famille).

### Chaque soirée

1. **Fin de soirée** : `/cote ouvrir` → le vote part dans #la-cote, jusqu'au prochain midi (heure de Paris). Option `heures` pour une autre durée.
2. **Avant midi** : `/cote notes` → la fenêtre liste les candidats, mettre une note de 0 à 10 après chaque nom. Sans note, un candidat compte 5 ; sans aucune note pour la séance, seuls les votes comptent.
3. **À midi passé**, la Cote se calcule toute seule et se publie dans #la-cote : au premier clic dans #la-cote, au premier passage du bandeau, ou au plus tard au cron du soir. `/cote calculer` la publie tout de suite, ou la refait après de nouvelles notes (seulement la dernière séance).
4. **Une mort** : `/cote mort candidat:…` → faillite (cours à 0), annoncée dans #la-cote. `annuler:oui` répare une erreur.
5. **La révélation** : `/cote bandeau actif:oui` → le bandeau apparaît dans OBS et sur les télés, et « Le premier sortira. » s'ajoute aux publications. Avant, rien ne sort de la Loge.
6. **Le final** : `/cote sortie candidat:…` → « cotation suspendue · Transfert en cours. » Ses parts sont gelées (ni achat ni vente) et gardées pour la suite.
7. **Le dimanche soir** (cron), les 3 plus grandes fortunes sont publiées dans #la-cote ; la première propose un Choix d'Osiris.

`/cote etat` résume tout (séance, votants, bandeau, salon). `/cote remise-a-zero` efface tout, seulement après des tests.

### Tester avant la saison

1. Mettre `DISCORD_COTE_CHANNEL_ID` sur un salon staff de test (puis redéployer), pour que les Mécènes ne voient rien.
2. `/cote candidats` avec 5 faux noms, `/cote panneau`, `/cote ouvrir heures:1`, voter, `/cote notes`, `/cote calculer`, puis acheter et vendre avec le panneau. Recommencer une séance pour voir les cours bouger.
3. Un compte avec le rôle Candidat doit être refusé partout ; un compte Mécène doit pouvoir tout faire.
4. Le bandeau : `/cote bandeau actif:oui`, puis ouvrir `/bandeau` dans le navigateur (avant le 26 décembre, connecté en testeur avec le lien « Équipe »). `/cote bandeau actif:non` ensuite.
5. Fin des tests : `/cote remise-a-zero confirmer:EFFACER` (efface candidats, votes, cours et portefeuilles ; la prochaine séance redevient la séance 1), supprimer les messages de test, puis mettre `DISCORD_COTE_CHANNEL_ID` sur le vrai `#la-cote`. Ne jamais l'utiliser pendant ou après une vraie saison.

### Le calcul

- Score d'une séance = 5 × votes (le plus voté a 10, les autres en proportion) + 5 × note de spectacle : de 0 à 100.
- Cote = moitié l'ancienne Cote, moitié le score de la séance (à la première séance : le score).
- Prix d'une part = 20 + 2 × Cote, donc de 20 à 220 crédits. La variation du bandeau compare au prix d'avant le dernier calcul.
- Achat : autant de parts entières que le montant le permet, au cours du jour. Vente au cours du jour. Acheter ne change pas la Cote.
- Les crédits sont fictifs : rien ne s'achète ni ne se gagne en argent réel.

### Le bandeau dans OBS

Source **Navigateur**, adresse `https://osiriswl.vercel.app/bandeau`, 1920 × 1080 (fond transparent). `?demo=1` affiche des cours inventés pour régler la scène, `?tele=1` la version plein écran pour les télés en jeu, `?vitesse=120` change la vitesse de défilement. Il ne montre rien tant que `/cote bandeau actif:oui` n'a pas été fait. Les cours viennent de `/api/bourse`.

### La Bourse sur le site (`/cote`)

L'onglet **La Cote** du site (menu de l'accueil, ou `https://osiriswl.vercel.app/cote`). Le Mécène se connecte avec Discord et retrouve **le même portefeuille que sur Discord** (mêmes crédits, mêmes parts, même rang) : il voit les cours avec leur courbe, achète, vend, vote pour la séance ouverte et voit les fortunes. Rien à installer de plus : la page utilise la même base et les mêmes variables que la Cote sur Discord.

- **Qui voit quoi** : les rôles sont lus sur le serveur Osiris (gardés 2 minutes). Un Mécène joue ; un Candidat est refusé, même s'il a encore un rôle Mécène ; quelqu'un qui n'est pas sur le serveur est invité à le rejoindre.
- **Avant la révélation**, sans connexion Mécène, la page ne montre aucun cours (comme sur Discord, tout reste dans la Loge). **Après `/cote bandeau actif:oui`**, les cours deviennent publics sur la page ; le portefeuille, le vote et les fortunes restent réservés aux Mécènes connectés.
- **Avant l'introduction en Bourse**, un Mécène connecté voit « La Bourse ouvre le soir de la Sélection ».
- Comme le reste du site, la page n'est visible que des testeurs avant le 26 décembre.
- Les achats, ventes et votes passent par `POST /api/rangs?cote=1` (seulement depuis le site lui-même, avec la session Discord).

### Les colis

Les Mécènes mettent leurs crédits en commun pour envoyer un **colis marqué de l'Œil** à un candidat (comme les sponsors de Hunger Games). Les crédits donnés sortent de leur portefeuille, donc de leur fortune : sauver son favori, ou garder ses crédits pour le classement.

**Mise en place (une fois)**
1. Un salon **staff** pour la régie (par exemple `#colis-régie`), invisible des Mécènes et des candidats → son identifiant dans `DISCORD_COLIS_CHANNEL_ID`. Redéployer.
2. Renvoyer les commandes : `/api/commands?key=<SETUP_KEY>` (pour `/colis`).
3. **Republier le panneau de la Bourse** dans #la-cote (`/cote panneau`, puis supprimer l'ancien) : le nouveau a le bouton 📦 Colis.
4. Le catalogue par défaut : Chaleur 1 500 cr, Vivres 1 500, Soins 2 500, Une clé 6 000. `/colis catalogue` pour le changer (une ligne par colis : `Nom | prix | contenu`).

**Pendant le Programme**
- `/colis ouvrir actif:oui` : les Mécènes peuvent donner (bouton 📦 Colis du panneau, ou onglet La Cote du site). `actif:non` arrête les nouveaux dons.
- Une cagnotte par candidat et par sorte de colis. Quand elle est pleine : « 📦 Colis prêt » dans le salon de la régie (avec **Livré** et **Annuler et rembourser**), et « Un colis attend… » dans #la-cote.
- La régie fait apparaître le colis en jeu (à la poste ou sur le perron, lui seul peut l'ouvrir), puis clique sur **Livré** : c'est annoncé dans #la-cote. `/colis livrer` fait la même chose.
- Un candidat mort ou sorti avant la livraison : les donateurs sont remboursés tout seuls. `/colis annuler` rembourse une cagnotte à la main. `/colis etat` résume tout.
- Les candidats ne voient rien : tout se passe dans la Loge et sur l'onglet La Cote (Mécènes connectés).

### Saison 2

`COTE_PROGRAMME=02` (variable Vercel) : nouvelle liste de candidats, nouveaux votes. Les parts du vainqueur du Programme 01 restent dans les portefeuilles, et sa ligne « cotation suspendue » continue de défiler.

## La Sélection (samedi 24 avril 2027, 21 h)

La cérémonie de l'annonce des retenus, en direct. La régie clique sur **Nom suivant** : le nom apparaît à l'écran (page `/selection` dans OBS) avec sa photo de profil et son numéro, il est publié dans **#la-sélection** avec une mention, et la personne reçoit le rôle Candidat (Mécène, rangs, Postulant et Aspirant lui sont retirés). À la fin, **Introduction en Bourse** : tous les retenus entrent dans la Cote au même prix (120 cr), et les Mécènes peuvent miser tout de suite.

### Mise en place

1. Le salon public **#la-sélection** (tout le monde le voit, personne n'y écrit, le bot y écrit) → `DISCORD_SELECTION_CHANNEL_ID`. La base Upstash et `DISCORD_COTE_CHANNEL_ID` doivent déjà être en place (voir « La Cote et la Bourse »).
2. Le bot doit avoir l'intent **Server Members** (portail développeur → Bot → Privileged Gateway Intents) pour retrouver les pseudos, et son rôle au-dessus de Candidat et des rôles de Mécène.
3. Redéployer, puis `/api/commands?key=<SETUP_KEY>`. Vérification : `/api/interactions` → `selection : OK`.
4. Dans OBS, une scène « Sélection » avec une source **Navigateur** : `https://osiriswl.vercel.app/selection`, 1920 × 1080. `?demo=1` pour régler la scène avec des noms inventés, `?transparent=1` pour la poser sur une autre scène. La page n'affiche jamais un nom avant qu'il soit annoncé.

### Avant la cérémonie

`/selection preparer` → coller la liste **dans l'ordre de l'annonce**, une ligne par personne : `pseudo Discord ; catégorie ; nom du personnage` (le personnage est facultatif : sans lui, la Bourse affiche le pseudo). Le pseudo peut être le nom d'utilisateur, le nom affiché, le surnom sur le serveur, `@pseudo` ou l'identifiant Discord. Le bot dit qui il n'a pas trouvé (homonymes compris : mettre l'identifiant).

**Répétition** : `/selection preparer test:oui` → rien n'est donné ni mentionné, les cartes partent dans le salon de la régie. Après : `/selection remise-a-zero confirmer:EFFACER` (et `/cote remise-a-zero` si l'introduction en Bourse a été essayée).

### Pendant

1. `/selection regie` dans un salon staff → le panneau : **Nom suivant**, **Liste**, **Introduction en Bourse**. Le panneau affiche le dernier annoncé et le **prochain**, pour préparer ta phrase.
2. Un clic = un nom. Le bouton se bloque 2 secondes pour éviter les doubles clics.
3. Après le dernier nom, l'écran affiche « Les trente-cinq sont choisis. » ; **Introduction en Bourse** quand tu veux : l'annonce part dans #la-cote et l'écran affiche « La Bourse d'Osiris est ouverte ».

Ensuite, `/cote candidats` montre la liste avec des numéros (`#1 Thomas Hale`) : garder le `#n` en changeant un nom (pseudo → personnage) garde le même candidat et ses parts.

## Tickets d'aide

1. Ajouter les variables `DISCORD_PUBLIC_KEY`, `DISCORD_ADMIN_ROLE_ID`, `SETUP_KEY` (et si besoin `DISCORD_HELP_CATEGORY_ID`), puis redéployer.
2. Sur https://discord.com/developers/applications → l'application → **General Information** → **Interactions Endpoint URL** : `https://<ton-domaine>/api/interactions` → Save. Discord vérifie l'adresse tout de suite.
3. Taper `/aide-panneau` dans le salon d'aide (ou ouvrir une fois `https://<ton-domaine>/api/commands?key=<SETUP_KEY>&channel=<identifiant du salon d'aide>`) : le message « Créer un ticket » apparaît dans le salon.
4. Parcours : bouton « Créer un ticket » → menu des catégories → fenêtre « Explique ton problème » → salon privé avec le staff. Les tickets « Problème avec le staff » ne sont visibles que par le rôle Admin. Un seul ticket ouvert par personne et par catégorie. Le bouton « Fermer le ticket » supprime le salon (staff ou auteur).
5. Diagnostic : `https://<ton-domaine>/api/interactions`.

## Canal 17 (récompense du jeu de piste)

Le terminal « canal 17 » de la page casting mène à un code final. Le joueur qui le trouve l'envoie dans un ticket.

1. Sur Discord : créer le rôle « Canal 17 » (aucune permission) et le salon privé `#canal-17` (@everyone : ne voit pas ; Canal 17 : voit et écrit ; le bot Osiris : voit et écrit). Le rôle du bot doit être au-dessus de Canal 17.
2. Sur Vercel : `DISCORD_CANAL17_ROLE_ID` et `DISCORD_CANAL17_CHANNEL_ID`, puis redéployer.
3. Renvoyer les commandes à Discord : `/api/commands?key=<SETUP_KEY>`.
4. Dans le ticket du joueur : `/canal17 membre:@joueur`. Il reçoit le rôle et un numéro d'ordre (n° 1 à 17) ; une voix inconnue lui répond dans le ticket et l'accueille dans `#canal-17`. Après 17 personnes, la voix répond que le canal est complet.
5. `/canal17` sans membre : la liste. `/canal17-voix` : écrire au nom de la voix (dans `#canal-17`, ou un autre salon ; option pour mentionner le rôle). La voix ne dit jamais qui elle est.
6. `/canal17-voix document:<fichier>` : faire fuiter un document (image, PDF, audio, 10 Mo maximum) au nom de la voix. Le bot le dépose d'abord dans `#logs-commandes` (variable `DISCORD_LOGS_CHANNEL_ID`) pendant qu'on écrit le message, puis le publie avec. Une image s'affiche dans la carte de la voix.
7. Accès anticipé : un membre du canal 17 connecté voit **tout 17 minutes avant les autres** : l'ouverture du casting, chaque dossier des Archives (pour de vrai : il peut finir sur le podium), les décomptes et les cinématiques de la page d'accueil (sauf la fin du casting, qui reste la même pour tous). Sur `/casting`, le formulaire s'ouvre 17 minutes avant tout le monde (`AVANCE_MINUTES` dans `lib/canal17.js`). Pendant ces 17 minutes, la page affiche « Canal 17 ? Identifie-toi. » sous le compte à rebours. Sur l'accueil, ce lien est toujours visible pour un visiteur non connecté (`/api/auth/login?retour=canal17`) : au retour, une fenêtre dit « Canal 17 · accès reconnu » (rôle trouvé) ou « Signal non reconnu ». Le site vérifie le rôle sur Discord à chaque envoi de dossier.

Réservé aux fondateurs et aux admins, comme les autres commandes. Le nombre de places est `PLACES` dans `lib/canal17.js`.

## Archives (enquêtes du site)

Une enquête s'ouvre tous les 15 jours, le samedi à 21 h (heure de Paris), sur `/archives`. Chaque dossier contient des pièces (images) ; certaines sont cachées et s'ouvrent quand on tape leur référence. On valide le mot de passe en se connectant avec Discord.

1. Sur Discord : créer le rôle « Enquêteur » (aucune permission), un salon **privé** `#registre-archives` (le bot y note chaque dossier résolu, c'est lui qui donne les rangs) et choisir le salon public des annonces (par exemple `#annonce`). Le bot Osiris doit voir et écrire dans ces deux salons, et son rôle doit être au-dessus d'Enquêteur.
2. Sur Vercel : `DISCORD_ENQUETEUR_ROLE_ID`, `DISCORD_ARCHIVES_REGISTRE_ID`, `DISCORD_ARCHIVES_ANNONCE_ID`, puis redéployer.
3. Bonne réponse : rôle Enquêteur, une ligne dans le registre, et pour les trois premiers d'un dossier, une annonce (🥇 🥈 🥉) dans le salon public.
4. Écrire une enquête : `api/_archives/_dossiers.js` (titre, intro, pièces, empreinte du mot de passe, texte de fin ; la commande pour calculer l'empreinte est en haut du fichier) et les images dans `api/_archives/pieces/`. Un dossier sans contenu reste « en préparation ».
5. Tester avant la date : les comptes de `CASTING_TESTEURS` voient les dossiers en avance, en « mode test » (rien n'est noté ni annoncé).
6. Les mots de passe ne sont jamais écrits en clair, et les pièces ne sont servies qu'à partir de l'heure d'ouverture. Le dépôt GitHub doit rester **privé**.

## Le mot du jour (page /mot)

Un mot de 5 lettres à trouver en 6 essais, comme Motus : case rouge = bonne place, rond jaune = dans le mot mais ailleurs. Un nouveau mot chaque soir à 21 h (heure de Paris), à partir du soir de l'ouverture (26 décembre). Le canal 17 a chaque mot 17 minutes avant.

1. Sur Discord : créer un salon **privé** `#registre-mots` (le bot doit le voir, y écrire et lire l'historique). Facultatif : un salon pour l'annonce du soir (par exemple `#annonce`), et un rôle « Mot du jour : premier de la semaine », sous le rôle du bot.
2. Sur Vercel : `DISCORD_MOT_REGISTRE_ID` (et si besoin `DISCORD_MOT_ANNONCE_ID`, `DISCORD_MOT_ROLE_ID`), puis redéployer.
3. Il faut être connecté avec Discord pour jouer, et on ne joue qu'une fois par mot. Le mot ne quitte jamais le serveur : la page envoie chaque essai et reçoit seulement les couleurs. Un mot qui n'existe pas ne coûte pas d'essai (dictionnaire : `api/_mot/_dico.js`).
4. Classement du soir : le moins d'essais, puis le plus rapide. Classement de la semaine : trouvé en 1 essai = 6 points, … en 6 essais = 1 point ; il repart de zéro le lundi à 21 h. La semaine de l'ouverture (deux mots) compte avec la suivante. La série compte les soirs d'affilée où le mot a été trouvé.
5. Chaque soir vers 21 h (cron de `vercel.json`, et à défaut la première visite de /mot), si `DISCORD_MOT_ANNONCE_ID` est rempli, le bot annonce le mot de la veille, combien l'ont trouvé et qui a été le premier ; le lundi, il ajoute le podium de la semaine et donne le rôle au premier.
6. Les mots : `api/_mot/_mots.js`, dans l'ordre (n° 1 le 26 décembre 2026). La liste tient jusqu'en novembre 2027 ; ajouter des mots à la fin, sans changer l'ordre des mots déjà passés.
7. Tester avant la date : les comptes de `CASTING_TESTEURS` jouent sur des mots d'entraînement (rien n'est noté). Après l'ouverture, ils jouent comme tout le monde.
8. Le registre sert de mémoire au jeu : une ligne `🔤 mot …` par joueur et par soir, et une marque `📣 mot …` par annonce. Pour retirer une partie suspecte, supprimer sa ligne.

## Casting : dates et verrouillage

Le formulaire de `/casting` ne s'ouvre qu'entre l'ouverture et la fermeture du casting. Avant, la page affiche « Formulaire scellé » avec le compte à rebours ; après, « Casting terminé ». Le serveur refuse aussi tout dossier envoyé hors de ces dates (`api/candidature.js`), même si quelqu'un contourne la page.

- Dates par défaut dans `lib/casting.js` : ouverture le samedi 20 février 2027 à 23h30 (finale du TOURNOI BARHAW), fermeture le samedi 20 mars 2027 à 23h59 (heure de Paris).
- Pour les changer sans toucher au code, variables Vercel `CASTING_OUVERTURE` et `CASTING_FERMETURE`, au format `2027-02-20T23:30:00+01:00`. Penser à changer aussi les dates affichées sur l'accueil (`index.html`).
- `CASTING_TESTEURS` : identifiants Discord (séparés par des virgules) qui peuvent tester le formulaire même quand le casting est fermé. La page leur affiche « Mode test ».
- État actuel : `https://<ton-domaine>/api/casting` (ou la ligne `casting` de `/api/candidature`).

## Commandes slash

1. Il faut que les tickets d'aide soient déjà branchés (`DISCORD_PUBLIC_KEY` et Interactions Endpoint URL).
2. Ouvrir une fois `https://<ton-domaine>/api/commands?key=<SETUP_KEY>` : les commandes apparaissent sur le serveur Osiris. À refaire après chaque modification de `lib/commandes.js`.
3. Toutes les commandes sont réservées aux fondateurs et aux admins. Discord ne les affiche qu'aux membres qui ont la permission **Administrateur** ; pour un rôle qui ne l'a pas : Paramètres du serveur → Intégrations → Osiris → autoriser le rôle. Le bot vérifie en plus le rôle (Administrateur, `DISCORD_FONDATEUR_ROLE_ID` ou `DISCORD_ADMIN_ROLE_ID`).
4. Commandes :
   - `/annonce` : fenêtre titre + message, publiée aux couleurs d'Osiris dans le salon. Option `ping` pour @everyone.
   - `/aide-panneau` : publie le bouton « Créer un ticket » dans le salon.
   - `/fermer` : ferme le ticket où on la tape. Ticket d'aide : staff ou auteur. Ticket de candidature : staff seulement.
   - `/casting resultat:…` (dans un ticket de candidature) : publie le résultat au candidat, donne le rôle correspondant et retire le rôle Postulant.
   - `/offrande` : lance un vote des Mécènes dans #offrandes (voir « Rangs des Mécènes »).
   - `/decompte` : publie l'annonce de l'ouverture officielle du projet, avec un compte à rebours en direct (voir « Avant l'ouverture officielle »). Options `salon` et `ping`.
   - Les commandes de modération sont décrites plus bas.

## Sécurité

- Aucun secret n'est envoyé au navigateur : le token du bot et le client secret restent côté serveur.
- La session est un cookie HttpOnly, signé (HMAC SHA-256), valable 6 heures.
- La connexion Discord est protégée par un paramètre `state` (anti-CSRF).
- Les champs sont nettoyés et tronqués ; les mentions sont limitées au candidat et au rôle staff.
- Champ piège anti-robots (`site`), ignoré s'il est rempli.
- Les tickets d'aide vérifient la signature Discord de chaque requête (clé publique Ed25519).

## Jeu de piste et Archives

Les réponses du jeu de piste et des Archives ne sont écrites nulle part dans ce dépôt : la direction les garde. Le dépôt GitHub doit rester **privé**, et le site bloque l'accès direct à `/README.md`, `/lib/…`, `/api/_archives/…` et `/api/_mot/…` (`vercel.json`, redirections).

## Offre Vercel

L'offre gratuite (Hobby) est réservée à un usage non commercial. Les dons ne comptent pas comme usage commercial.

## Modération

Le bot a besoin de : Exclure temporairement des membres, Expulser des membres, Bannir des membres, Gérer les messages, Gérer les salons. Son rôle doit être placé au-dessus des rôles des joueurs. Créer un salon privé « sanctions » (visible par la direction et le bot) et mettre son identifiant dans `DISCORD_SANCTIONS_CHANNEL_ID`.

- `/warn membre raison` : avertissement. Le membre reçoit un message privé avec la raison, son nombre d'avertissements et le prochain palier.
- Paliers automatiques (`SEUILS` dans `lib/moderation.js`) : 3 avertissements = mute 1 heure, 5 = mute 24 heures, 7 = bannissement.
- `/unwarn membre` : retire un avertissement (l'historique est gardé).
- `/sanctions membre` : historique et nombre d'avertissements actifs.
- `/mute membre duree raison` et `/unmute membre` : mute Discord (10 minutes à 7 jours), avec message privé.
- `/kick membre raison` : expulsion (il peut revenir avec une invitation), avec message privé.
- `/ban membre raison` (option : supprimer ses messages des dernières 24 h) et `/unban identifiant`.
- `/clear nombre` (option : seulement les messages d'un membre) : supprime jusqu'à 100 messages de moins de 14 jours.
- `/slowmode delai` : mode lent du salon (désactivé à 1 heure).

Chaque sanction est écrite dans le salon des sanctions : c'est là que le bot compte les avertissements (500 derniers messages du salon). Les membres de l'équipe (Fondateur, Admin, Staff) ne peuvent pas être sanctionnés par le bot. Après une modification de `lib/moderation.js`, rouvrir `/api/commands?key=<SETUP_KEY>`.

## Antispam

Installé une fois en ouvrant `https://<ton-domaine>/api/antispam?key=<SETUP_KEY>` (le bot doit avoir « Gérer le serveur » et « Exclure temporairement des membres »). Ce sont des règles AutoMod de Discord : elles tournent 24 h sur 24, même quand le bot ne fait rien.

| Règle | Action |
| --- | --- |
| Mentions en masse (5 mentions ou plus dans un message, raid de mentions) | message bloqué, alerte, mute 10 minutes |
| Liens d'invitation vers d'autres serveurs | message bloqué, alerte, mute 10 minutes |
| Arnaques (faux Nitro, faux liens Steam ou Discord) | message bloqué, alerte, mute 1 heure |
| Spam détecté par Discord | message bloqué, alerte |
| Insultes graves (liste de Discord) | message bloqué, alerte |

Les alertes arrivent dans le salon des sanctions. L'équipe n'est jamais bloquée. Tout se modifie ensuite dans Paramètres du serveur → AutoMod (ajouter des mots interdits, changer une durée). Le flood pur (beaucoup de messages en quelques secondes) n'est pas détecté par AutoMod : utiliser `/slowmode` sur le salon concerné.

## Journal

Avec `DISCORD_LOGS_CHANNEL_ID`, le bot note dans ce salon : chaque commande utilisée (qui, laquelle, dans quel salon, avec quelles options), les tentatives refusées, les tickets ouverts et fermés, les annonces publiées.

Les messages supprimés ou modifiés, les arrivées et départs et les actions faites à la main ne passent pas par le site : Discord ne les envoie qu'à un programme connecté en permanence. C'est le rôle du dossier séparé `osiris-logs` (voir son LISEZMOI).

## Rangs des Mécènes

Le bot compte les sondages votés par chaque Mécène dans #offrandes (un sondage = un vote, quelle que soit la réponse) et donne le rôle du rang atteint : Mécène d'argent à 6 votes, Mécène d'or à 12, Grand Mécène à 18 (paliers dans `lib/rangs.js`). On ne redescend jamais. À chaque promotion : message privé au Mécène et annonce dans #le-salon. Chaque nuit, un rapport est posté dans #logs-commandes, avec les 3 Mécènes les plus fidèles des 7 derniers jours.

- Automatique : chaque nuit (Vercel, `vercel.json` → `crons`, entre 2h et 3h UTC).
- À la main : `https://<ton-domaine>/api/rangs?key=<SETUP_KEY>` ; ajouter `&simulation=1` pour voir ce qui changerait sans rien modifier.
- Sécurité : un candidat (rôle Candidat) perd automatiquement le rôle Mécène et ses rangs ; `/casting resultat:Retenu` les retire aussi tout de suite.
- Le portail développeur doit garder « Server Members Intent » activé (le bot lit la liste des membres).

### Lancer un vote : `/offrande`

Taper `/offrande` n'importe où : une fenêtre demande le titre, la durée (en minutes, 10 par défaut, ou par exemple « 2h ») et 2 ou 3 Offrandes (1re ligne : le nom, qui devient le choix du sondage ; lignes suivantes : la description). Le bot publie dans #offrandes une carte aux couleurs d'Osiris (bannière `img/offrande.png`, description de chaque Offrande, heure de fin affichée à l'heure locale de chacun), puis le sondage Discord juste en dessous, avec ❄️ 🕯️ 🗝️ devant les choix. La carte mentionne les rôles Mécène, Mécène d'argent, Mécène d'or, Grand Mécène et Staff (pas lors d'un test). Le vote reste un vrai sondage Discord : il compte pour les rangs. Chaque lancement est noté dans #logs-commandes.

**Votes de moins d'une heure** : Discord n'accepte pas de sondage de moins d'une heure. Le sondage est donc créé pour l'heure entière, la carte annonce la vraie heure de fin, et le journal Osiris (programme sur le VPS) ferme le sondage à cette heure-là. Si le journal est arrêté, le sondage reste ouvert jusqu'au bout de l'heure.

Pour essayer sans fausser les rangs : `/offrande salon:#un-salon-staff`. La carte et le sondage partent dans ce salon, qui n'est pas compté.

### Les Offrandes à l'écran

Avec la base Upstash branchée, chaque `/offrande` est aussi gardée sur le site :
- **Les Mécènes votent aussi depuis le site**, dans la bande « Offrande en cours » en haut de la Salle de contrôle (connexion Discord). Un candidat ne peut pas voter.
- **Le compte réunit Discord et le site**, sans doublon : si quelqu'un a voté aux deux endroits, c'est son vote Discord qui compte.
- **À l'heure de fin**, le bot publie le résultat réuni en réponse au sondage (« L'OFFRANDE EST CHOISIE · … »). Discord affiche aussi son propre résultat, qui ne compte que les votes Discord : c'est celui du bot qui fait foi.
- **Les votes du site comptent pour les rangs**, comme un vote au sondage.
- **Option `ecran`** de `/offrande` (oui par défaut) : le vote s'affiche en direct sur l'écran OBS et, pour tout le monde, dans la Salle de contrôle. Avec `ecran:non`, seuls les Mécènes connectés le voient (et votent) dans la Salle ; l'écran OBS reste vide.
- **L'écran OBS** : source Navigateur `https://osiriswl.vercel.app/offrande`, 1920 × 1080, fond transparent. Le panneau apparaît au lancement, montre les barres et le compte à rebours, puis le résultat pendant 60 secondes. `?position=gauche` ou `centre`, `?resultat=90` (secondes), `?demo=1` pour régler la scène.
- Après l'ajout de l'option `ecran`, renvoyer les commandes : `/api/commands?key=<SETUP_KEY>`.

Permissions du bot dans #offrandes : Voir le salon, Envoyer des messages, Intégrer des liens, **Créer des sondages**, **Mentionner @everyone, @here et tous les rôles** (sinon les rôles s'affichent mais personne n'est notifié). La bannière et l'icône viennent du site : `SITE_URL` doit être rempli.

| Variable | Valeur |
| --- | --- |
| `DISCORD_OFFRANDES_CHANNEL_ID` | Identifiant du salon #offrandes (les sondages) |
| `DISCORD_LOGE_SALON_ID` | Facultatif. Identifiant de #le-salon, pour annoncer les promotions |
| `DISCORD_MECENE_ROLE_ID` | Rôle Mécène (accès à la Loge) |
| `DISCORD_MECENE_ARGENT_ROLE_ID` | Rôle Mécène d'argent |
| `DISCORD_MECENE_OR_ROLE_ID` | Rôle Mécène d'or |
| `DISCORD_GRAND_MECENE_ROLE_ID` | Rôle Grand Mécène |
| `DISCORD_CANDIDAT_ROLE_ID` | Rôle Candidat (déjà utilisé par /casting) |
| `CRON_SECRET` | Une suite de caractères au hasard (16 ou plus) : Vercel l'envoie au lancement de chaque nuit |

## Les écrans (streams du Programme)

Section « Les écrans » de l'accueil : un moniteur et une case par streamer. « Regarder ici » charge le direct Twitch dans le moniteur, sans quitter le site. Rien n'est chargé depuis Twitch avant ce clic (voir la page légale, partie Cookies).

- **Liste des streamers** : `ECRANS`, en haut du script de `index.html`. Une ligne par chaîne : `twitch` = ce qui suit `twitch.tv/`. `role` remplace « Écran 0X » (ex. « La régie ») ; `texte` s'affiche quand la chaîne n'est pas en direct ; `nom` = nom affiché tant que Twitch ne l'a pas donné.
- **En direct ou non** : `api/ecrans.js` demande à Twitch qui est en direct (titre, jeu, spectateurs). La réponse est gardée 60 secondes, et la page se met à jour toute seule chaque minute. Sans les deux variables ci-dessous, tout marche quand même, mais sans « En direct » ni « Hors ligne ».
- **Créer les identifiants Twitch** (gratuit, 2 minutes) : https://dev.twitch.tv/console → se connecter → **Register Your Application** → Name : `Osiris RP` ; OAuth Redirect URLs : `http://localhost` ; Category : `Website Integration` ; Client Type : `Confidential` → Create → **Manage** → copier le **Client ID**, puis **New Secret** et copier le secret.
- Le lecteur Twitch ne marche que sur le site en ligne (https), pas en ouvrant `index.html` depuis l'ordinateur : dans ce cas, « Regarder ici » ouvre Twitch dans un nouvel onglet.

| Variable | Valeur |
| --- | --- |
| `TWITCH_CLIENT_ID` | Client ID de l'application Twitch |
| `TWITCH_CLIENT_SECRET` | Secret de l'application Twitch (ne jamais le partager) |

### La Salle de contrôle (`/salle`)

Tous les directs du Programme **en même temps**, en mosaïque, comme les Mécènes qui observent l'île. Lien depuis la section « Les écrans » de l'accueil et le pied de page.

- Le visiteur clique sur **Entrer** (c'est là que les lecteurs Twitch se chargent, avec leurs cookies). Les écrans en direct démarrent sans le son ; ceux qui ne sont pas en direct affichent « Hors antenne ».
- **Un clic sur un écran** : il passe en grand avec le son, les autres se rangent sur le côté, sans le son. **Mosaïque** (ou Échap) pour revenir ; touches **1 à 9** pour choisir un écran, **F** pour le plein écran.
- **Le bandeau de la Bourse** s'affiche en bas tout seul après `/cote bandeau actif:oui` (pas sur téléphone, où il serait illisible).
- **Liste des streamers** : la même que l'accueil, mais écrite deux fois : `ECRANS` dans `index.html` **et** dans `salle.html`. À modifier aux deux endroits.
- Qui est en direct : même source que l'accueil (`TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET`). Sans ces variables, tous les écrans chargent le lecteur Twitch, qui affiche lui-même « hors ligne ».

## Partenaires

Section « Partenaires » en bas de l'accueil (FreakyVerse). Pour en ajouter un : copier le bloc `<article class="partner">` dans `index.html` et changer les textes et les liens.
