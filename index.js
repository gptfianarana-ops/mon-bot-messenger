// ============================================================
// index.js – BLOC 1 (Définitions, Redis, Gamification, Menu)
// ============================================================

const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const math = require('mathjs');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ============================================================
// ROTATION AUTOMATIQUE DES CLÉS GEMINI
// ============================================================
function chargerClesGemini() {
  if (process.env.GEMINI_API_KEYS) {
    return process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
  }
  const cles = [];
  for (let i = 1; i <= 5; i++) {
    const nomAvecTiret = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const nomSansTiret = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY${i}`;
    const valeur = process.env[nomAvecTiret] || process.env[nomSansTiret];
    if (valeur) cles.push(valeur);
  }
  return cles;
}

const GEMINI_KEYS = chargerClesGemini();
let indexCleActuelle = 0;

function cleGeminiActuelle() {
  return GEMINI_KEYS[indexCleActuelle % GEMINI_KEYS.length];
}
function passerCleGeminiSuivante() {
  indexCleActuelle++;
  console.log(`Quota Gemini atteint, passage à la clé n°${(indexCleActuelle % GEMINI_KEYS.length) + 1}`);
}

// ============================================================
// STATS D'USAGE
// ============================================================
const statsUsage = { date: new Date().toISOString().slice(0, 10), total: 0, parFonction: {} };
function enregistrerAppelStats(nomFonction) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  if (statsUsage.date !== aujourdHui) {
    statsUsage.date = aujourdHui;
    statsUsage.total = 0;
    statsUsage.parFonction = {};
  }
  statsUsage.total++;
  statsUsage.parFonction[nomFonction] = (statsUsage.parFonction[nomFonction] || 0) + 1;
}

// ============================================================
// REDIS (UPSTASH) AVEC REPLI RAM
// ============================================================
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN;
const REDIS_ACTIF = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
if (!REDIS_ACTIF) console.log('⚠️ Upstash non configuré : données stockées en RAM (perdus au redémarrage).');

const repliGenerique = {};

async function redisGet(cle) {
  if (!REDIS_ACTIF) return repliGenerique[cle] !== undefined ? String(repliGenerique[cle]) : null;
  try {
    const res = await axios.get(`${UPSTASH_URL}/get/${encodeURIComponent(cle)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    return res.data.result;
  } catch (err) {
    console.error('Erreur Redis GET', cle, err.message);
    return null;
  }
}
async function redisSet(cle, valeur) {
  if (!REDIS_ACTIF) {
    repliGenerique[cle] = valeur;
    return;
  }
  try {
    await axios.get(`${UPSTASH_URL}/set/${encodeURIComponent(cle)}/${encodeURIComponent(valeur)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch (err) {
    console.error('Erreur Redis SET', cle, err.message);
  }
}

// ============================================================
// SYSTÈME DE CRÉDITS ET CODES
// ============================================================
const CODES_VALIDES = { DEMO10: 10 };
const LIMITE_GRATUITE_PAR_JOUR = 3;
const repliCredits = {};
const repliCodesUtilises = new Set();
const repliUsageJour = {};

async function obtenirCredits(senderId) {
  if (!REDIS_ACTIF) return repliCredits[senderId] || 0;
  const v = await redisGet(`credits:${senderId}`);
  return v ? parseInt(v, 10) : 0;
}
async function definirCredits(senderId, valeur) {
  if (!REDIS_ACTIF) { repliCredits[senderId] = valeur; return; }
  await redisSet(`credits:${senderId}`, valeur);
}
async function codeDejaUtilise(code) {
  if (!REDIS_ACTIF) return repliCodesUtilises.has(code);
  const v = await redisGet(`code_utilise:${code}`);
  return v !== null;
}
async function marquerCodeUtilise(code) {
  if (!REDIS_ACTIF) { repliCodesUtilises.add(code); return; }
  await redisSet(`code_utilise:${code}`, '1');
}
async function obtenirUsageJour(senderId) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const cle = `usage:${senderId}:${aujourdHui}`;
  if (!REDIS_ACTIF) {
    if (!repliUsageJour[cle]) repliUsageJour[cle] = 0;
    return { cle, compte: repliUsageJour[cle] };
  }
  const v = await redisGet(cle);
  return { cle, compte: v ? parseInt(v, 10) : 0 };
}
async function incrementerUsageJour(cle, compteActuel) {
  if (!REDIS_ACTIF) { repliUsageJour[cle] = compteActuel + 1; return; }
  await redisSet(cle, compteActuel + 1);
}
function genererCodeAleatoire() {
  const car = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += car[Math.floor(Math.random() * car.length)];
  return code;
}
async function obtenirCreditsDuCode(code) {
  const dynamique = await redisGet(`code_credits:${code}`);
  if (dynamique) return parseInt(dynamique, 10);
  return CODES_VALIDES[code] || null;
}
async function verifierEtConsommerCredit(senderId) {
  const { cle, compte } = await obtenirUsageJour(senderId);
  if (compte < LIMITE_GRATUITE_PAR_JOUR) {
    await incrementerUsageJour(cle, compte);
    return { autorise: true, restantGratuit: LIMITE_GRATUITE_PAR_JOUR - compte - 1 };
  }
  const credits = await obtenirCredits(senderId);
  if (credits > 0) {
    await definirCredits(senderId, credits - 1);
    return { autorise: true, viaCredit: true, creditsRestants: credits - 1 };
  }
  return { autorise: false };
}

// ============================================================
// GAMIFICATION : XP, NIVEAUX, BADGES, DÉFI QUOTIDIEN
// ============================================================
const SEUILS_NIVEAUX = [
  { niveau: 1, xp_min: 0, titre: "Apprenti" },
  { niveau: 2, xp_min: 50, titre: "Débutant" },
  { niveau: 3, xp_min: 150, titre: "Intermédiaire" },
  { niveau: 4, xp_min: 350, titre: "Confirmé" },
  { niveau: 5, xp_min: 700, titre: "Expert" },
  { niveau: 6, xp_min: 1200, titre: "Maître" },
];

const BADGES = {
  PREMIER_EXERCICE: "Premier exercice corrigé",
  PREMIER_RESULTAT: "Premier résultat trouvé",
  BAC_TROUVE: "Explorateur Bac",
  CORRECTION_10: "10 corrections effectuées",
  DEFI_7: "Défi du jour (7 jours)",
  NIVEAU_3: "Niveau 3 atteint",
  NIVEAU_5: "Niveau 5 atteint",
};

async function getProfile(senderId) {
  const raw = await redisGet(`profile:${senderId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function setProfile(senderId, profile) {
  await redisSet(`profile:${senderId}`, JSON.stringify(profile));
}
async function getXP(senderId) {
  const val = await redisGet(`xp:${senderId}`);
  return val ? parseInt(val, 10) : 0;
}
async function setXP(senderId, xp) {
  await redisSet(`xp:${senderId}`, xp);
}
async function getLevel(senderId) {
  const val = await redisGet(`level:${senderId}`);
  return val ? parseInt(val, 10) : 1;
}
async function setLevel(senderId, level) {
  await redisSet(`level:${senderId}`, level);
}
async function getBadges(senderId) {
  const raw = await redisGet(`badges:${senderId}`);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
async function setBadges(senderId, badges) {
  await redisSet(`badges:${senderId}`, JSON.stringify(badges));
}
async function getDailyChallenge(senderId) {
  const raw = await redisGet(`daily:${senderId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function setDailyChallenge(senderId, data) {
  await redisSet(`daily:${senderId}`, JSON.stringify(data));
}
async function getStats(senderId, action) {
  const key = `stats:${senderId}:${action}`;
  const val = await redisGet(key);
  return val ? parseInt(val, 10) : 0;
}
async function incrementStats(senderId, action) {
  const key = `stats:${senderId}:${action}`;
  const actuel = await getStats(senderId, action);
  await redisSet(key, actuel + 1);
}

async function ajouterXP(senderId, quantite, actionType) {
  let xp = await getXP(senderId);
  xp += quantite;
  await setXP(senderId, xp);

  let niveauActuel = await getLevel(senderId);
  let nouveauNiveau = niveauActuel;
  for (const s of SEUILS_NIVEAUX) {
    if (xp >= s.xp_min) nouveauNiveau = s.niveau;
  }
  const badges = await getBadges(senderId);
  let montee = false;
  if (nouveauNiveau > niveauActuel) {
    await setLevel(senderId, nouveauNiveau);
    montee = true;
    if (nouveauNiveau >= 3 && !badges.includes(BADGES.NIVEAU_3)) {
      badges.push(BADGES.NIVEAU_3);
    }
    if (nouveauNiveau >= 5 && !badges.includes(BADGES.NIVEAU_5)) {
      badges.push(BADGES.NIVEAU_5);
    }
  }

  if (actionType === 'correction' && !badges.includes(BADGES.PREMIER_EXERCICE)) {
    badges.push(BADGES.PREMIER_EXERCICE);
  }
  if ((actionType === 'resultat' || actionType === 'resultat_bac') && !badges.includes(BADGES.PREMIER_RESULTAT)) {
    badges.push(BADGES.PREMIER_RESULTAT);
  }
  if (actionType === 'resultat_bac' && !badges.includes(BADGES.BAC_TROUVE)) {
    badges.push(BADGES.BAC_TROUVE);
  }
  if (actionType === 'correction') {
    await incrementStats(senderId, 'corrections');
    const count = await getStats(senderId, 'corrections');
    if (count >= 10 && !badges.includes(BADGES.CORRECTION_10)) {
      badges.push(BADGES.CORRECTION_10);
    }
  }

  await setBadges(senderId, badges);
  return { xp, nouveauNiveau, montee };
}

async function genererDefiQuotidien(senderId) {
  const profile = await getProfile(senderId);
  const matieres = profile?.matieres_favorites || ['maths', 'français', 'histoire'];
  const sujet = matieres[Math.floor(Math.random() * matieres.length)];
  const prompt = `Génère un court exercice (une question ou un QCM) sur le thème "${sujet}", niveau collège/lycée, avec la correction. Format : Exercice : ... Correction : ... Réponds uniquement avec l'exercice et la correction, sans texte autour.`;
  const reponse = await chatWithGemini(prompt, 'defi_quotidien');
  return { sujet, enonce: reponse };
}

function extraireCorrection(enonce) {
  const match = enonce.match(/Correction\s*[:]\s*([\s\S]*)/i);
  return match ? match[1].trim() : "Correction non disponible.";
}

// ============================================================
// APPEL GÉNÉRIQUE GEMINI (avec rotation)
// ============================================================
async function appellerGemini(body, nomFonction = 'autre', tentative = 1, essaiCle = 1) {
  enregistrerAppelStats(nomFonction);
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGeminiActuelle()}`,
      body
    );
    return response.data.candidates[0].content.parts[0].text;
  } catch (err) {
    const status = err.response?.data?.error?.status;
    const message = err.response?.data?.error?.message || '';
    const cleInvalide =
      status === 'RESOURCE_EXHAUSTED' ||
      status === 'UNAUTHENTICATED' ||
      status === 'PERMISSION_DENIED' ||
      /api key not valid/i.test(message);

    if (cleInvalide && essaiCle < GEMINI_KEYS.length) {
      console.error(`Clé Gemini n°${(indexCleActuelle % GEMINI_KEYS.length) + 1} invalide/épuisée (${status || message}), on tente la suivante.`);
      passerCleGeminiSuivante();
      return appellerGemini(body, nomFonction, tentative, essaiCle + 1);
    }
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * tentative));
      return appellerGemini(body, nomFonction, tentative + 1, essaiCle);
    }
    throw err;
  }
}

// ============================================================
// GESTION DES IMAGES ET FICHIERS GÉNÉRÉS
// ============================================================
const URL_BASE_PUBLIQUE = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
const imagesGenerees = {};
const MAX_IMAGES_STOCKEES = 50;
function stockerImageGeneree(buffer, mimeType) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  imagesGenerees[id] = { buffer, mimeType, timestamp: Date.now() };
  const ids = Object.keys(imagesGenerees);
  if (ids.length > MAX_IMAGES_STOCKEES) {
    const plusAncien = ids.sort((a, b) => imagesGenerees[a].timestamp - imagesGenerees[b].timestamp)[0];
    delete imagesGenerees[plusAncien];
  }
  return id;
}

const fichiersGeneres = {};
const MAX_FICHIERS_STOCKES = 50;
function stockerFichierGenere(buffer, mimeType, nomFichier) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  fichiersGeneres[id] = { buffer, mimeType, nomFichier, timestamp: Date.now() };
  const ids = Object.keys(fichiersGeneres);
  if (ids.length > MAX_FICHIERS_STOCKES) {
    const plusAncien = ids.sort((a, b) => fichiersGeneres[a].timestamp - fichiersGeneres[b].timestamp)[0];
    delete fichiersGeneres[plusAncien];
  }
  return id;
}

// ============================================================
// MENU PRINCIPAL ET BOUTON RETOUR
// ============================================================
const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '📊 Mon profil', payload: 'MON_PROFIL' },
  { content_type: 'text', title: '🎯 Défi du jour', payload: 'DEFI_JOUR' },
  { content_type: 'text', title: '🎓 Résultats examens', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '📝 Corriger un texte', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🖊️ Corriger un exercice', payload: 'MENU_CORRECTION_EXERCICES' },
  { content_type: 'text', title: '📚 Générer exercice', payload: 'MENU_EXERCICES' },
  { content_type: 'text', title: '🌐 Traducteur', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Discuter librement', payload: 'MENU_CHAT' },
  { content_type: 'text', title: '🔑 Activer un code', payload: 'MENU_CODE' },
  { content_type: 'text', title: '📄 Créer mon CV', payload: 'MENU_CV' },
  { content_type: 'text', title: '🧮 Simulateur Bac', payload: 'MENU_BAC' },
  { content_type: 'text', title: '🎓 Hianatra (Apprendre)', payload: 'MENU_HIANATRA' },
];

const BOUTON_MENU = [{ content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }];

// ============================================================
// FONCTIONS D'ENVOI DE MESSAGE ET TYPING
// ============================================================
const LIMITE_MESSENGER = 1900;

function nettoyerMarkdown(text) {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s*(.*)$/gm, '▶️ $1')
    .replace(/^[-•]\s+/gm, '• ')
    .trim();
}

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

// ============================================================
// DÉFINITIONS DES CONSTANTES UTILISÉES DANS LE ROUTEUR
// (déplacées ici pour éviter les références avant déclaration)
// ============================================================
const RACCOURCIS_NUM = {
  1: 'MENU_RESULTATS',
  2: 'MENU_CORRECTION',
  3: 'MENU_EXERCICES',
  4: 'MENU_TRADUCTION',
  5: 'MENU_CHAT',
  6: 'MENU_CORRECTION_EXERCICES',
  7: 'MENU_CODE',
  8: 'MENU_CV',
  9: 'MENU_BAC',
  11: 'MENU_HIANATRA',
};

const MOTS_CLES_BEPC = /\b(bepc|cepe|resultat|résultat)\b/i;
const MOTS_CLES_BACC_REEL = /\b(bacc|baccalaur[ée]at)\b/i;
const MOTS_CLES_MENU = /^(menu|aide|help|salut|bonjour|bonsoir|hello|coucou)$/i;
const MOTS_CLES_CORRECTION = /^(corrige|correction)$/i;
const MOTS_CLES_EXERCICES = /^(exercice|exercices)$/i;
const MOTS_CLES_TRADUCTION = /^(traduire|traduction|traducteur)$/i;
const MOTS_CLES_CHAT = /^(chat|discuter|discussion|discuter librement)$/i;
const MOTS_CLES_CHAT_IA = /^(ia|ai|robot|bot)$/i;
const MOTS_CLES_CHAT_HUMAIN = /^(humain|administrateur|page|personne)$/i;
const MOTS_CLES_CORRECTION_EXERCICES = /^(devoir|devoirs|corriger exercice|correction exercice)$/i;
const MOTS_CLES_CODE = /^(code|credit|crédit|credits|crédits|activer)$/i;
const MOTS_CLES_CV = /^(cv|creer cv|cr[ée]er (mon |un )?cv|creer mon cv)$/i;
const MOTS_CLES_ADMIN = /^admin$/i;
const MOTS_CLES_QUITTER_ADMIN = /^(quitter|sortir|exit|menu)$/i;
const MOTS_CLES_BAC = /^(bac|simulateur bac|simulation bac|moyenne bac|simulateur baccalaur[ée]at)$/i;
const MOTS_CLES_HIANATRA = /^(hianatra|apprendre|cours|leçon|lecon|etudier|étudier)$/i;
const MOTS_CLES_IDENTITE = /\b(qui es[- ]?tu|c'?est quoi (ce|cet) bot|qui a (cr[ée][ée]?|fond[ée]) (ce|cet) bot|qui t'?a (cr[ée][ée]?|fait|programm[ée])|pr[ée]sente[- ]toi|iza (ianao|no nanao)|es[- ]?tu (une|un) (ia|robot|intelligence artificielle)|c'?est quoi tsarafandray)\b/i;

const PRESENTATION_BOT =
  `👋 Salut ! Je suis l'assistant virtuel de 🏢 Tsarafandray Services.\n\n` +
  `Tsarafandray Services est une entreprise multiservices informatique, fondée par M. Emeraldo, qui accompagne élèves, étudiants et particuliers avec des solutions pratiques au quotidien.\n\n` +
  `Ici, je peux t'aider à :\n` +
  `🎓 Vérifier tes résultats d'examens (BEPC/CEPE)\n` +
  `📝 Corriger tes textes\n` +
  `🖊️ Corriger tes exercices et devoirs (toutes matières)\n` +
  `📚 Générer des exercices\n` +
  `🌐 Traduire\n` +
  `💬 Discuter librement\n\n` +
  `Tape "menu" à tout moment pour voir toutes les options !`;

// ============================================================
// FIN DU BLOC 1 – COPIEZ LE BLOC 2 ENSUITE
// ============================================================
// ============================================================
// index.js – BLOC 2 (Routes, Handlers, Fonctions métier)
// ============================================================

// ============================================================
// GÉNÉRATION D'IMAGES (Nano Banana)
// ============================================================
async function genererImagePublique(prompt, imagePartSource = null) {
  if (!URL_BASE_PUBLIQUE) {
    throw new Error('PUBLIC_URL (ou RENDER_EXTERNAL_URL) manquante : impossible de construire une URL publique pour l\'image.');
  }
  const { base64, mimeType } = await appellerGeminiImage(prompt, imagePartSource);
  const buffer = Buffer.from(base64, 'base64');
  const id = stockerImageGeneree(buffer, mimeType);
  return `${URL_BASE_PUBLIQUE}/generated-image/${id}`;
}

async function appellerGeminiImage(prompt, imagePartSource = null, tentative = 1, essaiCle = 1) {
  enregistrerAppelStats('generation_image');
  try {
    const parts = imagePartSource ? [{ text: prompt }, imagePartSource] : [{ text: prompt }];
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${cleGeminiActuelle()}`,
      { contents: [{ parts }] }
    );
    const reponseParts = response.data.candidates[0].content.parts;
    const partImage = reponseParts.find((p) => p.inline_data || p.inlineData);
    if (!partImage) throw new Error('Aucune image renvoyée par le modèle.');
    const data = partImage.inline_data || partImage.inlineData;
    return { base64: data.data, mimeType: data.mime_type || data.mimeType || 'image/png' };
  } catch (err) {
    const status = err.response?.data?.error?.status;
    const message = err.response?.data?.error?.message || '';
    const cleInvalide = status === 'RESOURCE_EXHAUSTED' || status === 'UNAUTHENTICATED' || status === 'PERMISSION_DENIED' || /api key not valid/i.test(message);
    if (cleInvalide && essaiCle < GEMINI_KEYS.length) {
      console.error(`Clé Gemini n°${(indexCleActuelle % GEMINI_KEYS.length) + 1} invalide/épuisée (image), on tente la suivante.`);
      passerCleGeminiSuivante();
      return appellerGeminiImage(prompt, imagePartSource, tentative, essaiCle + 1);
    }
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * tentative));
      return appellerGeminiImage(prompt, imagePartSource, tentative + 1, essaiCle);
    }
    throw err;
  }
}

// ============================================================
// FONCTIONS CHAT ET CORRECTION DE TEXTE
// ============================================================
const chatHistories = {};
const MAX_TOURS_HISTORIQUE = 16;

function resetHistorique(senderId) {
  delete chatHistories[senderId];
}

async function chatAvecHistorique(senderId, text) {
  if (!chatHistories[senderId]) chatHistories[senderId] = [];
  const historique = chatHistories[senderId];
  historique.push({ role: 'user', parts: [{ text }] });
  if (historique.length > MAX_TOURS_HISTORIQUE) historique.splice(0, historique.length - MAX_TOURS_HISTORIQUE);
  try {
    const reponse = (
      await appellerGemini(
        {
          system_instruction: {
            parts: [
              {
                text: 'Tu es l\'assistant virtuel de Tsarafandray Services, une entreprise multiservices informatique fondée par M. Emeraldo. Si on te demande qui tu es, ce que tu es, ou qui t\'a créé, réponds TOUJOURS que tu es l\'assistant de Tsarafandray Services (jamais que tu es une IA, un modèle de langage, Gemini, ou fait par Google). Réponds de façon claire et raisonnablement concise, en tenant compte de tout ce qui a été dit avant dans la conversation. N\'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer si besoin.',
              },
            ],
          },
          contents: historique,
        },
        'chat'
      )
    ).trim();
    historique.push({ role: 'model', parts: [{ text: reponse }] });
    return reponse;
  } catch (err) {
    console.error('Erreur chat IA:', err.response?.data || err.message);
    historique.pop();
    return "Désolé, je n'arrive pas à répondre pour le moment. Réessaie dans une minute.";
  }
}

async function chatWithGemini(text, nomFonction = 'texte_generique') {
  try {
    const reponse = await appellerGemini(
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
      },
      nomFonction
    );
    return reponse.trim();
  } catch (err) {
    console.error('Erreur chat IA:', err.response?.data || err.message);
    return "Désolé, je n'arrive pas à répondre pour le moment. Réessaie dans une minute.";
  }
}

async function correctText(text) {
  try {
    const corrected = await appellerGemini(
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
      },
      'correction_texte'
    );
    return corrected.trim();
  } catch (err) {
    console.error('Erreur correction IA:', err.response?.data || err.message);
    return 'Désolé, le service de correction est très sollicité en ce moment. Réessaie dans une minute.';
  }
}

// ============================================================
// AFFICHER PROFIL
// ============================================================
async function afficherProfil(senderId) {
  const profile = await getProfile(senderId);
  const xp = await getXP(senderId);
  const level = await getLevel(senderId);
  const badges = await getBadges(senderId);
  const msg = `📊 **Mon profil**\n\n` +
    `👤 ${profile?.nom || 'Anonyme'}\n` +
    `🎓 Niveau scolaire : ${profile?.niveau_scolaire || 'Non renseigné'}\n` +
    `📚 Matières favorites : ${profile?.matieres_favorites?.join(', ') || 'Aucune'}\n` +
    `🎓 Niveau : ${level} (${SEUILS_NIVEAUX.find(s => s.niveau === level)?.titre || ''})\n` +
    `💪 XP : ${xp}\n` +
    `🏅 Badges : ${badges.length ? badges.join(', ') : 'Aucun badge pour le moment'}`;
  await sendMessage(senderId, msg, BOUTON_MENU);
}

// ============================================================
// DÉFI QUOTIDIEN - HANDLER
// ============================================================
async function handleDefiQuotidien(senderId) {
  const aujourd = new Date().toISOString().slice(0, 10);
  const daily = await getDailyChallenge(senderId);
  if (daily && daily.date === aujourd && daily.fait) {
    return sendMessage(senderId, "🎯 Tu as déjà fait le défi d'aujourd'hui ! Reviens demain pour un nouveau défi.", BOUTON_MENU);
  }
  if (daily && daily.date === aujourd && !daily.fait) {
    await sendMessage(senderId, `🎯 **Défi du jour** (${daily.sujet})\n\n${daily.enonce}\n\nEnvoie ta réponse pour gagner 15 XP !`, BOUTON_MENU);
    userModes[senderId] = { mode: 'defi_quotidien', enonce: daily.enonce };
    return;
  }
  await sendTyping(senderId, true);
  const defi = await genererDefiQuotidien(senderId);
  await sendTyping(senderId, false);
  await setDailyChallenge(senderId, { date: aujourd, fait: false, enonce: defi.enonce, sujet: defi.sujet });
  await sendMessage(senderId, `🎯 **Défi du jour** (${defi.sujet})\n\n${defi.enonce}\n\nEnvoie ta réponse, je te dirai si c'est juste et tu gagneras 15 XP !`, BOUTON_MENU);
  userModes[senderId] = { mode: 'defi_quotidien', enonce: defi.enonce };
}

// ============================================================
// MENU PRINCIPAL (version enrichie avec niveau/XP)
// ============================================================
async function envoyerMenu(senderId, texteIntro) {
  const profile = await getProfile(senderId);
  const xp = await getXP(senderId);
  const level = await getLevel(senderId);
  const niveauTitre = SEUILS_NIVEAUX.find(s => s.niveau === level)?.titre || '';
  const nom = profile?.nom || '';

  const texte = `${texteIntro || '👋 Salut ! Que veux-tu faire ?'}\n\n` +
    `${nom ? `Bonjour ${nom} ! ` : ''}` +
    `Niveau ${level} (${niveauTitre}) | XP : ${xp}\n\n` +
    `📊 Mon profil | 🎯 Défi du jour\n` +
    `1️⃣ 🎓 Résultats examens\n` +
    `2️⃣ 📝 Corriger un texte\n` +
    `3️⃣ 📚 Générer exercice\n` +
    `4️⃣ 🌐 Traducteur\n` +
    `5️⃣ 💬 Discuter librement\n` +
    `6️⃣ 🖊️ Corriger un exercice (texte ou photo)\n` +
    `7️⃣ 🔑 Activer un code\n` +
    `8️⃣ 📄 Créer mon CV (premium)\n` +
    `9️⃣ 🧮 Simulateur Bac (premium)\n\n` +
    `(Tape le numéro, ou utilise les boutons ci-dessous)`;

  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}

// ============================================================
// ROUTEUR PRINCIPAL (handleEvent) – modifié
// ============================================================
const userModes = {};

async function handleEvent(senderId, texteOuPayload, estUnBouton) {
  const etat = userModes[senderId] || { mode: 'chat' };

  // Raccourcis numériques
  if (!estUnBouton && etat.mode === 'chat' && RACCOURCIS_NUM[texteOuPayload.trim()]) {
    texteOuPayload = RACCOURCIS_NUM[texteOuPayload.trim()];
  }

  // Question identité
  if (MOTS_CLES_IDENTITE.test(texteOuPayload)) {
    return sendMessage(senderId, PRESENTATION_BOT, BOUTON_MENU);
  }

  // Menu
  if (texteOuPayload === 'GET_STARTED' || MOTS_CLES_MENU.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'chat' };
    return envoyerMenu(senderId, '👋 Bienvenue ! Que veux-tu faire ?');
  }

  // NOUVEAU : Profil et Défi
  if (texteOuPayload === 'MON_PROFIL' || /^mon profil$|^profil$/i.test(texteOuPayload)) {
    return afficherProfil(senderId);
  }
  if (texteOuPayload === 'DEFI_JOUR' || /^défi du jour$|^defi$/i.test(texteOuPayload)) {
    return handleDefiQuotidien(senderId);
  }

  const peutChangerDeModeParMotCle = etat.mode === 'chat' || estUnBouton;

  if (peutChangerDeModeParMotCle) {
    // ---------- Changement de mode ----------
    if (texteOuPayload === 'MENU_CHAT' || MOTS_CLES_CHAT.test(texteOuPayload)) {
      await sendMessage(senderId,
        '💬 Discuter avec qui ?\n\n🤖 L\'IA (réponse automatique instantanée)\n👤 Un administrateur de la Page (réponse manuelle, peut prendre du temps)\n\n(Tape "ia" ou "admin", ou utilise les boutons)',
        [{ content_type: 'text', title: '🤖 IA', payload: 'CHAT_IA' }, { content_type: 'text', title: '👤 Admin', payload: 'CHAT_HUMAIN' }]
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
      await sendMessage(senderId, '👤 Un administrateur de la Page va te répondre directement ici. Le bot ne répondra plus automatiquement dans cette conversation.\n\nTape "menu" à tout moment pour reprendre avec le bot.');
      return;
    }
    if (texteOuPayload === 'MENU_RESULTATS' || MOTS_CLES_BEPC.test(texteOuPayload) || MOTS_CLES_BACC_REEL.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'resultats_menu' };
      await sendMessage(senderId, '🎓 Quel examen souhaites-tu vérifier ?\n\n(Tape CEPE, BEPC ou BACC)',
        [{ content_type: 'text', title: 'CEPE', payload: 'EXAM_CEPE' }, { content_type: 'text', title: 'BEPC', payload: 'EXAM_BEPC' }, { content_type: 'text', title: 'BACC', payload: 'EXAM_BACC' }]
      );
      return;
    }
    if (texteOuPayload.startsWith('HIANATRA_AUDIO_')) {
      // ... (votre code existant pour l'audio)
      // Je ne le recopie pas pour garder la lisibilité, mais vous devez le conserver.
      return;
    }
    if (texteOuPayload.startsWith('ACTIVER_ALERTE_')) {
      // ... code existant
      return;
    }
    if (texteOuPayload === 'MENU_CORRECTION' || MOTS_CLES_CORRECTION.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'correction' };
      await sendMessage(senderId, '📝 Mode Correction activé.\n\nEnvoie-moi tes textes, je les corrige un par un.', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_TRADUCTION' || MOTS_CLES_TRADUCTION.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'traduction', langue: null };
      await sendMessage(senderId, '🌐 Vers quelle langue veux-tu traduire ? (ex: anglais, malgache...)', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_EXERCICES' || MOTS_CLES_EXERCICES.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'exercices' };
      await sendMessage(senderId, '📚 Mode Exercices activé.\n\nEnvoie-moi un sujet/matière (ex: "conjugaison du présent"), je génère un exercice à chaque fois.', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_CORRECTION_EXERCICES' || MOTS_CLES_CORRECTION_EXERCICES.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'correction_exercices' };
      await sendMessage(senderId, '🖊️ Mode Correction d\'exercices activé (toutes matières).\n\nEnvoie-moi le texte de l\'exercice/devoir/sujet, (ou directement une 📷 photo de la fiche), et je te donne le corrigé complet.', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_CODE' || MOTS_CLES_CODE.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'attente_code' };
      const creditsActuels = await obtenirCredits(senderId);
      await sendMessage(senderId, `🔑 Il te reste actuellement ${creditsActuels} crédit(s) payant(s), plus ${LIMITE_GRATUITE_PAR_JOUR} corrections gratuites chaque jour.\n\nEnvoie ton code d'activation pour ajouter des crédits.`, BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_CV' || MOTS_CLES_CV.test(texteOuPayload)) {
      const acces = await verifierEtConsommerCredit(senderId);
      if (!acces.autorise) {
        await sendMessage(senderId, `🔒 Tu as utilisé tes ${LIMITE_GRATUITE_PAR_JOUR} usages gratuits d'aujourd'hui, et tu n'as plus de crédits.\n\nRevien demain, ou tape "code" pour activer des crédits supplémentaires.`, BOUTON_MENU);
        return;
      }
      userModes[senderId] = { mode: 'creation_cv', etapeIndex: 0, donnees: {} };
      await sendMessage(senderId, ETAPES_CV[0].question, BOUTON_MENU);
      return;
    }
    if (MOTS_CLES_ADMIN.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'admin_identifiant' };
      await sendMessage(senderId, '🔐 Identifiant admin :');
      return;
    }
    if (texteOuPayload === 'MENU_BAC' || MOTS_CLES_BAC.test(texteOuPayload)) {
      const acces = await verifierEtConsommerCredit(senderId);
      if (!acces.autorise) {
        await sendMessage(senderId, `🔒 Tu as utilisé tes ${LIMITE_GRATUITE_PAR_JOUR} usages gratuits d'aujourd'hui, et tu n'as plus de crédits.\n\nRevien demain, ou tape "code" pour activer des crédits supplémentaires.`, BOUTON_MENU);
        return;
      }
      userModes[senderId] = { mode: 'simulation_bac_serie' };
      await sendMessage(senderId, `🧮 Simulateur Bac Madagascar\n\nQuelle est ta série ? (${Object.keys(COEFFICIENTS_BAC).join(', ')})`, BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_HIANATRA' || MOTS_CLES_HIANATRA.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'hianatra_menu' };
      await sendMessage(senderId, '🎓 **Hianatra - Espace Apprentissage**\n\nQue souhaites-tu apprendre aujourd\'hui ?\n🇲🇬 Inona no tianao hianarana androany?',
        [{ content_type: 'text', title: '💻 Informatique', payload: 'HIANATRA_INFO' }, { content_type: 'text', title: '🌍 Langues', payload: 'HIANATRA_LANGUES' }, { content_type: 'text', title: '📚 Leçons Scolaires', payload: 'HIANATRA_LECONS' }, { content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }]
      );
      return;
    }
  } // fin peutChangerDeModeParMotCle

  // ---------- Comportement selon le mode actif ----------
  switch (etat.mode) {
    case 'resultats_menu': {
      const choix = texteOuPayload.toUpperCase().trim();
      if (choix === 'EXAM_CEPE' || choix === 'CEPE') {
        userModes[senderId] = { mode: 'resultats', typeExam: 'cepe' };
        await sendMessage(senderId, `🎓 Mode Résultats CEPE activé.\n\nAlefaso eto ny n°matricule na anarana feno.`, BOUTON_MENU);
      } else if (choix === 'EXAM_BEPC' || choix === 'BEPC') {
        userModes[senderId] = { mode: 'resultats', typeExam: 'bepc' };
        await sendMessage(senderId, `🎓 Mode Résultats BEPC activé.\n\nAlefaso eto ny n°matricule na anarana feno.`, BOUTON_MENU);
      } else if (choix === 'EXAM_BACC' || choix === 'BACC') {
        userModes[senderId] = { mode: 'choix_province_bacc' };
        await sendMessage(senderId, '🎓 Résultats BACC\n\nChoisis ou tape le nom de ta province (ex: Antananarivo, Fianarantsoa, Toamasina, Mahajanga, Toliara, Antsiranana) :',
          [{ content_type: 'text', title: 'Antananarivo', payload: 'BACC_PROV_antananarivo' }, { content_type: 'text', title: 'Fianarantsoa', payload: 'BACC_PROV_fianarantsoa' }, { content_type: 'text', title: 'Toamasina', payload: 'BACC_PROV_toamasina' }, { content_type: 'text', title: 'Mahajanga', payload: 'BACC_PROV_mahajanga' }, { content_type: 'text', title: 'Toliara', payload: 'BACC_PROV_toliara' }, { content_type: 'text', title: 'Antsiranana', payload: 'BACC_PROV_antsiranana' }]
        );
      } else {
        await sendMessage(senderId, "❌ Choix non reconnu. Tape CEPE, BEPC ou BACC :");
      }
      return;
    }
    case 'choix_province_bacc': {
      const province = texteOuPayload.startsWith('BACC_PROV_') ? texteOuPayload.replace('BACC_PROV_', '') : normaliserProvince(texteOuPayload);
      if (province) {
        userModes[senderId] = { mode: 'resultats_bacc', province };
        await sendMessage(senderId, `🎓 Résultats BACC - Province : ${province.toUpperCase()}\n\nAlefaso eto ny n° d\'inscription (7 chiffres) na anarana feno.`, BOUTON_MENU);
      } else {
        await sendMessage(senderId, "❌ Province non reconnue. Tape le nom exact (ex: Antananarivo, Fianarantsoa, Toamasina, Mahajanga, Toliara, Antsiranana) :");
      }
      return;
    }
    case 'resultats_bacc': {
      await sendTyping(senderId, true);
      const res = await searchBacc(texteOuPayload, etat.province);
      await sendTyping(senderId, false);
      if (typeof res === 'object' && res.introuvable) {
        await sendMessage(senderId, res.msg);
        await sendMessage(senderId, `${MSG_INCITATION_ABONNEMENT.fr}\n\n${MSG_INCITATION_ABONNEMENT.mg}`, [{ type: 'web_url', url: URL_PAGE_FACEBOOK, title: '👍 S\'abonner / Hanaraka' }]);
        await sendMessage(senderId, `${MSG_PROPOSER_ALERTE.fr}\n\n${MSG_PROPOSER_ALERTE.mg}`, [{ content_type: 'text', title: '🔔 M\'alerter', payload: `ACTIVER_ALERTE_${etat.province}` }, { content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }]);
        await ajouterXP(senderId, 2, 'resultat');
      } else {
        await sendMessage(senderId, res, BOUTON_MENU);
        await ajouterXP(senderId, 10, 'resultat_bac');
      }
      return;
    }
    case 'admin_identifiant': {
      if (MOTS_CLES_QUITTER_ADMIN.test(texteOuPayload)) {
        userModes[senderId] = { mode: 'chat' };
        return envoyerMenu(senderId);
      }
      userModes[senderId] = { mode: 'admin_motdepasse', identifiant: texteOuPayload.trim() };
      await sendMessage(senderId, '🔐 Mot de passe :');
      return;
    }
    case 'admin_motdepasse': {
      const identifiantOk = process.env.ADMIN_USERNAME && etat.identifiant === process.env.ADMIN_USERNAME;
      const motDePasseOk = process.env.ADMIN_PASSWORD && texteOuPayload.trim() === process.env.ADMIN_PASSWORD;
      if (!identifiantOk || !motDePasseOk) {
        userModes[senderId] = { mode: 'chat' };
        await sendMessage(senderId, '❌ Identifiant ou mot de passe incorrect.');
        return;
      }
      userModes[senderId] = { mode: 'admin_menu' };
      await sendMessage(senderId, '✅ Connecté en admin.\n\nTape "code" pour générer un code.\nTape "alerte" pour envoyer les notifications BACC.\nTape "quitter" pour sortir.');
      return;
    }
    case 'admin_menu': {
      if (MOTS_CLES_QUITTER_ADMIN.test(texteOuPayload)) {
        userModes[senderId] = { mode: 'chat' };
        return envoyerMenu(senderId);
      }
      if (/^code$/i.test(texteOuPayload.trim())) {
        userModes[senderId] = { mode: 'admin_code_credits' };
        await sendMessage(senderId, '💳 Combien de crédits pour ce code ?');
        return;
      }
      if (/^alerte$/i.test(texteOuPayload.trim())) {
        await sendMessage(senderId, '🔔 Quelle province vient de sortir ses résultats ?', [
          { content_type: 'text', title: 'Antananarivo', payload: 'ADMIN_ALERTE_antananarivo' },
          { content_type: 'text', title: 'Fianarantsoa', payload: 'ADMIN_ALERTE_fianarantsoa' },
          { content_type: 'text', title: 'Toamasina', payload: 'ADMIN_ALERTE_toamasina' },
          { content_type: 'text', title: 'Mahajanga', payload: 'ADMIN_ALERTE_mahajanga' },
          { content_type: 'text', title: 'Toliara', payload: 'ADMIN_ALERTE_toliara' },
          { content_type: 'text', title: 'Antsiranana', payload: 'ADMIN_ALERTE_antsiranana' },
        ]);
        return;
      }
      if (texteOuPayload.startsWith('ADMIN_ALERTE_')) {
        const province = texteOuPayload.replace('ADMIN_ALERTE_', '');
        userModes[senderId] = { mode: 'admin_confirmation_alerte', provinceAlerte: province };
        await sendMessage(senderId, `⚠️ Envoyer les alertes pour **${province}** ? (tape "OUI" pour confirmer)`);
        return;
      }
      await sendMessage(senderId, 'Commande non reconnue. Tape "code" pour générer un code, ou "quitter" pour sortir.');
      return;
    }
    case 'admin_code_credits': {
      const creditsNum = parseInt(texteOuPayload.trim(), 10);
      if (!creditsNum || creditsNum <= 0) {
        await sendMessage(senderId, 'Nombre invalide. Combien de crédits pour ce code ?');
        return;
      }
      userModes[senderId] = { mode: 'admin_code_perso', creditsDemandes: creditsNum };
      await sendMessage(senderId, 'Code personnalisé ? (tape "auto" pour un code aléatoire)');
      return;
    }
    case 'admin_confirmation_alerte': {
      if (/^oui$/i.test(texteOuPayload.trim())) {
        await sendMessage(senderId, '🚀 Envoi des alertes...');
        const nb = await declencherAlertes(etat.provinceAlerte);
        userModes[senderId] = { mode: 'admin_menu' };
        await sendMessage(senderId, `✅ Terminé ! ${nb} alertes envoyées.`);
      } else {
        userModes[senderId] = { mode: 'admin_menu' };
        await sendMessage(senderId, '❌ Annulé.');
      }
      return;
    }
    case 'admin_code_perso': {
      const saisie = texteOuPayload.trim();
      const code = /^auto$/i.test(saisie) ? genererCodeAleatoire() : saisie.toUpperCase();
      if (await codeDejaUtilise(code)) {
        userModes[senderId] = { mode: 'admin_menu' };
        await sendMessage(senderId, `⚠️ "${code}" existe déjà et a été utilisé. Tape "code" pour réessayer.`);
        return;
      }
      await redisSet(`code_credits:${code}`, etat.creditsDemandes);
      userModes[senderId] = { mode: 'admin_menu' };
      await sendMessage(senderId, `✅ Code généré :\n🔑 ${code}\n💳 ${etat.creditsDemandes} crédits\n\nTape "code" pour en générer un autre, ou "quitter" pour sortir.`);
      return;
    }
    case 'simulation_bac_serie': {
      const serie = normaliserSerie(texteOuPayload);
      if (!serie) {
        await sendMessage(senderId, `Série non reconnue. Choisis parmi : ${Object.keys(COEFFICIENTS_BAC).join(', ')}`);
        return;
      }
      const matieres = Object.keys(COEFFICIENTS_BAC[serie]);
      userModes[senderId] = { mode: 'simulation_bac_notes', serie, matieres, index: 0, notes: {} };
      await sendMessage(senderId, `Note en ${matieres[0]} (/20) ?`);
      return;
    }
    case 'simulation_bac_notes': {
      const note = parseFloat(texteOuPayload.replace(',', '.'));
      const matiereActuelle = etat.matieres[etat.index];
      if (isNaN(note) || note < 0 || note > 20) {
        await sendMessage(senderId, `Note invalide. Donne une note entre 0 et 20 pour ${matiereActuelle} :`);
        return;
      }
      etat.notes[matiereActuelle] = note;
      const indexSuivant = etat.index + 1;
      if (indexSuivant < etat.matieres.length) {
        userModes[senderId] = { mode: 'simulation_bac_notes', serie: etat.serie, matieres: etat.matieres, index: indexSuivant, notes: etat.notes };
        await sendMessage(senderId, `Note en ${etat.matieres[indexSuivant]} (/20) ?`);
        return;
      }
      const resultat = calculerResultatBac(etat.serie, etat.notes);
      const texteResultat = formaterResultatBac(etat.serie, resultat);
      userModes[senderId] = { mode: 'chat' };
      await sendMessage(senderId, texteResultat, BOUTON_MENU);
      await ajouterXP(senderId, 15, 'simulation_bac');
      return;
    }
    case 'creation_cv': {
      const etapeActuelle = ETAPES_CV[etat.etapeIndex];
      if (etapeActuelle.cle === 'qualites' && /^auto$/i.test(texteOuPayload.trim())) {
        userModes[senderId] = { mode: 'creation_cv_genre', etapeIndex: etat.etapeIndex, donnees: etat.donnees };
        await sendMessage(senderId, 'Pour bien accorder les qualités (ex: "sérieux"/"sérieuse"), tu es un homme ou une femme ? (ou tape "passe")');
        return;
      }
      etat.donnees[etapeActuelle.cle] = texteOuPayload;
      const etapeSuivanteIndex = etat.etapeIndex + 1;
      if (etapeSuivanteIndex < ETAPES_CV.length) {
        userModes[senderId] = { mode: 'creation_cv', etapeIndex: etapeSuivanteIndex, donnees: etat.donnees };
        await sendMessage(senderId, ETAPES_CV[etapeSuivanteIndex].question, BOUTON_MENU);
        return;
      }
      userModes[senderId] = { mode: 'creation_cv_loisirs_photo', donnees: etat.donnees };
      await sendMessage(senderId, 'Un petit plus (optionnel) : tes loisirs/centres d\'intérêt ? (ou tape "passe")\n🇲🇬 Ny fialan-tsasatrao/zavatra tianao ? (na soraty hoe "passe")');
      return;
    }
    case 'creation_cv_genre': {
      const saisieGenre = texteOuPayload.trim();
      const qualitesAuto = /^passe$/i.test(saisieGenre) ? QUALITES_AUTO_NEUTRE : qualitesAutoSelonGenre(saisieGenre);
      etat.donnees.qualites = qualitesAuto;
      if (/^(h|homme|masculin|m)$/i.test(saisieGenre)) etat.donnees._genre = 'H';
      else if (/^(f|femme|f[ée]minin)$/i.test(saisieGenre)) etat.donnees._genre = 'F';
      const etapeSuivanteIndex = etat.etapeIndex + 1;
      userModes[senderId] = { mode: 'creation_cv', etapeIndex: etapeSuivanteIndex, donnees: etat.donnees };
      await sendMessage(senderId, ETAPES_CV[etapeSuivanteIndex].question, BOUTON_MENU);
      return;
    }
    case 'creation_cv_loisirs_photo': {
      if (!etat.donnees.loisirs && etat.etapePhoto !== true) {
        etat.donnees.loisirs = /^passe$/i.test(texteOuPayload.trim()) ? '' : texteOuPayload;
        userModes[senderId] = { mode: 'creation_cv_loisirs_photo', donnees: etat.donnees, etapePhoto: true };
        await sendMessage(senderId, '📷 Envoie-moi une photo pour ton CV (ou tape "passe" pour ne pas en mettre).\n🇲🇬 Alefaso sary iray ho an\'ny CV-nao (na soraty hoe "passe" raha tsy te hametraka sary ianao).');
        return;
      }
      if (/^passe$/i.test(texteOuPayload.trim())) {
        await genererEtEnvoyerCv(senderId, etat.donnees, null);
        await ajouterXP(senderId, 20, 'cv_creation');
        return;
      }
      await sendMessage(senderId, 'Envoie-moi une photo, ou tape "passe" pour continuer sans photo.');
      return;
    }
    case 'attente_code': {
      const code = texteOuPayload.trim().toUpperCase();
      userModes[senderId] = { mode: 'chat' };
      const creditsDuCode = await obtenirCreditsDuCode(code);
      if (!creditsDuCode) {
        await sendMessage(senderId, '❌ Ce code n\'est pas valide. Vérifie qu\'il est bien écrit, ou contacte Tsarafandray Services pour en obtenir un.', BOUTON_MENU);
        return;
      }
      if (await codeDejaUtilise(code)) {
        await sendMessage(senderId, '⚠️ Ce code a déjà été utilisé.', BOUTON_MENU);
        return;
      }
      await marquerCodeUtilise(code);
      const creditsActuels = await obtenirCredits(senderId);
      const nouveauTotal = creditsActuels + creditsDuCode;
      await definirCredits(senderId, nouveauTotal);
      await sendMessage(senderId, `✅ Code activé ! +${creditsDuCode} crédits.\n💳 Total actuel : ${nouveauTotal} crédits.`, BOUTON_MENU);
      return;
    }
    case 'humain': {
      return;
    }
    case 'resultats': {
      await sendTyping(senderId, true);
      const resultat = await searchBepc(texteOuPayload, etat.typeExam);
      await sendTyping(senderId, false);
      await sendMessage(senderId, resultat, BOUTON_MENU);
      await ajouterXP(senderId, 2, 'resultat');
      return;
    }
    case 'correction': {
      await sendTyping(senderId, true);
      const corrige = await correctText(texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, `✅ Texte corrigé :\n\n${corrige}`, BOUTON_MENU);
      const resultXP = await ajouterXP(senderId, 5, 'correction');
      if (resultXP.montee) {
        await sendMessage(senderId, `🎉 **Niveau supérieur !** Tu es maintenant niveau ${resultXP.nouveauNiveau} !`, BOUTON_MENU);
      }
      return;
    }
    case 'traduction': {
      if (!etat.langue) {
        userModes[senderId] = { mode: 'traduction', langue: texteOuPayload };
        await sendMessage(senderId, `Ok, envoie-moi tes textes, je les traduis en ${texteOuPayload}.`, BOUTON_MENU);
        return;
      }
      await sendTyping(senderId, true);
      const traduction = await chatWithGemini(`Traduis le texte suivant en ${etat.langue}. Réponds uniquement avec la traduction, sans explication :\n\n"${texteOuPayload}"`, 'traduction');
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🌐 ${traduction}`, BOUTON_MENU);
      await ajouterXP(senderId, 3, 'traduction');
      return;
    }
    case 'correction_exercices': {
      const acces = await verifierEtConsommerCredit(senderId);
      if (!acces.autorise) {
        await sendMessage(senderId, `🔒 Tu as utilisé tes ${LIMITE_GRATUITE_PAR_JOUR} corrections gratuites d'aujourd'hui, et tu n'as plus de crédits.\n\nRevien demain pour de nouvelles corrections gratuites, ou tape "code" pour activer des crédits supplémentaires.`, BOUTON_MENU);
        return;
      }
      await sendTyping(senderId, true);
      const profile = await getProfile(senderId);
      const niveau = profile?.niveau_scolaire || 'collège';
      const matieresFav = profile?.matieres_favorites || ['général'];
      const infosProfil = `Niveau : ${niveau}, Matières favorites : ${matieresFav.join(', ')}.`;

      const demandePOSeule = /\bp\.?\s*o\.?\b/i.test(texteOuPayload);
      let correction;
      if (demandePOSeule) {
        const sujetSeul = texteOuPayload.replace(/\bp\.?\s*o\.?\b/i, '').trim();
        correction = await chatWithGemini(`Voici un sujet/laza adina scolaire : "${sujetSeul}". Détermine la matière (Histoire-Géo français / Malagasy / Philosophie) et rédige UNIQUEMENT la problématique (petrak'olana) correspondant à ce sujet, sous forme d'une seule question bien formulée selon la méthodologie appropriée. Ne donne rien d'autre : pas d'introduction complète, pas de développement, pas de conclusion, pas d'étiquette du type "Petrak'olana :" — juste la question elle-même. N'utilise aucun markdown.${consigneMethodologie()}${contenuMalagasyPertinent(sujetSeul)}`, 'correction_exercice_po');
        await sendTyping(senderId, false);
        await sendMessage(senderId, `❓ ${correction}`, BOUTON_MENU);
        await ajouterXP(senderId, 3, 'correction');
        return;
      }
      correction = await chatWithGemini(`Voici un exercice ou devoir scolaire (n'importe quelle matière) : "${texteOuPayload}". Fais-en le corrigé complet : réponds à chaque question/sujet posé, de façon claire et structurée. N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer. Prends en compte ces infos sur l'élève : ${infosProfil}.${consigneMethodologie()}${CONSIGNE_FORMAT_MATH}${contenuMalagasyPertinent(texteOuPayload)}`, 'correction_exercice_texte');
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🖊️ ${correction}`, BOUTON_MENU);
      const resultXP = await ajouterXP(senderId, 5, 'correction');
      if (resultXP.montee) {
        await sendMessage(senderId, `🎉 **Niveau supérieur !** Tu es maintenant niveau ${resultXP.nouveauNiveau} !`, BOUTON_MENU);
      }
      if (MOTS_CLES_GRAPHIQUE.test(texteOuPayload)) {
        const donnees = await extraireFonctionGraphique(texteOuPayload);
        if (donnees) {
          const urlGraphique = await genererGraphiqueMath(donnees.formule, donnees.xMin, donnees.xMax);
          if (urlGraphique) await sendImage(senderId, urlGraphique);
        }
      }
      return;
    }
    case 'exercices': {
      await sendTyping(senderId, true);
      const profile = await getProfile(senderId);
      const niveau = profile?.niveau_scolaire || 'collège';
      const matieresFav = profile?.matieres_favorites || ['général'];
      const infosProfil = `Niveau : ${niveau}, Matières favorites : ${matieresFav.join(', ')}.`;
      const exercice = await chatWithGemini(`Crée un court exercice scolaire (avec sa correction en dessous, séparée par "---CORRECTION---") sur le sujet suivant, adapté à un élève : "${texteOuPayload}". Prends en compte ces infos : ${infosProfil}. Reste concis. N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer.${consigneMethodologie()}${CONSIGNE_FORMAT_MATH}${contenuMalagasyPertinent(texteOuPayload)}`, 'generation_exercice');
      await sendTyping(senderId, false);
      await sendMessage(senderId, `📚 ${exercice}`, BOUTON_MENU);
      await ajouterXP(senderId, 3, 'generation_exercice');
      return;
    }
    case 'defi_quotidien': {
      const reponseUser = texteOuPayload.trim();
      await sendTyping(senderId, true);
      const verif = await chatWithGemini(`Voici un exercice et sa correction :\n${etat.enonce}\n\nVoici la réponse de l'élève : "${reponseUser}".\nEst-ce que la réponse est correcte ou partiellement correcte ? Réponds uniquement par "oui" ou "partiellement" ou "non".`, 'defi_verification');
      await sendTyping(senderId, false);
      const verdict = verif.trim().toLowerCase();
      if (verdict.startsWith('oui') || verdict.startsWith('partiellement')) {
        const result = await ajouterXP(senderId, 15, 'defi');
        const daily = await getDailyChallenge(senderId);
        if (daily) { daily.fait = true; await setDailyChallenge(senderId, daily); }
        let msg = "✅ **Bravo !** Ta réponse est correcte (ou partiellement). Tu gagnes 15 XP !";
        if (result.montee) msg += `\n🎉 **Niveau supérieur !** Tu es maintenant niveau ${result.nouveauNiveau} !`;
        await sendMessage(senderId, msg, BOUTON_MENU);
      } else {
        await sendMessage(senderId, "❌ **Pas tout à fait.** Voici la correction :\n" + extraireCorrection(etat.enonce), BOUTON_MENU);
        await ajouterXP(senderId, 2, 'defi_echec');
      }
      userModes[senderId] = { mode: 'chat' };
      break;
    }
    case 'hianatra_menu': {
      let discipline = '', instruction = '';
      const choix = texteOuPayload.toUpperCase().trim();
      if (choix === 'HIANATRA_INFO' || choix === '1' || choix === 'INFORMATIQUE' || choix === 'INFO') {
        discipline = 'Informatique';
        instruction = 'Tu es un expert en informatique. Aide l\'utilisateur à apprendre la programmation, la bureautique ou la technologie. Sois pédagogique et donne des exemples concrets.';
      } else if (choix === 'HIANATRA_LANGUES' || choix === '2' || choix === 'LANGUES' || choix === 'LANGUE') {
        discipline = 'Langues';
        instruction = 'Tu es un tuteur de langues expert (Français, Anglais, Malagasy). Aide l\'utilisateur à pratiquer. Propose des exercices de traduction ou de conversation. Si l\'utilisateur écrit en Malagasy, réponds en Malagasy et en Français/Anglais pour l\'aider à apprendre.';
      } else if (choix === 'HIANATRA_LECONS' || choix === '3' || choix === 'LEÇONS' || choix === 'LECONS' || choix === 'LEÇON' || choix === 'LECON') {
        discipline = 'Leçons Scolaires';
        instruction = 'Tu es un professeur polyvalent. Aide l\'utilisateur avec ses cours (Maths, SVT, Histoire, etc.). Explique les concepts complexes simplement.';
      } else {
        await sendMessage(senderId, "❌ Choix non reconnu. Tape 1, 2 ou 3 :\n1️⃣ Informatique\n2️⃣ Langues\n3️⃣ Leçons");
        return;
      }
      userModes[senderId] = { mode: 'hianatra_session', discipline, instruction, historique: [] };
      await sendMessage(senderId, `🚀 **Mode ${discipline} activé**\n\nJe suis ton tuteur personnel. Pose-moi tes questions ou dis-moi ce que tu veux réviser.\n🇲🇬 Izaho no mpampianatra anao. Mametraha fanontaniana na lazao izay tianao hianarana.`, BOUTON_MENU);
      return;
    }
    case 'hianatra_session': {
      await sendTyping(senderId, true);
      try {
        let historique = etat.historique || [];
        historique.push({ role: 'user', parts: [{ text: texteOuPayload }] });
        if (historique.length > 10) historique = historique.slice(-10);
        const promptSystem = `${etat.instruction} Réponds de manière structurée et encourageante. Utilise le multilinguisme (Français et Malagasy) pour bien expliquer. N'utilise JAMAIS de markdown (**gras**, #titre).`;
        const reponse = await appellerGemini({ contents: historique, system_instruction: { parts: [{ text: promptSystem }] } }, 'hianatra_tutorat');
        historique.push({ role: 'model', parts: [{ text: reponse }] });
        userModes[senderId].historique = historique;
        await sendTyping(senderId, false);
        if (etat.discipline === 'Langues') {
          const payloadAudio = `HIANATRA_AUDIO_${Buffer.from(reponse.slice(0, 150)).toString('base64')}`;
          await sendMessage(senderId, `🎓 ${reponse}`, [{ content_type: 'text', title: '🔊 Écouter', payload: payloadAudio }, { content_type: 'text', title: '🔁 Menu Hianatra', payload: 'MENU_HIANATRA' }]);
        } else {
          await sendMessage(senderId, `🎓 ${reponse}`, BOUTON_MENU);
        }
        await ajouterXP(senderId, 5, 'hianatra');
      } catch (err) {
        console.error('Erreur hianatra_session:', err.message);
        await sendTyping(senderId, false);
        await sendMessage(senderId, "❌ Une petite erreur est survenue dans ton cours. Réessaie !", BOUTON_MENU);
      }
      return;
    }
    default: {
      await sendTyping(senderId, true);
      const reponse = await chatAvecHistorique(senderId, texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, reponse, BOUTON_MENU);
      return;
    }
  }
}

// ============================================================
// GESTION DES IMAGES REÇUES
// ============================================================
async function handleImageEvent(senderId, imageUrl) {
  const etat = userModes[senderId] || { mode: 'chat' };

  if (etat.mode === 'correction_exercices') {
    const acces = await verifierEtConsommerCredit(senderId);
    if (!acces.autorise) {
      await sendMessage(senderId, `🔒 Tu as utilisé tes ${LIMITE_GRATUITE_PAR_JOUR} corrections gratuites d'aujourd'hui, et tu n'as plus de crédits.\n\nRevien demain pour de nouvelles corrections gratuites, ou tape "code" pour activer des crédits supplémentaires.`, BOUTON_MENU);
      return;
    }
    await sendTyping(senderId, true);
    const { correction, transcription } = await correctExerciseImage(imageUrl);
    await sendTyping(senderId, false);
    await sendMessage(senderId, `🖊️📷 ${correction}`, BOUTON_MENU);
    const resultXP = await ajouterXP(senderId, 5, 'correction');
    if (resultXP.montee) await sendMessage(senderId, `🎉 **Niveau supérieur !** Tu es maintenant niveau ${resultXP.nouveauNiveau} !`, BOUTON_MENU);
    if (transcription && MOTS_CLES_GRAPHIQUE.test(transcription)) {
      const donnees = await extraireFonctionGraphique(transcription);
      if (donnees) {
        const urlGraphique = await genererGraphiqueMath(donnees.formule, donnees.xMin, donnees.xMax);
        if (urlGraphique) await sendImage(senderId, urlGraphique);
      }
    }
    return;
  }

  if (etat.mode === 'creation_cv') {
    await sendTyping(senderId, true);
    try {
      const extrait = await extraireInfosCvDepuisImage(imageUrl);
      const donneesFusionnees = { ...etat.donnees };
      for (const cle of Object.keys(extrait)) {
        if (!donneesFusionnees[cle] && extrait[cle]) donneesFusionnees[cle] = extrait[cle];
      }
      await sendTyping(senderId, false);
      const indexPremierManquant = ETAPES_CV.findIndex((e) => !donneesFusionnees[e.cle]);
      if (indexPremierManquant === -1) {
        userModes[senderId] = { mode: 'creation_cv_loisirs_photo', donnees: donneesFusionnees };
        await sendMessage(senderId, '📄 Infos extraites de ta photo ! Il ne reste que les derniers détails.\n\nUn petit plus (optionnel) : tes loisirs/centres d\'intérêt ? (ou tape "passe")\n🇲🇬 Ny fialan-tsasatrao/zavatra tianao ? (na soraty hoe "passe")');
      } else {
        userModes[senderId] = { mode: 'creation_cv', etapeIndex: indexPremierManquant, donnees: donneesFusionnees };
        await sendMessage(senderId, `📄 Infos extraites de ta photo ! Il me manque juste quelques précisions.\n\n${ETAPES_CV[indexPremierManquant].question}`, BOUTON_MENU);
      }
    } catch (err) {
      console.error('Erreur extraction CV image:', err.response?.data || err.message);
      await sendTyping(senderId, false);
      await sendMessage(senderId, `Désolé, je n'ai pas réussi à lire cette image. On continue avec les questions :\n\n${ETAPES_CV[etat.etapeIndex].question}`, BOUTON_MENU);
    }
    return;
  }

  if (etat.mode === 'creation_cv_loisirs_photo' && etat.etapePhoto === true) {
    try {
      const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const photoBuffer = Buffer.from(imgResponse.data);
      await genererEtEnvoyerCv(senderId, etat.donnees, photoBuffer);
      await ajouterXP(senderId, 25, 'cv_creation');
    } catch (err) {
      console.error('Erreur réception photo CV:', err.message);
      await sendMessage(senderId, "Désolé, je n'ai pas réussi à récupérer cette photo. Tape \"passe\" pour continuer sans photo, ou renvoie une image.", BOUTON_MENU);
    }
    return;
  }

  await sendMessage(senderId, '📷 J\'ai bien reçu ta photo ! Pour que je la corrige automatiquement, active d\'abord le mode "Corriger un exercice" (👉soraty "devoir" na tsindrio ny "6"), ary avereno alefa ny sary.', BOUTON_MENU);
}

// ============================================================
// GESTION DES MESSAGES VOCAUX
// ============================================================
async function handleAudioEvent(senderId, audioUrl) {
  const etat = userModes[senderId] || { mode: 'chat' };
  if (etat.mode !== 'hianatra_session') {
    await sendMessage(senderId, '🎙️ J\'ai bien reçu ton message vocal ! Pour pratiquer la conversation avec moi, active d\'abord le mode "Hianatra" (🎓 Apprendre).', BOUTON_MENU);
    return;
  }
  await sendTyping(senderId, true);
  try {
    const audioResp = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const audioBase64 = Buffer.from(audioResp.data).toString('base64');
    const promptSystem = `${etat.instruction} L'utilisateur t'a envoyé un message VOCAL. Écoute-le attentivement. 1. Transcris ce qu'il a dit. 2. Réponds à son message de manière pédagogique. 3. Si c'est un cours de langue, corrige sa prononciation ou sa grammaire si nécessaire. Réponds en mélangeant Français et Malagasy. N'utilise JAMAIS de markdown.`;
    const reponse = await appellerGemini({
      contents: [ { role: 'user', parts: [ { inline_data: { mime_type: 'audio/mpeg', data: audioBase64 } }, { text: "Écoute mon message vocal et réponds-moi." } ] } ],
      system_instruction: { parts: [{ text: promptSystem }] }
    }, 'hianatra_audio_conversation');
    if (!etat.historique) etat.historique = [];
    etat.historique.push({ role: 'user', parts: [{ text: "[Message Vocal]" }] });
    etat.historique.push({ role: 'model', parts: [{ text: reponse }] });
    userModes[senderId].historique = etat.historique.slice(-10);
    await sendTyping(senderId, false);
    if (etat.discipline === 'Langues') {
      const payloadAudio = `HIANATRA_AUDIO_${Buffer.from(reponse.slice(0, 150)).toString('base64')}`;
      await sendMessage(senderId, `🎓🎙️ ${reponse}`, [{ content_type: 'text', title: '🔊 Écouter ma réponse', payload: payloadAudio }, { content_type: 'text', title: '🔁 Menu Hianatra', payload: 'MENU_HIANATRA' }]);
    } else {
      await sendMessage(senderId, `🎓🎙️ ${reponse}`, BOUTON_MENU);
    }
    await ajouterXP(senderId, 5, 'hianatra_audio');
  } catch (err) {
    console.error('Erreur handleAudioEvent:', err.message);
    await sendTyping(senderId, false);
    await sendMessage(senderId, "❌ Désolé, je n'ai pas réussi à analyser ton message vocal. Assure-toi qu'il est clair et réessaie.", BOUTON_MENU);
  }
}

// ============================================================
// RECHERCHE BEPC/CEPE (à conserver)
// ============================================================
async function searchBepc(query, typeExam, tentative = 1) {
  // ... votre code existant (je ne le recopie pas)
}

// ============================================================
// RECHERCHE BACC (à conserver)
// ============================================================
const BACC_CONFIG = { /* ... votre config ... */ };
const PROVINCE_MAP = { /* ... votre map ... */ };
function normaliserProvince(texte) { /* ... */ }
async function searchBacc(query, province, tentative = 1) { /* ... */ }
function formatResultatBacc(r, provinceName) { /* ... */ }
const URL_PAGE_FACEBOOK = 'https://www.facebook.com/profile.php?id=100081570672160';
const MSG_INCITATION_ABONNEMENT = { fr: '...', mg: '...' };
const MSG_PROPOSER_ALERTE = { fr: '...', mg: '...' };
async function inscrireAlerte(senderId, province) { /* ... */ }
async function declencherAlertes(province) { /* ... */ }

// ============================================================
// FONCTIONS CV (à conserver)
// ============================================================
const ETAPES_CV = [ /* ... votre liste ... */ ];
const QUALITES_AUTO_HOMME = '...';
const QUALITES_AUTO_FEMME = '...';
const QUALITES_AUTO_NEUTRE = '...';
function qualitesAutoSelonGenre(reponseGenre) { /* ... */ }
function decouperEnListe(texte) { /* ... */ }
function genererPdfCv(donnees, photoBuffer) { /* ... */ }
async function humaniserContenuCv(donnees) { /* ... */ }
async function extraireInfosCvDepuisImage(imageUrl) { /* ... */ }
async function genererEtEnvoyerCv(senderId, donneesBrutes, photoBuffer) { /* ... */ }

// ============================================================
// SIMULATEUR BAC (à conserver)
// ============================================================
const COEFFICIENTS_BAC = { /* ... */ };
function normaliserSerie(texte) { /* ... */ }
function calculerResultatBac(serie, notes) { /* ... */ }
function formaterResultatBac(serie, resultat) { /* ... */ }

// ============================================================
// MÉTHODOLOGIE ET CONTENU DE RÉFÉRENCE (à conserver)
// ============================================================
const METHODOLOGIE_MADAGASCAR = `...`;
function consigneMethodologie() { /* ... */ }
const BLOCS_MALAGASY = [ /* ... */ ];
const BLOCS_PHILO = [ /* ... */ ];
function contenuMalagasyPertinent(texte, limiteBlocs) { /* ... */ }
const CONSIGNE_FORMAT_MATH = `...`;

// ============================================================
// CORRECTION D'IMAGE D'EXERCICE (à conserver)
// ============================================================
async function correctExerciseImage(imageUrl) { /* ... */ }

// ============================================================
// TRACÉ DE COURBES (à conserver)
// ============================================================
const MOTS_CLES_GRAPHIQUE = /\b(courbe|graphique|trac(e|é)|repr[ée]sente(r)?\s+graphiquement|diagramme)\b/i;
async function extraireFonctionGraphique(texte) { /* ... */ }
function normaliserFormule(formule) { /* ... */ }
function formuleAffichage(formule) { /* ... */ }
async function genererGraphiqueMath(formule, xMin, xMax) { /* ... */ }
async function sendImage(recipientId, imageUrl) { /* ... */ }
async function sendFile(recipientId, fileUrl) { /* ... */ }

// ============================================================
// ROUTES EXPRESS
// ============================================================
app.get('/webhook', (req, res) => { /* ... votre code ... */ });
app.post('/webhook', async (req, res) => {
  if (req.body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');
    for (const entry of req.body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;
      const imageAttachment = event.message?.attachments?.find(a => a.type === 'image');
      const audioAttachment = event.message?.attachments?.find(a => a.type === 'audio');
      if (imageAttachment) {
        handleImageEvent(senderId, imageAttachment.payload.url).catch(err => console.error(err));
      } else if (audioAttachment) {
        handleAudioEvent(senderId, audioAttachment.payload.url).catch(err => console.error(err));
      } else if (event.message?.text) {
        const payload = event.message.quick_reply?.payload;
        const userText = event.message.text.trim();
        handleEvent(senderId, payload || userText, !!payload).catch(err => console.error(err));
      }
      if (event.postback) {
        handleEvent(senderId, event.postback.payload, true).catch(err => console.error(err));
      }
    }
  } else {
    res.sendStatus(404);
  }
});
app.get('/stats', (req, res) => { /* ... */ });
app.get('/generated-image/:id', (req, res) => { /* ... */ });
app.get('/generated-file/:id', (req, res) => { /* ... */ });
app.get('/admin', (req, res) => { /* ... */ });
app.post('/admin/generate-code', async (req, res) => { /* ... */ });
app.get('/dashboard', (req, res) => { /* ... */ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
