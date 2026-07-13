const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Mémoire simple en RAM : suit où en est chaque utilisateur dans une conversation
// à étapes (ex: "on attend son matricule/nom pour le BEPC").
// Limite connue : ça se remet à zéro si le serveur redémarre (acceptable pour un usage perso).
const userStates = {};

// ---------- 1. VERIFICATION DU WEBHOOK ----------
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
    res.status(200).send('EVENT_RECEIVED');

    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userText = event.message.text.trim();
        handleMessage(senderId, userText).catch((err) =>
          console.error('Erreur handleMessage:', err)
        );
      }
    }
  } else {
    res.sendStatus(404);
  }
});

// ---------- 3. ROUTEUR PRINCIPAL ----------
// Détecte automatiquement l'intention : pas besoin d'écrire "cherche:" ou "corrige:".
const MOTS_CLES_BEPC = /\b(bepc|cepe|resultat|résultat)\b/i;

async function handleMessage(senderId, text) {
  const etat = userStates[senderId];

  // 1) L'utilisateur est en train de répondre à "donne-moi ton matricule/nom"
  if (etat && etat.step === 'attente_matricule') {
    delete userStates[senderId];
    await sendMessage(senderId, `🔍 Recherche de "${text}" en cours...`);
    const resultat = await searchBepc(text);
    await sendMessage(senderId, resultat);
    return;
  }

  // 2) L'utilisateur mentionne le BEPC/CEPE/un résultat -> on lance le formulaire
  if (MOTS_CLES_BEPC.test(text)) {
    userStates[senderId] = { step: 'attente_matricule' };
    await sendMessage(
      senderId,
      '📋 Pour chercher ton résultat, donne-moi ton numéro matricule (ex: 12345678-A12/12) ou ton nom complet (ex: RAKOTOHATRA Fanampiny).'
    );
    return;
  }

  // 3) Sinon : chat général, comme ChatGPT/Gemini
  const reponse = await chatWithGemini(text);
  await sendMessage(senderId, reponse);
}

// ---------- 4. CHAT GENERAL VIA GEMINI ----------
async function chatWithGemini(text, tentative = 1) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text }],
          },
        ],
      }
    );

    const reponse = response.data.candidates[0].content.parts[0].text;
    return reponse.trim();
  } catch (err) {
    const status = err.response?.data?.error?.status;
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * tentative));
      return chatWithGemini(text, tentative + 1);
    }
    console.error('Erreur chat IA:', err.response?.data || err.message);
    return "Désolé, je n'arrive pas à répondre pour le moment. Réessaie dans une minute.";
  }
}

// ---------- 5. RECHERCHE BEPC/CEPE ----------
// ⚠️ À COMPLETER : ce site charge ses résultats en JavaScript (AJAX), donc
// impossible de deviner l'adresse exacte appelée en interne sans l'inspecter.
// Voir les instructions données à côté de ce fichier pour récupérer cette info.
async function searchBepc(query) {
  try {
    // TODO : remplacer par le vrai endpoint une fois identifié, ex:
    // const response = await axios.post('http://102.18.117.117/gre-men/web/app.php/api/recherche', { q: query });

    return "⚠️ La recherche BEPC/CEPE n'est pas encore branchée sur le vrai site — il manque l'adresse exacte de recherche (voir les instructions).";
  } catch (err) {
    console.error('Erreur recherche BEPC:', err.message);
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
