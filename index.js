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

// ============================================================
// MÉTHODOLOGIE DE RÉDACTION (Madagascar)
// À compléter avec les règles précises (intro/développement/conclusion,
// dissertation, commentaire de document, etc.) fournies par l'utilisateur,
// pour que les corrigés suivent fidèlement la méthode enseignée à l'école.
// Tant que c'est vide, l'IA répond avec une structure générale standard.
// ============================================================
const METHODOLOGIE_MADAGASCAR = `
DISSERTATION :
- Introduction : Préambule (accroche générale) ; Annonce du sujet (citer/reformuler le sujet) ; Problématique (question posée) ; Annonce du plan.
- Développement : Explique chaque grande partie annoncée dans le plan. Place une phrase de transition entre les parties.
- Conclusion : Résumé des grandes parties développées ; Elargissement du sujet (ouverture, souvent une question).

COMMENTAIRE DE DOCUMENT :
- Introduction : Présentation de la nature du document ; Présentation du document (intitulé, auteur, titre de l'ouvrage, date d'édition...) ; Idée générale ; Problématique ; Annonce du plan ("pour bien commenter ce document, nous allons expliquer d'abord... puis...").
- Développement : Répond aux questions/indicateurs du sujet, en expliquant chaque partie ET en justifiant avec des citations exactes tirées du texte entre guillemets « ... » (ne jamais changer les mots du document cité). Place une phrase de transition entre les parties.
- Conclusion : Intérêt du document ; Résumé des grandes parties développées (souvent terminé par une question d'ouverture).

MODÈLE DE PHRASES TYPE (à adapter, ne pas recopier mot pour mot) :
- Intro : "Ce document est un [nature du document], extrait de [source], écrit par [auteur]. Il parle de [sujet principal] et met en avant [idée générale]. Pour bien analyser ce texte, nous verrons d'abord [plan 1], puis [plan 2]."
- Conclusion : "En conclusion, ce document explique [récapitulatif des idées principales]. Cela nous permet de mieux comprendre [idée générale] et ouvre une réflexion sur [perspective élargie]."

Le développement peut rester assez concis (pas besoin de faire un essai aussi long que les modèles complets) tant que la structure ci-dessus et les idées essentielles sont respectées.
`;

function consigneMethodologie() {
  if (!METHODOLOGIE_MADAGASCAR.trim()) return '';
  return `\n\nSuis IMPÉRATIVEMENT cette méthodologie de rédaction (celle enseignée à Madagascar) quand la question s'y prête (dissertation, commentaire, etc.) :\n${METHODOLOGIE_MADAGASCAR}`;
}

// Mémoire simple en RAM : mode actif de chaque utilisateur (persiste tant qu'il
// ne choisit pas autre chose ou ne tape pas "menu"). Se remet à zéro si le
// serveur redémarre (acceptable pour un usage perso).
// Formes possibles : { mode: 'resultats', typeExam }
//                     { mode: 'correction' }
//                     { mode: 'traduction', langue }      (langue peut être vide au début)
//                     { mode: 'exercices' }
//                     { mode: 'chat' } ou rien
const userModes = {};

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

      // Photo/image envoyée (ex: fiche d'exercice à corriger)
      const imageAttachment = event.message?.attachments?.find((a) => a.type === 'image');
      if (imageAttachment) {
        handleImageEvent(senderId, imageAttachment.payload.url).catch((err) =>
          console.error('Erreur handleImageEvent:', err)
        );
      } else if (event.message && event.message.text) {
        const payload = event.message.quick_reply?.payload;
        const userText = event.message.text.trim();
        handleEvent(senderId, payload || userText, !!payload).catch((err) =>
          console.error('Erreur handleEvent:', err)
        );
      }

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
// 3. LE MENU PRINCIPAL (Quick Replies)
// ============================================================
const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '📝 Corriger un texte', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🖊️ Corriger un exercice', payload: 'MENU_CORRECTION_EXERCICES' },
  { content_type: 'text', title: '🎓 Résultats examens', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '📚 Exercices', payload: 'MENU_EXERCICES' },
  { content_type: 'text', title: '🌐 Traducteur', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Discuter librement', payload: 'MENU_CHAT' },
];

