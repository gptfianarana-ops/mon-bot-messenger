const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ---------- 1. VERIFICATION DU WEBHOOK (Meta appelle ça une seule fois) ----------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook vérifié');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ---------- 2. RECEPTION DES MESSAGES ----------
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('Webhook reçu:', JSON.stringify(body));

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userText = event.message.text.trim();
        await handleMessage(senderId, userText);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// ---------- 3. ROUTEUR DE COMMANDES ----------
// Adapte ces mots-clés selon ce que tu veux comme commandes.
// Exemple : "corrige: bonjour comment tu va" ou "cherche: Lovasoa"
async function handleMessage(senderId, text) {
  const lower = text.toLowerCase();

  if (lower.startsWith('corrige:') || lower.startsWith('corrige :')) {
    const toCorrect = text.split(':').slice(1).join(':').trim();
    await sendMessage(senderId, '⏳ Correction en cours...');
    const corrected = await correctText(toCorrect);
    await sendMessage(senderId, `✅ Texte corrigé :\n${corrected}`);
    return;
  }

  if (lower.startsWith('cherche:') || lower.startsWith('cherche :')) {
    const query = text.split(':').slice(1).join(':').trim();
    await sendMessage(senderId, `🔍 Recherche de "${query}" en cours...`);
    const result = await searchSite(query);
    await sendMessage(senderId, result);
    return;
  }

  // Message par défaut si aucune commande reconnue
  await sendMessage(
    senderId,
    "Salut ! Voici ce que je sais faire :\n\n" +
    "📝 Corrige un texte : écris \"corrige: ton texte ici\"\n" +
    "🔍 Cherche un résultat : écris \"cherche: ce que tu cherches\""
  );
}

// ---------- 4. CORRECTION DE TEXTE VIA GEMINI ----------
async function correctText(text) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Corrige uniquement l'orthographe et la grammaire du texte suivant. Renvoie SEULEMENT le texte corrigé, sans aucune explication ni introduction :\n\n"${text}"`,
              },
            ],
          },
        ],
      }
    );

    const corrected = response.data.candidates[0].content.parts[0].text;
    return corrected.trim();
  } catch (err) {
    console.error('Erreur correction IA:', err.response?.data || err.message);
    return "Désolé, je n'ai pas pu corriger le texte pour le moment.";
  }
}

// ---------- 5. RECHERCHE SUR UN SITE (SCRAPING) ----------
// ⚠️ Cette fonction est un GABARIT à adapter selon le site que tu cibles.
// Il faut inspecter (DevTools > Réseau) comment le formulaire du site envoie
// sa requête de recherche pour remplacer l'URL et les paramètres ci-dessous.
async function searchSite(query) {
  try {
    // Exemple générique : adapte l'URL et la méthode (GET/POST) au vrai site
    const response = await axios.get('https://exemple-site.com/recherche', {
      params: { q: query },
    });

    const $ = cheerio.load(response.data);
    const resultats = [];

    // Exemple : parcourir les lignes d'un tableau de résultats
    $('table tr').each((i, el) => {
      const nom = $(el).find('td').eq(0).text().trim();
      if (nom && nom.toLowerCase().includes(query.toLowerCase())) {
        resultats.push(nom);
      }
    });

    if (resultats.length === 0) {
      return `❌ Introuvable\n🔍 Recherche : "${query}"\nAucun résultat trouvé.`;
    }

    return `✅ Résultat(s) trouvé(s) pour "${query}" :\n${resultats.join('\n')}`;
  } catch (err) {
    console.error('Erreur recherche:', err.message);
    return "Désolé, la recherche a échoué. Réessaie plus tard.";
  }
}

// ---------- 6. ENVOI DE MESSAGE VIA L'API MESSENGER ----------
async function sendMessage(recipientId, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: { text },
      }
    );
  } catch (err) {
    console.error('Erreur envoi message:', err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
