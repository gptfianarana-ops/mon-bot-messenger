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
    await sendMessage(senderId, `🔎 Recherche de "${text}" en cours, un instant...`);
    const resultat = await searchBepc(text, etat.typeExam);
    await sendMessage(senderId, resultat);
    return;
  }

  // 2) L'utilisateur mentionne le BEPC/CEPE/un résultat -> on lance le formulaire
  if (MOTS_CLES_BEPC.test(text)) {
    const typeExam = /cepe/i.test(text) ? 'cepe' : 'bepc';
    userStates[senderId] = { step: 'attente_matricule', typeExam };
    await sendMessage(
      senderId,
      `🎓 Résultats ${typeExam.toUpperCase()} 2026\n\nDonne-moi ton numéro matricule (ex: 12345678-A12/12) ou ton nom complet (ex: RAKOTOHATRA Fanampiny), et je te dis tout de suite si tu es admis(e) ! ✨`
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
// Endpoint réel découvert en inspectant le site (POST vers ajaxres-cb.html
// avec etype/typeRc/mle, comme fait le JS du site lui-même).
async function searchBepc(query, typeExam = 'bepc') {
  const valeur = query.trim();
  // Une valeur qui contient un tiret suivi de lettres/chiffres ressemble à un matricule,
  // sinon on considère que c'est une recherche par nom.
  const matriculeReg = /^\d{3}[0-9A-Z]{0,2}\d{5}-[A-Z]?\d{2}\/\d{2}(-\d{0,2})?$/;
  const typeRc = matriculeReg.test(valeur) ? 'mle' : 'nom';

  try {
    const response = await axios.post(
      'http://102.18.117.117/gre-men/web/app.php/ajaxres-cb.html',
      new URLSearchParams({ etype: typeExam, typeRc, mle: valeur }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );

    const $ = cheerio.load(response.data);
    const resultats = [];

    $('tr').each((i, el) => {
      const cols = $(el).find('td');
      if (cols.length >= 4) {
        resultats.push({
          matricule: $(cols[0]).text().trim(),
          nom: $(cols[1]).text().trim(),
          province: $(cols[2]).text().trim(),
          observation: $(cols[3]).text().trim(),
        });
      }
    });

    if (resultats.length === 0) {
      return `🔍❌ *Introuvable*\n\nRecherche : "${valeur}" (${typeExam.toUpperCase()})\n\nAucun candidat trouvé avec cette information. Vérifie l'orthographe ou le format du matricule et réessaie.`;
    }

    return resultats.map((r) => formatResultat(r, typeExam)).join('\n\n━━━━━━━━━━━━\n\n');
  } catch (err) {
    console.error('Erreur recherche BEPC:', err.message);
    return "Désolé, la recherche a échoué (le site est peut-être indisponible). Réessaie plus tard.";
  }
}

// Met en forme un résultat individuel, avec un ton festif si admis(e).
function formatResultat(r, typeExam = 'bepc') {
  const obs = (r.observation || '').toUpperCase();
  const estAdmis = obs.includes('ADMIS');

  if (estAdmis) {
    return (
      `🎉🎊 Félicitation ${r.nom}, vous êtes admis(e) au ${typeExam.toUpperCase()} ! 🎊🎉\n\n` +
      `📌 Matricule : ${r.matricule}\n` +
      `📍 Province : ${r.province}\n` +
      `✅ Observation : ${r.observation}\n\n` +
      `Alefaso ny arrosage 😄🥳`
    );
  }

  return (
    `📋 Résultat trouvé\n\n` +
    `👤 ${r.nom}\n` +
    `📝 Observation : ${r.observation}\n` +
    `📌 Matricule : ${r.matricule}\n` +
    `📍 Province : ${r.province}\n\n` +
    `💪 Courage — la réussite se construit avec de la persévérance.`
  );
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