async function envoyerMenu(senderId, texteIntro) {
  const texte =
    `${texteIntro || '👋 Salut ! Que veux-tu faire ?'}\n\n` +
    `1️⃣ 🎓 Résultats examens\n` +
    `2️⃣ 📝 Corriger un texte\n` +
    `3️⃣ 📚 Exercices\n` +
    `4️⃣ 🌐 Traducteur\n` +
    `5️⃣ 💬 Discuter librement\n` +
    `6️⃣ 🖊️ Corriger un exercice (texte ou photo)\n\n` +
    `(Tape le numéro, ou utilise les boutons ci-dessous si tu les vois)`;
  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}

// Petit bouton à coller sur chaque réponse, pour changer de mode en 1 clic
// sans avoir à taper "menu" à la main.
const BOUTON_MENU = [{ content_type: 'text', title: '🔁 Menu', payload: 'MENU_CHAT' }];

// ============================================================
// 4. ROUTEUR PRINCIPAL — un mode reste actif tant qu'on n'en choisit pas un autre
// ============================================================
const MOTS_CLES_BEPC = /\b(bepc|cepe|resultat|résultat)\b/i;
const MOTS_CLES_MENU = /^(menu|aide|help|salut|bonjour|bonsoir|hello|coucou)$/i;
const MOTS_CLES_CORRECTION = /^(corrige|correction)$/i;
const MOTS_CLES_EXERCICES = /^(exercice|exercices)$/i;
const MOTS_CLES_TRADUCTION = /^(traduire|traduction|traducteur)$/i;
const MOTS_CLES_CHAT = /^(chat|discuter|discussion|discuter librement)$/i;
const MOTS_CLES_CHAT_IA = /^(ia|ai|robot|bot)$/i;
const MOTS_CLES_CHAT_HUMAIN = /^(humain|admin|administrateur|page|personne)$/i;
const MOTS_CLES_CORRECTION_EXERCICES = /^(devoir|devoirs|corriger exercice|correction exercice)$/i;

// Raccourcis numériques (message EXACT uniquement, ex: juste "1"), pratiques
// pour Facebook Lite où les boutons ne s'affichent pas.
const RACCOURCIS_NUM = {
  1: 'MENU_RESULTATS',
  2: 'MENU_CORRECTION',
  3: 'MENU_EXERCICES',
  4: 'MENU_TRADUCTION',
  5: 'MENU_CHAT',
  6: 'MENU_CORRECTION_EXERCICES',
};

