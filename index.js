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

// ============================================================
// 1. VERIFICATION DU WEBHOOK
// ============================================================
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

// ============================================================
// 2. RECEPTION DES MESSAGES
// ============================================================
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('Webhook reçu:', JSON.stringify(body));

  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');

    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      // Texte tapé librement (peut contenir un quick_reply.payload si l'utilisateur
      // a appuyé sur un bouton de suggestion)
      if (event.message && event.message.text) {
        const payload = event.message.quick_reply?.payload;
        const userText = event.message.text.trim();
        handleEvent(senderId, payload || userText, !!payload).catch((err) =>
          console.error('Erreur handleEvent:', err)
        );
      }

      // Clic sur un bouton du menu persistant / bouton "Get Started"
      if (event.postback && event.postback.payload) {
        handleEvent(senderId, event.postback.payload, true).catch((err) =>
          console.error('Erreur handleEvent (postback):', err)
        );
      }
    }
  } else {
    res.sendStatus(404);
  }
});

// ============================================================
// 3. LE MENU PRINCIPAL (boutons de suggestion / Quick Replies)
// ============================================================
const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '📝 Corriger un texte', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🎓 Résultats examens', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '📚 Exercices', payload: 'MENU_EXERCICES' },
  { content_type: 'text', title: '🌐 Traducteur', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Discuter librement', payload: 'MENU_CHAT' },
];

async function envoyerMenu(senderId, texteIntro) {
  await sendMessage(
    senderId,
    texteIntro || '👋 Salut ! Que veux-tu faire ?',
    MENU_QUICK_REPLIES
  );
}

// ============================================================
// 4. ROUTEUR PRINCIPAL
// ============================================================
const MOTS_CLES_BEPC = /\b(bepc|cepe|resultat|résultat)\b/i;
const MOTS_CLES_MENU = /^(menu|aide|help|salut|bonjour|bonsoir|hello|coucou)$/i;

async function handleEvent(senderId, texteOuPayload, estUnBouton) {
  const etat = userStates[senderId];

  // ---------- A. L'utilisateur est au milieu d'un flux à étapes ----------
  if (etat) {
    switch (etat.step) {
      case 'attente_matricule': {
        delete userStates[senderId];
        await sendTyping(senderId, true);
        const resultat = await searchBepc(texteOuPayload, etat.typeExam);
        await sendTyping(senderId, false);
        await sendMessage(senderId, resultat);
        return envoyerMenu(senderId, 'Autre chose ?');
      }
      case 'attente_correction': {
        delete userStates[senderId];
        await sendTyping(senderId, true);
        const corrige = await correctText(texteOuPayload);
        await sendTyping(senderId, false);
        await sendMessage(senderId, `✅ Texte corrigé :\n\n${corrige}`);
        return envoyerMenu(senderId, 'Autre chose ?');
      }
      case 'attente_traduction_langue': {
        userStates[senderId] = { step: 'attente_traduction_texte', langue: texteOuPayload };
        await sendMessage(senderId, `Ok, envoie-moi le texte à traduire en ${texteOuPayload} :`);
        return;
      }
      case 'attente_traduction_texte': {
        const { langue } = etat;
        delete userStates[senderId];
        await sendTyping(senderId, true);
        const traduction = await chatWithGemini(
          `Traduis le texte suivant en ${langue}. Réponds uniquement avec la traduction, sans explication :\n\n"${texteOuPayload}"`
        );
        await sendTyping(senderId, false);
        await sendMessage(senderId, `🌐 Traduction (${langue}) :\n\n${traduction}`);
        return envoyerMenu(senderId, 'Autre chose ?');
      }
      case 'attente_exercice_sujet': {
        delete userStates[senderId];
        await sendTyping(senderId, true);
        const exercice = await chatWithGemini(
          `Crée un court exercice scolaire (avec sa correction en dessous, séparée par "---CORRECTION---") sur le sujet suivant, adapté à un élève : "${texteOuPayload}". Reste concis.`
        );
        await sendTyping(senderId, false);
        await sendMessage(senderId, `📚 Exercice :\n\n${exercice}`);
        return envoyerMenu(senderId, 'Autre chose ?');
      }
    }
  }

  // ---------- B. Boutons du menu principal ----------
  if (texteOuPayload === 'MENU_RESULTATS' || MOTS_CLES_BEPC.test(texteOuPayload)) {
    const typeExam = /cepe/i.test(texteOuPayload) ? 'cepe' : 'bepc';
    userStates[senderId] = { step: 'attente_matricule', typeExam };
    await sendMessage(
      senderId,
      `🎓 Résultats ${typeExam.toUpperCase()} 2026\n\nDonne-moi ton numéro matricule (ex: 12345678-A12/12) ou ton nom complet (ex: RAKOTOHATRA Fanampiny), et je te dis tout de suite si tu es admis(e) ! ✨`
    );
    return;
  }

  if (texteOuPayload === 'MENU_CORRECTION') {
    userStates[senderId] = { step: 'attente_correction' };
    await sendMessage(senderId, '📝 Envoie-moi le texte que tu veux que je corrige (orthographe/grammaire).');
    return;
  }

  if (texteOuPayload === 'MENU_TRADUCTION') {
    userStates[senderId] = { step: 'attente_traduction_langue' };
    await sendMessage(senderId, '🌐 Vers quelle langue veux-tu traduire ? (ex: anglais, malgache, français...)');
    return;
  }

  if (texteOuPayload === 'MENU_EXERCICES') {
    userStates[senderId] = { step: 'attente_exercice_sujet' };
    await sendMessage(senderId, '📚 Sur quel sujet/matière veux-tu un exercice ? (ex: "conjugaison du présent", "fractions 6ème")');
    return;
  }

  if (texteOuPayload === 'MENU_CHAT' || texteOuPayload === 'GET_STARTED' || MOTS_CLES_MENU.test(texteOuPayload)) {
    return envoyerMenu(senderId, '👋 Bienvenue ! Que veux-tu faire ?');
  }

  // ---------- C. Sinon : chat général, comme ChatGPT/Gemini ----------
  await sendTyping(senderId, true);
  const reponse = await chatWithGemini(texteOuPayload);
  await sendTyping(senderId, false);
  await sendMessage(senderId, reponse);
}

