# Mon Bot Messenger

Bot Messenger avec correction de texte (IA) et recherche sur un site externe.

## Installation locale

```bash
npm install
cp .env.example .env
# puis remplis .env avec tes vraies valeurs
npm start
```

## Déploiement gratuit (Render.com)

1. Pousse ce dossier sur un dépôt GitHub.
2. Sur Render.com → "New" → "Web Service" → connecte ton repo.
3. Build command : `npm install`
4. Start command : `npm start`
5. Dans "Environment", ajoute les variables : `VERIFY_TOKEN`, `PAGE_ACCESS_TOKEN`, `GEMINI_API_KEY`.
6. Une fois déployé, Render te donne une URL du type `https://ton-bot.onrender.com`.

## Configuration du webhook Meta

Dans le tableau de bord de ton app Meta (produit Messenger > Webhooks) :
- URL de rappel : `https://ton-bot.onrender.com/webhook`
- Verify Token : la même valeur que `VERIFY_TOKEN` dans ton `.env`
- Abonne-toi au champ `messages`

## Commandes du bot (à adapter)

- `corrige: ton texte ici` → corrige l'orthographe/grammaire via Gemini
- `cherche: ce que tu cherches` → cherche sur le site ciblé (voir `searchSite()` dans `index.js`)

## ⚠️ À adapter avant utilisation

La fonction `searchSite()` dans `index.js` est un gabarit générique.
Il faut l'adapter au vrai site que tu cibles :
1. Ouvre le site dans un navigateur, ouvre les DevTools (F12) > onglet "Réseau".
2. Fais une recherche sur le site et regarde quelle requête est envoyée (URL, méthode GET/POST, paramètres).
3. Remplace l'URL et les paramètres dans `searchSite()` en conséquence.
4. Adapte le sélecteur CSS (`table tr`, `td`) selon la structure HTML réelle de la page de résultats.