async function handleEvent(senderId, texteOuPayload, estUnBouton) {
  // Un message EXACT de "1" à "5" est un raccourci pratique (surtout sur
  // Facebook Lite où les boutons ne s'affichent pas).
  if (!estUnBouton && RACCOURCIS_NUM[texteOuPayload.trim()]) {
    texteOuPayload = RACCOURCIS_NUM[texteOuPayload.trim()];
  }

  // ---------- A. Changement explicite de mode (bouton menu ou mot-clé) ----------
  if (texteOuPayload === 'GET_STARTED' || MOTS_CLES_MENU.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'chat' };
    return envoyerMenu(senderId, '👋 Bienvenue ! Que veux-tu faire ?');
  }

  // "Discuter librement" -> on demande d'abord si c'est avec l'IA ou avec un admin
  if (texteOuPayload === 'MENU_CHAT' || MOTS_CLES_CHAT.test(texteOuPayload)) {
    await sendMessage(
      senderId,
      '💬 Discuter avec qui ?\n\n🤖 L\'IA (réponse automatique instantanée)\n👤 Un administrateur de la Page (réponse manuelle, peut prendre du temps)\n\n(Tape "ia" ou "admin", ou utilise les boutons)',
      [
        { content_type: 'text', title: '🤖 IA', payload: 'CHAT_IA' },
        { content_type: 'text', title: '👤 Admin', payload: 'CHAT_HUMAIN' },
      ]
    );
    return;
  }

  if (texteOuPayload === 'CHAT_IA' || MOTS_CLES_CHAT_IA.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'chat' };
    resetHistorique(senderId);
    await sendMessage(senderId, '🤖 Tu discutes avec l\'IA. Pose-moi tes questions !', BOUTON_MENU);
    return;
  }

  if (texteOuPayload === 'CHAT_HUMAIN' || MOTS_CLES_CHAT_HUMAIN.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'humain' };
    await sendMessage(
      senderId,
      '👤 Un administrateur de la Page va te répondre directement ici. Le bot ne répondra plus automatiquement dans cette conversation.\n\nTape "menu" à tout moment pour reprendre avec le bot.'
    );
    return;
  }

  if (texteOuPayload === 'MENU_RESULTATS' || MOTS_CLES_BEPC.test(texteOuPayload)) {
    const typeExam = /cepe/i.test(texteOuPayload) ? 'cepe' : 'bepc';
    userModes[senderId] = { mode: 'resultats', typeExam };
    await sendMessage(
      senderId,
      `🎓 Mode Résultats ${typeExam.toUpperCase()} activé.\n\nEnvoie-moi un matricule (ex: 12345678-A12/12) ou un nom complet, je cherche direct. Tu peux enchaîner plusieurs recherches sans rien retaper d'autre.`,
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_CORRECTION' || MOTS_CLES_CORRECTION.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'correction' };
    await sendMessage(
      senderId,
      '📝 Mode Correction activé.\n\nEnvoie-moi tes textes, je les corrige un par un.',
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_TRADUCTION' || MOTS_CLES_TRADUCTION.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'traduction', langue: null };
    await sendMessage(senderId, '🌐 Vers quelle langue veux-tu traduire ? (ex: anglais, malgache...)', BOUTON_MENU);
    return;
  }

  if (texteOuPayload === 'MENU_EXERCICES' || MOTS_CLES_EXERCICES.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'exercices' };
    await sendMessage(
      senderId,
      '📚 Mode Exercices activé.\n\nEnvoie-moi un sujet/matière (ex: "conjugaison du présent"), je génère un exercice à chaque fois.',
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_CORRECTION_EXERCICES' || MOTS_CLES_CORRECTION_EXERCICES.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'correction_exercices' };
    await sendMessage(
      senderId,
      '🖊️ Mode Correction d\'exercices activé (toutes matières).\n\nEnvoie-moi le texte de l\'exercice/devoir, ou directement une 📷 photo de la fiche, et je te donne le corrigé complet.',
      BOUTON_MENU
    );
    return;
  }

  // ---------- B. Comportement selon le mode actif ----------
  const etat = userModes[senderId] || { mode: 'chat' };

  switch (etat.mode) {
    case 'humain': {
      // Le bot reste volontairement silencieux : un administrateur de la
      // Page répond manuellement depuis la boîte de réception Messenger.
      return;
    }

    case 'resultats': {
      await sendTyping(senderId, true);
      const resultat = await searchBepc(texteOuPayload, etat.typeExam);
      await sendTyping(senderId, false);
      await sendMessage(senderId, resultat, BOUTON_MENU);
      return;
    }

    case 'correction': {
      await sendTyping(senderId, true);
      const corrige = await correctText(texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, `✅ Texte corrigé :\n\n${corrige}`, BOUTON_MENU);
      return;
    }

    case 'traduction': {
      if (!etat.langue) {
        // Premier message dans ce mode = la langue cible
        userModes[senderId] = { mode: 'traduction', langue: texteOuPayload };
        await sendMessage(senderId, `Ok, envoie-moi tes textes, je les traduis en ${texteOuPayload}.`, BOUTON_MENU);
        return;
      }
      await sendTyping(senderId, true);
      const traduction = await chatWithGemini(
        `Traduis le texte suivant en ${etat.langue}. Réponds uniquement avec la traduction, sans explication :\n\n"${texteOuPayload}"`
      );
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🌐 ${traduction}`, BOUTON_MENU);
      return;
    }

    case 'correction_exercices': {
      await sendTyping(senderId, true);
      const correction = await chatWithGemini(
        `Voici un exercice ou devoir scolaire (n'importe quelle matière) : "${texteOuPayload}". Fais-en le corrigé complet : réponds à chaque question/sujet posé, de façon claire et structurée. N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer.${consigneMethodologie()}`
      );
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🖊️ ${correction}`, BOUTON_MENU);
      return;
    }

    case 'exercices': {
      await sendTyping(senderId, true);
      const exercice = await chatWithGemini(
        `Crée un court exercice scolaire (avec sa correction en dessous, séparée par "---CORRECTION---") sur le sujet suivant, adapté à un élève : "${texteOuPayload}". Reste concis. N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer.`
      );
      await sendTyping(senderId, false);
      await sendMessage(senderId, `📚 ${exercice}`, BOUTON_MENU);
      return;
    }

    default: {
      // Chat général, comme ChatGPT/Gemini
      await sendTyping(senderId, true);
      const reponse = await chatAvecHistorique(senderId, texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, reponse, BOUTON_MENU);
      return;
    }
  }
}

// ============================================================
// 4bis. GESTION DES IMAGES REÇUES (ex: photo de fiche d'exercice)
// ============================================================
async function handleImageEvent(senderId, imageUrl) {
  const etat = userModes[senderId] || { mode: 'chat' };

  if (etat.mode === 'correction_exercices') {
    await sendTyping(senderId, true);
    const correction = await correctExerciseImage(imageUrl);
    await sendTyping(senderId, false);
    await sendMessage(senderId, `🖊️📷 ${correction}`, BOUTON_MENU);
    return;
  }

  await sendMessage(
    senderId,
    '📷 J\'ai bien reçu ta photo ! Pour que je la corrige automatiquement, active d\'abord le mode "Corriger un exercice" (tape "devoir" ou "6"), puis renvoie la photo.',
    BOUTON_MENU
  );
}

async function correctExerciseImage(imageUrl, tentative = 1) {
  try {
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const base64Image = Buffer.from(imgResponse.data).toString('base64');
    const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: "Voici une photo d'une fiche d'exercice ou de devoir scolaire (n'importe quelle matière : maths, français, histoire, sciences...). Fais-en le CORRIGÉ complet : réponds à chaque question/sujet posé, de façon claire et structurée (reprends chaque numéro de question puis donne la réponse/l'explication). N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise plutôt des émojis/icônes (📌 ✅ 👉 etc.) pour structurer visuellement, adapté à une conversation Messenger." + consigneMethodologie(),
              },
              { inline_data: { mime_type: mimeType, data: base64Image } },
            ],
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
      return correctExerciseImage(imageUrl, tentative + 1);
    }
    console.error('Erreur correction image:', err.response?.data || err.message);
    return "Désolé, je n'ai pas réussi à analyser cette photo. Vérifie qu'elle est bien lisible, ou envoie plutôt le texte de l'exercice.";
  }
}

// ============================================================
// 5. CHAT GENERAL VIA GEMINI
// ============================================================

// Historique de conversation par utilisateur, pour le mode "chat IA" uniquement
// (pas utilisé pour correction/traduction/exercices, qui sont des appels ponctuels).
// Se remet à zéro si le serveur redémarre, et est limité pour ne pas grossir indéfiniment.
const chatHistories = {};
const MAX_TOURS_HISTORIQUE = 16; // ~8 échanges question/réponse conservés

function resetHistorique(senderId) {
  delete chatHistories[senderId];
}

async function chatAvecHistorique(senderId, text, tentative = 1) {
  if (!chatHistories[senderId]) chatHistories[senderId] = [];
  const historique = chatHistories[senderId];

  historique.push({ role: 'user', parts: [{ text }] });
  if (historique.length > MAX_TOURS_HISTORIQUE) historique.splice(0, historique.length - MAX_TOURS_HISTORIQUE);

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        system_instruction: {
          parts: [
            {
              text: 'Tu es un assistant qui discute sur Messenger. Réponds de façon claire et raisonnablement concise, en tenant compte de tout ce qui a été dit avant dans la conversation. N\'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer si besoin.',
            },
          ],
        },
        contents: historique,
      }
    );

    const reponse = response.data.candidates[0].content.parts[0].text.trim();
    historique.push({ role: 'model', parts: [{ text: reponse }] });
    return reponse;
  } catch (err) {
    const status = err.response?.data?.error?.status;
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * tentative));
      return chatAvecHistorique(senderId, text, tentative + 1);
    }
    console.error('Erreur chat IA:', err.response?.data || err.message);
    // On retire le message qu'on venait d'ajouter puisqu'il n'a pas eu de réponse
    historique.pop();
    return "Désolé, je n'arrive pas à répondre pour le moment. Réessaie dans une minute.";
  }
}

// Version SANS historique, pour les appels ponctuels (traduction, exercices).
async function chatWithGemini(text, tentative = 1) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Réponds de façon claire et raisonnablement concise (adaptée à une conversation Messenger, évite les pavés interminables sauf si vraiment nécessaire) à ce message : "${text}". N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer si besoin.`,
              },
            ],
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
  const estNon Admis = obs.includes('Non Admis') || obs.includes('NON ADMIS') || obs.includes('REDOUBL');

  if (estAdmis) {
    return (
      `🎓✨ RÉSULTAT ${typeExam.toUpperCase()} ✨🎓\n\n` +
      `🎉🎊 Félicitations ${r.nom} !\n` +
      `🥳 Vous êtes officiellement ADMIS(E) au ${typeExam.toUpperCase()}.\n\n` +
      `🪪 Matricule : ${r.matricule}\n` +
      `🏫 Établissement : ${r.ecole}\n` +
      `📍 CISCO : ${r.cisco}\n` +
      `✅ Résultats 👏: ${r.observation}\n\n` +
      `🍾 Alefaso ny arrosage e! 😄🥳\n` +
      `📸 Ataovy capture ary zarao amin'ny namanao!`
    );
  }

  if (estAjourne) {
    return (
      `🎓📋 RÉSULTAT ${typeExam.toUpperCase()}\n\n` +
      `👤 Candidat : ${r.nom}\n\n` +
      `🪪 Matricule : ${r.matricule}\n` +
      `🏫 Établissement : ${r.ecole}\n` +
      `📍 CISCO : ${r.cisco}\n` +
      `❌ Résultats 😭: ${r.observation}\n\n` +
      `💪 Courage! Aza mora kivy.\n` +
      `📚 Mianara tsara `
    );
  }

  return (
    `🎓📋 RÉSULTAT ${typeExam.toUpperCase()}\n\n` +
    `👤 Candidat : ${r.nom}\n\n` +
    `🪪 Matricule : ${r.matricule}\n` +
    `🏫 Établissement : ${r.ecole}\n` +
    `📍 CISCO : ${r.cisco}\n` +
    `ℹ️ Observation : ${r.observation}\n\n` +
    `⏳ Le résultat officiel n'est pas encore disponible pour ce candidat.\n` +
    `🔄 Merci de réessayer un peu plus tard.`
  );
}

// ============================================================
// 8. ENVOI DE MESSAGE / INDICATEUR DE FRAPPE
// ============================================================
const LIMITE_MESSENGER = 1900; // marge de sécurité sous la limite réelle de 2000

// Messenger n'affiche pas le markdown : "**gras**" ou "### Titre" s'affichent
// tels quels avec les symboles. On les nettoie et remplace par des repères visuels.
function nettoyerMarkdown(text) {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s*(.*)$/gm, '▶️ $1')
    .replace(/^[-•]\s+/gm, '• ')
    .trim();
}

