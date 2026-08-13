const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const math = require('mathjs');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const { execSync } = require('child_process');
require('dotenv').config();

// ============================================================
// IMPORT DU MODULE MÉMOIRE
// ============================================================
const memoire = require('./memoire.js');

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));
const upload = multer({ dest: '/tmp/' });

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ============================================================
// ROTATION DES CLÉS GEMINI
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
// APPEL GÉNÉRIQUE GEMINI (TEXTE)
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
      await new Promise(r => setTimeout(r, 1500 * tentative));
      return appellerGemini(body, nomFonction, tentative + 1, essaiCle);
    }
    throw err;
  }
}

// ============================================================
// APPEL GEMINI VISION (avec fallback sur plusieurs modèles)
// ============================================================
async function appellerGeminiVision(prompt, imagePart, tentative = 1, essaiCle = 1) {
  enregistrerAppelStats('vision');
  try {
    const parts = [{ text: prompt }, imagePart];
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGeminiActuelle()}`,
      { contents: [{ parts }] }
    );
    const reponseParts = response.data.candidates[0].content.parts;
    const textPart = reponseParts.find(p => p.text);
    return textPart ? textPart.text : '';
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 400) {
      console.warn('⚠️ gemini-flash-lite-latest ne supporte pas les images, tentative avec gemini-1.5-flash');
      try {
        const parts = [{ text: prompt }, imagePart];
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleGeminiActuelle()}`,
          { contents: [{ parts }] }
        );
        const reponseParts = response.data.candidates[0].content.parts;
        const textPart = reponseParts.find(p => p.text);
        return textPart ? textPart.text : '';
      } catch (err2) {
        console.warn('⚠️ gemini-1.5-flash échoue, tentative avec gemini-1.0-pro-vision');
        try {
          const parts = [{ text: prompt }, imagePart];
          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro-vision:generateContent?key=${cleGeminiActuelle()}`,
            { contents: [{ parts }] }
          );
          const reponseParts = response.data.candidates[0].content.parts;
          const textPart = reponseParts.find(p => p.text);
          return textPart ? textPart.text : '';
        } catch (err3) {
          console.error('❌ Aucun modèle vision disponible, erreur :', err3.message);
          throw err3;
        }
      }
    }
    const status = err.response?.data?.error?.status;
    const message = err.response?.data?.error?.message || '';
    const cleInvalide =
      status === 'RESOURCE_EXHAUSTED' ||
      status === 'UNAUTHENTICATED' ||
      status === 'PERMISSION_DENIED' ||
      /api key not valid/i.test(message);
    if (cleInvalide && essaiCle < GEMINI_KEYS.length) {
      console.error(`Clé Gemini vision n°${(indexCleActuelle % GEMINI_KEYS.length) + 1} invalide/épuisée, on tente la suivante.`);
      passerCleGeminiSuivante();
      return appellerGeminiVision(prompt, imagePart, tentative, essaiCle + 1);
    }
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise(r => setTimeout(r, 1500 * tentative));
      return appellerGeminiVision(prompt, imagePart, tentative + 1, essaiCle);
    }
    throw err;
  }
}

// ============================================================
// GESTION DES IMAGES GÉNÉRÉES (Nano Banana)
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

// ============================================================
// FICHIERS GÉNÉRÉS (CV, mémoire, etc.)
// ============================================================
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
// REDIS & CRÉDITS
// ============================================================
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN;
const REDIS_ACTIF = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
if (!REDIS_ACTIF) console.log('⚠️ Upstash non configuré : données en RAM (perdus au redémarrage).');
const repliGenerique = {};
async function redisGet(cle) {
  if (!REDIS_ACTIF) return repliGenerique[cle] !== undefined ? String(repliGenerique[cle]) : null;
  try {
    const res = await axios.get(`${UPSTASH_URL}/get/${encodeURIComponent(cle)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
    return res.data.result;
  } catch (err) { console.error('Redis GET error', cle, err.message); return null; }
}
async function redisSet(cle, valeur) {
  if (!REDIS_ACTIF) { repliGenerique[cle] = valeur; return; }
  try {
    await axios.get(`${UPSTASH_URL}/set/${encodeURIComponent(cle)}/${encodeURIComponent(valeur)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  } catch (err) { console.error('Redis SET error', cle, err.message); }
}

const CODES_VALIDES = { DEMO10: 10 };
const LIMITE_GRATUITE_PAR_JOUR = 3;
const repliCredits = {};
const repliCodesUtilises = new Set();
const repliUsageJour = {};

async function obtenirCredits(senderId) {
  if (!REDIS_ACTIF) return repliCredits[senderId] || 0;
  const v = await redisGet(`credits:${senderId}`);
  return v ? parseInt(v,10) : 0;
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
  const aujourdHui = new Date().toISOString().slice(0,10);
  const cle = `usage:${senderId}:${aujourdHui}`;
  if (!REDIS_ACTIF) { if (!repliUsageJour[cle]) repliUsageJour[cle] = 0; return { cle, compte: repliUsageJour[cle] }; }
  const v = await redisGet(cle);
  return { cle, compte: v ? parseInt(v,10) : 0 };
}
async function incrementerUsageJour(cle, compteActuel) {
  if (!REDIS_ACTIF) { repliUsageJour[cle] = compteActuel + 1; return; }
  await redisSet(cle, compteActuel + 1);
}
function genererCodeAleatoire() {
  const car = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i=0; i<8; i++) code += car[Math.floor(Math.random()*car.length)];
  return code;
}
async function obtenirCreditsDuCode(code) {
  const dynamique = await redisGet(`code_credits:${code}`);
  if (dynamique) return parseInt(dynamique,10);
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
// GAMIFICATION
// ============================================================
const SEUILS_NIVEAUX = [
  { niveau:1, xp_min:0, titre:'Apprenti' },
  { niveau:2, xp_min:50, titre:'Débutant' },
  { niveau:3, xp_min:150, titre:'Intermédiaire' },
  { niveau:4, xp_min:350, titre:'Confirmé' },
  { niveau:5, xp_min:700, titre:'Expert' },
  { niveau:6, xp_min:1200, titre:'Maître' }
];
const BADGES = {
  PREMIER_EXERCICE: 'Premier exercice corrigé',
  PREMIER_RESULTAT: 'Premier résultat trouvé',
  BAC_TROUVE: 'Explorateur Bac',
  CORRECTION_10: '10 corrections effectuées',
  DEFI_7: 'Défi du jour (7 jours)',
  NIVEAU_3: 'Niveau 3 atteint',
  NIVEAU_5: 'Niveau 5 atteint',
  PREMIER_MEMOIRE: 'Premier mémoire rédigé'
};
async function getProfile(sid) { const r=await redisGet(`profile:${sid}`); try { return r ? JSON.parse(r) : null; } catch(e){ return null; } }
async function setProfile(sid,p) { await redisSet(`profile:${sid}`, JSON.stringify(p)); }
async function getXP(sid) { const v=await redisGet(`xp:${sid}`); return v ? parseInt(v,10) : 0; }
async function setXP(sid,v) { await redisSet(`xp:${sid}`, v); }
async function getLevel(sid) { const v=await redisGet(`level:${sid}`); return v ? parseInt(v,10) : 1; }
async function setLevel(sid,v) { await redisSet(`level:${sid}`, v); }
async function getBadges(sid) { const r=await redisGet(`badges:${sid}`); try { return r ? JSON.parse(r) : []; } catch(e){ return []; } }
async function setBadges(sid,b) { await redisSet(`badges:${sid}`, JSON.stringify(b)); }
async function getDaily(sid) { const r=await redisGet(`daily:${sid}`); try { return r ? JSON.parse(r) : null; } catch(e){ return null; } }
async function setDaily(sid,d) { await redisSet(`daily:${sid}`, JSON.stringify(d)); }
async function getStat(sid,action) { const v=await redisGet(`stats:${sid}:${action}`); return v ? parseInt(v,10) : 0; }
async function incStat(sid,action) { const c=await getStat(sid,action); await redisSet(`stats:${sid}:${action}`, c+1); }

async function ajouterXP(sid, qte, type) {
  let xp = await getXP(sid);
  xp += qte;
  await setXP(sid, xp);
  let niveau = await getLevel(sid);
  let nouveau = niveau;
  for (const s of SEUILS_NIVEAUX) if (xp >= s.xp_min) nouveau = s.niveau;
  const badges = await getBadges(sid);
  let montee = false;
  if (nouveau > niveau) {
    await setLevel(sid, nouveau);
    montee = true;
    if (nouveau >= 3 && !badges.includes(BADGES.NIVEAU_3)) badges.push(BADGES.NIVEAU_3);
    if (nouveau >= 5 && !badges.includes(BADGES.NIVEAU_5)) badges.push(BADGES.NIVEAU_5);
  }
  if (type === 'correction' && !badges.includes(BADGES.PREMIER_EXERCICE)) badges.push(BADGES.PREMIER_EXERCICE);
  if ((type === 'resultat' || type === 'resultat_bac') && !badges.includes(BADGES.PREMIER_RESULTAT)) badges.push(BADGES.PREMIER_RESULTAT);
  if (type === 'resultat_bac' && !badges.includes(BADGES.BAC_TROUVE)) badges.push(BADGES.BAC_TROUVE);
  if (type === 'correction') {
    await incStat(sid, 'corrections');
    const c = await getStat(sid, 'corrections');
    if (c >= 10 && !badges.includes(BADGES.CORRECTION_10)) badges.push(BADGES.CORRECTION_10);
  }
  if (type === 'memoire' && !badges.includes(BADGES.PREMIER_MEMOIRE)) badges.push(BADGES.PREMIER_MEMOIRE);
  await setBadges(sid, badges);
  return { xp, nouveauNiveau: nouveau, montee };
}

async function genererDefiQuotidien(sid) {
  const profile = await getProfile(sid);
  const matieres = profile?.matieres_favorites || ['maths', 'français', 'histoire'];
  const sujet = matieres[Math.floor(Math.random() * matieres.length)];
  const prompt = `Génère un court exercice (une question ou un QCM) sur le thème "${sujet}", niveau collège/lycée, avec la correction. Format : Exercice : ... Correction : ... Réponds uniquement avec l'exercice et la correction, sans texte autour.`;
  const reponse = await chatWithGemini(prompt, 'defi_quotidien');
  return { sujet, enonce: reponse };
}
function extraireCorrection(enonce) {
  const m = enonce.match(/Correction\s*[:]\s*([\s\S]*)/i);
  return m ? m[1].trim() : "Correction non disponible.";
}

// ============================================================
// BOUTONS, MENU
// ============================================================
const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '📝 Corriger un texte', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🖊️ Corriger un exercice', payload: 'MENU_CORRECTION_EXERCICES' },
  { content_type: 'text', title: '🎓 Résultats examens', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '📚 Exercices', payload: 'MENU_EXERCICES' },
  { content_type: 'text', title: '🌐 Traducteur', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Discuter librement', payload: 'MENU_CHAT' },
  { content_type: 'text', title: '🔑 Activer un code', payload: 'MENU_CODE' },
  { content_type: 'text', title: '📄 Créer mon CV', payload: 'MENU_CV' },
  { content_type: 'text', title: '🧮 Simulateur Bac', payload: 'MENU_BAC' },
  { content_type: 'text', title: '🎓 Hianatra (Apprendre)', payload: 'MENU_HIANATRA' },
  { content_type: 'text', title: '📖 Rédaction Mémoire', payload: 'MENU_MEMOIRE' },
];
const BOUTON_MENU = [{ content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }];

// ============================================================
// FONCTIONS D'ENVOI ET CHAT
// ============================================================
const LIMITE_MESSENGER = 1900;
function nettoyerMarkdown(t) {
  return t.replace(/\*\*\*(.*?)\*\*\*/g,'$1').replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/^#{1,6}\s*(.*)$/gm,'▶️ $1').replace(/^[-•]\s+/gm,'• ').trim();
}
function decouperTexte(t, l) {
  if (t.length <= l) return [t];
  const m = []; let r=t;
  while (r.length > l) {
    let c = r.lastIndexOf('\n', l);
    if (c < l*0.5) c = r.lastIndexOf(' ', l);
    if (c < l*0.5) c = l;
    m.push(r.slice(0,c).trim());
    r = r.slice(c).trim();
  }
  if (r) m.push(r);
  return m;
}
async function sendMessage(rid, txt, qr) {
  const morceaux = decouperTexte(nettoyerMarkdown(txt), LIMITE_MESSENGER);
  for (let i=0; i<morceaux.length; i++) {
    const dernier = i === morceaux.length-1;
    try {
      const msg = { text: morceaux[i] };
      if (dernier && qr) msg.quick_replies = qr;
      await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, { recipient: { id: rid }, message: msg });
    } catch(e) { console.error('Erreur envoi message:', e.response?.data || e.message); }
  }
}
async function sendTyping(rid, on) {
  try { await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, { recipient: { id: rid }, sender_action: on ? 'typing_on' : 'typing_off' }); } catch(e) {}
}
async function sendImage(rid, url) {
  try { await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, { recipient: { id: rid }, message: { attachment: { type: 'image', payload: { url, is_reusable: true } } } }); } catch(e) {}
}
async function sendFile(rid, url) {
  try { await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, { recipient: { id: rid }, message: { attachment: { type: 'file', payload: { url, is_reusable: true } } } }); } catch(e) {}
}
async function envoyerMenu(senderId, texteIntro) {
  const profile = await getProfile(senderId);
  const xp = await getXP(senderId);
  const level = await getLevel(senderId);
  const niveauTitre = SEUILS_NIVEAUX.find(s => s.niveau === level)?.titre || '';
  const nom = profile?.nom || '';
  const texte = `${texteIntro || '👋 Salut ! Que veux-tu faire ?'}\n\n${nom ? `Bonjour ${nom} ! ` : ''}Niveau ${level} (${niveauTitre}) | XP : ${xp}\n\n` +
    `🔔 Pour être alerté des résultats : tapez "alerte [province]" (ex: alerte itasy)\n\n` +
    `1️⃣ 🎓 Résultats examens\n` +
    `2️⃣ 📝 Corriger un texte\n` +
    `3️⃣ 📚 Exercices\n` +
    `4️⃣ 🌐 Traducteur\n` +
    `5️⃣ 💬 Discuter librement\n` +
    `6️⃣ 🖊️ Corriger un exercice (texte ou photo)\n` +
    `7️⃣ 🔑 Activer un code\n` +
    `8️⃣ 📄 Créer mon CV (premium)\n` +
    `9️⃣ 🧮 Simulateur Bac (premium)\n` +
    `🔟 📖 Rédaction Mémoire (premium)`;
  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}