// ============================================================
// 5. CHAT GENERAL VIA GEMINI
// ============================================================
async function chatWithGemini(text, tentative = 1) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text }] }] }
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

// ============================================================
// 6. CORRECTION DE TEXTE VIA GEMINI
// ============================================================
async function correctText(text, tentative = 1) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
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
    const status = err.response?.data?.error?.status;
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * tentative));
      return correctText(text, tentative + 1);
    }
    console.error('Erreur correction IA:', err.response?.data || err.message);
    return 'Désolé, le service de correction est très sollicité en ce moment. Réessaie dans une minute.';
  }
}

// ============================================================
// 7. RECHERCHE BEPC/CEPE
// ============================================================
async function searchBepc(query, typeExam = 'bepc') {
  const valeur = query.trim();
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
      if (cols.length >= 5) {
        resultats.push({
          matricule: $(cols[0]).text().trim(),
          nom: $(cols[1]).text().trim(),
          cisco: $(cols[2]).text().trim(),
          ecole: $(cols[3]).text().trim(),
          observation: $(cols[4]).text().trim(),
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

function formatResultat(r, typeExam = 'bepc') {
  const obs = (r.observation || '').toUpperCase();
  const estAdmis = obs.includes('ADMIS') && !obs.includes('NON ADMIS');
  const estAjourne = obs.includes('AJOURNE') || obs.includes('NON ADMIS') || obs.includes('REDOUBL');

  if (estAdmis) {
    return (
      `🎉🎊 Félicitation ${r.nom}, vous êtes admis(e) au ${typeExam.toUpperCase()} ! 🎊🎉\n\n` +
      `📌 Matricule : ${r.matricule}\n` +
      `🏫 École : ${r.ecole}\n` +
      `📍 CISCO : ${r.cisco}\n` +
      `✅ Observation : ${r.observation}\n\n` +
      `Alefaso ny arrosage 😄🥳`
    );
  }

  if (estAjourne) {
    return (
      `📋 Résultat trouvé\n\n` +
      `👤 ${r.nom}\n` +
      `📝 Observation : ${r.observation}\n` +
      `📌 Matricule : ${r.matricule}\n` +
      `🏫 École : ${r.ecole}\n` +
      `📍 CISCO : ${r.cisco}\n\n` +
      `💪 Courage — la réussite se construit avec de la persévérance.`
    );
  }

  return (
    `📋 Candidat trouvé\n\n` +
    `👤 ${r.nom}\n` +
    `📌 Matricule : ${r.matricule}\n` +
    `🏫 École : ${r.ecole}\n` +
    `📍 CISCO : ${r.cisco}\n` +
    `ℹ️ ${r.observation}\n\n` +
    `Le statut (admis ou non) n'est pas encore affiché pour ce candidat sur le site officiel — réessaie plus tard.`
  );
}

// ============================================================
// 8. ENVOI DE MESSAGE / INDICATEUR DE FRAPPE (API Messenger)
// ============================================================
async function sendMessage(recipientId, text, quickReplies) {
  try {
    const message = { text };
    if (quickReplies) message.quick_replies = quickReplies;

    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      { recipient: { id: recipientId }, message }
    );
  } catch (err) {
    console.error('Erreur envoi message:', err.response?.data || err.message);
  }
}

// Affiche ou cache le petit "... est en train d'écrire" natif de Messenger
async function sendTyping(recipientId, actif) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      { recipient: { id: recipientId }, sender_action: actif ? 'typing_on' : 'typing_off' }
    );
  } catch (err) {
    console.error('Erreur sender_action:', err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