async function sendMessage(recipientId, text, quickReplies) {
  const morceaux = decouperTexte(nettoyerMarkdown(text), LIMITE_MESSENGER);

  for (let i = 0; i < morceaux.length; i++) {
    const estLeDernier = i === morceaux.length - 1;
    try {
      const message = { text: morceaux[i] };
      if (estLeDernier && quickReplies) message.quick_replies = quickReplies;

      await axios.post(
        `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
        { recipient: { id: recipientId }, message }
      );
    } catch (err) {
      console.error('Erreur envoi message:', err.response?.data || err.message);
    }
  }
}

// Découpe un texte trop long en plusieurs morceaux, en essayant de couper
// proprement sur un saut de ligne ou un espace plutôt qu'au milieu d'un mot.
function decouperTexte(text, limite) {
  if (text.length <= limite) return [text];

  const morceaux = [];
  let reste = text;

  while (reste.length > limite) {
    let coupeA = reste.lastIndexOf('\n', limite);
    if (coupeA < limite * 0.5) coupeA = reste.lastIndexOf(' ', limite);
    if (coupeA < limite * 0.5) coupeA = limite;

    morceaux.push(reste.slice(0, coupeA).trim());
    reste = reste.slice(coupeA).trim();
  }
  if (reste) morceaux.push(reste);

  return morceaux;
}

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