// ============================================================
// FONCTIONS CHAT ET CORRECTION DE TEXTE (inchangées)
// ============================================================
const chatHistories = {};
const MAX_TOURS_HISTORIQUE = 16;
function resetHistorique(sid) { delete chatHistories[sid]; }

async function chatAvecHistorique(sid, text, contextePersonnalise = '') {
  if (!chatHistories[sid]) chatHistories[sid] = [];
  const h = chatHistories[sid];
  h.push({ role: 'user', parts: [{ text }] });
  if (h.length > MAX_TOURS_HISTORIQUE) h.splice(0, h.length - MAX_TOURS_HISTORIQUE);
  try {
    const systemPrompt = `Tu es l'assistant virtuel de Tsarafandray Services, une entreprise multiservices informatique fondée par M. Emeraldo.
    
    **RÈGLES D'OR :**
    1. Sois naturel, chaleureux et humain dans tes réponses. Utilise des émojis avec parcimonie.
    2. Si on te demande des résultats d'examens, oriente vers le menu "Résultats examens" (ne les invente JAMAIS).
    3. Adapte ton ton à l'ambiance de la conversation.
    4. Si l'utilisateur semble frustré ou perdu, sois encourageant et propose de l'aide.
    5. N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre).
    6. Si tu ne sais pas, dis-le honnêtement et propose de rediriger.
    
    ${contextePersonnalise}`;

    const reponse = (await appellerGemini({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: h
    }, 'chat')).trim();
    h.push({ role: 'model', parts: [{ text: reponse }] });
    return reponse;
  } catch(err) {
    h.pop();
    return "Désolé, une erreur. Réessaie.";
  }
}
async function chatWithGemini(text, nomFonction='texte') {
  try {
    return (await appellerGemini({ contents: [{ parts: [{ text: `Réponds de façon claire et concise : "${text}"` }] }] }, nomFonction)).trim();
  } catch(err) { return "Désolé, erreur."; }
}
async function correctText(text) {
  try {
    return (await appellerGemini({ contents: [{ parts: [{ text: `Corrige uniquement l'orthographe/grammaire de ce texte, renvoie le texte corrigé seul :\n\n"${text}"` }] }] }, 'correction_texte')).trim();
  } catch(err) { return "Erreur de correction."; }
}

// ============================================================
// AFFICHER PROFIL & DÉFI QUOTIDIEN (inchangés)
// ============================================================
async function afficherProfil(sid) {
  const p = await getProfile(sid);
  const xp = await getXP(sid);
  const lvl = await getLevel(sid);
  const badges = await getBadges(sid);
  const msg = `📊 Mon profil\n👤 ${p?.nom || 'Anonyme'}\n🎓 Niveau scolaire : ${p?.niveau_scolaire || 'Non renseigné'}\n📚 Matières favorites : ${p?.matieres_favorites?.join(', ') || 'Aucune'}\n🎓 Niveau : ${lvl} (${SEUILS_NIVEAUX.find(s=>s.niveau===lvl)?.titre || ''})\n💪 XP : ${xp}\n🏅 Badges : ${badges.length ? badges.join(', ') : 'Aucun'}`;
  await sendMessage(sid, msg, BOUTON_MENU);
}
async function handleDefiQuotidien(sid) {
  const aujourd = new Date().toISOString().slice(0,10);
  const daily = await getDaily(sid);
  if (daily && daily.date === aujourd && daily.fait) {
    return sendMessage(sid, "🎯 Tu as déjà fait le défi d'aujourd'hui ! Reviens demain.", BOUTON_MENU);
  }
  if (daily && daily.date === aujourd && !daily.fait) {
    await sendMessage(sid, `🎯 Défi du jour (${daily.sujet})\n\n${daily.enonce}\n\nEnvoie ta réponse pour gagner 15 XP !`, BOUTON_MENU);
    userModes[sid] = { mode: 'defi_quotidien', enonce: daily.enonce };
    return;
  }
  await sendTyping(sid, true);
  const defi = await genererDefiQuotidien(sid);
  await sendTyping(sid, false);
  await setDaily(sid, { date: aujourd, fait: false, enonce: defi.enonce, sujet: defi.sujet });
  await sendMessage(sid, `🎯 Défi du jour (${defi.sujet})\n\n${defi.enonce}\n\nEnvoie ta réponse pour gagner 15 XP !`, BOUTON_MENU);
  userModes[sid] = { mode: 'defi_quotidien', enonce: defi.enonce };
}// ============================================================
// RECHERCHE BEPC/CEPE (inchangée)
// ============================================================
async function searchBepc(query, typeExam='bepc', tentative=1) {
  const valeur = query.trim();
  const matriculeReg = /^\d{3}[0-9A-Z]{0,2}\d{5}-[A-Z]?\d{2}\/\d{2}(-\d{0,2})?$/;
  const typeRc = matriculeReg.test(valeur) ? 'mle' : 'nom';
  try {
    const response = await axios.post(
      'http://102.18.117.117/gre-men/web/app.php/ajaxres-cb.html',
      new URLSearchParams({ etype: typeExam, typeRc, mle: valeur }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 50000 }
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
      return `🔍❌ *Introuvable*\n\nRecherche : "${valeur}" (${typeExam.toUpperCase()})\n\nAucun candidat trouvé. Vérifie l'orthographe ou le format du matricule.`;
    }
    return resultats.map(r => formatResultatBEPC(r, typeExam)).join('\n\n━━━━━━━━━━━━\n\n');
  } catch(err) {
    const estTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message);
    if (estTimeout && tentative < 3) {
      await new Promise(r => setTimeout(r, 1000));
      return searchBepc(query, typeExam, tentative+1);
    }
    console.error('Erreur recherche BEPC:', err.message);
    return estTimeout ? "⏳ Le site officiel met trop de temps à répondre. Réessaie dans quelques minutes." : 'Désolé, la recherche a échoué (site indisponible).';
  }
}
function formatResultatBEPC(r, typeExam) {
  const obs = (r.observation || '').toUpperCase();
  const estAdmis = obs.includes('ADMIS') && !obs.includes('NON ADMIS');
  if (estAdmis) {
    return `🎓✨ RÉSULTAT ${typeExam.toUpperCase()} ✨🎓\n🎉 Félicitations ${r.nom} !\n🥳 Vous êtes ADMIS(E).\n🪪 Matricule : ${r.matricule}\n🏫 Établissement : ${r.ecole}\n📍 CISCO : ${r.cisco}\n✅ Résultats : ${r.observation}`;
  }
  if (obs.includes('AJOURNE') || obs.includes('NON ADMIS') || obs.includes('REDOUBL')) {
    return `🎓📋 RÉSULTAT ${typeExam.toUpperCase()}\n👤 Candidat : ${r.nom}\n🪪 Matricule : ${r.matricule}\n🏫 Établissement : ${r.ecole}\n📍 CISCO : ${r.cisco}\n❌ Résultats : ${r.observation}\n💪 Courage! Aza mora kivy.`;
  }
  return `🎓📋 RÉSULTAT ${typeExam.toUpperCase()}\n👤 Candidat : ${r.nom}\n🪪 Matricule : ${r.matricule}\n🏫 Établissement : ${r.ecole}\n📍 CISCO : ${r.cisco}\nℹ️ Observation : ${r.observation}\n⏳ Résultat non encore disponible.`;
}

