# PRISM — reprise 1.0.2

Date : 9 octobre 2026.

Cette version ajoute le lecteur MP4 progressif décrit dans `IMPORT-VIDEO-1.0.2.md`.
Le bilan des 19 tests ci-dessous concerne la reprise 1.0.1 ; la suite actuelle
compte 22 tests, tous réussis. Les limites de validation sur téléphone restent applicables.
Base examinée : fichier fourni `Prism-main.zip`, archive portant la référence Git
`997d257eb484ff3cae6cb01bbbe688f209afd7bc`. Aucun accès au dépôt distant ou au
site déployé n'a été utilisé pour établir l'état du projet.
Le cahier des charges `PRISM-cahier-des-charges-Claude-MAX.zip` n'était pas disponible.
Cette reprise corrige la base fournie ; elle ne valide pas la conformité à ce document absent.

## Ce que contient cette version

Application de conversion et d'extraction audio dans le navigateur. Version gratuite :
import, sélection d'un extrait, lecture et export MP3/WAV. Module Pro : fondus,
normalisation, extraits multiples et ZIP, export M4A selon le navigateur,
installation et cache de l'application. L'activation existante utilise l'e-mail d'achat
Gumroad ; il n'y a pas de mot de passe de test dans les fichiers reçus.
Le prix de 19 € et le lien d'achat sont ceux présents dans le code fourni : leur
correspondance avec la boutique actuelle n'a pas été vérifiée.

## Corrections effectuées

- `.env.example` : variables réellement attendues par le serveur ; ajout du jeton et
  du permalien, prise en charge facultative de l'identifiant API exact du produit.
- Restauration Pro : les variables d'installation sont initialisées avant la
  réactivation depuis le stockage local ; suppression d'une erreur de démarrage.
- Contrôle Gumroad : comparaison exacte du produit, pagination des ventes,
  délai maximal de réponse, absence de journalisation des données d'achat et du jeton.
  Les tentatives ne sont plus toutes oubliées lorsque la table de limitation grossit.
- Export et import : verrouillage des contrôles pour conserver le fichier, les
  paramètres et les extraits pendant le traitement ; restauration après échec.
- Import refusé : erreur visible dès le premier fichier ; le nom d'une source
  précédemment chargée n'est plus remplacé par le nom d'un fichier refusé.
- Retrait Pro : retour à un format gratuit si M4A était sélectionné,
  bouton d'installation masqué, anciennes réponses de revérification ignorées.
- Encodeur MP3 : lamejs 1.2.1 inclus localement, sans modification, avec notice,
  texte de licence et liens vers les sources.
- Service worker : cache limité aux ressources de Prism ; médias et API exclus ;
  suppression limitée aux anciennes versions du cache Prism.
- Champ e-mail adapté aux styles de l'interface et libellé accessible du bouton
  de lecture mis à jour lors du changement d'état.

## Vérifications réalisées

Commande : `npm test` — **19 tests réussis, 0 échec**.

- Contrôles Gumroad avec réponses simulées : configuration manquante, méthode
  refusée, e-mail invalide, achat exact, autre produit, remboursement, pagination,
  panne réseau et limitation des tentatives.
- Script de l'application exécuté dans un environnement DOM simulé : démarrage,
  restauration et retrait Pro, erreur d'import, verrouillage des réglages,
  révocation et gestion d'une ancienne réponse après retrait manuel.
- Fichier WAV réel : reconnu comme PCM 16 bits mono à 16 kHz par `ffprobe`.
- Fichiers MP3 réels : encodeur intégré, mono et stéréo à 44,1 kHz, reconnus par
  `ffprobe`.
- Fondus et normalisation : contrôle numérique du signal.
- Archive ZIP réelle : intégrité et contenu vérifiés avec Python `zipfile`,
  y compris un nom contenant un caractère accentué.
- Cache : ressources incluses, médias et API exclus, autres caches conservés.

Ces vérifications ne simulent pas le décodage audio natif d'un vrai navigateur.
La tentative d'installation de Chromium pour les essais de navigation a échoué
(téléchargement incomplet). Aucun test visuel sur navigateur, aucun essai Android/iOS,
aucun export M4A natif ni achat Gumroad réel n'est déclaré validé.

## Remplacement sur GitHub et Vercel

1. Décompresser le ZIP et ouvrir le dossier `Prism-main`.
2. Remplacer les fichiers du projet par son contenu, en ajoutant aussi `public/vendor/`
   et `tests/`. Ne pas créer un deuxième dossier `Prism-main` dans le dépôt.
3. Garder les secrets réels uniquement dans Vercel ou `.env.local` non publié.
   Variables serveur : `GUMROAD_ACCESS_TOKEN` et `GUMROAD_PRODUCT_PERMALINK`.
   `GUMROAD_PRODUCT_ID` est facultatif ; si rempli, il doit être l'identifiant API
   exact, et non le code du lien produit.
4. Paramètres du projet : framework « Other », sortie `public`, aucun build nécessaire.
5. Redéployer puis vérifier `/private/pro.js` : ce chemin doit renvoyer 404.
6. Tester un fichier WAV et un fichier vidéo représentatifs sur le téléphone visé,
   puis une vraie activation Gumroad. Les codecs acceptés dépendent du navigateur.

## Limites à conserver dans les décisions suivantes

Le traitement charge le fichier et l'audio décodé en mémoire. Il n'y a pas de moteur
FFmpeg/WASM dans cette base ; une extension affichée n'est pas une garantie de décodage.
La version Pro par e-mail confirme l'existence d'un achat, pas l'identité du visiteur.
Le code Pro déjà reçu peut être copié et reste utilisable hors ligne ; une révocation
immédiate n'est pas garantie. La limitation par IP est propre à une instance serveur.

Les sources techniques consultées sont le code fourni, les sources officielles
Gumroad (`https://github.com/antiwork/gumroad/blob/main/app/controllers/api/v2/sales_controller.rb`),
lamejs (`https://github.com/zhuker/lamejs`) et LAME
(`https://github.com/lameproject/lame/blob/master/COPYING`).
Les tests Gumroad utilisent exclusivement des données fictives et ne prouvent pas
le fonctionnement de la configuration de production.
