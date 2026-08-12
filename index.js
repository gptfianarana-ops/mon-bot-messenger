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
// FICHIERS GÉNÉRÉS (CV, etc.)
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
// SIMULATEUR BAC
// ============================================================
const COEFFICIENTS_BAC = {
  A1: { Malagasy: 4, Philosophie: 4, Français: 3, 'Histoire-Géographie': 4, Anglais: 2, 'SVT/PC': 1, Mathématiques: 1, EPS: 1 },
  A2: { Malagasy: 4, Philosophie: 4, Français: 2, 'Histoire-Géographie': 4, Anglais: 1, 'SVT/PC': 1, Mathématiques: 3, EPS: 1 },
  C: { Malagasy: 3, Philosophie: 2, Français: 2, 'Histoire-Géographie': 2, Anglais: 1, SVT: 4, 'Physique-Chimie': 5, Mathématiques: 5, EPS: 1 },
  D: { Malagasy: 3, Philosophie: 2, Français: 2, 'Histoire-Géographie': 2, Anglais: 1, SVT: 3, 'Physique-Chimie': 4, Mathématiques: 4, EPS: 1 },
  L: { Malagasy: 6, Français: 5, Anglais: 5, 'Histoire-Géographie': 4, Philosophie: 5, Mathématiques: 1, 'Physique-Chimie': 1, SVT: 1, SES: 2, EPS: 2 },
  S: { Malagasy: 3, Français: 2, Anglais: 2, 'Histoire-Géographie': 2, Philosophie: 2, Mathématiques: 6, 'Physique-Chimie': 6, SVT: 6, SES: 1, EPS: 2 },
  OSE: { Malagasy: 3, Français: 3, Anglais: 2, 'Histoire-Géographie': 6, Philosophie: 3, Mathématiques: 5, 'Physique-Chimie': 1, SVT: 1, SES: 6, EPS: 2 },
};
function normaliserSerie(texte) {
  const s = texte.trim().toUpperCase().replace(/^SERIE\s*/, '').replace(/^SÉRIE\s*/, '');
  return COEFFICIENTS_BAC[s] ? s : null;
}
function calculerResultatBac(serie, notes) {
  const coeffs = COEFFICIENTS_BAC[serie];
  const matieres = Object.keys(coeffs);
  let totalCoeff = 0, totalPoints = 0, lignes = [];
  for (const matiere of matieres) {
    const coeff = coeffs[matiere];
    const note = notes[matiere];
    const points = note * coeff;
    totalCoeff += coeff;
    totalPoints += points;
    lignes.push({ matiere, note, coeff, points });
  }
  const moyenne = Math.round((totalPoints / totalCoeff) * 100) / 100;
  const admis = moyenne >= 10;
  const matieresFortes = lignes.filter(l => l.note >= 12).sort((a,b) => b.note - a.note);
  const matieresFaibles = lignes.filter(l => l.note < 10).sort((a,b) => b.coeff - a.coeff);
  return { lignes, totalCoeff, totalPoints, moyenne, admis, matieresFortes, matieresFaibles };
}
function formaterResultatBac(serie, resultat) {
  const { lignes, totalCoeff, totalPoints, moyenne, admis, matieresFortes, matieresFaibles } = resultat;
  let texte = `🎓 SIMULATION BAC EMEDUC\n\nSérie : ${serie}\n\n`;
  texte += `Matière | Note | Coeff | Points\n`;
  for (const l of lignes) texte += `${l.matiere} | ${l.note} | ${l.coeff} | ${l.points}\n`;
  texte += `\n────────────────────\n`;
  texte += `Total Coefficients : ${totalCoeff}\n`;
  texte += `Total Points : ${totalPoints}\n`;
  texte += `Bonus : 0 point\n`;
  texte += `Moyenne Générale : ${moyenne.toFixed(2)}\n`;
  texte += `Résultat : ${admis ? '✅ ADMIS' : '❌ NON ADMIS'}\n`;
  texte += `\n────────────────────\nAnalyse\n\n`;
  texte += matieresFortes.length ? `✔ Matières fortes : ${matieresFortes.map(l => `${l.matiere} (${l.note})`).join(', ')}\n` : `✔ Matières fortes : aucune note ≥ 12 pour l'instant.\n`;
  texte += matieresFaibles.length ? `✔ Matières faibles : ${matieresFaibles.map(l => `${l.matiere} (${l.note})`).join(', ')}\n` : `✔ Matières faibles : aucune note < 10, continue comme ça !\n`;
  if (matieresFaibles.length > 0) {
    const prioritaire = matieresFaibles[0];
    texte += `✔ Conseil : ${prioritaire.matiere} a un coefficient ${prioritaire.coeff} (parmi les plus importants) mais une note faible (${prioritaire.note}/20) — c'est la matière à travailler en priorité pour remonter la moyenne.`;
  } else {
    texte += `✔ Conseil : continue à consolider tes matières à fort coefficient pour sécuriser ta moyenne.`;
  }
  return texte;
}