// ============================================================
// RECHERCHE BACC (API + local) - inchangée
// ============================================================
const PROVINCE_MAP = {
  'antananarivo':'antananarivo','tana':'antananarivo',
  'fianarantsoa':'fianarantsoa','fianar':'fianarantsoa',
  'toamasina':'toamasina','tamatave':'toamasina',
  'mahajanga':'mahajanga','majunga':'mahajanga',
  'toliara':'toliara','tulear':'toliara',
  'antsiranana':'antsiranana','diego':'antsiranana',
  'itasy':'itasy','miarinarivo':'itasy',
  'analanjirofo':'analanjirofo','fenarivo':'analanjirofo'
};
const BACC_CONFIG = {
  fianarantsoa:{name:'Fianarantsoa',type:'api',baseUrl:'https://bacc.univ-fianarantsoa.mg/api/search',endpoints:{nom:'/name/',mle:'/num/'}},
  antananarivo:{name:'Antananarivo',type:'api',baseUrl:'https://tana-api.bacc.digital.gov.mg/api/search',endpoints:{nom:'/name/',mle:'/num/'}},
  toamasina:{name:'Toamasina',type:'api',baseUrl:'https://toamasina-api.bacc.digital.gov.mg/api/search',endpoints:{nom:'/name/',mle:'/num/'}},
  mahajanga:{name:'Mahajanga',type:'api',baseUrl:'https://mahajanga-api.bacc.digital.gov.mg/api/search',endpoints:{nom:'/name/',mle:'/num/'}},
  toliara:{name:'Toliara',type:'api',baseUrl:'https://bacc.toliara.digital.gov.mg/api/search',endpoints:{nom:'/name/',mle:'/num/'}},
  antsiranana:{name:'Antsiranana',type:'api',baseUrl:'https://diego-api.bacc.digital.gov.mg/api/search',endpoints:{nom:'/name/',mle:'/num/'}},
  itasy:{name:'Itasy',type:'local'},
  analanjirofo:{name:'Analanjirofo',type:'local'}
};
function normaliserProvince(texte) {
  const t = texte.toLowerCase().trim();
  return PROVINCE_MAP[t] || null;
}

// ============================================================
// FORMATAGE DES RÉSULTATS BACC
// ============================================================
function formatResultatBaccApi(r, provinceName) {
  const nom = r.nom || 'Inconnu';
  const num = r.num || 'Inconnu';
  const serie = r.serie || '-';
  const centre = r.centre || '-';
  const resultat = (r.resultat || '').toUpperCase();
  const mention = (r.mention || '').toUpperCase();

  const estNonAdmis = resultat.includes('NON ADMIS') || resultat.includes('AJOURNE') || mention.includes('AJOURNE');
  const mentionsAdmission = ['PASSABLE', 'ASSEZ BIEN', 'BIEN', 'TRES BIEN', 'TRÈS BIEN', 'SATISFACTION'];
  const estMentionAdmission = mentionsAdmission.some(m => mention.includes(m));
  const estAdmis = !estNonAdmis && (estMentionAdmission || (resultat.includes('ADMIS') && !resultat.includes('NON ADMIS')));

  if (estAdmis) {
    return `🎓✨ RÉSULTAT BACCALAURÉAT ✨🎓\n📍 Province : ${provinceName}\n\n🎉 Félicitations ${nom} !\n🥳 ADMIS(E).\n🪪 N° Inscription : ${num}\n📚 Série : ${serie}\n🏫 Centre : ${centre}\n🎖️ Mention : ${r.mention || 'Passable'}\n\n🍾 Alefaso ny arrosage e! 😄🥳`;
  }
  if (estNonAdmis) {
    return `🎓📋 RÉSULTAT BACCALAURÉAT\n📍 Province : ${provinceName}\n\n👤 Candidat : ${nom}\n🪪 N° Inscription : ${num}\n📚 Série : ${serie}\n🏫 Centre : ${centre}\n❌ Résultat : ${r.resultat || 'Non Admis(e)'}\n\n❌ **Désolé, vous n'êtes pas ADMIS(E).**\n\n💪 Ne vous découragez pas ! Préparez-vous mieux pour la prochaine session.`;
  }
  return `🎓📋 RÉSULTAT BACCALAURÉAT\n📍 Province : ${provinceName}\n\n👤 Candidat : ${nom}\n🪪 N° Inscription : ${num}\n📚 Série : ${serie}\n🏫 Centre : ${centre}\nℹ️ Résultat : ${r.resultat || 'Non disponible'}`;
}

function formatResultatBaccCustom(c, provinceName) {
  const nom = c.nom || 'Inconnu';
  const prenoms = c.prenoms || '';
  const num = c.matricule || 'Inconnu';
  const mention = c.mention || 'Passable';
  const estAjourne = mention.toUpperCase().includes('AJOURNE');
  if (estAjourne) {
    return `🎓📋 RÉSULTAT BACCALAURÉAT\n📍 Province : ${provinceName}\n\n👤 Candidat : ${nom} ${prenoms}\n🪪 N° Inscription : ${num}\n📝 Mention : ${mention}\n\n❌ **Désolé, vous n'êtes pas ADMIS(E).**\n📌 Vous êtes AJOURNÉ(E) et devez passer les épreuves de rattrapage.\n\n💪 Courage ! Révisez bien et vous y arriverez.`;
  }
  return `🎓✨ RÉSULTAT BACCALAURÉAT ✨🎓\n📍 Province : ${provinceName}\n\n🎉 Félicitations ${nom} ${prenoms} !\n🥳 ADMIS(E).\n🪪 N° Inscription : ${num}\n🎖️ Mention : ${mention}\n\n🍾 Alefaso ny arrosage e! 😄🥳`;
}

async function searchBacc(query, province, tentative = 1) {
  const config = BACC_CONFIG[province];
  if (!config) return "❌ Province non reconnue.";

  const available = await getAvailability(province);
  if (!available) {
    return `🔔 **Résultats non encore disponibles**\n\nLes résultats pour **${config.name}** ne sont pas encore publiés ou importés.\n\nSouhaitez-vous être alerté dès qu'ils seront disponibles ?\n\nCliquez sur le bouton ci-dessous ou tapez "alerte ${province}" pour vous inscrire.`;
  }

  const localResults = await getStoredBaccResults(province);
  if (localResults && localResults.length > 0) {
    const valeur = query.trim().toLowerCase();
    const matched = localResults.filter(r => {
      const m = String(r.matricule || '').toLowerCase();
      const n = String(r.nom || '').toLowerCase();
      const p = String(r.prenoms || '').toLowerCase();
      return m.includes(valeur) || n.includes(valeur) || p.includes(valeur) || (n + ' ' + p).includes(valeur);
    });
    if (matched.length > 0) {
      return matched.map(r => formatResultatBaccCustom(r, config.name)).join('\n\n━━━━━━━━━━━━\n\n');
    } else {
      return `🔍❌ *Introuvable*\n\nProvince : ${config.name}\nRecherche : "${query.trim()}"\n\nAucun candidat trouvé. Vérifie l'orthographe ou le numéro.`;
    }
  }

  if (config.type === 'api' && config.baseUrl) {
    const typeRc = /^\d{7}$/.test(query.trim()) ? 'mle' : 'nom';
    const url = `${config.baseUrl}${config.endpoints[typeRc]}${encodeURIComponent(query.trim())}`;
    try {
      const response = await axios.get(url, { timeout: 30000 });
      const data = response.data;
      if (data && data.bacc && data.bacc.length > 0) {
        return data.bacc.map(r => formatResultatBaccApi(r, config.name)).join('\n\n━━━━━━━━━━━━\n\n');
      }
    } catch(err) { console.error(`Erreur API BACC ${province}:`, err.message); }
  }

  return `🔍❌ *Introuvable*\n\nProvince : ${config.name}\nRecherche : "${query.trim()}"\n\nAucun candidat trouvé. Vérifie l'orthographe ou le numéro.`;
}

// ============================================================
// GESTION DES RÉSULTATS BACC (stockage, disponibilité)
// ============================================================
async function getStoredBaccResults(province) {
  const raw = await redisGet(`bacc_results:${province}`);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch(e) { return []; }
}
async function saveStoredBaccResults(province, results) {
  await redisSet(`bacc_results:${province}`, JSON.stringify(results));
}
async function getAvailability(province) {
  const val = await redisGet(`bacc_available:${province}`);
  return val === '1';
}
async function setAvailability(province, available) {
  await redisSet(`bacc_available:${province}`, available ? '1' : '0');
}
async function activerResultatsEtNotifier(province) {
  await setAvailability(province, true);
  const nb = await declencherAlertes(province);
  return nb;
}

// ============================================================
// ALERTES BACC
// ============================================================
const URL_PAGE_FACEBOOK = 'https://www.facebook.com/profile.php?id=100081570672160';
const MSG_INCITATION_ABONNEMENT = { fr: '📢 Abonnez-vous à notre page pour les alertes !', mg: '📢 Hanaraka ny pejy Tsarafandray Services !' };
const MSG_PROPOSER_ALERTE = { fr: '🔔 Voulez-vous être alerté dès la publication ?', mg: '🔔 Te hahazo fampandrenesana ve ianao?' };

async function inscrireAlerte(sid, province) {
  const key = `alertes_bacc:${province}`;
  let inscrits = await redisGet(key) || "";
  let liste = inscrits ? inscrits.split(',') : [];
  if (!liste.includes(sid)) {
    liste.push(sid);
    await redisSet(key, liste.join(','));
    return true;
  }
  return false;
}
async function declencherAlertes(province) {
  const key = `alertes_bacc:${province}`;
  const inscrits = await redisGet(key);
  if (!inscrits) return 0;
  const liste = inscrits.split(',');
  const provinceName = BACC_CONFIG[province]?.name || province;
  const msg = `🔔 ALERTE RÉSULTATS BACC\nLes résultats pour ${provinceName} sont disponibles !\n🇲🇬 Efa mivoaka ny valim-panadinana ho an'ny ${provinceName} !\n\nCliquez sur "Consulter" pour voir les résultats.`;
  const qr = [{ content_type:'text', title:'🎓 Consulter', payload:`BACC_PROV_${province}` }, { content_type:'text', title:'🔁 Menu', payload:'GET_STARTED' }];
  let nb=0;
  for (const rid of liste) {
    try { await sendMessage(rid, msg, qr); nb++; } catch(e) { console.error(`Erreur alerte ${rid}:`, e.message); }
  }
  await redisSet(key, "");
  return nb;
}

// ============================================================
// ROUTES EXPRESS (webhook, admin, dashboard, etc.)
// ============================================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook vérifié');
    res.status(200).send(challenge);
  } else res.sendStatus(403);
});

app.get('/stats', (req, res) => {
  res.json({
    date: statsUsage.date,
    totalAppelsGemini: statsUsage.total,
    parFonctionnalite: statsUsage.parFonction,
    nombreDeClesConfigurees: GEMINI_KEYS.length,
    quotaGratuitEstimeParJour: GEMINI_KEYS.length * 500,
  });
});

app.get('/generated-image/:id', (req, res) => {
  const img = imagesGenerees[req.params.id];
  if (!img) return res.sendStatus(404);
  res.set('Content-Type', img.mimeType);
  res.send(img.buffer);
});
app.get('/generated-file/:id', (req, res) => {
  const fichier = fichiersGeneres[req.params.id];
  if (!fichier) return res.sendStatus(404);
  res.set('Content-Type', fichier.mimeType);
  res.set('Content-Disposition', `inline; filename="${fichier.nomFichier}"`);
  res.send(fichier.buffer);
});

