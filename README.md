# playSURE Training v5

## Patch v5

- Nouvelle image de fond de connexion : `public/assets/login-bg.png`.
- Refonte de l’écran login : fond plein écran, carte glass, contraste bleu/orange.
- Suppression du `package-lock.json` du zip pour éviter les URLs de registry internes.


Refonte Vite + React + Tailwind + Netlify Functions, avec stockage Netlify Blobs.

## Stockage Netlify Blobs

Store utilisé par défaut : `psm`.

Structure demandée :

```text
psm/
  Sessions/
    <user>.json
  Stats/
    <user>.json
```

`Sessions/<user>.json` contient le compte joueur :

```json
{
  "username": "playsure",
  "displayName": "playSURE",
  "passwordHash": "pbkdf2:sha256:...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`Stats/<user>.json` contient le suivi :

```json
{
  "username": "playsure",
  "displayName": "playSURE",
  "weapons": [
    { "id": "m4a4", "label": "M4A4", "base": true, "createdAt": null },
    { "id": "m4a1s", "label": "M4A1-S", "base": true, "createdAt": null },
    { "id": "ak47", "label": "AK47", "base": true, "createdAt": null }
  ],
  "entries": [
    { "date": "2026-06-29", "time": "19:42:10", "weaponId": "ak47", "weapon": "AK47", "kpm": 87.5 }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

Les anciennes clés `auth:<user>` et `data:<user>` sont lues en fallback et recopiées vers `Sessions/<user>.json` / `Stats/<user>.json` au prochain accès ou à la création forcée.

## Fonctionnel

- Plus de whitelist `players.json`.
- Création utilisateur via script PowerShell local.
- Rétention des données : 180 jours.
- Armes de base : `M4A4`, `M4A1-S`, `AK47`.
- Ajout et suppression d'armes par joueur.
- Les armes ajoutées sont stockées dans `Stats/<user>.json`.
- Graphique :
  - `Tous` : une courbe par arme.
  - `Global` : moyenne de toutes les armes.
- Échelle Y dynamique : min KPM -15 / max KPM +15.
- Filtres : semaine, 15aine, mois, 2 mois, 3 mois.
- Exports : JSON et CSV.
- Suppression d'une journée complète.

## Installation propre

Si tu as déjà tenté un `npm install` foireux :

```powershell
rd /s /q node_modules 2>$null
del package-lock.json 2>$null
npm cache verify
npm install
```

Build :

```powershell
npm run build
```

Si `tsc` n'est pas reconnu, c'est que `npm install` n'a pas fini correctement. Le script `build` appelle le TypeScript local installé dans `node_modules/.bin`, pas un `tsc` global.

## Variables Netlify

À définir dans Netlify > Site configuration > Environment variables :

```text
ADMIN_TOKEN=<un token admin long>
SESSION_SECRET=<un secret long pour signer les sessions>
BLOB_STORE=psm
```

`BLOB_STORE` est optionnel. Sans valeur, le store `psm` est utilisé.

## Créer un utilisateur

Déploiement Netlify :

```powershell
$env:PSM_ADMIN_TOKEN="TON_ADMIN_TOKEN"
.\scripts\add-user.ps1 -Username "playSURE" -Password "MonPassword123" -SiteUrl "https://ton-site.netlify.app"
```

Dev local avec Netlify :

```powershell
$env:ADMIN_TOKEN="dev-admin-token"
$env:SESSION_SECRET="dev-session-secret"
npm run dev:netlify
```

Puis, dans un autre terminal :

```powershell
.\scripts\add-user.ps1 -Username "playSURE" -Password "MonPassword123" -SiteUrl "http://localhost:8888" -AdminToken "dev-admin-token"
```

Pour remplacer le password :

```powershell
.\scripts\add-user.ps1 -Username "playSURE" -Password "NouveauPassword123" -SiteUrl "https://ton-site.netlify.app" -AdminToken "TON_ADMIN_TOKEN" -Force
```

## Développement front seul

```powershell
npm run dev
```

Le front seul ne suffit pas pour tester les fonctions Netlify. Pour tester login, sauvegarde et blobs, utilise :

```powershell
npm run dev:netlify
```

## Déploiement

Netlify utilise :

```text
build command: npm run build
publish: dist
functions: netlify/functions
```

La configuration est déjà dans `netlify.toml`.


## V6 - Login screen

Écran de connexion recentré : badge CS2 en haut, titre playSURE Training sur une seule ligne, suppression des textes marketing et suppression du texte explicatif dans la carte. Le script `scripts/add-user.ps1` reste le seul point de création utilisateur côté local, via la fonction Netlify `admin-user` et les Blobs `Sessions/` + `Stats/`.
