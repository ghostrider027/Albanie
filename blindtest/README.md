# Blind Test des 29

Un blind test à jouer entre amis. L'organisateur connecte son Spotify et lance la musique sur la télé, un ordinateur ou une enceinte. Les joueurs répondent sur leur téléphone : ils scannent un QR code et choisissent un pseudo, sans compte ni appli.

- 1 point pour l'artiste, 1 point pour le titre, +1 au premier qui trouve les deux, 3 essais par morceau.
- Les fautes de frappe, les accents et les « feat. » sont tolérés.
- Deux façons de gérer la musique :
  - **le jeu lance une de tes playlists** : morceaux mélangés, extrait chronométré (20 s à 1 min), départ au hasard dans le morceau si tu veux, réponse affichée avec la pochette, enchaînement automatique ;
  - **tu gères la musique dans Spotify** : le jeu suit ce qui joue et chaque nouveau morceau lance une manche. Ça marche avec n'importe quelle playlist.

Tout tient dans des fichiers statiques, sans serveur. La page de l'organisateur sert d'arbitre : les téléphones s'y connectent directement en pair-à-pair (WebRTC, via [PeerJS](https://peerjs.com)).

## Mise en ligne (une fois)

### 1. Publier la page avec GitHub Pages

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Deploy from a branch**, choisis la branche `main` et le dossier `/ (root)`, puis enregistre.

Au bout d'une minute, le jeu est en ligne à l'adresse :
`https://ghostrider027.github.io/Albanie/blindtest/`

### 2. Créer l'appli Spotify

1. Va sur le [tableau de bord Spotify for Developers](https://developer.spotify.com/dashboard), connecte-toi avec ton compte Spotify **Premium** et clique sur **Create app**.
2. Dans **Redirect URIs**, ajoute l'adresse exacte du jeu, avec la barre oblique finale : `https://ghostrider027.github.io/Albanie/blindtest/`. L'écran de réglage du jeu affiche aussi cette adresse, avec un bouton pour la copier.
3. Coche **Web API** et **Web Playback SDK**, puis enregistre.
4. Copie le **Client ID** depuis **Settings**. Tu as deux options :
   - le coller dans le jeu la première fois que tu cliques sur « J'organise » : il reste enregistré dans ce navigateur ;
   - ou l'écrire dans `config.js` (`window.BT29_CLIENT_ID = "…"`) pour ne plus avoir à le saisir. Ce n'est pas un secret, il peut être public.

## Jouer

1. **L'organisateur** ouvre le jeu sur l'ordinateur branché à la télé, clique sur « J'organise avec Spotify » et se connecte.
2. Il choisit la playlist et l'appareil de lecture : « Ce navigateur » (le son sort de l'ordinateur) ou un appareil Spotify Connect (télé, enceinte, téléphone).
3. **Les joueurs** scannent le QR code affiché, ou ouvrent le site et tapent le code du salon à 4 lettres.
4. On lance la partie. À la fin, « Rejouer avec les mêmes joueurs » remet les scores à zéro sans perdre personne.

Si un joueur recharge sa page ou perd le réseau, il revient automatiquement avec son score. Si l'organisateur recharge la sienne, la partie reprend là où elle en était.

## L'installer comme une appli sur le téléphone

Le jeu s'installe directement depuis le navigateur, sans passer par l'App Store ni le Play Store. Il a alors son icône sur l'écran d'accueil et s'ouvre en plein écran.

- **iPhone (Safari)** : ouvre le jeu, touche **Partager** puis **Sur l'écran d'accueil**.
- **Android (Chrome)** : touche le bouton **Installer l'appli sur ce téléphone** sur l'accueil du jeu, ou passe par le menu ⋮ puis **Installer l'application**.

L'appli sert surtout à jouer. Pour organiser, mieux vaut utiliser le navigateur de l'ordinateur branché à la télé : sur iPhone, la connexion Spotify passe mal depuis une appli installée.

## Bon à savoir

- **Spotify Premium est obligatoire** pour le compte qui crée l'appli Spotify et lance la musique. C'est une règle de Spotify pour les applis personnelles (mode « Development »).
- Seul l'organisateur se connecte à Spotify. En mode Development, Spotify limite l'appli à 5 comptes : si un ami veut organiser avec son propre Spotify, ajoute son e-mail dans **User Management** de l'appli. Les joueurs ne comptent pas.
- **Mode « le jeu lance une playlist »** : Spotify ne laisse lire le contenu que des playlists qui t'appartiennent, ou des playlists collaboratives. Pour une playlist publique, copie ses morceaux dans une playlist à toi, ou utilise le mode « je gère la musique ».
- « Ce navigateur » fonctionne sur ordinateur (Chrome, Edge, Firefox, Safari). Sur téléphone, choisis plutôt un appareil Spotify Connect.
- Le plus fiable, c'est que tout le monde soit sur le même Wi-Fi. Sur certains réseaux d'entreprise ou en 4G, la connexion pair-à-pair peut échouer.
- Garde la page de l'organisateur ouverte et l'écran allumé pendant la partie : c'est elle qui corrige les réponses.

## Tester sans Spotify

- `…/blindtest/?demo` : partie complète sans musique, avec 8 tubes factices. Le titre à fredonner s'affiche chez l'organisateur.
- `…/blindtest/?demo&local` : tout se joue dans un seul navigateur, onglet par onglet (organisateur dans l'un, joueurs dans les autres), sans réseau.
- En local : `python3 -m http.server 8000` à la racine du dépôt, puis ouvre `http://127.0.0.1:8000/blindtest/`. Pour Spotify, ajoute cette adresse en Redirect URI : Spotify refuse `localhost` mais accepte `127.0.0.1`.

## Fichiers

- `index.html`, `style.css`, `app.js` : le jeu
- `config.js` : Client ID Spotify (facultatif)
- `manifest.webmanifest`, `icons/` : installation comme appli sur le téléphone
- `vendor/` : PeerJS 1.5.4 et qrcode-generator 1.4.4, sous licence MIT, inclus pour ne dépendre d'aucun CDN