// ============================================================
// ADMIN : INTERFACE WEB
// ============================================================
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Admin Tsarafandray</title>
<style>
body{font-family:sans-serif;background:#f4f6fb;padding:20px;max-width:500px;margin:auto}
.carte{background:white;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08)}
label{display:block;font-size:13px;margin:10px 0 4px;color:#444}
input,select{width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box}
button{width:100%;margin-top:15px;padding:12px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer}
#resultat,#uploadResult,#availResult,#refResult{margin-top:12px;padding:10px;border-radius:8px;display:none}
.succes{background:#dcfce7;color:#166534;display:block}
.erreur{background:#fee2e2;color:#991b1b;display:block}
</style>
</head>
<body>
<div class="carte"><h1>🔑 Générer un code</h1>
<label>Mot de passe admin</label><input type="password" id="motDePasse" />
<label>Nombre de crédits</label><input type="number" id="credits" value="10" min="1" />
<label>Code personnalisé (optionnel)</label><input type="text" id="codePerso" placeholder="PROMO2026" />
<button onclick="genererCode()">Générer</button>
<div id="resultat"></div></div>

<div class="carte"><h2>📤 Importer liste BACC</h2>
<form id="uploadForm" enctype="multipart/form-data">
<label>Mot de passe admin</label><input type="password" name="motDePasse" id="uploadMotDePasse" required />
<label>Province</label><select name="province">
<option value="itasy">Itasy</option>
<option value="analanjirofo">Analanjirofo</option>
<option value="antananarivo">Antananarivo</option>
<option value="fianarantsoa">Fianarantsoa</option>
<option value="toamasina">Toamasina</option>
<option value="mahajanga">Mahajanga</option>
<option value="toliara">Toliara</option>
<option value="antsiranana">Antsiranana</option>
</select>
<label>Fichier (image ou PDF)</label><input type="file" name="resultFile" accept="image/*,application/pdf" required />
<button type="submit">Importer</button>
</form>
<div id="uploadResult"></div></div>

<div class="carte"><h2>🔔 Gérer la disponibilité</h2>
<label>Mot de passe admin</label><input type="password" id="availMotDePasse" />
<label>Province</label>
<select id="availProvince">
<option value="itasy">Itasy</option>
<option value="analanjirofo">Analanjirofo</option>
<option value="antananarivo">Antananarivo</option>
<option value="fianarantsoa">Fianarantsoa</option>
<option value="toamasina">Toamasina</option>
<option value="mahajanga">Mahajanga</option>
<option value="toliara">Toliara</option>
<option value="antsiranana">Antsiranana</option>
</select>
<label>État actuel :</label><span id="availStatus">Chargement...</span>
<button onclick="toggleAvailability()">🔄 Activer / Désactiver</button>
<div id="availResult"></div></div>

<div class="carte"><h2>📚 Ajouter une référence académique</h2>
<form id="refForm" enctype="multipart/form-data">
<label>Mot de passe admin</label><input type="password" name="motDePasse" id="refMotDePasse" required />
<label>Nom du document (optionnel)</label><input type="text" name="nom" placeholder="Guide méthodologique..." />
<label>Fichier (PDF, DOCX, image)</label><input type="file" name="refFile" accept=".pdf,.docx,.doc,image/*" required />
<button type="submit">Ajouter la référence</button>
</form>
<div id="refResult"></div></div>

<script>
async function genererCode() {
  const motDePasse = document.getElementById('motDePasse').value;
  const credits = document.getElementById('credits').value;
  const codePerso = document.getElementById('codePerso').value;
  const resultat = document.getElementById('resultat');
  const res = await fetch('/admin/generate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motDePasse, credits, codePerso }),
  });
  const data = await res.json();
  resultat.style.display = 'block';
  if (data.success) { resultat.className = 'succes'; resultat.innerHTML = '✅ Code : <strong>' + data.code + '</strong> (' + data.credits + ' crédits)'; }
  else { resultat.className = 'erreur'; resultat.textContent = '❌ ' + data.erreur; }
}

document.getElementById('uploadForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const resultat = document.getElementById('uploadResult');
  try {
    const res = await fetch('/admin/upload-results', { method: 'POST', body: formData });
    const data = await res.json();
    resultat.style.display = 'block';
    if (data.success) { resultat.className = 'succes'; resultat.textContent = '✅ ' + data.message; }
    else { resultat.className = 'erreur'; resultat.textContent = '❌ ' + data.erreur; }
  } catch(err) { resultat.style.display = 'block'; resultat.className = 'erreur'; resultat.textContent = '❌ Erreur réseau.'; }
});

async function toggleAvailability() {
  const motDePasse = document.getElementById('availMotDePasse').value;
  const province = document.getElementById('availProvince').value;
  const resultat = document.getElementById('availResult');
  if (!motDePasse) { alert('Veuillez entrer le mot de passe admin'); return; }
  const statusRes = await fetch('/admin/get-availability?province='+province);
  const statusData = await statusRes.json();
  const current = statusData.available;
  const newVal = !current;
  const res = await fetch('/admin/set-availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motDePasse, province, available: newVal })
  });
  const data = await res.json();
  resultat.style.display = 'block';
  if (data.success) {
    resultat.className = 'succes';
    resultat.textContent = '✅ ' + data.message;
    document.getElementById('availStatus').textContent = newVal ? '✅ Disponible' : '❌ Non disponible';
  } else {
    resultat.className = 'erreur';
    resultat.textContent = '❌ ' + data.erreur;
  }
}

async function loadAvailability() {
  const province = document.getElementById('availProvince').value;
  const res = await fetch('/admin/get-availability?province='+province);
  const data = await res.json();
  document.getElementById('availStatus').textContent = data.available ? '✅ Disponible' : '❌ Non disponible';
}
document.getElementById('availProvince').addEventListener('change', loadAvailability);
loadAvailability();

document.getElementById('refForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const resultat = document.getElementById('refResult');
  try {
    const res = await fetch('/admin/upload-reference', { method: 'POST', body: formData });
    const data = await res.json();
    resultat.style.display = 'block';
    if (data.success) { resultat.className = 'succes'; resultat.textContent = '✅ ' + data.message; }
    else { resultat.className = 'erreur'; resultat.textContent = '❌ ' + data.erreur; }
  } catch(err) { resultat.style.display = 'block'; resultat.className = 'erreur'; resultat.textContent = '❌ Erreur réseau.'; }
});
</script>
</body>
</html>`);
});

// ============================================================
// ROUTES ADMIN (CRÉDITS, RÉSULTATS, DISPONIBILITÉ, RÉFÉRENCES)
// ============================================================
app.post('/admin/generate-code', async (req, res) => {
  const { motDePasse, credits, codePerso } = req.body;
  if (!process.env.ADMIN_PASSWORD) return res.json({ success: false, erreur: 'ADMIN_PASSWORD non configuré.' });
  if (motDePasse !== process.env.ADMIN_PASSWORD) return res.json({ success: false, erreur: 'Mot de passe incorrect.' });
  const creditsNum = parseInt(credits,10);
  if (!creditsNum || creditsNum <= 0) return res.json({ success: false, erreur: 'Nombre invalide.' });
  const code = (codePerso && codePerso.trim()) ? codePerso.trim().toUpperCase() : genererCodeAleatoire();
  if (await codeDejaUtilise(code)) return res.json({ success: false, erreur: 'Code déjà utilisé.' });
  await redisSet(`code_credits:${code}`, creditsNum);
  res.json({ success: true, code, credits: creditsNum });
});

app.post('/admin/upload-results', upload.single('resultFile'), async (req, res) => {
  const { motDePasse, province } = req.body;
  if (!process.env.ADMIN_PASSWORD || motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'Mot de passe incorrect.' });
  }
  if (!province || !BACC_CONFIG[province]) {
    return res.json({ success: false, erreur: 'Province invalide.' });
  }
  if (!req.file) return res.json({ success: false, erreur: 'Aucun fichier.' });
  const mimeType = req.file.mimetype;
  if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
    return res.json({ success: false, erreur: 'Format non supporté (image ou PDF requis).' });
  }
  try {
    const buffer = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);
    const { centre, serie, candidats } = await extraireResultatsBacDepuisBuffer(buffer, mimeType);
    if (!candidats || candidats.length === 0) {
      return res.json({ success: false, erreur: "Aucun candidat admis n'a pu être extrait avec certitude." });
    }
    const existants = await getStoredBaccResults(province);
    const map = new Map();
    for (const c of existants) map.set(String(c.matricule), c);
    for (const c of candidats) map.set(String(c.matricule), c);
    const fusion = Array.from(map.values());
    await saveStoredBaccResults(province, fusion);
    const matricules = fusion.map(c => c.matricule).sort();
    const minMat = matricules[0] || 'N/A';
    const maxMat = matricules[matricules.length-1] || 'N/A';
    res.json({
      success: true,
      message: `✅ Ajout réussi pour ${BACC_CONFIG[province].name} !\n- Série : ${serie}\n- Centre : ${centre || 'Non précisé'}\n- N° matricule : ${minMat} à ${maxMat}\n- Nouveaux candidats : ${candidats.length}\n- Total en base : ${fusion.length}`
    });
  } catch(err) {
    console.error('Erreur upload results:', err);
    res.json({ success: false, erreur: "Erreur lors de l'analyse : " + err.message });
  }
});

app.get('/admin/get-availability', async (req, res) => {
  const province = req.query.province;
  if (!province || !BACC_CONFIG[province]) return res.json({ available: false });
  const avail = await getAvailability(province);
  const count = (await getStoredBaccResults(province)).length;
  res.json({ available: avail, count });
});

app.post('/admin/set-availability', async (req, res) => {
  const { motDePasse, province, available } = req.body;
  if (!process.env.ADMIN_PASSWORD || motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'Mot de passe incorrect.' });
  }
  if (!province || !BACC_CONFIG[province]) {
    return res.json({ success: false, erreur: 'Province invalide.' });
  }
  const isAvailable = available === true || available === 'true';
  await setAvailability(province, isAvailable);
  let nb = 0;
  if (isAvailable) {
    nb = await declencherAlertes(province);
  }
  res.json({ 
    success: true, 
    message: `Disponibilité mise à jour : ${isAvailable ? 'activée' : 'désactivée'}. Notifications envoyées : ${nb}` 
  });
});

// ============================================================
// ROUTES ADMIN : RÉFÉRENCES
// ============================================================
app.post('/admin/upload-reference', upload.single('refFile'), async (req, res) => {
  const { motDePasse, nom } = req.body;
  if (!process.env.ADMIN_PASSWORD || motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'Mot de passe incorrect.' });
  }
  if (!req.file) return res.json({ success: false, erreur: 'Aucun fichier.' });
  
  try {
    const buffer = fs.readFileSync(req.file.path);
    fs.unlinkSync(req.file.path);
    const mimeType = req.file.mimetype;
    const originalName = req.file.originalname;
    
    const texte = await memoire.extraireTexteDocument(buffer, mimeType, originalName, appellerGeminiVision);
    if (!texte || texte.length < 100) {
      return res.json({ success: false, erreur: 'Le texte extrait est trop court ou illisible.' });
    }
    
    const segments = await memoire.decouperEnSegments(texte, chatWithGemini);
    const id = await memoire.stockerReference(redisGet, redisSet, nom || req.file.originalname, mimeType, 'web_upload', segments);
    
    res.json({ success: true, message: `Référence ajoutée avec succès ! ${segments.length} segments extraits. ID: ${id}` });
  } catch (err) {
    console.error('Erreur upload référence:', err);
    res.json({ success: false, erreur: 'Erreur lors du traitement : ' + err.message });
  }
});

app.get('/admin/list-references', async (req, res) => {
  const { motDePasse } = req.query;
  if (!process.env.ADMIN_PASSWORD || motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'Mot de passe incorrect.' });
  }
  const allKey = 'reference:all';
  let all = await redisGet(allKey) || '[]';
  const list = JSON.parse(all);
  const refs = [];
  for (const id of list) {
    const doc = await redisGet(`reference:doc:${id}`);
    if (doc) {
      try { refs.push(JSON.parse(doc)); } catch(e) {}
    }
  }
  res.json({ success: true, references: refs });
});

app.delete('/admin/delete-reference/:id', async (req, res) => {
  const { motDePasse } = req.body;
  const id = req.params.id;
  if (!process.env.ADMIN_PASSWORD || motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'Mot de passe incorrect.' });
  }
  await redisSet(`reference:doc:${id}`, null);
  const allKey = 'reference:all';
  let all = await redisGet(allKey) || '[]';
  let list = JSON.parse(all).filter(x => x !== id);
  await redisSet(allKey, JSON.stringify(list));
  res.json({ success: true, message: 'Référence supprimée.' });
});

app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Dashboard</title><script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.umd.min.js"></script>
<style>
body{font-family:sans-serif;background:#f4f6fb;padding:20px;max-width:800px;margin:auto}
.carte{background:white;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-align:center}
.valeur{font-size:28px;font-weight:700;color:#2563eb}
.label{font-size:12px;color:#666}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px}
</style>
</head>
<body>
<h1>📊 Tableau de bord</h1>
<div class="grid" id="cartes"></div>
<div class="carte"><canvas id="graphique" height="180"></canvas></div>
<script>
let chart=null;
async function charger() {
  const res=await fetch('/stats');
  const data=await res.json();
  const restant=Math.max(data.quotaGratuitEstimeParJour-data.totalAppelsGemini,0);
  const pct=data.quotaGratuitEstimeParJour>0 ? Math.round((data.totalAppelsGemini/data.quotaGratuitEstimeParJour)*100) : 0;
  document.getElementById('cartes').innerHTML=
    '<div class="carte"><div class="valeur">'+data.totalAppelsGemini+'</div><div class="label">Appels utilisés</div></div>'+
    '<div class="carte"><div class="valeur">'+restant+'</div><div class="label">Restants estimés</div></div>'+
    '<div class="carte"><div class="valeur">'+pct+'%</div><div class="label">Quota consommé</div></div>'+
    '<div class="carte"><div class="valeur">'+data.nombreDeClesConfigurees+'</div><div class="label">Clés actives</div></div>';
  const entrees=Object.entries(data.parFonctionnalite||{});
  const canvas=document.getElementById('graphique');
  if(entrees.length===0){canvas.style.display='none';return;}
  canvas.style.display='block';
  const labels=entrees.map(([k])=>k);
  const valeurs=entrees.map(([,v])=>v);
  if(chart)chart.destroy();
  chart=new Chart(canvas,{type:'bar',data:{labels,datasets:[{label:'Appels',data:valeurs,backgroundColor:'#2563eb',borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
}
charger();
setInterval(charger,30000);
</script>
</body></html>`);
});