// ============================================================
// CV (version complète)
// ============================================================
const ETAPES_CV = [
  { cle: 'nom', question: '📝 Commençons ton CV premium !\n\n1/9 — Quel est ton nom complet ?\n🇲🇬 Inona ny anarana feno-nao ?' },
  { cle: 'contact', question: '2/9 — Tes coordonnées ? (téléphone, email, ville)\n🇲🇬 Ahoana ny fomba fifandraisana aminao ? (telefaonina, mailaka, tanàna)' },
  { cle: 'poste', question: '3/9 — Quel poste ou métier vises-tu ?\n🇲🇬 Inona ny asa/toerana kendrenao ?' },
  { cle: 'profil', question: '4/9 — En 1-2 phrases, comment te décrirais-tu professionnellement ? (ou tape "passe" si tu préfères que je le rédige moi-même)\n🇲🇬 Ahoana no ilazanao ny tenanao ara-tsehatra ? (na soraty hoe "passe" raha tianao aho no manoratra)' },
  { cle: 'experiences', question: '5/9 — Liste tes expériences professionnelles (poste, entreprise, période, pour chacune — tout en un seul message, une par ligne). Si tu ne sais pas trop comment les présenter, écris-les comme tu peux, je réorganiserai proprement.\n🇲🇬 Tanisao ireo traikefa ara-tsehatra efa nanananao (asa, orinasa, fotoana — tsirairay isaky ny andalana).' },
  { cle: 'formation', question: '6/9 — Ta formation/tes diplômes (diplôme, établissement, année).\n🇲🇬 Ny fianaranao/diplaomanao (diplaoma, sekoly, taona).' },
  { cle: 'competences', question: '7/9 — Tes compétences techniques principales (séparées par des virgules).\n🇲🇬 Ireo fahaizana ara-teknika manan-danja aminao (sarahin\'ny faingo).' },
  { cle: 'qualites', question: '8/9 — Tes qualités personnelles ? (ex: sérieux, dynamique, motivé) — ou tape "auto" pour que je choisisse des qualités classiques pour toi.\n🇲🇬 Ny toetranao manokana ? (ohatra: matotra, be vin-tsaina) — na soraty hoe "auto" mba hisafidianako ho anao.' },
  { cle: 'langues', question: '9/9 — Les langues que tu parles, et ton niveau dans chacune.\n🇲🇬 Ireo teny fantatrao, sy ny haavonao amin\'ny tsirairay.' },
];
const QUALITES_AUTO_HOMME = 'Sérieux, dynamique, motivé, ponctuel, fiable, méthodique';
const QUALITES_AUTO_FEMME = 'Sérieuse, dynamique, motivée, ponctuelle, fiable, méthodique';
const QUALITES_AUTO_NEUTRE = 'Sérieux(se), dynamique, motivé(e), ponctuel(le), fiable, méthodique';
function qualitesAutoSelonGenre(reponseGenre) {
  const g = reponseGenre.trim().toLowerCase();
  if (/^(h|homme|masculin|m)$/.test(g)) return QUALITES_AUTO_HOMME;
  if (/^(f|femme|f[ée]minin)$/.test(g)) return QUALITES_AUTO_FEMME;
  return QUALITES_AUTO_NEUTRE;
}
const THEMES_CV = [
  { primaire: '#1e3a8a', accent: '#2563eb', texteClair: '#dbeafe' },
  { primaire: '#7c2d12', accent: '#ea580c', texteClair: '#fed7aa' },
  { primaire: '#065f46', accent: '#10b981', texteClair: '#d1fae5' },
  { primaire: '#581c87', accent: '#a855f7', texteClair: '#f3e8ff' },
  { primaire: '#831843', accent: '#ec4899', texteClair: '#fce7f3' },
  { primaire: '#1f2937', accent: '#6b7280', texteClair: '#e5e7eb' },
];
function decouperEnListe(texte) {
  if (!texte) return [];
  const lignes = texte.split('\n').map(l => l.trim()).filter(Boolean);
  if (lignes.length > 1) return lignes;
  return texte.split(',').map(l => l.trim()).filter(Boolean);
}
function genererPdfCv(donnees, photoBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const theme = THEMES_CV[Math.floor(Math.random() * THEMES_CV.length)];
      const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      const morceaux = [];
      doc.on('data', (chunk) => morceaux.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(morceaux)));
      doc.on('error', reject);

      const largeurPage = doc.page.width, hauteurPage = doc.page.height;
      const largeurBandeau = Math.round(largeurPage * 0.3), margeColonne = 22;
      doc.rect(0, 0, largeurBandeau, hauteurPage).fill(theme.primaire);

      const ajusterPolice = (texte, largeur, hauteurMax, tailleDefaut, tailleMin) => {
        let taille = tailleDefaut;
        doc.fontSize(taille);
        while (doc.heightOfString(texte, { width: largeur, lineGap: 2 }) > hauteurMax && taille > tailleMin) {
          taille -= 0.5;
          doc.fontSize(taille);
        }
        return taille;
      };

      let ySidebar = 26;
      if (photoBuffer) {
        const centreX = largeurBandeau / 2, rayon = 52;
        try {
          doc.save();
          doc.circle(centreX + 2, ySidebar + rayon + 2, rayon).fill('rgba(0,0,0,0.25)');
          doc.restore();
          doc.save();
          doc.circle(centreX, ySidebar + rayon, rayon).clip();
          doc.image(photoBuffer, centreX - rayon, ySidebar, { width: rayon * 2, height: rayon * 2 });
          doc.restore();
          doc.circle(centreX, ySidebar + rayon, rayon).lineWidth(2.5).stroke('#ffffff');
        } catch(e) {}
        ySidebar += rayon * 2 + 22;
      } else { ySidebar += 8; }

      doc.moveTo(margeColonne, ySidebar).lineTo(largeurBandeau - margeColonne, ySidebar).strokeColor(theme.texteClair).lineWidth(0.75).stroke();
      ySidebar += 14;

      const dessinerCoche = (x, y, taille, couleur) => {
        doc.save();
        doc.lineWidth(1.3).strokeColor(couleur)
          .moveTo(x, y + taille * 0.5)
          .lineTo(x + taille * 0.35, y + taille * 0.85)
          .lineTo(x + taille, y)
          .stroke();
        doc.restore();
      };

      const sectionSidebar = (titre, contenu, options = {}) => {
        if (!contenu) return;
        const { premiere, avecCoche } = options;
        if (!premiere) {
          doc.moveTo(margeColonne, ySidebar).lineTo(largeurBandeau - margeColonne, ySidebar).strokeColor(theme.texteClair).lineWidth(0.5).stroke();
          ySidebar += 12;
        }
        doc.fontSize(11).fillColor('#ffffff').font('Helvetica-Bold')
          .text(titre.toUpperCase(), margeColonne, ySidebar, { width: largeurBandeau - margeColonne * 2 });
        ySidebar = doc.y + 6;
        const decalageCoche = avecCoche ? 14 : 0;
        const largeurTexte = largeurBandeau - margeColonne * 2 - decalageCoche;
        const hauteurRestante = hauteurPage - ySidebar - 30;
        const tailleAjustee = ajusterPolice(contenu, largeurTexte, Math.min(hauteurRestante, 160), 9.5, 7.5);
        doc.font('Helvetica').fontSize(tailleAjustee).fillColor(theme.texteClair);
        for (const item of decouperEnListe(contenu)) {
          if (avecCoche) {
            dessinerCoche(margeColonne, ySidebar + 1, 8, theme.texteClair);
            doc.text(item, margeColonne + decalageCoche, ySidebar, { width: largeurTexte });
          } else {
            doc.text(`• ${item}`, margeColonne, ySidebar, { width: largeurTexte });
          }
          ySidebar = doc.y + 3;
        }
        ySidebar += 14;
      };

      sectionSidebar('Contact', donnees.contact, { premiere: true });
      sectionSidebar('Compétences', donnees.competences, { avecCoche: true });
      sectionSidebar('Langues', donnees.langues, {});
      if (donnees.loisirs) sectionSidebar('Loisirs', donnees.loisirs, {});

      const xPrincipal = largeurBandeau + margeColonne;
      const largeurPrincipale = largeurPage - xPrincipal - margeColonne;
      let yPrincipal = 38;
      doc.fontSize(26).fillColor('#111827').font('Helvetica-Bold')
        .text((donnees.nom || '').toUpperCase(), xPrincipal, yPrincipal, { width: largeurPrincipale });
      yPrincipal = doc.y + 3;
      doc.fontSize(13).fillColor(theme.accent).font('Helvetica-Bold')
        .text((donnees.poste || '').toUpperCase(), xPrincipal, yPrincipal, { width: largeurPrincipale });
      yPrincipal = doc.y + 6;
      doc.moveTo(xPrincipal, yPrincipal).lineTo(xPrincipal + 90, yPrincipal).strokeColor(theme.accent).lineWidth(2).stroke();
      yPrincipal += 16;

      const ESPACE_RESERVE_BAS = 100;
      const qualitesListe = decouperEnListe(donnees.qualites);
      const sectionsPrincipales = ['profil', 'experiences', 'formation'].filter(c => donnees[c]);
      if (qualitesListe.length) sectionsPrincipales.push('atouts');

      const ajusterPoliceZoneCible = (texte, largeur, hauteurCible, tailleDefaut, tailleMin, tailleMax) => {
        let taille = tailleDefaut;
        doc.fontSize(taille);
        let hauteur = doc.heightOfString(texte, { width: largeur, lineGap: 3 });
        if (hauteur > hauteurCible) {
          while (hauteur > hauteurCible && taille > tailleMin) {
            taille -= 0.5;
            doc.fontSize(taille);
            hauteur = doc.heightOfString(texte, { width: largeur, lineGap: 3 });
          }
        } else if (hauteur < hauteurCible * 0.75) {
          while (hauteur < hauteurCible * 0.85 && taille < tailleMax) {
            taille += 0.5;
            doc.fontSize(taille);
            hauteur = doc.heightOfString(texte, { width: largeur, lineGap: 3 });
          }
          if (hauteur > hauteurCible && taille > tailleDefaut) taille -= 0.5;
        }
        return taille;
      };

      const titreSection = (titre) => {
        doc.moveTo(xPrincipal, yPrincipal).lineTo(xPrincipal + largeurPrincipale, yPrincipal).strokeColor(theme.accent).lineWidth(1.5).stroke();
        yPrincipal += 8;
        doc.fontSize(12.5).fillColor(theme.accent).font('Helvetica-Bold')
          .text(titre.toUpperCase(), xPrincipal, yPrincipal, { width: largeurPrincipale });
        yPrincipal = doc.y + 6;
      };

      const sectionPrincipale = (cle, titre, contenu) => {
        if (!contenu) return;
        titreSection(titre);
        const hauteurRestante = hauteurPage - yPrincipal - ESPACE_RESERVE_BAS;
        const hauteurCible = hauteurRestante / Math.max(sectionsPrincipales.length, 1);
        const tailleAjustee = ajusterPoliceZoneCible(contenu, largeurPrincipale, Math.max(hauteurCible, 60), 10.5, 8, 14);
        doc.font('Helvetica').fontSize(tailleAjustee).fillColor('#1f2937')
          .text(contenu, xPrincipal, yPrincipal, { width: largeurPrincipale, lineGap: 3 });
        yPrincipal = doc.y + 16;
        sectionsPrincipales.shift();
      };

      sectionPrincipale('profil', 'Profil', donnees.profil);
      sectionPrincipale('experiences', 'Expériences professionnelles', donnees.experiences);
      sectionPrincipale('formation', 'Formation', donnees.formation);

      if (qualitesListe.length) {
        titreSection('Atouts');
        const gapCarte = 10;
        const largeurCarte = (largeurPrincipale - gapCarte) / 2;
        const hauteurCarte = 30;
        qualitesListe.forEach((qualite, i) => {
          const col = i % 2;
          const ligne = Math.floor(i / 2);
          const x = xPrincipal + col * (largeurCarte + gapCarte);
          const y = yPrincipal + ligne * (hauteurCarte + gapCarte);
          doc.roundedRect(x, y, largeurCarte, hauteurCarte, 6).fill('#f3f4f6');
          doc.fontSize(9.5).font('Helvetica-Bold').fillColor(theme.primaire)
            .text(qualite, x + 8, y + hauteurCarte / 2 - 5, { width: largeurCarte - 16, align: 'center' });
        });
        const nbLignes = Math.ceil(qualitesListe.length / 2);
        yPrincipal += nbLignes * (hauteurCarte + gapCarte) + 8;
        sectionsPrincipales.shift();
      }

      const texteSignature = donnees._genre === 'H' ? "L'intéressé" : donnees._genre === 'F' ? "L'intéressée" : "L'intéressé(e)";
      const yDeclaration = hauteurPage - 78;
      doc.fontSize(8.5).fillColor('#6b7280').font('Helvetica-Oblique')
        .text('Je certifie et déclare sur l\'honneur que tous les renseignements ci-dessus sont exacts.', xPrincipal, yDeclaration, { width: largeurPrincipale, align: 'center' });
      const ySignature = yDeclaration + 22;
      doc.fontSize(9).fillColor('#6b7280').font('Helvetica')
        .text('Fait à ______________________, le ______________________', xPrincipal, ySignature, { width: largeurPrincipale, align: 'center' });
      doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Oblique')
        .text(texteSignature, xPrincipal, ySignature + 24, { width: largeurPrincipale, align: 'right' });

      doc.end();
    } catch(err) { reject(err); }
  });
}
async function humaniserContenuCv(donnees) {
  const brut = JSON.stringify(donnees);
  const reponse = await chatWithGemini(
    `Voici les informations brutes fournies par une personne pour son CV (au format JSON) : ${brut}\n\n` +
    `Réécris et structure ce contenu de façon professionnelle, humanisée et bien rédigée (corrige les fautes, reformule proprement, sois concis et percutant, style CV professionnel). ` +
    `La personne a pu répondre en français OU en malgache, indifféremment selon les champs. Quelle que soit la langue de chaque réponse d'origine, le CV final doit être ENTIÈREMENT rédigé en français (traduis les parties en malgache). ` +
    `Si "experiences" ou "formation" sont mal écrites, désordonnées, ou dans le désordre chronologique, réorganise-les proprement (une entrée claire par ligne : poste/diplôme — organisme — période). ` +
    `Si "profil" contient "passe" ou est vide, rédige toi-même un court profil professionnel cohérent avec le poste visé et les expériences. ` +
    `Réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans aucun texte autour, sans markdown : ` +
    `{"nom": "...", "poste": "...", "contact": "...", "profil": "...", "experiences": "...", "formation": "...", "competences": "...", "qualites": "...", "langues": "...", "loisirs": "..."}\n` +
    `Pour "experiences" et "formation", garde un retour à la ligne entre chaque élément. Pour "qualites" et "langues", garde une virgule entre chaque élément.`,
    'creation_cv'
  );
  const nettoye = reponse.replace(/```json|```/g, '').trim();
  return JSON.parse(nettoye);
}
async function extraireInfosCvDepuisImage(imageUrl) {
  const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
  const base64Image = Buffer.from(imgResponse.data).toString('base64');
  const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';
  const imagePart = { inline_data: { mime_type: mimeType, data: base64Image } };
  const reponse = await appellerGemini({
    contents: [{ parts: [{ text: "Voici une photo (ancien CV, document administratif, ou notes manuscrites) contenant des informations personnelles/professionnelles d'une personne. Extrait tout ce que tu peux identifier avec certitude (n'invente rien). Réponds UNIQUEMENT avec un objet JSON de cette forme exacte (laisse une chaîne vide \"\" pour tout champ que tu ne trouves pas), sans markdown, sans texte autour : {\"nom\": \"\", \"contact\": \"\", \"poste\": \"\", \"profil\": \"\", \"experiences\": \"\", \"formation\": \"\", \"competences\": \"\", \"qualites\": \"\", \"langues\": \"\", \"loisirs\": \"\"}\nPour \"experiences\" et \"formation\", une ligne par élément trouvé." }, imagePart] }]
  }, 'extraction_cv_photo');
  const nettoye = reponse.replace(/```json|```/g, '').trim();
  return JSON.parse(nettoye);
}
async function genererEtEnvoyerCv(senderId, donneesBrutes, photoBuffer) {
  await sendTyping(senderId, true);
  try {
    const donneesHumanisees = await humaniserContenuCv(donneesBrutes);
    donneesHumanisees._genre = donneesBrutes._genre || null;
    const pdfBuffer = await genererPdfCv(donneesHumanisees, photoBuffer);
    const nomFichier = `CV_${(donneesHumanisees.nom || 'candidat').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const id = stockerFichierGenere(pdfBuffer, 'application/pdf', nomFichier);
    const urlFichier = `${URL_BASE_PUBLIQUE}/generated-file/${id}`;
    userModes[senderId] = { mode: 'chat' };
    await sendTyping(senderId, false);
    await sendFile(senderId, urlFichier);
    await sendMessage(senderId, '📄 Voilà ton CV en PDF, prêt à envoyer ! Tape "cv" pour en refaire un autre.', BOUTON_MENU);
  } catch(err) {
    console.error('Erreur génération CV:', err.response?.data || err.message);
    userModes[senderId] = { mode: 'chat' };
    await sendTyping(senderId, false);
    await sendMessage(senderId, "Désolé, je n'ai pas réussi à générer ton CV. Réessaie en tapant \"cv\".", BOUTON_MENU);
  }
}

// ============================================================
// MÉTHODOLOGIE ET CONTENU DE RÉFÉRENCE
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

FANOARATANA/FAMOABOASAN-KEVITRA amin'ny taranja MALAGASY (dissertation en malgache) :
- TENY FAMPIDIRANA (introduction), tsy maintsy misy 5 teboka arahin'ny filaharana :
  1. Tari-dresaka : fehezan-teny 1-2 mametraka ny foto-dresaka amin'ny ankapobeny.
  2. Fanolorana laza adina : mametraka ilay laza adina (sujet) ao anaty fehezan-teny mirindra.
  3. Foto-kevitra : fehezan-teny 1 milaza ny hevitra fonosin'ilay laza adina.
  4. Petrak'olana : fanontaniana mifandraika amin'ilay laza adina, ka ny valiny dia ilay Drafitra.
  5. Drafitra : ireo hevi-dehibe/Reni-Hevitra (RH) 2 na 3 mamaly ilay Petrak'olana.
- TENY FAMELABELARANA (développement) : isaky ny RH iray dia misy Zana-kevitra (ZK) 2-3, ka ny isaky ny ZK dia arahina Porofo-kevitra (PK — teny fandinihana, ohabolana, na ohatra) ary miafara amin'ny Tsoa-kevitra (mini-conclusion an'ilay ZK). Asio Tetezamita (fehezan-teny fampidirana + famintinana) eo anelanelan'ny RH tsirairay.
- TENY FAMARANANA (conclusion) : famintinana ny RH tsirairay nohazavaina (RH1 noho ny ZK1/ZK2/ZK3, RH2..., RH3...), arahin'ny Fanitarana (hevitry ny tena manokana/fanidiana) ary matetika fanontaniana famaranana.
- Rehefa asiana teny nalaina avy amin'ny olon-kafa (oham-pitenenana, tenin'olo-malaza) dia tokony ho eo ambanin'ny hoe "Hoy i [Anarana] : « ... »".
Ampiharo ihany koa ity fomba fanoratana ity rehefa fanoratana/famoaboasan-kevitra amin'ny taranja Malagasy no angatahina, na dia ho hafa noho ny an'ny Dissertation frantsay aza ny teny fampiasa (RH/ZK/PK).

FOMBA FAMOABOASAN-KEVITRA FILOZOFIKA (dissertation philo) :
- TENY FAMPIDIRANA, teboka efatra : (1) Tari-dresaka (fiandohana amin'ny tenina mpandinika/fahatsapan'ny besinimaro/zavatra marina ankapobeny), (2) Fanehoana ny laza adina (soratana feno arahin'ny teny mpampitohy), (3) Petrak'olana (laza adina avadika endrika fanontaniana hafa, tsy miova hevitra), (4) Drafitra (ireo Reny Hevitra/RH 2-3 mamaly ny Petrak'olana).
- NY DRAFITRA MIANKINA AMIN'NY ENDRIKY NY LAZA ADINA — 3 karazany :
  a) Laza adina fanontaniana tsotra (tsy misy teny mpampitohy) → drafitra DIALEKTIKA : RH1 = ENY (na TSIA), RH2 = TSIA (na ENY, mifanohitra amin'ny RH1), RH3 = fandravonana/fitongilanana.
  b) Laza adina miendrika tenina mpandinika/fanambarana (ohatra: teny fanambaran'olo-malaza hodinihina) → drafitra ANALITIKA : RH1 = famaritana ireo teny manandanja, RH2 = fanazavana ny hevitry ny mpandinika, RH3 = fitsikerana an'izany hevitra izany (miafara amin'ny valin'ny hoe "ahoana ny hevitrao", tsy azo ampiasaina ny hoe "araka ny hevitro").
  c) Laza adina fanontaniana ahitana lohahevitra roa mifanohitra (arahin'ny "na/sy/sa/nohon'ny/fa") → drafitra DIALECTIQUE EXPLICATIF : RH1 = famaritana ireo teny manandanja, RH2 = fanazavana ny lohahevitra voalohany, RH3 = fanazavana ny lohahevitra faharoa + valiteny farany.
  Isaky ny RH dia misy ZK 2-3 arahin'ny Porofo-kevitra (teny nalaina amin'ny filozofa/mpandinika, eo ambanin'ny "Hoy i [Anarana] : « ... »") ary Tsoa-kevitra ; asio Tetezamita eo anelanelan'ny RH.
- TENY FAMARANANA, teboka telo : (1) famintinana fohy ny RH voalaza, (2) valiteny farany/valin'ny petrak'olana, (3) fanitarana (fanontaniana vaovao mifandraika amin'ilay laza adina).
`;

const BLOCS_MALAGASY = [
  { cles: /literatiora|lahabolana|haisoratra|sôva|hain-teny|kabary|angano|tononkalo/i, texte: `LITERATIORA (ankapobeny) : Ny literatiora dia zava-kanto vita amin'ny teny (avy amin'ny "litterae" latina). Karazany roa : Lahabolana (Sôva) sy Haisoratra (Tononkalo). Literatiora am-bava : fandaharan-teny amin'ny fomba kanto ny fihetseham-po. Toetra telo mampiavaka azy : tononina/tanisaina, mampifanatrika mivantana ny mpihaino sy mpanatontosa, tsy manavaka (mahay na tsy mahay mamaky teny). Anjara asa : mampita hafatra, manabe, mampiala voly, mampifandray. Karazana telo : mirakitra tantara (Angano), mirindra ifamaliana (Hain-teny), tsy mirindra ifamaliana (Kabary). Mampiavaka faritra : Tsimihety=Sôva, Betsileo=Sokela, Antandroy=Beko, Antanosy=Sarandra, Merina=Hain-teny, Betsimisaraka=Tôkatôka. Loharanony : teny, aingam-panahy, talenta, zava-misy iainana. Singa mandrafitra : mpamorona (mpanoratra/poeta), asa soratra, mpankafy. Toetran'ny zava-kanto : manintona, manaitra, mihataka amin'ny andavanandro.` },
  { cles: /vanim-potoana|fakan-tahaka|kristiana|fiforetana|mitady ny very|fahaleovan-tena|tolom-piavotana|ankehitriny|VVS|mpanoratra zokiny|zandriny/i, texte: `TANTARAN'NY LITERATIORA (vanim-potoana) : Am-bava (tara-kevitra : fihavanana/firaisan-kina, fitiavana, fikaloana zava-boahary, fahoriana). Kristiana (misionera : THOMAS BEVAN sy DAVID JONES ; gazety voalohany : TENY SOA ANALANA ANDRO, 1861 ; tara-kevitra : fiantorahana amin'Andriamanitra, fanantenana paradisa). Fakan-tahaka (fironan-tsaina : "libre pensée", "Laika" ; zava-nisy : fanjakazakan'ny Governora Frantsay, fijoroan'ny VVS). Mpanoratra zokiny (voarohirohy VVS, teraka talohan'ny 1901 : Ny Avana RAMANANTOANINA, Jasmina RATSIMISETA, Justin RAINIZANABOLOLONA) / zandriny (taorian'ny 1901 : Jean Joseph RABEARIVELO, Samuel RATANY, HARIOLEY). Fiforetana anaty (tara-kevitra : alahelo, fahakambotiana, aloky ny fahafatesana). Mitady ny very (Ny Avana RAMANANTOANINA, Charles RAJOELISOLO, Jean Joseph RABEARIVELO ; nadiavina : teny Malagasy, haisoratra, fahafahana). Fahafahana (fanoherana fanjanahan-tany, fitiavan-tanindrazana). Ankehitriny (fitiavana, fahantrana, fahapotehan'ny tontolo iainana, tsy fahatokisana mpanao politika). Gazety literatiora : AMBIOKA, VALIHA. Fikambanana : FARIBOLANA SANDRATRA (Elie RAJAONARISON, SOLOFO José, RANOË), HAVATSA UPEM (Henri RAHAINGOSON, RAZAFIARIVONY Wilson, Iharilanto Patrick ANDRIAMANGATIANA).` },
  { cles: /rabearivelo|samuel ratany|ratsimiseta|tanicus|amance valmond|j\.?j\.?r|embona|fasana faharoa|imaitsoanala/i, texte: `MPANORATRA TSARA HO FANTATRA : Jean Joseph RABEARIVELO (né Jean Casimir), teraka 04 Martsa 1901 Isoraka Tananarive, maty 22 Jona 1937 Ambatofotsy. Solon'anarana : AMANCE Valmond. Vanim-potoana : Fiforetana anaty. Tara-kevitra : embona sy hanina, alahelo, fasana, fahafatesana, fahadisoam-panantenana, fahakambotiana. Asa malaza : tononkalo teny gasy "Fasana faharoa", "Tsy embona akory" ; tantara an-tsehatra "Imaitsoanala" (1936) ; teny vahiny "La coupe des cendres", "Presque songes". Samuel RATANY (solon'anarana Tanicus), teraka 16 Jolay 1901, maty 10 Oktobra 1926. Tononkalo malaza : "Embona" (natolony an-dRabearivelo, novaliny hoe "Tsy embona akory"). Jasmina RATSIMISETA : teraka 1890, maty 1946, tompon'ny gazety Telegrafy. Tara-kevitra iombonan'i Ratany sy Rabearivelo : alahelo, lasa, fahadisoam-panantenana, aloky ny fasana/fahafatesana.` },
  { cles: /vakivakim-piainana|tsikalakalam|andriamangatiana/i, texte: `BOKY VAKIVAKIM-PIAINANA : Nosoratan'i Iharilanto Patrick ANDRIAMANGATIANA. Lohateny isam-pizarana : Tsikalakalam-pihavanana, Tsikalakalam-pitia, Tsikalakalam-bola, Tsikalakalan'olona. Mpandray anjara fototra : Tsiry. Mpanampy : Mino, Meja, Ramily, Rakotovao, Aziz, Houssen, Voahangy. Tara-kevitra : fitiavana, fahantrana, vintana sy anjara. "Vakivakim-piainana" = potipotika, sombitsombiny, adim-pianana, tantara maneho fitetezana onjam-piainana.` },
  { cles: /olombelona sy ny fifandraisany|fihavanana|firaisankina|fifampitsimbinana/i, texte: `NY OLOMBELONA SY NY FIFANDRAISANY : Ohabolana : "ny olombelona mora soa, mora ratsy" ; "toy ny amalona an-drano ka be siasia" ; "toy ny omby indray mandry fa tsy indray mifoha". Antony mahatonga fifandraisana : tsy misy mahavita tena, fahasamihafana miteraka fifandraisana, olona maromaro afaka mampandroso ny fiaraha-monina. Endrika : Fihavanana, Firaisankina, Fifampitsimbinana. Hahatsara fihavanana : fifanajana, fifandeferana, fifanampiana, fifankatiavana.` },
  { cles: /\bmarina\b|\brariny\b|\bhitsiny\b/i, texte: `NY MARINA, NY RARINY, NY HITSINY : Marina = zavatra tena nisy tsy namboarina. Rariny = fametrahana ny tsirairay amin'ny toerana tokony hisy azy. Hitsiny = lalàna/didy/fitsipika hampirindra ny fiainana. Olo-marina = tsy mandainga, mijoro amin'ny tsangan-kevitra. Fahavalon'ny rariny : fitiavam-bola, fitiavan-tena, fitiavam-boninahitra. Vokatry ny fampiharana ny rariny : filaminana, fanajana ny zon'ny hafa, fandrosoana.` },
  { cles: /\bfanahy\b|malemy fanahy|tsara fanahy|fotsy fanahy/i, texte: `NY FANAHY : "Ny fanahy no maha olona". Ambaratonga : Fanahy tahotra, Fanahy henatra, Fanahy fahendrena. Malemy fanahy = tsotra/mora ifandraisana ; Tsara fanahy = mitsinjo ny hoavin'ny hafa ; Fotsy fanahy = fetsifetsy/mamitaka. Vokatra tsara : manentana ny fitondran-tena, mahatonga fandanjalanjana. Vokatra ratsy : fandeferana be loatra. Manamafy : "Aleo maty toy izay menatr'olona".` },
  { cles: /\btsiny\b|\btody\b/i, texte: `NY TSINY SY NY TODY : Tsiny = fanamelohan'ny mpiara-belona, fahabangana/kilema. Karazany : Tsinin'Andriamanitra, Tsinin-drazana, Tsinim-pihavanana, Tsinin-dray aman-dreny. Tody = valin'ny natao na tsara na ratsy ("ny tody tsy misy fa ny atao no miverina"). Maha samihafa : ny tsiny dia fitsarana ny fihetsika ary azo sorohina, ny tody dia ateraky ny fihetsika ihany ary tsy misy fanafany. Fomba fisorohana tsiny : fanaovana asa soa, fitandroana fihavanana.` },
  { cles: /vintana|\banjara\b|\blahatra\b|\btendry\b/i, texte: `NY VINTANA, NY ANJARA, NY LAHATRA, NY TENDRY : Vintana = hery napetrak'Andriamanitra mifanandrify amin'ny andro nahaterahana. Anjara = fisehoan-javatra (tsara/ratsy) tsy maintsy zakaina, ampahany voatokana ho an'ny tsirairay. Lahatra = fifandimbiasana/lamina avy amin'Andriamanitra ; tsy ananan'olombelona fahefana ("aza manantena hery fa ny lahatra tsy azo rombaina"). Tendry = fepetra ahatanterahana ny lahatra, fanomezana andraikitra. Vokatra tsara amin'ny finoana ireo : fahaizana mionona ; vokatra ratsy : famoizam-po, tsy fampivoatra.` },
  { cles: /razana|zanahary|andriamanitra/i, texte: `NY RAZANA, ZANAHARY, ANDRIAMANITRA : Razana = olona efa maty rehetra. Toetran'ny razana : mitahy ny velona, mamono/mampaharary raha tsy karakaraina, mandrindra ny fiaraha-monina. Adidin'ny velona : manohy ny zava-bitany, manaja ny hafatra, mikarakara (ohatra: famadihana). Tsinin-drazana = vokatry ny tsy fikarakarana azy. Andriamanitra/Zanahary : mpandahatra ny fiainana, mitsimbina, mamaly soa/ratsy araka ny nataon'ny olona.` },
  { cles: /fitsimbinana ny aina|faharetan'ny taranaka|\baina\b|\btaranaka\b/i, texte: `NY FITSIMBINANA NY AINA SY NY FAHARETAN'NY TARANAKA : Aina : tokana, mihelana, marefo. Fitsimbinana : fanohanana ny aina (sakafo, fitsaboana), fanarahan-dalana, fananam-panahy. Zava-dehibe ny fananan-janaka : harena, hamelo-maso anaran-dray, fikarakarana amin'androm-pahanterana. Fampaharetana taranaka : fitandremana amin'ny fanambadiana, fanabeazana taranaka manam-panahy.` },
];

const BLOCS_PHILO = [
  { cles: /natiora|vainga|olona.*fanahy|olona.*batana|iza moa aho/i, texte: `NY NATIORA VOAJANAHARIN'NY OLONA : Ny olona = zava-manan'aina manan-tsaina, afaka miresaka. Natiora ara-batana : ho an'ny siansa, ny olona dia vainga azo kirakiraina, hitoviany amin'ny biby. Natiora ara-panahy : ho an'ny sosiolojia, ny olona voafaritry ny fiaraha-monina misy azy ; ho an'ny filozofia, ny olona dia sady vainga no tsy vainga (manana fanahy/saina, izay mahatonga ny fahamboniany). E. KANT : fanontaniana efatra lehibe momba ny olona : Iza moa aho? / Inona no azoko fantarina? / Inona no tsy maintsy ataoko? / Inona no azoko antenaina?` },
  { cles: /filozofia|filôzôfia|filôzôfy|fahendrena|toetsaina filozofika|fandinihana filozofika/i, texte: `NY FILOZOFIA (fandinihana sy toetsaina) : Ara-piforonan-teny : "fitiavana ny fahendrena" (Pythagore), navadik'i Heidegger hoe "fahendren'ny fitiavana". Nitovy hevitra tamin'ny siansa hatramin'i Aristote ka hatramin'ny taonjato faha XVIII. Manakaiky ny metafizika (mandinika ny any ambadiky ny tsapa). Filôzôfy = manam-pahaizana, olona mandray ny fiainana amim-paharetana. Fahendrena = filozofia + siansa, fahafehezan-tena. Toetsaina filozofika, roa sosona : ara-pahalalana (mandinika, mitsara, misalasala, mitsikera, mamakafaka, mandravona) sy ara-moraly (fietre-tena, hafanam-po, herim-po, faharetana).` },
  { cles: /\bmarina\b|mari-pamatarana/i, texte: `NY MARINA (philo) : Famaritana : fifanarahan'ny zava-misy amin'izay lazaina ; rafitra tsy misy fifanoheran-kevitra. Sehatra ahitana azy : ara-pinoana (dogmatika), ara-tsiansa (fifanarahan'ny saina), ara-politika (miankina amin'ny tanjona/fahombiazana), ara-pilozofia (fanadihadiana, maïeutique, ironie). Mari-pamantarana : miharihary, endriky ny zava-misy, fahombiazana. Ny marina tsy natao ho an'ny rehetra, miankina amin'ny sehatra ampiasana azy.` },
  { cles: /\bsiansa\b|déterminisme|fanandramana|toe-tsaina siantifika|siantisma|idealisma|materialisma/i, texte: `NY SIANSA : Famaritana : fahalalana naorina amin'ny fandinihana/fanjohizohin-kevitra/fanandramana, mikendry lalàna eken'ny tranga rehetra. Karazana fahalalana (Auguste Comte) : toetra teolojika, metafizika, pozitifa ; ary fahalalana ampirika, teolojika, filozofika (idealisma = saina voalohany ; materialisma = vainga voalohany), siantifika. Déterminisme : singa tsirairay miankina amin'ny teo aloha ; fatalisma : efa voalahatra avokoa, tsy azo ovana. Dingana telo amin'ny fanandramana : fandinihana ireo zava-mitranga, famoronana tsangan-kevitra, fanamarinana amin'ny fanandramana. Toe-tsaina siantifika : mandinika, entitra, mahay mandrefy, mitsikera (ara-pahalalana) ; hatsara-po, faharetana, herim-po, tsy tia maka tombony (ara-moraly). Lanjan'ny siansa : ara-teoria (fanazavana) sy ara-pampiharana (fitaovana). Fetrany : fanazavana ampahany fotsiny, tsy afaka manao ny zavatra rehetra.` },
  { cles: /fiarahamonina|fiaraha-monina|moraly|fitsipi-pitondra-tena|fahatsiaron-tsaina/i, texte: `NY FIARAHA-MONINA SY NY MORALY : Fiaraha-monina : avy amin'ny "socius" (namana), fitambaran'ny isam-batan'olona mitovy natiora fehezin'ny lalàna iray. Moraly : tambatra fitsipika itondra-tena (tsara/ratsy). Tsara = mifanaraka amin'ny fenitra, mandrindra fiainana ; Ratsy = mifanohitra amin'ny rafitra natsangana. Niandohan'ny moraly : ny tsirairay, ny fianakaviana, ny fiaraha-monina, ny fivavahana. Fahatsiaron-tsaina = fandraisana fandinihan-tena ; Fahatsiaronan-tena ara-moraly = fitsarana avy ao anatin'ny olona.` },
  { cles: /fahafahana|fahalalahana|\bzo\b|\badidy\b|hitsiny sy.*rariny|andraikitra/i, texte: `NY FAHAFAHANA (fahalalahana) : Famaritana : tsy fisian'ny faneriterena, saingy misy koa zavatra tsy maintsy atao (zo, adidy, andraikitra, fahamarinana). Zo : mifanaraka amin'ny fitsipika/nahazoana alalana ; zo pozitifa (avy amin'ny lalàna nosoratana) vs zo natoraly (araka ny natiora). Adidy : izay tokony atao, lalàna ara-piaraha-monina manery. Fahamarinana (hitsiny sy rariny) : fitsipika ara-moraly mitaky fanajana ny zon'ny hafa. Andraikitra : fahafahana mamaly ny antso natao ; miantoka ny vokatry ny nataony.` },
  { cles: /politika|fanjakana|demokrasia|etatisma|absolutisma|totalitarisma|teknokrasia|repoblika/i, texte: `NY FIAINANA POLITIKA : Ara-piforonan-teny : "polis" (tanàna) + "tuke" (fahaizana). Fampianarana lehibe ara-politika : Etatisma (fanjakana miditra an-tsehatra amin'ny toe-karena, ohatra: SOLIMA), Absolutisma (fahefana feno amin'ny fanjakana), Anarsisma (tsy misy tompoina), Totalitarisma (fanjakana mamehy ny fiainana manontolo), Teknokrasia (fahefana ho an'ny manam-pahaizana), Demokrasia ("demos"=vahoaka + "kratos"=fahefana, fahefam-bahoaka), Repoblika ("res publica" = raharaham-bahoaka). Anjara asan'ny fanjakana : miantoka fandriam-pahalemana sy filaminam-bahoaka, mametra fietsehampo tsy mamokatra.` },
  { cles: /pythagore|descartes|pascal|montesquieu|rousseau|kant|protagoras|jaspers|holbach|comte|hobbes|sartre|aristote|durkheim/i, texte: `TENINA MPANDINIKA (citations philo, à utiliser avec « Hoy i [Nom] : « ... » ») : PROTAGORAS : "Ny olona no refin'ny zavatra rehetra". DESCARTES : "Misaina aho noho izany misy aho". PASCAL : "Ny olona dia ilay zozoro malefaka indrindra amin'ny natiora fa saingy zozoro misaina". ARISTOTE : "Ny olona dia biby manao politika". J.J. ROUSSEAU : "Nateraka ny ho tsara ny olona fa ny fiaraha-monina no manimba azy" ; "Ny fahafahana dia fanekena ny lalàna efa voasoritra mialoha". MONTESQUIEU : "Ny fahafahana dia zo hahazoana manao izay avelan'ny lalàna" ; "Marina fa amin'ny demokrasia toa manao izay tiany atao ny vahoaka". T. HOBBES : "Eo anatrehan'ny osa sy ny matanjaka dia ny fahafahana no mamoritra ary ny lalàna no manafaka". J.P. SARTRE : "Mijanona eo anoloan'ny fahafahan'ny hafa ny fahafahanao". A. COMTE : "Ny siansa dia teraka avy amin'ny fanovana ny toe-tsaina filôzôfika". D. HOLBACH : "Tsy hitako velively izany fanahiko izany, fa ny vatana no misaina sy mitsara". Karl JASPERS : "Amin'ny filôzôfia dia ny fanontaniana no manan-danja noho ny valiny". E. DURKHEIM : "Ny olona dia vokatry ny fiaraha-monina misy azy".` },
];

function contenuMalagasyPertinent(texte, limiteBlocs = 2) {
  const trouves = [...BLOCS_MALAGASY, ...BLOCS_PHILO].filter(b => b.cles.test(texte)).slice(0, limiteBlocs);
  if (trouves.length === 0) return '';
  return `\n\nContenu de référence (utilise-le si pertinent pour la question, sans le recopier intégralement) :\n${trouves.map(b => b.texte).join('\n\n')}`;
}

const CONSIGNE_FORMAT_MATH =
  `\n\nSI l'exercice contient des maths/calculs, applique ces règles de présentation :\n` +
  `- Utilise les symboles Unicode au lieu de la syntaxe brute : ² ³ ⁿ pour les puissances, √ pour racine carrée, ÷ × ± ≈ ≤ ≥ π ∞ → pour les opérateurs.\n` +
  `- Numérote chaque question/étape avec des chiffres cerclés : ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨.\n` +
  `- Encadre chaque résultat final important entre 「 et 」, ex: 「r = -3」 ou 「S = -539」.\n` +
  `- Sépare bien les grandes étapes de calcul en allant à la ligne, sans tout coller en un seul bloc.\n` +
  `- Écris les fonctions et multiplications de façon naturelle et lisible, PAS avec le symbole * : "f(x) = 3x + 2" (pas "f(x) = 3*x + 2"), "2x²" (pas "2*x^2").\n\n` +
  `SI l'exercice est de la PHYSIQUE-CHIMIE, applique en plus :\n` +
  `- Formules chimiques avec les bons indices/exposants Unicode : H₂O, CO₂, Fe³⁺, SO₄²⁻, Na⁺, Cl⁻...\n` +
  `- Équations de réaction avec flèche → et coefficients bien alignés, ex: 2H₂ + O₂ → 2H₂O.\n` +
  `- Toujours préciser les unités avec le bon symbole : m/s, m·s⁻¹, °C, K, Ω, Hz, mol/L, kg, N, J, W, V, A...\n` +
  `- Grandeurs physiques présentées clairement : symbole = valeur unité, ex: v = 12 m/s.\n` +
  `- Encadre chaque résultat final entre 「 et 」 comme pour les maths.\n\n` +
  `SI l'exercice est de la SVT (biologie/géologie), applique en plus :\n` +
  `- Structure la réponse avec des titres courts par partie (ex: "🔬 Observation", "📊 Analyse", "✅ Conclusion") plutôt qu'un seul bloc de texte.\n` +
  `- Utilise des puces (•) pour lister des caractéristiques, étapes d'un processus biologique, ou couches géologiques, plutôt que des phrases enchaînées.\n` +
  `- Pour les schémas demandés (coupe, cycle, appareil...) : NE PRODUIS PAS de dessin (une IA ne peut pas garantir un schéma scientifiquement exact) — décris à la place, de façon structurée et numérotée, les éléments à dessiner et leur légende, pour que l'élève puisse le reproduire lui-même correctement.\n` +
  `- Utilise → pour indiquer un enchaînement/une transformation (ex: glucose → énergie).`;

function consigneMethodologie() {
  if (!METHODOLOGIE_MADAGASCAR.trim()) return '';
  return `\n\nSuis IMPÉRATIVEMENT cette méthodologie de rédaction (celle enseignée à Madagascar) quand la question s'y prête (dissertation, commentaire, etc.) :\n${METHODOLOGIE_MADAGASCAR}\n\nRÈGLES SUPPLÉMENTAIRES IMPORTANTES :\n0. AVANT TOUTE CHOSE, réfléchis si ce qui est transmis constitue vraiment un sujet d'exercice complet et exploitable (une vraie question de dissertation, un texte à commenter, un exercice avec un énoncé clair, etc.). Si le texte est trop court, vague, incomplet, ambigu, ou ressemble à un simple mot/fragment sans lien clair avec un sujet scolaire précis (ex: juste un nom, une expression isolée, un mot-clé sans contexte), NE PRODUIS PAS de rédaction/corrigé complet : demande plutôt des précisions sur le sujet exact et le contexte (quelle matière, quelle consigne précise) avant de rédiger quoi que ce soit. Un vrai sujet scolaire a normalement une formulation reconnaissable (une question, une consigne du type "commentez...", "expliquez...", une citation à analyser, etc.) — l'absence de cette formulation est un signal fort qu'il faut demander des précisions plutôt que d'inventer un cadre.\n1. Détermine d'abord PRÉCISÉMENT, à partir du contenu de l'exercice, à quelle matière il appartient (Histoire-Géographie / Malagasy langue-littérature / Philosophie) et applique UNIQUEMENT la méthodologie correspondant à CETTE matière — ne mélange jamais leurs structures ou leur terminologie entre elles (par exemple, n'applique jamais les 3 types de plan de la Philosophie à un sujet de Malagasy, et inversement), même si elles utilisent parfois des termes proches (RH/ZK/PK).\n2. Indique quand même clairement les 3 grandes parties de la copie (Introduction/Fampidirana, Développement/Famelabelarana, Conclusion/Famaranana — dans la langue de la matière), par exemple avec un simple titre court pour chacune. En revanche, n'affiche PAS les étiquettes internes détaillées (pas de "Tari-dresaka :", "Petrak'olana :", "Drafitra :", "RH1 :", "ZK1 :", "Valiteny farany :", "Fanitarana :", etc.) : à l'intérieur de chaque grande partie, le texte doit être rédigé de façon fluide et continue, comme une vraie copie d'élève.\n3. Les phrases de transition (tetezamita) entre les grandes idées du développement sont OBLIGATOIRES et doivent être écrites en toutes lettres comme de vraies phrases (juste sans les faire précéder du mot "Tetezamita :").\n4. Langue de la réponse : pour l'Histoire-Géo et la Philosophie, réponds dans la langue demandée par l'utilisateur (français ou malgache, selon ce qu'il demande). Pour la matière Malagasy (langue et littérature), la réponse reste TOUJOURS entièrement en malgache, quelle que soit la langue de la demande.\n5. IMPORTANT : toutes les questions ne demandent pas une dissertation/rédaction complète. Si la question est une question-réponse courte et factuelle (typiquement : "Inona no atao hoe...?", "Inona avy ireo...?", "Milaza/Manomeza ... telo/roa fantatrao ?", "Farito ny atao hoe...", ou toute question fermée qui appelle une liste ou une définition précise plutôt qu'un développement argumenté), NE PRODUIS PAS d'introduction/développement/conclusion : réponds directement et normalement, de façon concise (quelques lignes ou une petite liste), exactement comme dans un exercice de questions-réponses classique. N'applique la méthodologie complète (Fampidirana/Famelabelarana/Famaranana) QUE pour les vrais sujets de dissertation ou de commentaire de document/texte.`;
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
  NIVEAU_5: 'Niveau 5 atteint'
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
// GESTION DES RÉSULTATS BACC (stockage, extraction, disponibilité)
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
// EXTRACTION DES RÉSULTATS BACC DEPUIS IMAGE/PDF
// ============================================================
async function extraireResultatsBacDepuisBuffer(buffer, mimeType) {
  try {
    const base64 = buffer.toString('base64');
    const imagePart = { inline_data: { mime_type: mimeType, data: base64 } };
    const prompt = `
Tu es un assistant spécialisé dans l'extraction de données depuis des images de résultats d'examen (BACC).

**INSTRUCTIONS STRICTES :**
- Analyse cette image de liste de résultats du Baccalauréat.
- Tu dois extraire UNIQUEMENT les candidats qui sont **ADMIS** (ils ont une mention : Très bien, Bien, Assez bien, Passable, ou simplement "Admis").
- Pour chaque candidat admis, extrais : son **numéro d'inscription** (matricule), son **nom complet** (nom et prénoms), et sa **mention**.
- Le tableau peut être présenté sous différentes formes, mais cherche les colonnes "N°", "Inscription", "Nom", "Prénoms", "Mention".
- Si une ligne est illisible ou douteuse, **ignore‑la**.
- Si tu ne vois aucun candidat admis, retourne un tableau vide.

**RÉPONSE UNIQUEMENT EN JSON (sans markdown, sans texte autour) :**
{
  "serie": "...",  // si visible, sinon "Inconnue"
  "centre": "...", // si visible, sinon "Inconnu"
  "candidats": [
    {
      "matricule": "1156004",
      "nom": "RAKOTOARIMANANA Haritiana Lilian",
      "prenoms": "", // si prénom séparé, sinon laisser vide
      "mention": "Assez bien",
      "admis": true
    }
  ]
}

**IMPORTANT :** Ne mets aucun autre texte que ce JSON. Assure‑toi que le JSON est valide (guillemets doubles, pas de virgules en trop).
`;
    const reponse = await appellerGeminiVision(prompt, imagePart);
    console.log('📄 Réponse brute de Gemini Vision :', reponse);
    let nettoye = reponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const match = nettoye.match(/\{[\s\S]*\}/);
    if (match) nettoye = match[0];
    let data;
    try {
      data = JSON.parse(nettoye);
    } catch (parseErr) {
      console.error('❌ Erreur de parsing JSON. Réponse :', nettoye);
      const repaired = nettoye.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
      try {
        data = JSON.parse(repaired);
      } catch (e2) {
        console.error('❌ Échec de la réparation JSON.');
        return { centre: null, serie: 'Inconnue', candidats: [] };
      }
    }
    if (!data.candidats || !Array.isArray(data.candidats)) {
      return { centre: data.centre || null, serie: data.serie || 'Inconnue', candidats: [] };
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
    console.error('❌ Erreur dans extraireResultatsBacDepuisBuffer :', err);
    return { centre: null, serie: 'Inconnue', candidats: [] };
  }
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
];
const BOUTON_MENU = [{ content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }];

async function envoyerMenu(senderId, texteIntro) {
  const profile = await getProfile(senderId);
  const xp = await getXP(senderId);
  const level = await getLevel(senderId);
  const niveauTitre = SEUILS_NIVEAUX.find(s => s.niveau === level)?.titre || '';
  const nom = profile?.nom || '';
  const texte = `${texteIntro || '👋 Salut ! Que veux-tu faire ?'}\n\n${nom ? `Bonjour ${nom} ! ` : ''}Niveau ${level} (${niveauTitre}) | XP : ${xp}\n\n1️⃣ 🎓 Résultats examens\n2️⃣ 📝 Corriger un texte\n3️⃣ 📚 Exercices\n4️⃣ 🌐 Traducteur\n5️⃣ 💬 Discuter librement\n6️⃣ 🖊️ Corriger un exercice (texte ou photo)\n7️⃣ 🔑 Activer un code\n8️⃣ 📄 Créer mon CV (premium)\n9️⃣ 🧮 Simulateur Bac (premium)`;
  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}

// ============================================================
// CHAT, CORRECTION, HISTORIQUE
// ============================================================
const chatHistories = {};
const MAX_TOURS_HISTORIQUE = 16;
function resetHistorique(sid) { delete chatHistories[sid]; }

async function chatAvecHistorique(sid, text) {
  if (!chatHistories[sid]) chatHistories[sid] = [];
  const h = chatHistories[sid];
  h.push({ role: 'user', parts: [{ text }] });
  if (h.length > MAX_TOURS_HISTORIQUE) h.splice(0, h.length - MAX_TOURS_HISTORIQUE);
  try {
    const reponse = (await appellerGemini({
      system_instruction: { parts: [{ text: 'Tu es l\'assistant de Tsarafandray Services. Ne te présente jamais comme une IA, un modèle, ou Google. Réponds clairement, sans markdown, avec des émojis.' }] },
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
// FONCTIONS D'ENVOI
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

// ============================================================
// AFFICHER PROFIL
// ============================================================
async function afficherProfil(sid) {
  const p = await getProfile(sid);
  const xp = await getXP(sid);
  const lvl = await getLevel(sid);
  const badges = await getBadges(sid);
  const msg = `📊 Mon profil\n👤 ${p?.nom || 'Anonyme'}\n🎓 Niveau scolaire : ${p?.niveau_scolaire || 'Non renseigné'}\n📚 Matières favorites : ${p?.matieres_favorites?.join(', ') || 'Aucune'}\n🎓 Niveau : ${lvl} (${SEUILS_NIVEAUX.find(s=>s.niveau===lvl)?.titre || ''})\n💪 XP : ${xp}\n🏅 Badges : ${badges.length ? badges.join(', ') : 'Aucun'}`;
  await sendMessage(sid, msg, BOUTON_MENU);
}

// ============================================================
// DÉFI QUOTIDIEN
// ============================================================
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
}

// ============================================================
// RECHERCHE BEPC/CEPE
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
// RECHERCHE BACC (API + local)
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
// FORMATAGE DES RÉSULTATS BACC (CORRECTION AJOURNÉ)
// ============================================================
function formatResultatBaccApi(r, provinceName) {
  const nom = r.nom || 'Inconnu';
  const num = r.num || 'Inconnu';
  const serie = r.serie || '-';
  const centre = r.centre || '-';
  const resultat = (r.resultat || '').toUpperCase();
  const mention = (r.mention || '').toUpperCase();

  // 🛡️ LOGIQUE ULTRA-ROBUSTE
  // 1. Si résultat contient "NON ADMIS" → NON ADMIS
  // 2. Si mention contient "AJOURNE" → NON ADMIS (rattrapage)
  // 3. Si mention contient "PASSABLE", "BIEN", "ASSEZ BIEN", "TRES BIEN" → ADMIS
  // 4. Si resultat contient "ADMIS" ET pas de mention négative → ADMIS

  const estNonAdmis = resultat.includes('NON ADMIS') || resultat.includes('AJOURNE') || mention.includes('AJOURNE');
  
  // Mentions d'admission officielles
  const mentionsAdmission = ['PASSABLE', 'ASSEZ BIEN', 'BIEN', 'TRES BIEN', 'TRÈS BIEN', 'SATISFACTION'];
  const estMentionAdmission = mentionsAdmission.some(m => mention.includes(m));
  
  // Un candidat est admis UNIQUEMENT si :
  const estAdmis = !estNonAdmis && (
    estMentionAdmission || 
    (resultat.includes('ADMIS') && !resultat.includes('NON ADMIS'))
  );

  if (estAdmis) {
    return `🎓✨ RÉSULTAT BACCALAURÉAT ✨🎓\n📍 Province : ${provinceName}\n\n🎉 Félicitations ${nom} !\n🥳 ADMIS(E).\n🪪 N° Inscription : ${num}\n📚 Série : ${serie}\n🏫 Centre : ${centre}\n🎖️ Mention : ${r.mention || 'Passable'}\n\n🍾 Alefaso ny arrosage e! 😄🥳`;
  }

  if (estNonAdmis) {
    return `🎓📋 RÉSULTAT BACCALAURÉAT\n📍 Province : ${provinceName}\n\n👤 Candidat : ${nom}\n🪪 N° Inscription : ${num}\n📚 Série : ${serie}\n🏫 Centre : ${centre}\n❌ Résultat : ${r.resultat || 'Non Admis(e)'}\n\n❌ **Désolé, vous n'êtes pas ADMIS(E).**\n\n💪 Ne vous découragez pas ! Préparez-vous mieux pour la prochaine session.`;
  }

  // Cas par défaut (si aucun cas ne correspond)
  return `🎓📋 RÉSULTAT BACCALAURÉAT\n📍 Province : ${provinceName}\n\n👤 Candidat : ${nom}\n🪪 N° Inscription : ${num}\n📚 Série : ${serie}\n🏫 Centre : ${centre}\nℹ️ Résultat : ${r.resultat || 'Non disponible'}`;
}

function formatResultatBaccCustom(c, provinceName) {
  const nom = c.nom || 'Inconnu';
  const prenoms = c.prenoms || '';
  const num = c.matricule || 'Inconnu';
  const mention = c.mention || 'Passable';

  const estAjourne = mention.toUpperCase().includes('AJOURNE');

  if (estAjourne) {
    return `🎓📋 RÉSULTAT BACCALAURÉAT\n📍 Province : ${provinceName}\n\n👤 Candidat : ${nom} ${prenoms}\n🪪 N° Inscription : ${num}\n📝 Mention : ${mention}\n\n⏳ **AJOURNÉ(E)** — rattrapage nécessaire pour l'admission.\n💪 Courage, vous pouvez y arriver !`;
  }

  return `🎓✨ RÉSULTAT BACCALAURÉAT ✨🎓\n📍 Province : ${provinceName}\n\n🎉 Félicitations ${nom} ${prenoms} !\n🥳 ADMIS(E).\n🪪 N° Inscription : ${num}\n🎖️ Mention : ${mention}\n\n🍾 Alefaso ny arrosage e! 😄🥳`;
}

// ============================================================
// SEARCH BACC (avec vérification disponibilité)
// ============================================================
async function searchBacc(query, province, tentative = 1) {
  const config = BACC_CONFIG[province];
  if (!config) return "❌ Province non reconnue.";

  // Vérifier si les résultats sont marqués disponibles
  const available = await getAvailability(province);
  if (!available) {
    return `🔔 **Résultats non encore disponibles**\n\nLes résultats pour **${config.name}** ne sont pas encore publiés ou importés.\n\nSouhaitez-vous être alerté dès qu'ils seront disponibles ?\n\nCliquez sur le bouton ci-dessous ou tapez "alerte ${province}" pour vous inscrire.`;
  }

  // 1. Vérifier les données locales
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

  // 2. API officielle
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

  // 3. Introuvable
  return `🔍❌ *Introuvable*\n\nProvince : ${config.name}\nRecherche : "${query.trim()}"\n\nAucun candidat trouvé. Vérifie l'orthographe ou le numéro.`;
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
#resultat,#uploadResult,#availResult{margin-top:12px;padding:10px;border-radius:8px;display:none}
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
</script>
</body>
</html>`);
});

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
// ROUTEUR PRINCIPAL (handleEvent)
// ============================================================
const userModes = {};
const RACCOURCIS_NUM = { 1:'MENU_RESULTATS', 2:'MENU_CORRECTION', 3:'MENU_EXERCICES', 4:'MENU_TRADUCTION', 5:'MENU_CHAT', 6:'MENU_CORRECTION_EXERCICES', 7:'MENU_CODE', 8:'MENU_CV', 9:'MENU_BAC', 11:'MENU_HIANATRA' };
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
const MOTS_CLES_IDENTITE = /\b(qui es[- ]?tu|c'?est quoi (ce|cet) bot|qui a (cr[ée][ée]?|fond[ée]) (ce|cet) bot|qui t'?a (cr[ée][ée]?|fait|programm[ée])|pr[ée]sente[- ]toi|iza (ianao|no nanao)|es[- ]?tu (une|un) (ia|robot|intelligence artificielle)|c'?est quoi tsarafandray)\b/i;
const PRESENTATION_BOT = `👋 Salut ! Je suis l'assistant de Tsarafandray Services, fondée par M. Emeraldo. Je t'aide avec les résultats d'examens, la correction de textes, les exercices, la traduction, et plus encore. Tape "menu" pour voir les options.`;

async function handleEvent(senderId, texteOuPayload, estUnBouton) {
  const etat = userModes[senderId] || { mode: 'chat' };
  if (!estUnBouton && etat.mode === 'chat' && RACCOURCIS_NUM[texteOuPayload.trim()]) {
    texteOuPayload = RACCOURCIS_NUM[texteOuPayload.trim()];
  }
  if (MOTS_CLES_IDENTITE.test(texteOuPayload)) {
    return sendMessage(senderId, PRESENTATION_BOT, BOUTON_MENU);
  }
  if (texteOuPayload === 'GET_STARTED' || MOTS_CLES_MENU.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'chat' };
    return envoyerMenu(senderId, '👋 Bienvenue ! Que veux-tu faire ?');
  }
  if (texteOuPayload === 'MON_PROFIL' || /^mon profil$|^profil$/i.test(texteOuPayload)) {
    return afficherProfil(senderId);
  }
  if (texteOuPayload === 'DEFI_JOUR' || /^défi du jour$|^defi$/i.test(texteOuPayload)) {
    return handleDefiQuotidien(senderId);
  }

  const peutChanger = etat.mode === 'chat' || estUnBouton;
  if (peutChanger) {
    // Menu principal / modes
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
  // GESTION DES MODES ACTIFS
  // ============================================================
  switch (etat.mode) {
    case 'resultats_menu': {
      const choix = texteOuPayload.toUpperCase().trim();
      if (choix === 'EXAM_CEPE' || choix === 'CEPE') { userModes[senderId] = { mode: 'resultats', typeExam: 'cepe' }; await sendMessage(senderId, '🎓 CEPE : envoyez matricule ou nom.', BOUTON_MENU); }
      else if (choix === 'EXAM_BEPC' || choix === 'BEPC') { userModes[senderId] = { mode: 'resultats', typeExam: 'bepc' }; await sendMessage(senderId, '🎓 BEPC : envoyez matricule ou nom.', BOUTON_MENU); }
      else if (choix === 'EXAM_BACC' || choix === 'BACC') { userModes[senderId] = { mode: 'choix_province_bacc' }; await sendMessage(senderId, '🎓 BACC : province ? (Antananarivo, Fianarantsoa, Toamasina, Mahajanga, Toliara, Antsiranana, Itasy, Analanjirofo)',
        [{ content_type:'text', title:'Antananarivo', payload:'BACC_PROV_antananarivo' }, { content_type:'text', title:'Fianarantsoa', payload:'BACC_PROV_fianarantsoa' }, { content_type:'text', title:'Toamasina', payload:'BACC_PROV_toamasina' }, { content_type:'text', title:'Mahajanga', payload:'BACC_PROV_mahajanga' }, { content_type:'text', title:'Toliara', payload:'BACC_PROV_toliara' }, { content_type:'text', title:'Antsiranana', payload:'BACC_PROV_antsiranana' }, { content_type:'text', title:'Itasy', payload:'BACC_PROV_itasy' }, { content_type:'text', title:'Analanjirofo', payload:'BACC_PROV_analanjirofo' }]);
      } else await sendMessage(senderId, "❌ Choix invalide. Tapez CEPE, BEPC ou BACC.");
      return;
    }
    case 'choix_province_bacc': {
      const province = texteOuPayload.startsWith('BACC_PROV_') ? texteOuPayload.replace('BACC_PROV_', '') : normaliserProvince(texteOuPayload);
      if (province) { userModes[senderId] = { mode: 'resultats_bacc', province }; await sendMessage(senderId, `🎓 BACC ${province.toUpperCase()} : envoyez n° d'inscription ou nom.`, BOUTON_MENU); }
      else await sendMessage(senderId, "❌ Province non reconnue.");
      return;
    }
    case 'resultats_bacc': {
      await sendTyping(senderId, true);
      const res = await searchBacc(texteOuPayload, etat.province);
      await sendTyping(senderId, false);
      
      // Si "non disponible", proposer l'alerte
      if (res.includes('Résultats non encore disponibles')) {
        const province = etat.province;
        await sendMessage(senderId, res, [
          { content_type: 'text', title: '🔔 M\'alerter', payload: `ACTIVER_ALERTE_${province}` },
          { content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }
        ]);
      } else {
        await sendMessage(senderId, res, BOUTON_MENU);
        await ajouterXP(senderId, 10, 'resultat_bac');
      }
      return;
    }
    case 'admin_identifiant': {
      if (MOTS_CLES_QUITTER_ADMIN.test(texteOuPayload)) { userModes[senderId] = { mode: 'chat' }; return envoyerMenu(senderId); }
      userModes[senderId] = { mode: 'admin_motdepasse', identifiant: texteOuPayload.trim() };
      await sendMessage(senderId, '🔐 Mot de passe :');
      return;
    }
    case 'admin_motdepasse': {
      const identOk = process.env.ADMIN_USERNAME && etat.identifiant === process.env.ADMIN_USERNAME;
      const passOk = process.env.ADMIN_PASSWORD && texteOuPayload.trim() === process.env.ADMIN_PASSWORD;
      if (!identOk || !passOk) { userModes[senderId] = { mode: 'chat' }; await sendMessage(senderId, '❌ Identifiant ou mot de passe incorrect.'); return; }
      userModes[senderId] = { mode: 'admin_menu' };
      await sendMessage(senderId, '✅ Admin. Commandes :\n- code : générer un code\n- résultats : importer des résultats\n- alerte : envoyer des alertes\n- activer [province] : activer les résultats\n- desactiver [province] : désactiver les résultats\n- liste : voir l\'état des provinces\n- quitter : sortir du mode admin');
      return;
    }
    case 'admin_menu': {
      if (MOTS_CLES_QUITTER_ADMIN.test(texteOuPayload)) { userModes[senderId] = { mode: 'chat' }; return envoyerMenu(senderId); }
      const cmd = texteOuPayload.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      // Commande : activer
      if (cmd.startsWith('activer ')) {
        const province = cmd.replace('activer ', '').trim();
        const provinceKey = normaliserProvince(province);
        if (provinceKey && BACC_CONFIG[provinceKey]) {
          const nb = await activerResultatsEtNotifier(provinceKey);
          await sendMessage(senderId, `✅ Résultats activés pour ${BACC_CONFIG[provinceKey].name}.\n📨 ${nb} notifications envoyées.`, BOUTON_MENU);
        } else {
          await sendMessage(senderId, `❌ Province "${province}" non reconnue.`, BOUTON_MENU);
        }
        return;
      }
      
      // Commande : desactiver
      if (cmd.startsWith('desactiver ')) {
        const province = cmd.replace('desactiver ', '').trim();
        const provinceKey = normaliserProvince(province);
        if (provinceKey && BACC_CONFIG[provinceKey]) {
          await setAvailability(provinceKey, false);
          await sendMessage(senderId, `❌ Résultats désactivés pour ${BACC_CONFIG[provinceKey].name}.`, BOUTON_MENU);
        } else {
          await sendMessage(senderId, `❌ Province "${province}" non reconnue.`, BOUTON_MENU);
        }
        return;
      }
      
      // Commande : liste
      if (cmd === 'liste' || cmd === 'list') {
        let msg = '📋 **État des provinces BACC**\n\n';
        for (const [key, config] of Object.entries(BACC_CONFIG)) {
          const avail = await getAvailability(key);
          const count = (await getStoredBaccResults(key)).length;
          msg += `- ${config.name}: ${avail ? '✅ Disponible' : '❌ Non disponible'} (${count} candidats)\n`;
        }
        await sendMessage(senderId, msg, BOUTON_MENU);
        return;
      }
      
      // Commandes existantes
      if (cmd === 'code') { userModes[senderId] = { mode: 'admin_code_credits' }; await sendMessage(senderId, '💳 Nombre de crédits ?'); return; }
      if (cmd === 'alerte') {
        await sendMessage(senderId, '🔔 Province des résultats :',
          [{ content_type:'text', title:'Antananarivo', payload:'ADMIN_ALERTE_antananarivo' }, { content_type:'text', title:'Fianarantsoa', payload:'ADMIN_ALERTE_fianarantsoa' }, { content_type:'text', title:'Toamasina', payload:'ADMIN_ALERTE_toamasina' }, { content_type:'text', title:'Mahajanga', payload:'ADMIN_ALERTE_mahajanga' }, { content_type:'text', title:'Toliara', payload:'ADMIN_ALERTE_toliara' }, { content_type:'text', title:'Antsiranana', payload:'ADMIN_ALERTE_antsiranana' }]);
        return;
      }
      if (cmd === 'résultats' || cmd === 'resultats') {
        userModes[senderId] = { mode: 'admin_choix_province_resultats' };
        await sendMessage(senderId, '📁 Ajout de résultats BACC\n\nChoisis la région :', [
          { content_type:'text', title:'Antananarivo', payload:'ADMIN_RES_antananarivo' },
          { content_type:'text', title:'Fianarantsoa', payload:'ADMIN_RES_fianarantsoa' },
          { content_type:'text', title:'Toamasina', payload:'ADMIN_RES_toamasina' },
          { content_type:'text', title:'Mahajanga', payload:'ADMIN_RES_mahajanga' },
          { content_type:'text', title:'Toliara', payload:'ADMIN_RES_toliara' },
          { content_type:'text', title:'Antsiranana', payload:'ADMIN_RES_antsiranana' },
          { content_type:'text', title:'Itasy', payload:'ADMIN_RES_itasy' },
          { content_type:'text', title:'Analanjirofo', payload:'ADMIN_RES_analanjirofo' }
        ]);
        return;
      }
      if (texteOuPayload.startsWith('ADMIN_ALERTE_')) {
        const province = texteOuPayload.replace('ADMIN_ALERTE_', '');
        userModes[senderId] = { mode: 'admin_confirmation_alerte', provinceAlerte: province };
        await sendMessage(senderId, `⚠️ Envoyer les alertes pour **${province}** ? (OUI pour confirmer)`);
        return;
      }
      await sendMessage(senderId, 'Commande non reconnue. Tape "code", "résultats", "alerte", "activer [province]", "desactiver [province]", "liste" ou "quitter".');
      return;
    }
    case 'admin_choix_province_resultats': {
      const province = texteOuPayload.startsWith('ADMIN_RES_') ? texteOuPayload.replace('ADMIN_RES_', '') : normaliserProvince(texteOuPayload);
      if (province && BACC_CONFIG[province]) {
        userModes[senderId] = { mode: 'admin_attente_image_resultats', provinceRes: province };
        await sendMessage(senderId, `📂 Mode Ajout Résultats BACC actif : **${BACC_CONFIG[province].name}**\n\nEnvoie maintenant la ou les photos (ou PDF) des résultats ! Le bot va analyser automatiquement la série, le centre, extraire les matricules et éliminer les doublons.\n\n(Tape "menu" ou "quitter" pour sortir).`, BOUTON_MENU);
      } else {
        await sendMessage(senderId, '❌ Région non reconnue. Choisis parmi les boutons.');
      }
      return;
    }
    case 'admin_attente_image_resultats': {
      if (MOTS_CLES_QUITTER_ADMIN.test(texteOuPayload)) {
        userModes[senderId] = { mode: 'admin_menu' };
        await sendMessage(senderId, '✅ Retour menu admin.');
        return;
      }
      await sendMessage(senderId, "📷 Envoie une image ou un document de résultats en pièce jointe.");
      return;
    }
    case 'admin_confirmation_alerte': {
      if (/^oui$/i.test(texteOuPayload.trim())) {
        await sendMessage(senderId, '🚀 Envoi...');
        const nb = await declencherAlertes(etat.provinceAlerte);
        userModes[senderId] = { mode: 'admin_menu' };
        await sendMessage(senderId, `✅ ${nb} alertes envoyées.`);
      } else {
        userModes[senderId] = { mode: 'admin_menu' };
        await sendMessage(senderId, '❌ Annulé.');
      }
      return;
    }
    case 'admin_code_credits': {
      const nb = parseInt(texteOuPayload.trim(),10);
      if (!nb || nb <= 0) { await sendMessage(senderId, 'Nombre invalide.'); return; }
      userModes[senderId] = { mode: 'admin_code_perso', creditsDemandes: nb };
      await sendMessage(senderId, 'Code personnalisé (ou "auto") ?');
      return;
    }
    case 'admin_code_perso': {
      const saisie = texteOuPayload.trim();
      const code = /^auto$/i.test(saisie) ? genererCodeAleatoire() : saisie.toUpperCase();
      if (await codeDejaUtilise(code)) { userModes[senderId] = { mode: 'admin_menu' }; await sendMessage(senderId, `⚠️ Code ${code} déjà utilisé.`); return; }
      await redisSet(`code_credits:${code}`, etat.creditsDemandes);
      userModes[senderId] = { mode: 'admin_menu' };
      await sendMessage(senderId, `✅ Code généré : ${code} (${etat.creditsDemandes} crédits)`);
      return;
    }
    case 'simulation_bac_serie': {
      const serie = normaliserSerie(texteOuPayload);
      if (!serie) { await sendMessage(senderId, `Série invalide. Choisir : ${Object.keys(COEFFICIENTS_BAC).join(', ')}`); return; }
      const matieres = Object.keys(COEFFICIENTS_BAC[serie]);
      userModes[senderId] = { mode: 'simulation_bac_notes', serie, matieres, index:0, notes:{} };
      await sendMessage(senderId, `Note en ${matieres[0]} (/20) ?`);
      return;
    }
    case 'simulation_bac_notes': {
      const note = parseFloat(texteOuPayload.replace(',', '.'));
      const matiereActuelle = etat.matieres[etat.index];
      if (isNaN(note) || note<0 || note>20) { await sendMessage(senderId, `Note invalide (0-20) pour ${matiereActuelle}`); return; }
      etat.notes[matiereActuelle] = note;
      const next = etat.index + 1;
      if (next < etat.matieres.length) {
        userModes[senderId] = { mode: 'simulation_bac_notes', serie: etat.serie, matieres: etat.matieres, index: next, notes: etat.notes };
        await sendMessage(senderId, `Note en ${etat.matieres[next]} (/20) ?`);
        return;
      }
      const resultat = calculerResultatBac(etat.serie, etat.notes);
      const txt = formaterResultatBac(etat.serie, resultat);
      userModes[senderId] = { mode: 'chat' };
      await sendMessage(senderId, txt, BOUTON_MENU);
      await ajouterXP(senderId, 15, 'simulation_bac');
      return;
    }
    case 'creation_cv': {
      const etape = ETAPES_CV[etat.etapeIndex];
      if (etape.cle === 'qualites' && /^auto$/i.test(texteOuPayload.trim())) {
        userModes[senderId] = { mode: 'creation_cv_genre', etapeIndex: etat.etapeIndex, donnees: etat.donnees };
        await sendMessage(senderId, 'Homme ou femme ? (ou "passe")');
        return;
      }
      etat.donnees[etape.cle] = texteOuPayload;
      const nextIdx = etat.etapeIndex + 1;
      if (nextIdx < ETAPES_CV.length) {
        userModes[senderId] = { mode: 'creation_cv', etapeIndex: nextIdx, donnees: etat.donnees };
        await sendMessage(senderId, ETAPES_CV[nextIdx].question, BOUTON_MENU);
        return;
      }
      userModes[senderId] = { mode: 'creation_cv_loisirs_photo', donnees: etat.donnees };
      await sendMessage(senderId, 'Loisirs/centres d\'intérêt ? (ou "passe")');
      return;
    }
    case 'creation_cv_genre': {
      const genre = texteOuPayload.trim();
      const qualites = /^passe$/i.test(genre) ? QUALITES_AUTO_NEUTRE : qualitesAutoSelonGenre(genre);
      etat.donnees.qualites = qualites;
      if (/^(h|homme|masculin|m)$/i.test(genre)) etat.donnees._genre = 'H';
      else if (/^(f|femme|f[ée]minin)$/i.test(genre)) etat.donnees._genre = 'F';
      const nextIdx = etat.etapeIndex + 1;
      userModes[senderId] = { mode: 'creation_cv', etapeIndex: nextIdx, donnees: etat.donnees };
      await sendMessage(senderId, ETAPES_CV[nextIdx].question, BOUTON_MENU);
      return;
    }
    case 'creation_cv_loisirs_photo': {
      if (!etat.donnees.loisirs && etat.etapePhoto !== true) {
        etat.donnees.loisirs = /^passe$/i.test(texteOuPayload.trim()) ? '' : texteOuPayload;
        userModes[senderId] = { mode: 'creation_cv_loisirs_photo', donnees: etat.donnees, etapePhoto: true };
        await sendMessage(senderId, '📷 Envoyez une photo (ou "passe")');
        return;
      }
      if (/^passe$/i.test(texteOuPayload.trim())) {
        await genererEtEnvoyerCv(senderId, etat.donnees, null);
        await ajouterXP(senderId, 20, 'cv_creation');
        return;
      }
      await sendMessage(senderId, 'Envoie une photo ou "passe"');
      return;
    }
    case 'attente_code': {
      const code = texteOuPayload.trim().toUpperCase();
      userModes[senderId] = { mode: 'chat' };
      const credits = await obtenirCreditsDuCode(code);
      if (!credits) { await sendMessage(senderId, '❌ Code invalide.', BOUTON_MENU); return; }
      if (await codeDejaUtilise(code)) { await sendMessage(senderId, '⚠️ Code déjà utilisé.', BOUTON_MENU); return; }
      await marquerCodeUtilise(code);
      const actuel = await obtenirCredits(senderId);
      await definirCredits(senderId, actuel + credits);
      await sendMessage(senderId, `✅ +${credits} crédits. Total : ${actuel + credits}`, BOUTON_MENU);
      return;
    }
    case 'humain': return;
    case 'resultats': {
      await sendTyping(senderId, true);
      const res = await searchBepc(texteOuPayload, etat.typeExam);
      await sendTyping(senderId, false);
      await sendMessage(senderId, res, BOUTON_MENU);
      await ajouterXP(senderId, 2, 'resultat');
      return;
    }
    case 'correction': {
      await sendTyping(senderId, true);
      const corrige = await correctText(texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, `✅ Texte corrigé :\n\n${corrige}`, BOUTON_MENU);
      const res = await ajouterXP(senderId, 5, 'correction');
      if (res.montee) await sendMessage(senderId, `🎉 Niveau ${res.nouveauNiveau} atteint !`, BOUTON_MENU);
      return;
    }
    case 'traduction': {
      if (!etat.langue) { userModes[senderId] = { mode: 'traduction', langue: texteOuPayload }; await sendMessage(senderId, `Ok, envoie le texte à traduire en ${texteOuPayload}.`, BOUTON_MENU); return; }
      await sendTyping(senderId, true);
      const trad = await chatWithGemini(`Traduis en ${etat.langue} : "${texteOuPayload}"`, 'traduction');
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🌐 ${trad}`, BOUTON_MENU);
      await ajouterXP(senderId, 3, 'traduction');
      return;
    }
    case 'correction_exercices': {
      const acces = await verifierEtConsommerCredit(senderId);
      if (!acces.autorise) { await sendMessage(senderId, `🔒 Utilisation gratuite épuisée et pas de crédits.`, BOUTON_MENU); return; }
      await sendTyping(senderId, true);
      const profile = await getProfile(senderId);
      const niveau = profile?.niveau_scolaire || 'collège';
      const matieresFav = profile?.matieres_favorites || ['général'];
      const infos = `Niveau : ${niveau}, matières favorites : ${matieresFav.join(', ')}.`;
      const demandePO = /\bp\.?\s*o\.?\b/i.test(texteOuPayload);
      let correction;
      if (demandePO) {
        const sujet = texteOuPayload.replace(/\bp\.?\s*o\.?\b/i, '').trim();
        correction = await chatWithGemini(`Sujet scolaire : "${sujet}". Rédige UNIQUEMENT la problématique (petrak'olana) sous forme d'une question. ${consigneMethodologie()}`, 'correction_exercice_po');
        await sendTyping(senderId, false);
        await sendMessage(senderId, `❓ ${correction}`, BOUTON_MENU);
        await ajouterXP(senderId, 3, 'correction');
        return;
      }
      correction = await chatWithGemini(`Exercice scolaire : "${texteOuPayload}". Fais le corrigé complet, structuré, adapté à l'élève (${infos}). ${consigneMethodologie()} ${CONSIGNE_FORMAT_MATH}`, 'correction_exercice_texte');
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🖊️ ${correction}`, BOUTON_MENU);
      const res = await ajouterXP(senderId, 5, 'correction');
      if (res.montee) await sendMessage(senderId, `🎉 Niveau ${res.nouveauNiveau} atteint !`, BOUTON_MENU);
      if (MOTS_CLES_GRAPHIQUE.test(texteOuPayload)) {
        const donnees = await extraireFonctionGraphique(texteOuPayload);
        if (donnees) {
          const url = await genererGraphiqueMath(donnees.formule, donnees.xMin, donnees.xMax);
          if (url) await sendImage(senderId, url);
        }
      }
      return;
    }
    case 'exercices': {
      await sendTyping(senderId, true);
      const profile = await getProfile(senderId);
      const niveau = profile?.niveau_scolaire || 'collège';
      const matieresFav = profile?.matieres_favorites || ['général'];
      const infos = `Niveau : ${niveau}, matières favorites : ${matieresFav.join(', ')}.`;
      const exercice = await chatWithGemini(`Crée un exercice (avec correction) sur "${texteOuPayload}", adapté à ${infos}. ${consigneMethodologie()} ${CONSIGNE_FORMAT_MATH}`, 'generation_exercice');
      await sendTyping(senderId, false);
      await sendMessage(senderId, `📚 ${exercice}`, BOUTON_MENU);
      await ajouterXP(senderId, 3, 'generation_exercice');
      return;
    }
    case 'defi_quotidien': {
      const reponseUser = texteOuPayload.trim();
      await sendTyping(senderId, true);
      const verif = await chatWithGemini(`Exercice : ${etat.enonce}\nRéponse : "${reponseUser}". Est-ce correct ou partiel ? Réponds "oui", "partiellement" ou "non".`, 'defi_verification');
      await sendTyping(senderId, false);
      const verdict = verif.trim().toLowerCase();
      if (verdict.startsWith('oui') || verdict.startsWith('partiellement')) {
        const res = await ajouterXP(senderId, 15, 'defi');
        const daily = await getDaily(senderId);
        if (daily) { daily.fait = true; await setDaily(senderId, daily); }
        let msg = "✅ Bravo ! +15 XP.";
        if (res.montee) msg += ` Niveau ${res.nouveauNiveau} !`;
        await sendMessage(senderId, msg, BOUTON_MENU);
      } else {
        await sendMessage(senderId, `❌ Pas tout à fait. Correction :\n${extraireCorrection(etat.enonce)}`, BOUTON_MENU);
        await ajouterXP(senderId, 2, 'defi_echec');
      }
      userModes[senderId] = { mode: 'chat' };
      break;
    }
    case 'hianatra_menu': {
      const choix = texteOuPayload.toUpperCase().trim();
      let discipline='', instruction='';
      if (choix === 'HIANATRA_INFO' || choix === '1' || choix === 'INFORMATIQUE' || choix === 'INFO') { discipline='Informatique'; instruction='Tu es un expert en informatique. Aide à apprendre avec pédagogie.'; }
      else if (choix === 'HIANATRA_LANGUES' || choix === '2' || choix === 'LANGUES' || choix === 'LANGUE') { discipline='Langues'; instruction='Tu es un tuteur de langues (français, anglais, malgache). Propose des exercices et corrige.'; }
      else if (choix === 'HIANATRA_LECONS' || choix === '3' || choix === 'LEÇONS' || choix === 'LECONS') { discipline='Leçons'; instruction='Tu es un professeur polyvalent. Explique les cours simplement.'; }
      else { await sendMessage(senderId, "❌ Choix invalide. Tapez 1, 2 ou 3."); return; }
      userModes[senderId] = { mode: 'hianatra_session', discipline, instruction, historique: [] };
      await sendMessage(senderId, `🚀 Mode ${discipline}. Pose ta question !`, BOUTON_MENU);
      return;
    }
    case 'hianatra_session': {
      await sendTyping(senderId, true);
      try {
        let hist = etat.historique || [];
        hist.push({ role: 'user', parts: [{ text: texteOuPayload }] });
        if (hist.length > 10) hist = hist.slice(-10);
        const promptSystem = `${etat.instruction} Réponds de façon structurée, sans markdown, en utilisant français et malgache si utile.`;
        const reponse = await appellerGemini({ contents: hist, system_instruction: { parts: [{ text: promptSystem }] } }, 'hianatra_tutorat');
        hist.push({ role: 'model', parts: [{ text: reponse }] });
        userModes[senderId].historique = hist;
        await sendTyping(senderId, false);
        if (etat.discipline === 'Langues') {
          const payload = `HIANATRA_AUDIO_${Buffer.from(reponse.slice(0,150)).toString('base64')}`;
          await sendMessage(senderId, `🎓 ${reponse}`, [{ content_type:'text', title:'🔊 Écouter', payload }]);
        } else {
          await sendMessage(senderId, `🎓 ${reponse}`, BOUTON_MENU);
        }
        await ajouterXP(senderId, 5, 'hianatra');
      } catch(e) { console.error('Hianatra error:', e.message); await sendTyping(senderId, false); await sendMessage(senderId, "❌ Erreur. Réessaie."); }
      return;
    }
    default: {
      await sendTyping(senderId, true);
      const rep = await chatAvecHistorique(senderId, texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, rep, BOUTON_MENU);
      return;
    }
  }
}

// ============================================================
// GESTION DES IMAGES REÇUES (handleImageEvent)
// ============================================================
async function handleImageEvent(senderId, imageUrl) {
  const etat = userModes[senderId] || { mode: 'chat' };

  // --- Mode admin : import de résultats BACC ---
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
      
      // Aperçu avant enregistrement
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

  // --- Mode confirmation d'import ---
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

  // --- Mode correction d'exercice ---
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

  // --- Mode CV (photo pour CV) ---
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
// TRACÉ DE COURBES (QuickChart)
// ============================================================
const MOTS_CLES_GRAPHIQUE = /\b(courbe|graphique|trac(e|é)|repr[ée]sente(r)?\s+graphiquement|diagramme)\b/i;
async function extraireFonctionGraphique(texte) {
  try {
    const reponse = await chatWithGemini(
      `Voici un énoncé de maths : "${texte}". S'il demande de tracer une fonction, réponds UNIQUEMENT avec JSON : {"formule": "x^2 - 3*x + 2", "xMin": -5, "xMax": 5}. Sinon {"formule": null}.`,
      'extraction_graphique'
    );
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    const data = JSON.parse(nettoye);
    if (!data.formule) return null;
    return { formule: data.formule, xMin: data.xMin ?? -10, xMax: data.xMax ?? 10 };
  } catch(e){ return null; }
}
function normaliserFormule(formule) {
  return formule.replace(/(\d)(x)/gi, '$1*$2').replace(/(\d|x)\(/gi, '$1*(').replace(/\)(x|\()/gi, ')*$1');
}
function formuleAffichage(formule) {
  return formule.replace(/(\d)\*([a-zA-Z(])/g, '$1$2').replace(/\*/g, '');
}
async function genererGraphiqueMath(formule, xMin, xMax) {
  try {
    const f = normaliserFormule(formule);
    const noeud = math.compile(f);
    const nbPoints = 100, pas = (xMax - xMin) / nbPoints;
    const labels=[], valeurs=[];
    for (let i=0; i<=nbPoints; i++) {
      const x = xMin + i * pas;
      let y;
      try { y = noeud.evaluate({ x }); if (typeof y !== 'number' || !isFinite(y)) y = null; } catch(e){ y=null; }
      labels.push(Number(x.toFixed(2)));
      valeurs.push(y);
    }
    const nbValides = valeurs.filter(v => v !== null).length;
    if (nbValides < nbPoints * 0.2) return null;
    const chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `f(x) = ${formuleAffichage(formule)}`,
          data: valeurs,
          borderColor: 'rgb(37, 99, 235)',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
          spanGaps: false,
        }]
      },
      options: {
        title: { display: true, text: `f(x) = ${formuleAffichage(formule)}` },
        scales: { xAxes: [{ scaleLabel: { display: true, labelString: 'x' } }], yAxes: [{ scaleLabel: { display: true, labelString: 'f(x)' } }] }
      }
    };
    const response = await axios.post('https://quickchart.io/chart/create', { chart: chartConfig, version: '2', width: 600, height: 400, backgroundColor: 'white' });
    if (response.data && response.data.success) return response.data.url;
    return null;
  } catch(e){ return null; }
}

// ============================================================
// DÉMARRAGE
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Serveur démarré sur le port ${PORT}`));