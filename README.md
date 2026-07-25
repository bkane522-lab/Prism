# Prism — extracteur audio

Application web qui extrait et convertit la piste audio d'un fichier vidéo ou audio.
Tout le traitement a lieu dans le navigateur : aucun fichier n'est téléversé.

Version gratuite libre d'accès, version **Prism Pro** déverrouillée par une clé de licence Gumroad
(achat unique, 19 €).

---

## Sommaire

1. [Ce que fait chaque version](#ce-que-fait-chaque-version)
2. [Structure du dépôt](#structure-du-dépôt)
3. [Installation locale](#installation-locale)
4. [Déploiement sur Vercel](#déploiement-sur-vercel)
5. [Configuration Gumroad](#configuration-gumroad)
6. [Comment fonctionne le verrouillage Pro](#comment-fonctionne-le-verrouillage-pro)
7. [Mode hors ligne](#mode-hors-ligne)
8. [Limites connues](#limites-connues)
9. [Checklist de tests avant publication](#checklist-de-tests-avant-publication)
10. [Conformité](#conformité)

---

## Ce que fait chaque version

### Gratuit

- Import d'un fichier audio ou vidéo depuis l'appareil (ou depuis un lien direct vers un fichier média)
- Prévisualisation : forme d'onde, lecture de la sélection
- Découpe d'un extrait (début / fin)
- Export MP3 et WAV, avec choix du débit, de l'échantillonnage et des canaux
- Une extraction à la fois

### Prism Pro — 19 €, achat unique

- Fondus d'entrée et de sortie réglables de 0 à 10 s
- Normalisation du volume (crête à −1 dBFS)
- Création de plusieurs extraits sur une même source
- Export individuel et téléchargement groupé en `.zip`
- Format MP4/M4A en plus du MP3 et du WAV, quand le navigateur le permet
- Usage hors ligne et installation en PWA
- Activation par l'e-mail d'achat Gumroad, mémorisation locale, bouton pour changer de compte

---

## Structure du dépôt

```
prism/
├── api/
│   └── license.js              Fonction Vercel : vérifie la clé Gumroad, renvoie le module Pro
├── private/
│   └── pro.js                  Code des fonctions Pro — JAMAIS servi en statique
├── public/
│   ├── index.html              L'application entière (HTML + CSS + JS gratuit)
│   ├── sw.js                   Service worker (hors ligne, activé côté Pro seulement)
│   ├── manifest.webmanifest    Manifeste PWA
│   ├── icons/
│   │   ├── icon.svg
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   └── icon-maskable-512.png
│   └── vendor/                 (facultatif) déposer ici lame.min.js pour un MP3 hors ligne
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

`private/` est en dehors de `public/` : Vercel ne le sert pas en statique.
Il est embarqué dans la fonction serverless grâce à `includeFiles` dans `vercel.json`.

---

## Installation locale

Prérequis : Node 20 ou plus.

```bash
npm i -g vercel          # une seule fois
git clone <ton-dépôt> prism
cd prism
cp .env.example .env.local     # puis renseigne les deux variables Gumroad
vercel dev
```

`vercel dev` sert `public/` et exécute `api/license.js`, donc l'activation Pro est testable en local
sur `http://localhost:3000`.

Pour tester **seulement la version gratuite**, un simple serveur statique suffit :

```bash
cd public && python3 -m http.server 8000
```

Ne double-clique pas sur `index.html` : en `file://`, le chargement par lien et le service worker
sont bloqués par le navigateur.

---

## Déploiement sur Vercel

1. Pousse le dépôt sur GitHub.
2. Sur Vercel : **Add New → Project**, importe le dépôt.
3. Framework Preset : **Other**. Build Command : vide. Output Directory : `public`.
4. **Settings → Environment Variables**, pour les trois environnements (Production, Preview, Development) :

   | Nom | Valeur | Obligatoire |
   |---|---|---|
   | `GUMROAD_ACCESS_TOKEN` | jeton d'accès Gumroad (Settings → Advanced → Applications) | oui |
   | `GUMROAD_PRODUCT_PERMALINK` | le code du lien produit, ex. `tgmmus` dans `bkane522.gumroad.com/l/tgmmus` | oui |

5. Deploy. Vérifie ensuite que `https://ton-domaine/private/pro.js` renvoie bien **404** :
   si ce fichier est accessible, le verrouillage ne sert à rien.

À chaque modification de `private/pro.js`, il faut redéployer : la fonction lit le fichier au démarrage
et garde le contenu en mémoire.

---

## Configuration Gumroad

1. Crée le produit : **Digital product**, prix **19 €**, paiement unique, puis publie-le.
2. Dans l'onglet **Contenu**, mets le texte que reçoit l'acheteur — le lien vers Prism et la
   consigne : « Saisis l'e-mail de ton achat dans la section Prism Pro, en bas de la page ».
3. Génère un jeton d'accès : **Settings → Advanced → Applications**. Crée une application
   (Redirect URI : `http://127.0.0.1`, sa valeur n'a pas d'importance ici), puis
   **Generate access token**. Ce jeton vaut mot de passe : il ne va que dans Vercel.
4. Relève le code de ton lien produit (`tgmmus` dans `bkane522.gumroad.com/l/tgmmus`).
5. Renseigne `GUMROAD_ACCESS_TOKEN` et `GUMROAD_PRODUCT_PERMALINK` dans Vercel, puis redéploie.

L'API utilisée est `GET /v2/products` (une fois, pour résoudre l'identifiant du produit) puis
`GET /v2/sales` filtré par produit et par e-mail.

## Comment fonctionne le verrouillage Pro

Prism est un fichier HTML public : tout ce qu'il contient est lisible par n'importe qui.
Un test `if (isPro)` écrit dans la page se contourne en quelques secondes. Le code Pro n'est donc
jamais présent dans la page tant qu'un achat n'est pas prouvé :

1. L'acheteur saisit l'e-mail de son achat, la page appelle `POST /api/license`.
2. La fonction serverless interroge les ventes Gumroad avec le jeton d'accès, qui ne quitte
   jamais le serveur, et vérifie qu'une vente existe pour ce produit et cet e-mail, sans
   remboursement ni litige.
3. Si c'est bon, la réponse contient le **texte** de `private/pro.js`, exécuté par la page.
4. L'e-mail et le code sont conservés en `localStorage` pour que l'application fonctionne hors
   ligne ensuite. Une revérification silencieuse a lieu au bout de 14 jours : si l'achat a été
   remboursé, tout est effacé automatiquement.

Le bouton **Changer** vide le stockage local et retire les fonctions Pro immédiatement.

Ce que ce système protège et ce qu'il ne protège pas : il empêche qu'on récupère le code Pro sans
avoir acheté, et il coupe l'accès en cas de remboursement. Il n'empêche pas un acheteur de
communiquer son adresse à un ami, ni un acheteur déterminé de copier le code Pro depuis son propre
navigateur. Une limite de 12 tentatives par IP toutes les 10 minutes freine les essais d'adresses
au hasard. Pour un produit à 19 €, c'est le bon compromis ; verrouiller davantage coûterait plus
cher en complexité que ce que ça rapporterait.

Messages renvoyés par l'API, tous traduits dans l'interface :

| `reason` | Statut HTTP | Message affiché |
|---|---|---|
| — | 200 | Prism Pro est actif. |
| `invalid` | 400 | Cette adresse e-mail n'est pas valide. |
| `notfound` | 403 | Aucun achat trouvé pour cette adresse. Utilise l'e-mail indiqué sur ton reçu Gumroad. |
| `refunded` | 403 | Cet achat a été remboursé : Prism Pro n'est plus actif. |
| `toomany` | 429 | Trop de tentatives. Réessaie dans quelques minutes. |
| `config` | 500 | Vérification non configurée côté serveur. Contacte le support. |
| `offline` | 502 | Serveur injoignable. Réessaie quand tu seras en ligne. |

## Mode hors ligne

Le service worker n'est enregistré **qu'après activation d'une licence**. Il met en cache
l'application, les icônes et l'encodeur MP3.

L'encodeur MP3 (`lamejs`) est chargé dans cet ordre : `/vendor/lame.min.js`, puis deux CDN.
Pour un hors-ligne complet et indépendant des CDN, télécharge `lame.min.js` (lamejs 1.2.x)
et place-le dans `public/vendor/`. Sans lui, le MP3 dépend du cache du service worker ;
le WAV, lui, fonctionne toujours.

---

## Limites connues

- **Décodage** : Prism s'appuie sur les codecs du navigateur. MP4/AAC, WebM, MP3, WAV, OGG passent
  partout ; certains MKV ou pistes AC-3 sont refusés. Le message d'erreur le dit clairement.
- **MP4/M4A** : encodé par `MediaRecorder`, donc **en temps réel** (une minute d'audio = une minute
  d'attente) et seulement là où `audio/mp4` est pris en charge (Safari, Chrome récent sur Android).
  Ailleurs, le bouton est désactivé.
- **Gros fichiers** : le décodage charge tout en mémoire. Au-delà d'environ 1 h d'audio sur mobile,
  l'onglet peut manquer de mémoire.
- **ZIP** : archive sans compression (méthode « stored »), ce qui est le bon choix pour des fichiers
  audio déjà compressés.
- **Liens** : seuls les liens directs vers un fichier média sont acceptés, et uniquement si le serveur
  distant autorise le CORS.

---

## Checklist de tests avant publication

### Version gratuite

- [ ] Ouvrir le site sur mobile et sur ordinateur : la page s'affiche, l'heure et le titre apparaissent.
- [ ] **Choisir un fichier** ouvre bien le sélecteur (test sur Android Chrome et iOS Safari).
- [ ] **Parcourir tous les fichiers** affiche aussi les `.wav` qui n'apparaissent pas dans la vue Musique.
- [ ] Glisser-déposer un MP4 sur ordinateur : l'onde s'affiche, la durée est correcte.
- [ ] Lecture : le bouton ▶ joue la sélection, le curseur avance, ❚❚ arrête.
- [ ] Déplacer début et fin : les libellés changent, l'onde s'assombrit hors sélection.
- [ ] Export **MP3** : le fichier se télécharge et se lit dans un lecteur externe.
- [ ] Export **WAV** : idem, taille cohérente (environ 10 Mo par minute en 44,1 kHz stéréo).
- [ ] Changer échantillonnage et canaux : le fichier produit respecte les réglages.
- [ ] Coller un lien YouTube : message « page de streaming », pas d'erreur technique.
- [ ] Coller un lien direct vers un MP3 public : le fichier se charge.
- [ ] Coller une adresse sans extension média : message d'erreur clair.
- [ ] Déposer un fichier non décodable (`.txt` renommé) : message clair, pas de plantage.

### Activation Pro

- [ ] Les zones Traitement et Extraits multiples sont grisées ; un clic dessus fait défiler vers l'achat.
- [ ] Adresse jamais utilisée : « Aucun achat trouvé pour cette adresse. »
- [ ] Adresse mal formée : message d'adresse invalide.
- [ ] Vraie adresse d'achat (fais-toi un achat de test avec un code promo 100 %) : « Prism Pro est actif. »
- [ ] Après activation, les zones Pro se déverrouillent et le bouton MP4 devient actif si le navigateur le permet.
- [ ] Recharger la page : Prism Pro reste actif sans redemander l'adresse.
- [ ] **Changer** : les fonctions Pro disparaissent immédiatement, l'adresse n'est plus mémorisée.
- [ ] Rembourser l'achat de test dans Gumroad, effacer `prism.lic.at` du localStorage, recharger :
      l'accès se coupe avec le bon message.
- [ ] Saisir treize fois de suite une adresse au hasard : le message « Trop de tentatives » apparaît.
- [ ] Couper le réseau et recharger : Prism Pro reste actif (pas de coupure hors ligne).
- [ ] Vérifier que `https://ton-domaine/private/pro.js` renvoie 404.
- [ ] Vérifier dans l'onglet Réseau qu'aucune réponse ne contient le jeton d'accès Gumroad.

### Fonctions Pro

- [ ] Fondu d'entrée 2 s : le début monte progressivement, sans clic.
- [ ] Fondu de sortie 2 s : la fin descend proprement.
- [ ] Normalisation sur un extrait faible : le volume monte au niveau des autres.
- [ ] Ajouter trois extraits : ils s'affichent dans la liste et se dessinent sur l'onde.
- [ ] Retirer un extrait : la liste se renumérote.
- [ ] **Tout exporter en .zip** : l'archive s'ouvre, contient le bon nombre de fichiers, tous lisibles,
      les accents dans les noms sont corrects.
- [ ] Export MP4 sur un appareil compatible : le fichier `.m4a` se lit.
- [ ] Sur un navigateur sans `audio/mp4` : le bouton MP4 est bien désactivé.

### PWA

- [ ] Après activation, **Installer l'application** apparaît (Android/Chrome desktop).
- [ ] Une fois installée, l'app s'ouvre en plein écran avec la bonne icône.
- [ ] En mode avion, l'app se lance et l'export WAV fonctionne.

### Avant d'annoncer

- [ ] Page Gumroad : prix, description, mention « fonctionne dans le navigateur, rien à installer ».
- [ ] Acheter soi-même le produit une fois pour vérifier tout le parcours e-mail → clé → activation.
- [ ] Prévoir une adresse de support et la mettre sur la page Gumroad.

---

## Conformité

Prism s'utilise uniquement avec des fichiers personnels, autorisés ou libres de droits.
L'application ne contourne aucune protection technique (DRM) et n'annonce aucune prise en charge
des plateformes de streaming protégées : les adresses YouTube, Spotify, Deezer, SoundCloud, TikTok,
Instagram, Netflix et assimilées sont explicitement refusées par le champ de lien.
Seules les URL pointant directement vers un fichier média sont acceptées.

Cette mention figure aussi dans l'interface, en bas de page. Garde-la : c'est ce qui distingue
un outil de conversion légitime d'un outil de contournement.
