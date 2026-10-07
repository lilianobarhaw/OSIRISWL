# Site Osiris — notes pour le dev (Vercel)

Site du serveur GTA RP Osiris. Page d'accueil qui présente Osiris (animation d'ouverture « OSIRIS RP » avec le logo de l'artiste, l'émission, les Programmes, les Mécènes, les cinématiques, le calendrier), et une page casting séparée : compte à rebours du Programme 01, jeu de piste (terminal « Accès candidat ») et casting. Pour candidater, le joueur se connecte avec Discord ; sa candidature ouvre un ticket privé sur le serveur Osiris.

## Fichiers

- `index.html` : la page d'accueil (HTML, CSS et JS dans un seul fichier). En haut du script, deux réglages à remplir :
  - `LIENS` : les liens Discord, Twitch et TikTok (un lien vide cache le bouton) ;
  - `FILMS` : les cinématiques ; coller l'identifiant YouTube de chaque vidéo quand elle est en ligne. Une cinématique reste verrouillée jusqu'à sa date de diffusion.
- `casting.html` : la page de candidature (compte à rebours, dossier, connexion Discord, terminal « Accès candidat »), à l'adresse `/casting`.
- `vercel.json` : `cleanUrls` pour que `/casting` ouvre `casting.html`.
- `video/osiris-rp.mp4` : le générique (animation de l'Œil), lu dans la salle de projection.
- `legal.html` (adresse `/legal`) : mentions légales, mention de fiction, données personnelles (RGPD), cookies, conditions d'utilisation, crédits. Liée en bas de toutes les pages et sous le formulaire de candidature. Mettre à jour la date en haut de la page à chaque changement.
- `fonts/` : les polices du site (Marcellus, IBM Plex Mono, Source Serif 4), hébergées sur le site pour ne rien envoyer à Google. Licences OFL dans le dossier.
- `son.js` + `audio/ambiance.mp3` : l'ambiance sonore (composition originale, libre de droits, boucle de 96 s). Elle démarre au premier clic du visiteur (les navigateurs interdisent le son automatique), à volume bas, avec un bouton « Ambiance » en bas à gauche pour la couper ; le choix est retenu. Pour changer de musique : remplacer `audio/ambiance.mp3` et mettre sa durée dans `BOUCLE` (son.js). Volume : `VOLUME` dans son.js.
- `img/` : le logo d'Osiris (dessin de l'artiste, non retouché) : `oeil.webp` / `oeil.png` pour la page, `favicon.png` et `apple-touch-icon.png` pour l'onglet et les téléphones, `og.png` pour l'aperçu des liens sur Discord et les réseaux. Si l'adresse du site change, modifier aussi la ligne `og:image` dans `index.html`.
- `lib/discord.js` : sessions signées (cookie HttpOnly), cookies, appels à l'API Discord.
- `api/auth/login.js` : redirige vers Discord (scopes `identify guilds.join`).
- `api/auth/callback.js` : récupère le compte, ajoute le joueur au serveur Osiris, ouvre la session (6 h).
- `api/auth/logout.js` : ferme la session.
- `api/me.js` : dit à la page si le joueur est connecté.
- `api/candidature.js` : `GET` = diagnostic des variables ; `POST` = crée le ticket.
- `api/interactions.js` : tickets d'aide (bouton, menu des catégories, fenêtre, salon privé, fermeture).
- `api/panel.js` : publie le message « Créer un ticket » dans le salon d'aide.
- `lib/aide.js` : la liste des catégories d'aide et le texte du panneau (à modifier ici).
- `lib/commandes.js` : les commandes slash et les textes de résultat du casting.
- `api/commands.js` : envoie la liste des commandes slash à Discord.
- `lib/moderation.js` : les commandes de modération et les paliers de sanctions automatiques (à modifier ici).
- `lib/logs.js` : le journal des commandes (qui, quoi, où, quand).
- `lib/antispam.js` et `api/antispam.js` : les règles antispam (AutoMod de Discord) et leur installation.
- `package.json` : `"type": "module"`.

## Parcours du candidat

