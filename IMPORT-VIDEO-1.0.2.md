# PRISM 1.0.2 — chargement des vidéos volumineuses

## Résultat sur le fichier fourni

Source : `VID_20260514_193011.mp4` fourni le 9 octobre 2026.
Métadonnées lues avec ffprobe : vidéo H.264 1920 × 1080, audio AAC-LC stéréo
48 kHz, durée du conteneur 289,039522 s, taille 339 436 963 octets.

Un MP3 à 192 kbit/s a été produit avec FFmpeg et vérifié : 48 kHz, stéréo,
289,008 s, 6 936 912 octets. La piste AAC a aussi été copiée en M4A sans
réencodage. Ces exports ne nécessitent aucun achat.

Le nouveau module JavaScript `public/mp4-audio.js` a été exécuté localement
sur la vidéo originale, avec lecture par tranches depuis le disque :

- taille maximale d'une tranche : 1 048 576 octets ;
- octets lus : 236 969 432, en plusieurs tranches ;
- conteneur audio résultant : 13 022 943 octets ;
- une seule piste AAC stéréo 48 kHz, reconnue par ffprobe ;
- audio décodé comparé avec FFmpeg : empreinte SHA-256 identique entre la
  vidéo source et le conteneur audio produit. Les listes de montage et l'amorce
  AAC sont conservées pour éviter l'ajout de silence ou un décalage.

Le lecteur parcourt des portions du conteneur vidéo ; il ne lit pas uniquement
les octets audio. Il évite l'appel `file.arrayBuffer()` sur la vidéo entière
et ne décode pas les images vidéo.

## Changement ciblé

Pour MP4, MOV, M4A, M4V et 3GP avec une piste AAC compatible, Prism lit le
conteneur progressivement via MP4Box.js 2.4.1, reconstitue un conteneur audio,
puis fournit ce conteneur à `decodeAudioData`. Le traitement reste local.
L'import affiche son état et sa progression dès le premier fichier.

Le décodage audio et les encodeurs MP3/WAV existants restent utilisés. Les
réglages Pro et la vérification Gumroad sont conservés. Les petits conteneurs
non AAC peuvent revenir au décodage natif ; les gros fichiers refusés par
le lecteur progressif affichent une erreur explicite. WebM, MP3, WAV et les
extensions non MP4 conservent leur chemin d'import précédent.

Fichiers modifiés depuis 1.0.1 : `public/index.html`, `public/sw.js`,
`package.json`, documentation et numéro de version dans `private/pro.js`.
Ajouts : `public/mp4-audio.js`, `public/vendor/mp4box/` et
`tests/mp4-audio.test.js`.

## Vérifications et limites

`npm test` : **22 tests réussis, zéro échec**. Les nouveaux contrôles portent
sur des MP4 avec index au début ou à la fin, l'identité du signal audio,
l'absence d'audio et un conteneur invalide. Les contrôles MP3, WAV, licence,
ZIP et cache de la version précédente passent encore.

Le site en production a précédemment été testé dans un navigateur distant
avec un petit MP3 et une petite vidéo MP4 ; leur chargement et l'export MP3
fonctionnaient gratuitement. La vidéo utilisateur de 339 Mo n'a pas été
chargée dans ce navigateur, et le problème sur le téléphone n'a pas été
reproduit. Aucun achat Gumroad n'a été effectué.

Le poids de la vidéo et la lecture intégrale par l'ancien code peuvent
contribuer à une difficulté de mémoire, mais ce diagnostic n'est pas confirmé
sur le téléphone. La piste audio PCM décodée reste en mémoire ; cette
amélioration ne garantit pas la lecture de tous les gros fichiers sur tous
les appareils. Le nouveau parcours doit être validé dans le navigateur
Android visé avant de remplacer la production.

Ce ZIP n'a pas été déployé. Préserver la version actuelle et tester 1.0.2 sur
une prévisualisation Vercel, puis ouvrir la prévisualisation sur le téléphone
et importer la vidéo fournie. Un test d'activation Pro reste également utile.

Source du lecteur : https://github.com/gpac/mp4box.js (BSD-3-Clause,
licence incluse). Il est fourni localement ; aucun service supplémentaire
et aucun compte payant ne sont nécessaires pour ce lecteur.
