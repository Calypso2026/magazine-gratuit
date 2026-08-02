# Le Fichier — bibliothèque numérique du domaine public

Site complet (inscription, connexion, catégories, fiches livres, commentaires,
formulaire de contact, reCAPTCHA, sécurité de base) pour présenter des œuvres
**du domaine public** : livres classiques, contes et magazines/journaux anciens.
Aucun fichier protégé n'est hébergé — chaque fiche renvoie vers une source
légale (Projet Gutenberg, Gallica/BnF).

## Stack

- **Backend** : Node.js pur (module `http` natif, aucune dépendance externe) +
  stockage JSON fichier. Aucun `npm install` nécessaire.
- **Frontend** : React 18 + Babel Standalone chargés depuis un CDN (aucun
  bundler requis), HTML/CSS responsive.

## Démarrer en local

```bash
cd backend
node server.js
```

Puis ouvrir http://localhost:3000

Le premier compte créé via `/inscription` devient automatiquement administrateur
(rôle `admin`) et peut consulter les messages du formulaire de contact sur `/admin`.

## Configuration reCAPTCHA

Le projet utilise par défaut les **clés de test officielles de Google**
(elles valident toujours et ne doivent servir qu'en développement) :

- Site key : `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`
- Secret key : `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`

Pour la production, crée tes propres clés reCAPTCHA v2 ("Case à cocher") sur
https://www.google.com/recaptcha/admin puis lance le serveur avec :

```bash
RECAPTCHA_SITE_KEY=ta_site_key RECAPTCHA_SECRET_KEY=ta_secret_key node server.js
```

## Sécurité déjà en place

- Mots de passe hachés avec `scrypt` + sel aléatoire, comparaison en temps constant.
- Sessions par cookie `HttpOnly` (+ `Secure` en production), expiration 7 jours.
- Protection CSRF (jeton double-cookie, vérifié sur toutes les requêtes qui modifient des données).
- Limitation de débit (rate limiting) par IP sur l'inscription, la connexion, le contact et les commentaires.
- Échappement HTML systématique du contenu généré par les utilisateurs (commentaires, messages) pour empêcher les injections XSS.
- En-têtes de sécurité : `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Validation stricte des entrées (longueurs, format e-mail) côté serveur (jamais uniquement côté client).

### Pour aller plus loin en production

- Servir le site derrière HTTPS (reverse proxy Nginx/Caddy + certificat Let's Encrypt), et lancer avec `NODE_ENV=production` pour activer les cookies `Secure` et l'en-tête HSTS.
- Remplacer le stockage JSON par une vraie base de données (PostgreSQL/SQLite) si le trafic grandit.
- Ajouter l'envoi d'e-mail réel pour le formulaire de contact (ex. Nodemailer + SMTP) — actuellement les messages sont stockés et visibles dans `/admin`.
- Ajouter une politique de mots de passe encore plus stricte et une confirmation d'e-mail.

## Arborescence

```
backend/
  server.js          → serveur HTTP + toutes les routes API
  lib/db.js           → lecture/écriture de la base JSON
  lib/security.js      → hachage, CSRF, rate-limit, reCAPTCHA, échappement
  lib/auth.js          → gestion des sessions
  data/db.json         → "base de données" (catégories, livres, utilisateurs, commentaires, messages)
frontend/
  index.html
  css/style.css
  js/app.js            → application React (routage par hash, pages, formulaires)
```

## Personnaliser le catalogue

Édite `backend/data/db.json` : ajoute des entrées dans `categories` et `books`
(chaque livre pointe vers une source externe légale plutôt que d'héberger un
fichier — à toi d'ajouter tes propres œuvres du domaine public ou vos
publications avec autorisation).