1. Il clique sur « Se connecter avec Discord » et accepte.
2. Il revient sur la page `/casting`, connecté, et il est ajouté au serveur Osiris s'il n'y était pas.
3. Il remplit le dossier et le soumet.
4. Un salon `candidature-<numéro>-<pseudo>` est créé dans la catégorie des tickets, visible seulement par lui, le staff et le bot. Le dossier y est posté, avec une mention du candidat et du rôle staff.
5. Il reçoit le rôle « Postulant » si la variable `DISCORD_POSTULANT_ROLE_ID` est configurée. Le bot doit avoir la permission « Gérer les rôles », et son rôle doit être placé au-dessus de Postulant.
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
| `DISCORD_FONDATEUR_ROLE_ID` | Identifiant du rôle Fondateur : avec le rôle Admin, le seul autorisé à utiliser les commandes du bot |
| `DISCORD_LOGS_CHANNEL_ID` | Identifiant du salon privé `#logs-commandes` : qui a utilisé quelle commande du bot, tickets ouverts et fermés, annonces |
| `DISCORD_SANCTIONS_CHANNEL_ID` | Identifiant du salon privé des sanctions : historique, compteur d'avertissements et alertes de l'antispam |

Redéployer après chaque modification des variables. Vérification : ouvrir `https://<ton-domaine>/api/candidature` → doit afficher « toutes les variables sont configurées ».

L'ancienne variable `DISCORD_WEBHOOK` n'est plus utilisée.

## Tickets d'aide

1. Ajouter les variables `DISCORD_PUBLIC_KEY`, `DISCORD_ADMIN_ROLE_ID`, `SETUP_KEY` (et si besoin `DISCORD_HELP_CATEGORY_ID`), puis redéployer.
2. Sur https://discord.com/developers/applications → l'application → **General Information** → **Interactions Endpoint URL** : `https://<ton-domaine>/api/interactions` → Save. Discord vérifie l'adresse tout de suite.
3. Ouvrir une fois `https://<ton-domaine>/api/panel?key=<SETUP_KEY>&channel=<identifiant du salon d'aide>` : le message « Créer un ticket » apparaît dans le salon.
4. Parcours : bouton « Créer un ticket » → menu des catégories → fenêtre « Explique ton problème » → salon privé avec le staff. Les tickets « Problème avec le staff » ne sont visibles que par le rôle Admin. Un seul ticket ouvert par personne et par catégorie. Le bouton « Fermer le ticket » supprime le salon (staff ou auteur).
5. Diagnostic : `https://<ton-domaine>/api/interactions`.

## Casting : dates et verrouillage

Le formulaire de `/casting` ne s'ouvre qu'entre l'ouverture et la fermeture du casting. Avant, la page affiche « Formulaire scellé » avec le compte à rebours ; après, « Casting terminé ». Le serveur refuse aussi tout dossier envoyé hors de ces dates (`api/candidature.js`), même si quelqu'un contourne la page.

- Dates par défaut dans `lib/casting.js` : ouverture le samedi 20 février 2027 à 23h30 (finale du TOURNOI BARHAW), fermeture le 14 mars 2027 à 23h59 (heure de Paris).
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
   - Les commandes de modération sont décrites plus bas.

## Sécurité

- Aucun secret n'est envoyé au navigateur : le token du bot et le client secret restent côté serveur.
- La session est un cookie HttpOnly, signé (HMAC SHA-256), valable 6 heures.
- La connexion Discord est protégée par un paramètre `state` (anti-CSRF).
- Les champs sont nettoyés et tronqués ; les mentions sont limitées au candidat et au rôle staff.
- Champ piège anti-robots (`site`), ignoré s'il est rempli.
- Les tickets d'aide vérifient la signature Discord de chaque requête (clé publique Ed25519).

## Jeu de piste (réservé au staff)

Réponses, dans l'ordre : `0333`, `CANDIDAT17`, `LUDENDORFF`. Code final : `THOT-17-A3`.

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

Taper `/offrande` n'importe où : une fenêtre demande le titre, la durée (en heures, de 1 à 168) et 2 ou 3 Offrandes (1re ligne : le nom, qui devient le choix du sondage ; lignes suivantes : la description). Le bot publie dans #offrandes une carte aux couleurs d'Osiris (bannière `img/offrande.png`, description de chaque Offrande, heure de fin affichée à l'heure locale de chacun), puis le sondage Discord juste en dessous, avec ❄️ 🕯️ 🗝️ devant les choix. Le vote reste un vrai sondage Discord : il compte pour les rangs. Chaque lancement est noté dans #logs-commandes.

Pour essayer sans fausser les rangs : `/offrande salon:#un-salon-staff`. La carte et le sondage partent dans ce salon, qui n'est pas compté.

Permissions du bot dans #offrandes : Voir le salon, Envoyer des messages, Intégrer des liens, **Créer des sondages**. La bannière et l'icône viennent du site : `SITE_URL` doit être rempli.

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