// ============================================================
// WEBHOOK POST
// ============================================================
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;
      const imageAttachment = event.message?.attachments?.find(a => a.type === 'image');
      const audioAttachment = event.message?.attachments?.find(a => a.type === 'audio');
      if (imageAttachment) {
        handleImageEvent(senderId, imageAttachment.payload.url).catch(e => console.error(e));
      } else if (audioAttachment) {
        handleAudioEvent(senderId, audioAttachment.payload.url).catch(e => console.error(e));
      } else if (event.message && event.message.text) {
        const payload = event.message.quick_reply?.payload;
        const userText = event.message.text.trim();
        handleEvent(senderId, payload || userText, !!payload).catch(e => console.error(e));
      }
      if (event.postback) {
        handleEvent(senderId, event.postback.payload, true).catch(e => console.error(e));
      }
    }
  } else res.sendStatus(404);
});

// ============================================================
// ROUTEUR PRINCIPAL (handleEvent) - avec les nouveaux cas pour le mémoire
// ============================================================
const userModes = {};
const RACCOURCIS_NUM = { 1:'MENU_RESULTATS', 2:'MENU_CORRECTION', 3:'MENU_EXERCICES', 4:'MENU_TRADUCTION', 5:'MENU_CHAT', 6:'MENU_CORRECTION_EXERCICES', 7:'MENU_CODE', 8:'MENU_CV', 9:'MENU_BAC', 11:'MENU_HIANATRA', 10:'MENU_MEMOIRE' };
const MOTS_CLES_BEPC = /\b(bepc|cepe|resultat|résultat)\b/i;
const MOTS_CLES_BACC = /\b(bacc|baccalaur[ée]at)\b/i;
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
const MOTS_CLES_MEMOIRE = /^rédaction mémoire|^mémoire|^rediger mémoire/i;
const MOTS_CLES_IDENTITE = /\b(qui es[- ]?tu|c'?est quoi (ce|cet) bot|qui a (cr[ée][ée]?|fond[ée]) (ce|cet) bot|qui t'?a (cr[ée][ée]?|fait|programm[ée])|pr[ée]sente[- ]toi|iza (ianao|no nanao)|es[- ]?tu (une|un) (ia|robot|intelligence artificielle)|c'?est quoi tsarafandray)\b/i;
const PRESENTATION_BOT = `👋 Salut ! Je suis l'assistant de Tsarafandray Services, fondée par M. Emeraldo. Je t'aide avec les résultats d'examens, la correction de textes, les exercices, la traduction, et plus encore. Tape "menu" pour voir les options.`;

// ============================================================
// FONCTION DE DÉTECTION D'INTENTION (pour le chat)
// ============================================================
function detecterIntention(texte) {
  const t = texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const motsResultats = [
    'resultat', 'résultat', 'bacc', 'baccalauréat', 'bepc', 'cepe', 
    'examen', 'note', 'admis', 'non admis', 'réussi', 'hafaka', 
    'valim-panadinana', 'nahafaka', 'tsy nahafaka', 'score'
  ];
  const estResultat = motsResultats.some(m => t.includes(m)) && 
    (t.includes('?') || t.includes('ve') || t.includes('sa') || t.includes('numero') || t.includes('numéro') || /\d{5,}/.test(t));

  const motsConversation = ['bonjour', 'salut', 'coucou', 'hey', 'merci', 'bravo', 'cool', 'super', 'génial', 
    'comment ça va', 'quoi de neuf', 'tranquille', 'ça roule', 'a+', 'à plus', 'bye', 'au revoir', 'tchao',
    'misaotra', 'veloma', 'salama', 'manao ahoana'];
  const estConversation = motsConversation.some(m => t.includes(m));

  const motsAide = ['aide', 'help', 'comment', 'explique', 'tuto', 'guide', 'peux-tu', 'pourrais-tu', 'montre', 'apprends', 'enseigne'];
  const estAide = motsAide.some(m => t.includes(m)) && !estResultat;

  const motsFonction = ['exercice', 'corrige', 'traduis', 'cv', 'profil', 'code', 'credit', 'defi'];
  const estFonction = motsFonction.some(m => t.includes(m));

  return {
    estResultat,
    estConversation,
    estAide,
    estFonction,
    type: estResultat ? 'resultat' : (estAide ? 'aide' : (estFonction ? 'fonction' : (estConversation ? 'conversation' : 'general')))
  };
}

// ============================================================
// FONCTIONS POUR L'IMPORT DES RÉSULTATS BACC (image/PDF)
// ============================================================
async function extraireResultatsBacDepuisBuffer(buffer, mimeType) {
  try {
    const base64 = buffer.toString('base64');
    const imagePart = { inline_data: { mime_type: mimeType, data: base64 } };
    const prompt = `
Tu es un assistant spécialisé dans l'extraction de données depuis des images de résultats d'examen (BACC).
Analyse cette image de liste de résultats du Baccalauréat.
Extrais UNIQUEMENT les candidats qui sont **ADMIS**.
Pour chaque candidat admis, extrais : son **numéro d'inscription**, son **nom complet**, sa **mention**.
Retourne UNIQUEMENT un JSON de cette forme :
{
  "serie": "...",
  "centre": "...",
  "candidats": [
    {"matricule": "...", "nom": "...", "prenoms": "", "mention": "...", "admis": true}
  ]
}
Ne mets aucun autre texte que ce JSON.
`;
    const reponse = await appellerGeminiVision(prompt, imagePart);
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    const match = nettoye.match(/\{[\s\S]*\}/);
    const data = JSON.parse(match ? match[0] : nettoye);
    if (!data.candidats || !Array.isArray(data.candidats)) {
      return { centre: null, serie: 'Inconnue', candidats: [] };
    }
    const candidats = data.candidats
      .filter(c => c && c.matricule && c.admis === true)
      .map(c => ({
        matricule: String(c.matricule).replace(/\s/g, ''),
        nom: (c.nom || '').trim().toUpperCase(),
        prenoms: (c.prenoms || '').trim().toUpperCase(),
        mention: (c.mention || 'Passable').trim(),
        admis: true
      }));
    return { centre: data.centre || null, serie: data.serie || 'Inconnue', candidats };
  } catch (err) {
    console.error('❌ Erreur extraireResultatsBacDepuisBuffer:', err);
    return { centre: null, serie: 'Inconnue', candidats: [] };
  }
}

// ============================================================
// GESTION DES IMAGES REÇUES (handleImageEvent)
// ============================================================
async function handleImageEvent(senderId, imageUrl) {
  const etat = userModes[senderId] || { mode: 'chat' };

  // Mode admin : import de résultats BACC
  if (etat.mode === 'admin_attente_image_resultats') {
    const province = etat.provinceRes;
    if (!province) {
      await sendMessage(senderId, "❌ Province non définie. Retour au menu admin.");
      userModes[senderId] = { mode: 'admin_menu' };
      return;
    }
    await sendTyping(senderId, true);
    try {
      const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      const buffer = imgResp.data;
      const mimeType = imgResp.headers['content-type'] || 'image/jpeg';
      const { centre, serie, candidats } = await extraireResultatsBacDepuisBuffer(buffer, mimeType);
      
      if (!candidats || candidats.length === 0) {
        await sendTyping(senderId, false);
        await sendMessage(senderId, "⚠️ Aucun candidat admis n'a pu être extrait de cette image. Vérifie la lisibilité.", BOUTON_MENU);
        return;
      }
      
      const existants = await getStoredBaccResults(province);
      const map = new Map();
      for (const c of existants) map.set(String(c.matricule), c);
      let nouveaux = 0;
      for (const c of candidats) {
        if (!map.has(String(c.matricule))) {
          map.set(String(c.matricule), c);
          nouveaux++;
        }
      }
      const totalApres = map.size;
      
      userModes[senderId].candidatsTemp = candidats;
      userModes[senderId].provinceTemp = province;
      userModes[senderId].centreTemp = centre;
      userModes[senderId].serieTemp = serie;
      userModes[senderId].mode = 'admin_confirmation_import';
      
      await sendTyping(senderId, false);
      await sendMessage(senderId, `📋 **Aperçu des candidats extraits**\n\n` +
        `Province : ${BACC_CONFIG[province].name}\n` +
        `Série : ${serie || 'Inconnue'}\n` +
        `Centre : ${centre || 'Non précisé'}\n` +
        `Candidats trouvés : ${candidats.length}\n` +
        `Dont nouveaux (non doublons) : ${nouveaux}\n` +
        `Total après enregistrement : ${totalApres}\n\n` +
        `Exemples :\n${candidats.slice(0, 5).map(c => `- ${c.matricule} : ${c.nom} ${c.prenoms} (${c.mention})`).join('\n')}` +
        (candidats.length > 5 ? `\n... et ${candidats.length - 5} autres` : '') +
        `\n\n✅ Tape **OUI** pour enregistrer ces résultats.\n❌ Tape **NON** pour annuler.`,
        BOUTON_MENU
      );
    } catch (err) {
      console.error('Erreur traitement image admin:', err);
      await sendTyping(senderId, false);
      await sendMessage(senderId, "❌ Erreur lors de l'analyse de l'image : " + err.message, BOUTON_MENU);
    }
    return;
  }

  // Mode confirmation d'import
  if (etat.mode === 'admin_confirmation_import') {
    const reponse = texteOuPayload.trim().toUpperCase();
    if (reponse === 'OUI') {
      const province = etat.provinceTemp;
      const candidats = etat.candidatsTemp;
      if (!province || !candidats) {
        userModes[senderId] = { mode: 'admin_menu' };
        await sendMessage(senderId, '❌ Aucune donnée en attente.', BOUTON_MENU);
        return;
      }
      const existants = await getStoredBaccResults(province);
      const map = new Map();
      for (const c of existants) map.set(String(c.matricule), c);
      for (const c of candidats) map.set(String(c.matricule), c);
      const fusion = Array.from(map.values());
      await saveStoredBaccResults(province, fusion);
      userModes[senderId] = { mode: 'admin_menu' };
      await sendMessage(senderId, `✅ Enregistrement terminé !\n- Total : ${fusion.length} candidats.\n- N'oublie pas d'activer la disponibilité via la commande "activer ${province}" dans le menu admin.`, BOUTON_MENU);
    } else if (reponse === 'NON') {
      userModes[senderId] = { mode: 'admin_menu' };
      await sendMessage(senderId, '❌ Import annulé.', BOUTON_MENU);
    } else {
      await sendMessage(senderId, '❓ Tape OUI pour confirmer l\'import, ou NON pour annuler.', BOUTON_MENU);
    }
    return;
  }

  // Mode correction d'exercice (inchangé)
  if (etat.mode === 'correction_exercices') {
    const acces = await verifierEtConsommerCredit(senderId);
    if (!acces.autorise) {
      await sendMessage(senderId, `🔒 Utilisation gratuite épuisée.`, BOUTON_MENU);
      return;
    }
    await sendTyping(senderId, true);
    try {
      const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const base64 = Buffer.from(imgResp.data).toString('base64');
      const mime = imgResp.headers['content-type'] || 'image/jpeg';
      const imagePart = { inline_data: { mime_type: mime, data: base64 } };
      let transcription = '';
      try { transcription = await appellerGeminiVision('Transcris le texte de cette image (les questions/sujets).', imagePart); } catch(e) {}
      const extra = transcription ? contenuMalagasyPertinent(transcription) : '';
      const promptCorr = "Corrige l'exercice de cette image, détaille les réponses." + consigneMethodologie() + CONSIGNE_FORMAT_MATH + extra;
      const correction = await appellerGeminiVision(promptCorr, imagePart);
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🖊️📷 ${correction}`, BOUTON_MENU);
      const res = await ajouterXP(senderId, 5, 'correction');
      if (res.montee) await sendMessage(senderId, `🎉 Niveau ${res.nouveauNiveau} !`, BOUTON_MENU);
    } catch(e) { console.error('Image correction error:', e.message); await sendTyping(senderId, false); await sendMessage(senderId, "❌ Erreur d'analyse de l'image."); }
    return;
  }

  // Mode CV (photo pour CV)
  if (etat.mode === 'creation_cv') {
    await sendTyping(senderId, true);
    try {
      const extrait = await extraireInfosCvDepuisImage(imageUrl);
      const donneesFusionnees = { ...etat.donnees };
      for (const cle of Object.keys(extrait)) {
        if (!donneesFusionnees[cle] && extrait[cle]) donneesFusionnees[cle] = extrait[cle];
      }
      await sendTyping(senderId, false);
      const indexPremierManquant = ETAPES_CV.findIndex(e => !donneesFusionnees[e.cle]);
      if (indexPremierManquant === -1) {
        userModes[senderId] = { mode: 'creation_cv_loisirs_photo', donnees: donneesFusionnees };
        await sendMessage(senderId, '📄 Infos extraites de ta photo ! Il ne reste que les derniers détails.\n\nLoisirs ? (ou "passe")');
      } else {
        userModes[senderId] = { mode: 'creation_cv', etapeIndex: indexPremierManquant, donnees: donneesFusionnees };
        await sendMessage(senderId, `📄 Infos extraites ! Il me manque :\n\n${ETAPES_CV[indexPremierManquant].question}`, BOUTON_MENU);
      }
    } catch(err) { console.error('Erreur extraction CV image:', err.message); await sendTyping(senderId, false); await sendMessage(senderId, "❌ Erreur de lecture de l'image. Continue les questions.", BOUTON_MENU); }
    return;
  }

  if (etat.mode === 'creation_cv_loisirs_photo' && etat.etapePhoto === true) {
    try {
      const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const photoBuffer = Buffer.from(imgResp.data);
      await genererEtEnvoyerCv(senderId, etat.donnees, photoBuffer);
      await ajouterXP(senderId, 25, 'cv_creation');
    } catch(err) { console.error('CV photo error:', err.message); await sendMessage(senderId, "❌ Photo non reçue. Tapez 'passe'."); }
    return;
  }

  // Message par défaut
  await sendMessage(senderId, '📷 Photo reçue. Pour la faire analyser, active le mode "corriger un exercice" ou si tu es admin, utilise "résultats".', BOUTON_MENU);
}

// ============================================================
// GESTION DES AUDIOS (Hianatra)
// ============================================================
async function handleAudioEvent(senderId, audioUrl) {
  const etat = userModes[senderId] || { mode: 'chat' };
  if (etat.mode !== 'hianatra_session') {
    await sendMessage(senderId, '🎙️ Active le mode "Hianatra" pour utiliser l\'audio.', BOUTON_MENU);
    return;
  }
  await sendTyping(senderId, true);
  try {
    const audioResp = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const base64 = Buffer.from(audioResp.data).toString('base64');
    const imagePart = { inline_data: { mime_type: 'audio/mpeg', data: base64 } };
    const promptSystem = `${etat.instruction} Écoute le message vocal et réponds pédagogiquement.`;
    const reponse = await appellerGeminiVision(promptSystem, imagePart);
    if (!etat.historique) etat.historique = [];
    etat.historique.push({ role: 'user', parts: [{ text: '[Message vocal]' }] });
    etat.historique.push({ role: 'model', parts: [{ text: reponse }] });
    userModes[senderId].historique = etat.historique.slice(-10);
    await sendTyping(senderId, false);
    await sendMessage(senderId, `🎓🎙️ ${reponse}`, BOUTON_MENU);
    await ajouterXP(senderId, 5, 'hianatra_audio');
  } catch(e) { console.error('Audio error:', e.message); await sendTyping(senderId, false); await sendMessage(senderId, "❌ Audio non traité."); }
}

// ============================================================
// handleEvent - Fonction principale
// ============================================================
async function handleEvent(senderId, texteOuPayload, estUnBouton) {
  const etat = userModes[senderId] || { mode: 'chat' };
  
  // Raccourcis numériques
  if (!estUnBouton && etat.mode === 'chat' && RACCOURCIS_NUM[texteOuPayload.trim()]) {
    texteOuPayload = RACCOURCIS_NUM[texteOuPayload.trim()];
  }

  // Détection de la commande "alerte [province]" même en mode chat
  const matchAlerte = /^alerte\s+(\w+)/i.exec(texteOuPayload);
  if (matchAlerte && !estUnBouton) {
    const province = matchAlerte[1];
    const provinceKey = normaliserProvince(province);
    if (provinceKey && BACC_CONFIG[provinceKey]) {
      const ok = await inscrireAlerte(senderId, provinceKey);
      const name = BACC_CONFIG[provinceKey].name;
      if (ok) {
        await sendMessage(senderId, `✅ Alertes activées pour **${name}**. Vous recevrez une notification dès la publication.`, BOUTON_MENU);
      } else {
        await sendMessage(senderId, `🔔 Vous êtes déjà inscrit pour **${name}**.`, BOUTON_MENU);
      }
    } else {
      await sendMessage(senderId, `❌ Province "${province}" non reconnue. Provinces disponibles : Antananarivo, Fianarantsoa, Toamasina, Mahajanga, Toliara, Antsiranana, Itasy, Analanjirofo.`, BOUTON_MENU);
    }
    return;
  }

  // Identité du bot
  if (MOTS_CLES_IDENTITE.test(texteOuPayload)) {
    return sendMessage(senderId, PRESENTATION_BOT, BOUTON_MENU);
  }

  // Menu
  if (texteOuPayload === 'GET_STARTED' || MOTS_CLES_MENU.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'chat' };
    return envoyerMenu(senderId, '👋 Bienvenue ! Que veux-tu faire ?');
  }

  // Profil
  if (texteOuPayload === 'MON_PROFIL' || /^mon profil$|^profil$/i.test(texteOuPayload)) {
    return afficherProfil(senderId);
  }

  // Défi du jour
  if (texteOuPayload === 'DEFI_JOUR' || /^défi du jour$|^defi$/i.test(texteOuPayload)) {
    return handleDefiQuotidien(senderId);
  }

  const peutChanger = etat.mode === 'chat' || estUnBouton;
  if (peutChanger) {
    // ---------- MENU MEMOIRE ----------
    if (texteOuPayload === 'MENU_MEMOIRE' || MOTS_CLES_MEMOIRE.test(texteOuPayload)) {
      const credits = await obtenirCredits(senderId);
      await sendMessage(senderId,
        `📖 **Rédaction de mémoire premium**\n\n` +
        `Cet outil vous permet de rédiger un mémoire complet, structuré et prêt à être déposé.\n\n` +
        `📚 Niveaux disponibles :\n` +
        `- Licence (30-45 pages) : ${memoire.COUTS_MEMOIRE.LICENCE} crédits\n` +
        `- Master (60-75 pages) : ${memoire.COUTS_MEMOIRE.MASTER} crédits\n` +
        `- CAPEN / MAPEN : ${memoire.COUTS_MEMOIRE.CAPEN} crédits\n\n` +
        `💳 Vous avez actuellement ${credits} crédits.\n\n` +
        `Choisissez votre niveau :`,
        [
          { content_type: 'text', title: '📘 Licence', payload: 'MEMOIRE_LICENCE' },
          { content_type: 'text', title: '📗 Master', payload: 'MEMOIRE_MASTER' },
          { content_type: 'text', title: '📙 CAPEN/MAPEN', payload: 'MEMOIRE_CAPEN' },
        ]
      );
      return;
    }

    if (texteOuPayload.startsWith('MEMOIRE_')) {
      const niveau = texteOuPayload.replace('MEMOIRE_', '');
      const credits = await obtenirCredits(senderId);
      const cout = memoire.COUTS_MEMOIRE[niveau] || 0;
      if (credits < cout) {
        await sendMessage(senderId, `⚠️ Crédits insuffisants. Il vous faut ${cout} crédits. Vous en avez ${credits}. Tapez "code" pour en ajouter.`, BOUTON_MENU);
        return;
      }
      userModes[senderId] = { mode: 'memoire_theme', niveau, etape: 'theme' };
      await sendMessage(senderId,
        `📖 **Rédaction de mémoire - ${niveau}**\n\n` +
        `Envoie-moi votre thème ou un plan détaillé.\n\n` +
        `💳 ${cout} crédits seront déduits avant la rédaction.\n\n` +
        `🔔 Je vais d'abord générer un plan que vous pourrez valider ou modifier.`,
        BOUTON_MENU
      );
      return;
    }

    // ---------- AUTRES MENUS (inchangés) ----------
    if (texteOuPayload === 'MENU_CHAT' || MOTS_CLES_CHAT.test(texteOuPayload)) {
      await sendMessage(senderId, '💬 Discuter avec qui ?',
        [{ content_type:'text', title:'🤖 IA', payload:'CHAT_IA' }, { content_type:'text', title:'👤 Admin', payload:'CHAT_HUMAIN' }]);
      return;
    }
    if (texteOuPayload === 'CHAT_IA' || MOTS_CLES_CHAT_IA.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'chat' }; resetHistorique(senderId);
      await sendMessage(senderId, '🤖 Pose-moi tes questions !', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'CHAT_HUMAIN' || MOTS_CLES_CHAT_HUMAIN.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'humain' };
      await sendMessage(senderId, '👤 Un admin vous répondra. Tapez "menu" pour revenir.');
      return;
    }
    if (texteOuPayload === 'MENU_RESULTATS' || MOTS_CLES_BEPC.test(texteOuPayload) || MOTS_CLES_BACC.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'resultats_menu' };
      await sendMessage(senderId, '🎓 Quel examen ? (CEPE, BEPC, BACC)',
        [{ content_type:'text', title:'CEPE', payload:'EXAM_CEPE' }, { content_type:'text', title:'BEPC', payload:'EXAM_BEPC' }, { content_type:'text', title:'BACC', payload:'EXAM_BACC' }]);
      return;
    }
    if (texteOuPayload.startsWith('HIANATRA_AUDIO_')) {
      await sendTyping(senderId, true);
      try {
        const textToSpeak = Buffer.from(texteOuPayload.replace('HIANATRA_AUDIO_', ''), 'base64').toString();
        const lang = /[àâçéèêëîïôûùÿ]/.test(textToSpeak.toLowerCase()) ? 'fr' : 'en';
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(textToSpeak.slice(0,200))}&tl=${lang}&client=tw-ob`;
        const audioResp = await axios.get(ttsUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const fileId = stockerFichierGenere(Buffer.from(audioResp.data), 'audio/mpeg', 'prononciation.mp3');
        const url = `${URL_BASE_PUBLIQUE}/generated-file/${fileId}`;
        await sendTyping(senderId, false);
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
          recipient: { id: senderId },
          message: { attachment: { type: 'audio', payload: { url, is_reusable: true } } }
        });
      } catch(e) { console.error('TTS error:', e.message); await sendTyping(senderId, false); await sendMessage(senderId, "❌ Audio indisponible."); }
      return;
    }
    if (texteOuPayload.startsWith('ACTIVER_ALERTE_')) {
      const province = texteOuPayload.replace('ACTIVER_ALERTE_', '');
      const ok = await inscrireAlerte(senderId, province);
      const name = BACC_CONFIG[province]?.name || province;
      if (ok) await sendMessage(senderId, `✅ Alertes activées pour ${name}. Vous recevrez une notification dès la publication.`, BOUTON_MENU);
      else await sendMessage(senderId, `🔔 Vous êtes déjà inscrit pour ${name}.`, BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_CORRECTION' || MOTS_CLES_CORRECTION.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'correction' };
      await sendMessage(senderId, '📝 Envoyez votre texte à corriger.', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_TRADUCTION' || MOTS_CLES_TRADUCTION.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'traduction', langue: null };
      await sendMessage(senderId, '🌐 Vers quelle langue ? (ex: anglais, malgache...)', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_EXERCICES' || MOTS_CLES_EXERCICES.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'exercices' };
      await sendMessage(senderId, '📚 Quel sujet ? Je génère un exercice.', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_CORRECTION_EXERCICES' || MOTS_CLES_CORRECTION_EXERCICES.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'correction_exercices' };
      await sendMessage(senderId, '🖊️ Envoyez l\'exercice (texte ou photo).', BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_CODE' || MOTS_CLES_CODE.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'attente_code' };
      const credits = await obtenirCredits(senderId);
      await sendMessage(senderId, `🔑 Vous avez ${credits} crédits. Envoyez un code.`, BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_CV' || MOTS_CLES_CV.test(texteOuPayload)) {
      const acces = await verifierEtConsommerCredit(senderId);
      if (!acces.autorise) {
        await sendMessage(senderId, `🔒 Utilisation gratuite épuisée (${LIMITE_GRATUITE_PAR_JOUR}/jour) et pas de crédits. Revenez demain ou tapez "code".`, BOUTON_MENU);
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
        await sendMessage(senderId, `🔒 Utilisation gratuite épuisée et pas de crédits. Revenez demain.`, BOUTON_MENU);
        return;
      }
      userModes[senderId] = { mode: 'simulation_bac_serie' };
      await sendMessage(senderId, `🧮 Simulateur Bac. Quelle série ? (${Object.keys(COEFFICIENTS_BAC).join(', ')})`, BOUTON_MENU);
      return;
    }
    if (texteOuPayload === 'MENU_HIANATRA' || MOTS_CLES_HIANATRA.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'hianatra_menu' };
      await sendMessage(senderId, '🎓 Hianatra : que veux-tu apprendre ? (1 Informatique, 2 Langues, 3 Leçons)',
        [{ content_type:'text', title:'💻 Info', payload:'HIANATRA_INFO' }, { content_type:'text', title:'🌍 Langues', payload:'HIANATRA_LANGUES' }, { content_type:'text', title:'📚 Leçons', payload:'HIANATRA_LECONS' }]);
      return;
    }
  }

  // ============================================================
  // SWITCH DES MODES ACTIFS
  // ============================================================
  switch (etat.mode) {
    // ... tous les cas existants (resultats_menu, choix_province_bacc, resultats_bacc, admin_*, simulation_bac_*, creation_cv, attente_code, humain, resultats, correction, traduction, correction_exercices, exercices, defi_quotidien, hianatra_*)
    // Je les garde tels qu'ils sont dans votre version actuelle (ils n'ont pas changé)
    // Pour éviter de les répéter ici (ils sont déjà dans votre fichier), je vais seulement ajouter les NOUVEAUX cas pour le mémoire.
    // Les cas existants sont inchangés.

    // ============================================================
    // NOUVEAUX CAS POUR LA RÉDACTION DE MÉMOIRE
    // ============================================================
    case 'memoire_theme': {
      if (texteOuPayload.trim().length < 10) {
        await sendMessage(senderId, '⚠️ Veuillez fournir un thème plus précis (minimum 10 caractères).', BOUTON_MENU);
        return;
      }
      await sendTyping(senderId, true);
      try {
        const references = await memoire.getReferencesPertinentes(redisGet, texteOuPayload, etat.niveau);
        const planData = await memoire.genererPlanMemoire(chatWithGemini, texteOuPayload, etat.niveau, references);
        userModes[senderId] = {
          mode: 'memoire_validation_plan',
          niveau: etat.niveau,
          theme: texteOuPayload,
          plan: planData,
          references: references
        };
        await sendTyping(senderId, false);
        
        let msgPlan = `📋 **Plan proposé pour votre mémoire**\n\n`;
        msgPlan += `📌 **Titre :** ${planData.titre || 'À définir'}\n\n`;
        msgPlan += `📚 **Structure :**\n`;
        for (let i = 0; i < planData.plan.length; i++) {
          const partie = planData.plan[i];
          msgPlan += `\n**${i+1}. ${partie.titre}**\n`;
          for (const sp of partie.sousParties) {
            msgPlan += `   • ${sp}\n`;
          }
        }
        msgPlan += `\n📖 **Bibliographie proposée :** ${planData.bibliographie?.length || 0} références.\n\n`;
        msgPlan += `✅ Tapez **OUI** pour valider ce plan et commencer la rédaction.\n` +
          `✏️ Tapez **MODIFIER** pour proposer des changements.\n` +
          `❌ Tapez **ANNULER** pour abandonner.`;
        
        await sendMessage(senderId, msgPlan, BOUTON_MENU);
      } catch (err) {
        console.error('Erreur génération plan:', err);
        await sendTyping(senderId, false);
        await sendMessage(senderId, '❌ Erreur lors de la génération du plan. Réessaie avec un thème plus précis.', BOUTON_MENU);
      }
      break;
    }

    case 'memoire_validation_plan': {
      const reponse = texteOuPayload.trim().toUpperCase();
      if (reponse === 'OUI') {
        const cout = memoire.COUTS_MEMOIRE[etat.niveau] || 0;
        const credits = await obtenirCredits(senderId);
        if (credits < cout) {
          await sendMessage(senderId, `⚠️ Crédits insuffisants. Il vous faut ${cout} crédits.`, BOUTON_MENU);
          userModes[senderId] = { mode: 'chat' };
          return;
        }
        await definirCredits(senderId, credits - cout);
        
        userModes[senderId] = { 
          mode: 'memoire_redaction', 
          niveau: etat.niveau,
          theme: etat.theme,
          plan: etat.plan,
          references: etat.references,
          chapitres: [],
          resumes: [],
          indexChapitre: 0
        };
        await sendMessage(senderId, '🚀 **Début de la rédaction...**\n\nJe vais rédiger chapitre par chapitre. Vous recevrez une notification après chaque chapitre.', BOUTON_MENU);
        await memoire.demarrerRedactionMemoire(
          senderId,
          userModes,
          sendMessage,
          sendTyping,
          sendFile,
          BOUTON_MENU,
          obtenirCredits,
          definirCredits,
          ajouterXP,
          stockerFichierGenere,
          URL_BASE_PUBLIQUE,
          chatWithGemini,
          redisGet,
          redisSet
        );
      } else if (reponse === 'MODIFIER') {
        userModes[senderId] = { mode: 'memoire_modification_plan', niveau: etat.niveau, theme: etat.theme, plan: etat.plan, references: etat.references };
        await sendMessage(senderId, '✏️ Envoyez les modifications que vous souhaitez apporter au plan (ex: "Ajouter un chapitre sur...", "Supprimer la partie 2.3", "Changer le titre en...").', BOUTON_MENU);
      } else if (reponse === 'ANNULER') {
        userModes[senderId] = { mode: 'chat' };
        await sendMessage(senderId, '❌ Rédaction annulée.', BOUTON_MENU);
      } else {
        await sendMessage(senderId, '❓ Tapez OUI, MODIFIER ou ANNULER.', BOUTON_MENU);
      }
      break;
    }

    case 'memoire_modification_plan': {
      await sendTyping(senderId, true);
      try {
        const prompt = `
Voici le plan actuel d'un mémoire :
${JSON.stringify(etat.plan, null, 2)}

L'utilisateur demande les modifications suivantes :
"${texteOuPayload}"

Applique ces modifications et retourne le plan complet mis à jour, au même format JSON.
`;
        const reponse = await chatWithGemini(prompt, 'modification_plan');
        const nettoye = reponse.replace(/```json|```/g, '').trim();
        const nouveauPlan = JSON.parse(nettoye);
        
        userModes[senderId] = {
          mode: 'memoire_validation_plan',
          niveau: etat.niveau,
          theme: etat.theme,
          plan: nouveauPlan,
          references: etat.references
        };
        await sendTyping(senderId, false);
        
        let msgPlan = `📋 **Plan modifié avec succès !**\n\n`;
        msgPlan += `📌 **Titre :** ${nouveauPlan.titre || 'À définir'}\n\n`;
        msgPlan += `📚 **Nouvelle structure :**\n`;
        for (let i = 0; i < nouveauPlan.plan.length; i++) {
          const partie = nouveauPlan.plan[i];
          msgPlan += `\n**${i+1}. ${partie.titre}**\n`;
          for (const sp of partie.sousParties) {
            msgPlan += `   • ${sp}\n`;
          }
        }
        msgPlan += `\n✅ Tapez **OUI** pour valider ce plan et commencer la rédaction.\n` +
          `✏️ Tapez **MODIFIER** pour proposer d'autres changements.\n` +
          `❌ Tapez **ANNULER** pour abandonner.`;
        
        await sendMessage(senderId, msgPlan, BOUTON_MENU);
      } catch (err) {
        console.error('Erreur modification plan:', err);
        await sendTyping(senderId, false);
        await sendMessage(senderId, '❌ Erreur lors de la modification du plan. Réessaie.', BOUTON_MENU);
      }
      break;
    }

    case 'memoire_correction': {
      // Gérer les corrections post-rédaction (à développer plus tard)
      await sendMessage(senderId, '📝 Fonction de correction en développement. Contactez l\'admin.', BOUTON_MENU);
      break;
    }

    // ============================================================
    // CAS PAR DÉFAUT (CHAT LIBRE AVEC DÉTECTION D'INTENTION)
    // ============================================================
    default: {
      const intention = detecterIntention(texteOuPayload);
      const profile = await getProfile(senderId);
      const nomUtilisateur = profile?.nom || '';

      if (intention.estResultat) {
        await sendMessage(
          senderId,
          `🔍 **Pour consulter un résultat d'examen, veuillez activer le mode dédié :**\n\n` +
          `1️⃣ Tapez **"menu"** puis choisissez **"🎓 Résultats examens"**\n` +
          `2️⃣ Ou tapez directement :\n` +
          `   • **"bepc"** pour le BEPC\n` +
          `   • **"bacc"** pour le Baccalauréat\n` +
          `   • **"cepe"** pour le CEPE\n\n` +
          `🔔 Vous pouvez aussi taper **"alerte [province]"** pour recevoir une notification dès la publication des résultats.\n` +
          `Exemple : *"alerte itasy"* ou *"alerte fianarantsoa"*\n\n` +
          `Je ne peux pas inventer de résultats, je ne consulte que les bases officielles. 😊`,
          BOUTON_MENU
        );
        return;
      }

      if (intention.estConversation) {
        const reponses = {
          'bonjour': `👋 Bonjour${nomUtilisateur ? ' ' + nomUtilisateur : ''} ! Comment puis-je vous aider aujourd'hui ? 😊`,
          'salut': `👋 Salut${nomUtilisateur ? ' ' + nomUtilisateur : ''} ! Content de vous voir ! Que puis-je faire pour vous ? 😄`,
          'merci': `🌟 Avec plaisir ! Je suis là pour vous aider à tout moment 😊\n\nN'hésitez pas si vous avez d'autres questions !`,
          'bravo': `🎉 Merci beaucoup ! Vous êtes génial(e) aussi ! 💪\n\nBesoin d'autre chose ?`,
          'comment ça va': `🤗 Je vais très bien, merci de demander ! Et vous, comment allez-vous ? 🌟`,
          'quoi de neuf': `📢 Pas grand-chose de neuf ici, je suis toujours prêt à vous aider avec vos examens, exercices, traductions... Et vous, quoi de neuf ?`,
          'au revoir': `👋 Au revoir${nomUtilisateur ? ' ' + nomUtilisateur : ''} ! Revenez quand vous voulez, je serai là pour vous aider. Prenez soin de vous ! 🌟`
        };
        
        const clef = Object.keys(reponses).find(key => texteOuPayload.toLowerCase().includes(key));
        const reponse = clef ? reponses[clef] : 
          `💬 C'est un plaisir de discuter avec vous${nomUtilisateur ? ', ' + nomUtilisateur : ''} ! 😊\n\n` +
          `Je peux vous aider avec :\n` +
          `• 🎓 Résultats d'examens (BEPC, BACC, CEPE)\n` +
          `• 📝 Correction de textes\n` +
          `• 📚 Exercices scolaires\n` +
          `• 🌐 Traductions\n` +
          `• 📄 Création de CV\n\n` +
          `Tapez "menu" pour voir toutes les options !`;
        
        await sendMessage(senderId, reponse, BOUTON_MENU);
        return;
      }

      if (intention.estAide) {
        await sendMessage(
          senderId,
          `🆘 **Je suis là pour vous aider !**\n\n` +
          `Voici ce que je sais faire :\n\n` +
          `📌 **Examens** : "bacc", "bepc", "cepe" pour consulter les résultats\n` +
          `📝 **Correction** : envoyez un texte, je le corrige\n` +
          `📚 **Exercices** : demandez un exercice sur un sujet précis\n` +
          `🌐 **Traduction** : "traduis [texte] en [langue]"` +
          `📄 **CV** : tapez "cv" pour créer votre CV\n` +
          `📖 **Mémoire** : tapez "mémoire" pour rédiger un mémoire complet\n` +
          `🎯 **Défi** : tapez "défi du jour" pour un exercice quotidien\n` +
          `🔔 **Alertes** : tapez "alerte [province]" pour être notifié\n\n` +
          `Que souhaitez-vous faire ? Tapez "menu" pour voir toutes les options !`,
          BOUTON_MENU
        );
        return;
      }

      if (intention.estFonction) {
        if (texteOuPayload.includes('exercice') || texteOuPayload.includes('exercices')) {
          userModes[senderId] = { mode: 'exercices' };
          await sendMessage(senderId, '📚 Mode Exercices activé.\n\nEnvoie-moi un sujet/matière (ex: "conjugaison du présent"), je génère un exercice à chaque fois.', BOUTON_MENU);
          return;
        }
        if (texteOuPayload.includes('corrige') || texteOuPayload.includes('correction')) {
          userModes[senderId] = { mode: 'correction' };
          await sendMessage(senderId, '📝 Mode Correction activé.\n\nEnvoie-moi tes textes, je les corrige un par un.', BOUTON_MENU);
          return;
        }
        if (texteOuPayload.includes('traduis') || texteOuPayload.includes('traduction')) {
          userModes[senderId] = { mode: 'traduction', langue: null };
          await sendMessage(senderId, '🌐 Vers quelle langue veux-tu traduire ? (ex: anglais, malgache...)', BOUTON_MENU);
          return;
        }
        if (texteOuPayload.includes('cv')) {
          const acces = await verifierEtConsommerCredit(senderId);
          if (!acces.autorise) {
            await sendMessage(senderId, `🔒 Utilisation gratuite épuisée (${LIMITE_GRATUITE_PAR_JOUR}/jour) et pas de crédits. Revenez demain ou tapez "code".`, BOUTON_MENU);
            return;
          }
          userModes[senderId] = { mode: 'creation_cv', etapeIndex: 0, donnees: {} };
          await sendMessage(senderId, ETAPES_CV[0].question, BOUTON_MENU);
          return;
        }
        if (texteOuPayload.includes('mémoire') || texteOuPayload.includes('memoire') || texteOuPayload.includes('redaction')) {
          const credits = await obtenirCredits(senderId);
          await sendMessage(senderId,
            `📖 **Rédaction de mémoire premium**\n\n` +
            `Cet outil vous permet de rédiger un mémoire complet, structuré et prêt à être déposé.\n\n` +
            `📚 Niveaux disponibles :\n` +
            `- Licence (30-45 pages) : ${memoire.COUTS_MEMOIRE.LICENCE} crédits\n` +
            `- Master (60-75 pages) : ${memoire.COUTS_MEMOIRE.MASTER} crédits\n` +
            `- CAPEN / MAPEN : ${memoire.COUTS_MEMOIRE.CAPEN} crédits\n\n` +
            `💳 Vous avez actuellement ${credits} crédits.\n\n` +
            `Choisissez votre niveau en tapant "licence", "master" ou "capen".`,
            BOUTON_MENU
          );
          return;
        }
      }

      // Conversation générale avec l'IA
      await sendTyping(senderId, true);
      const niveau = profile?.niveau_scolaire || '';
      const matieres = profile?.matieres_favorites || [];
      let promptContexte = `L'utilisateur${nomUtilisateur ? ' ' + nomUtilisateur : ''} te parle.`;
      if (niveau) promptContexte += ` Son niveau : ${niveau}.`;
      if (matieres.length) promptContexte += ` Ses matières favorites : ${matieres.join(', ')}.`;
      promptContexte += ` Réponds de manière naturelle, chaleureuse et adaptée à une conversation humaine.`;

      const rep = await chatAvecHistorique(senderId, texteOuPayload, promptContexte);
      await sendTyping(senderId, false);
      await sendMessage(senderId, rep, BOUTON_MENU);
      return;
    }
  }
}

// ============================================================
// FONCTIONS CV, MÉTHODOLOGIE, ETC. (inchangées)
// ============================================================
// ... (ici vous conservez toutes vos fonctions existantes : CV, simulateur Bac, méthodologie, contenu de référence, etc.)

// ============================================================
// DÉMARRAGE
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Serveur démarré sur le port ${PORT}`));
