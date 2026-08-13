// ============================================================
// memoire.js - Module de rédaction de mémoire et gestion des références
// ============================================================

const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageNumber, Header, Footer, convertInchesToTwip } = require('docx');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const fs = require('fs');

// ============================================================
// CONSTANTES ET CONFIGURATION
// ============================================================
const COUTS_MEMOIRE = {
  LICENCE: 20,
  MASTER: 40,
  CAPEN: 30,
  MAPEN: 30
};

const NB_MOTS_PAR_PAGE = 450;
const PAGES_PAR_NIVEAU = {
  LICENCE: 35,
  MASTER: 65,
  CAPEN: 40,
  MAPEN: 40
};

// ============================================================
// FONCTIONS D'EXTRACTION ET DÉCOUPAGE
// ============================================================

async function extraireTexteDocument(buffer, mimeType, originalName, appellerGeminiVision) {
  let texte = '';
  try {
    if (mimeType === 'application/pdf' || originalName?.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      texte = data.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || originalName?.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      texte = result.value;
    } else if (mimeType.startsWith('image/')) {
      const base64 = buffer.toString('base64');
      const imagePart = { inline_data: { mime_type: mimeType, data: base64 } };
      texte = await appellerGeminiVision('Extrais tout le texte de cette image de document académique. Sois exhaustif.', imagePart);
    } else {
      texte = buffer.toString('utf8');
    }
  } catch (e) {
    console.error('Erreur extraction texte:', e.message);
    return null;
  }
  return texte;
}

async function decouperEnSegments(texte, chatWithGemini) {
  if (!texte || texte.length < 50) return [{ titre: 'Document', texte }];
  try {
    const prompt = `
Analyse ce document académique et découpe‑le en segments thématiques (introduction, chapitres, sous-parties, conclusion, bibliographie).
Retourne UNIQUEMENT un JSON valide de cette forme :
[
  { "titre": "Introduction", "texte": "..." },
  { "titre": "Chapitre 1 - Titre", "texte": "..." },
  ...
]
Texte : ${texte.slice(0, 25000)}
`;
    const reponse = await chatWithGemini(prompt, 'decoupage_segments');
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    const data = JSON.parse(nettoye);
    return Array.isArray(data) ? data : [{ titre: 'Document', texte }];
  } catch (e) {
    console.error('Erreur découpage segments:', e.message);
    return [{ titre: 'Document', texte }];
  }
}

// ============================================================
// GESTION DES RÉFÉRENCES (Redis)
// ============================================================

async function stockerReference(redisGet, redisSet, nom, type, source, segments) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const docData = {
    id,
    nom: nom || 'Document sans nom',
    type: type || 'general',
    source: source || 'admin',
    date: new Date().toISOString(),
    segments
  };
  await redisSet(`reference:doc:${id}`, JSON.stringify(docData));
  
  // Mettre à jour la liste des références
  const allKey = 'reference:all';
  let all = await redisGet(allKey) || '[]';
  let list = JSON.parse(all);
  if (!list.includes(id)) list.push(id);
  await redisSet(allKey, JSON.stringify(list));
  
  // Indexation par mots-clés (segments)
  for (const seg of segments) {
    const mots = (seg.titre + ' ' + seg.texte).toLowerCase().split(/\s+/);
    const motsFiltres = mots.filter(m => m.length > 3);
    for (const mot of motsFiltres) {
      const key = `reference:index:${mot}`;
      let ids = await redisGet(key) || '[]';
      let idxList = JSON.parse(ids);
      if (!idxList.includes(id)) idxList.push(id);
      await redisSet(key, JSON.stringify(idxList));
    }
  }
  return id;
}

async function getReferencesPertinentes(redisGet, theme, niveau, nombreMax = 3) {
  const mots = theme.toLowerCase().split(/\s+/).filter(m => m.length > 3);
  const scores = {};
  for (const mot of mots) {
    const ids = await redisGet(`reference:index:${mot}`);
    if (ids) {
      const list = JSON.parse(ids);
      for (const id of list) {
        scores[id] = (scores[id] || 0) + 1;
      }
    }
  }
  const idsTries = Object.keys(scores).sort((a,b) => scores[b] - scores[a]);
  const references = [];
  for (const id of idsTries.slice(0, nombreMax)) {
    const doc = await redisGet(`reference:doc:${id}`);
    if (doc) {
      try { references.push(JSON.parse(doc)); } catch(e) {}
    }
  }
  return references;
}

// ============================================================
// PROMPTS POUR LA RÉDACTION
// ============================================================

async function genererPlanMemoire(chatWithGemini, theme, niveau, references) {
  let refsTexte = '';
  if (references && references.length > 0) {
    refsTexte = references.map((r, i) => 
      `--- Référence ${i+1} : ${r.nom} ---\n${r.segments.map(s => `- ${s.titre}: ${s.texte.slice(0, 200)}...`).join('\n')}`
    ).join('\n\n');
  }
  
  const prompt = `
Tu es un expert en rédaction académique pour le système universitaire malgache. 
À partir du thème fourni : "${theme}", 
construis un plan de mémoire complet et détaillé pour un niveau **${niveau}** 
(Licence : 30-45 pages, Master : 60-75 pages, CAPEN/MAPEN : pédagogie appliquée).

**Exigences structurelles :**
- Introduction (contexte, problématique, hypothèses, annonce du plan)
- Développement (3 à 5 chapitres selon le niveau)
- Conclusion (synthèse, limites, perspectives)
- Bibliographie (minimum ${niveau === 'MASTER' ? 30 : 15} références)

${refsTexte ? `**📚 Documents de référence (inspiration uniquement, pas de copie) :**\n${refsTexte}\n\n` : ''}

**Format de réponse :**
Retourne UNIQUEMENT un objet JSON valide de cette forme :
{
  "titre": "Titre provisoire du mémoire",
  "plan": [
    { "titre": "Introduction", "sousParties": ["Sous-partie 1", "Sous-partie 2", "Sous-partie 3"] },
    { "titre": "Chapitre 1 : ...", "sousParties": [...] },
    ...
    { "titre": "Conclusion", "sousParties": ["Synthèse", "Limites", "Perspectives"] }
  ],
  "bibliographie": ["Référence 1", "Référence 2", ...]
}
Ne mets aucun autre texte que ce JSON.
`;
  const reponse = await chatWithGemini(prompt, 'plan_memoire');
  const nettoye = reponse.replace(/```json|```/g, '').trim();
  return JSON.parse(nettoye);
}

async function redigerChapitre(chatWithGemini, titre, sousParties, resumePrecedent, niveau, motsRequis, references) {
  let refsTexte = '';
  if (references && references.length > 0) {
    refsTexte = references.map((r, i) => 
      `--- Référence ${i+1} : ${r.nom} ---\n${r.segments.map(s => `- ${s.titre}: ${s.texte.slice(0, 300)}...`).join('\n')}`
    ).join('\n\n');
  }
  
  const prompt = `
Tu es un rédacteur académique expert. Rédige le chapitre suivant d’un mémoire de ${niveau} :

**Titre du chapitre :** ${titre}
**Sous-parties à développer :** ${sousParties.join(', ')}
**Contexte (résumé des chapitres précédents) :** ${resumePrecedent || 'Aucun chapitre précédent'}
**Longueur cible :** Environ ${motsRequis} mots.

${refsTexte ? `**📚 Documents de référence (inspiration pour la structure et le style, pas de copie) :**\n${refsTexte}\n\n` : ''}

**Consignes de style et de fond :**
- Rédige un texte académique clair, précis, bien argumenté.
- Utilise un vocabulaire soutenu mais accessible.
- Structure le chapitre en suivant les sous-parties indiquées, avec des transitions fluides.
- Intègre des citations pertinentes sous la forme : (Auteur, année, page).
- Évite les répétitions, les phrases trop longues, les anglicismes.
- Sois cohérent avec le contexte des chapitres précédents.
- Termine le chapitre par une courte transition vers la suite.

**Réponds uniquement avec le texte du chapitre, sans le titre.**
`;
  const reponse = await chatWithGemini(prompt, 'redaction_chapitre');
  return reponse.trim();
}

async function relireChapitre(chatWithGemini, texte) {
  const prompt = `
Relis ce texte académique et corrige :
1. Les fautes d'orthographe et de grammaire.
2. Les répétitions de mots ou d'idées.
3. Les phrases trop longues ou mal construites.
4. Les incohérences logiques.
5. Le style (rendu plus fluide et académique).

**Important** : Ne modifie pas le fond, seulement la forme.

Texte : ${texte}
`;
  const reponse = await chatWithGemini(prompt, 'relecture_chapitre');
  return reponse.trim();
}

async function genererResumeChapitre(chatWithGemini, texte) {
  const prompt = `Fais un résumé (6-8 phrases) de ce chapitre pour le passer en contexte au chapitre suivant :\n\n${texte.slice(0, 5000)}`;
  return await chatWithGemini(prompt, 'resume_chapitre');
}

function detecterRepetitions(texte) {
  const mots = texte.toLowerCase().split(/\s+/).filter(m => m.length > 3);
  const freq = {};
  const repetitions = [];
  for (const mot of mots) {
    freq[mot] = (freq[mot] || 0) + 1;
    if (freq[mot] > 5 && !repetitions.includes(mot)) {
      repetitions.push(mot);
    }
  }
  return repetitions;
}

async function corrigerRepetitions(chatWithGemini, texte, repetitions) {
  const prompt = `Dans ce texte, les mots suivants sont trop répétés : ${repetitions.join(', ')}. Réécris le texte en évitant ces répétitions.\n\n${texte}`;
  return await chatWithGemini(prompt, 'correction_repetitions');
}

// ============================================================
// GÉNÉRATION DOCX
// ============================================================

async function genererMemoireDocx(donnees) {
  const { titre, auteur, niveau, annee, encadreur, universite, chapitres, bibliographie } = donnees;
  
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: titre || 'Mémoire', size: 18, font: "Times New Roman" }),
                new TextRun({ text: ` | Page ${PageNumber.CURRENT}`, size: 18, font: "Times New Roman" })
              ],
              alignment: AlignmentType.RIGHT
            })
          ]
        })
      },
      children: [
        // Page de garde
        new Paragraph({ text: universite || "Université de Madagascar", size: 28, bold: true, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 200 } }),
        new Paragraph({ text: "---", alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 400 } }),
        new Paragraph({ text: titre || "Titre du mémoire", size: 36, bold: true, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 300 } }),
        new Paragraph({ text: "Mémoire présenté en vue de l'obtention du", size: 24, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: niveau || "Licence", size: 24, bold: true, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 300 } }),
        new Paragraph({ text: `Par : ${auteur || 'Auteur'}`, size: 24, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: `Encadreur : ${encadreur || 'Non précisé'}`, size: 24, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 300 } }),
        new Paragraph({ text: `Année universitaire : ${annee || new Date().getFullYear()}`, size: 22, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 400 } }),
        new Paragraph({ text: "---", alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 400 } }),

        // Table des matières
        new Paragraph({ children: [new TextRun({ text: "TABLE DES MATIÈRES", size: 28, bold: true, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 200 } }),
        ...chapitres.map((chap, i) => 
          new Paragraph({ 
            children: [
              new TextRun({ text: `Chapitre ${i+1} – ${chap.titre || `Chapitre ${i+1}`}`, size: 22, font: "Times New Roman" }),
              new TextRun({ text: "......................... " + (i+1), size: 22, font: "Times New Roman" }) 
            ]
          })
        ),
        new Paragraph({ text: "", spacing: { before: 400 } }),

        // Chapitres
        ...chapitres.map(chap => [
          new Paragraph({ text: "", spacing: { before: 300 } }),
          new Paragraph({ children: [new TextRun({ text: chap.titre || "Chapitre", size: 28, bold: true, font: "Times New Roman" })], alignment: AlignmentType.LEFT }),
          new Paragraph({ text: chap.texte || "Contenu du chapitre...", spacing: { before: 200 }, alignment: AlignmentType.JUSTIFIED }),
        ]).flat(),

        // Bibliographie
        new Paragraph({ text: "", spacing: { before: 400 } }),
        new Paragraph({ children: [new TextRun({ text: "BIBLIOGRAPHIE", size: 28, bold: true, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "", spacing: { before: 200 } }),
        ...(bibliographie || []).map(ref => 
          new Paragraph({ text: `• ${ref}`, bullet: { level: 0 } })
        ),
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

// ============================================================
// FONCTION PRINCIPALE DE RÉDACTION
// ============================================================

async function demarrerRedactionMemoire(
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
) {
  const etat = userModes[senderId];
  if (!etat || etat.mode !== 'memoire_redaction') return;
  
  const { niveau, plan, references, chapitres, resumes, indexChapitre } = etat;
  const totalChapitres = plan.plan.length;
  const totalPages = PAGES_PAR_NIVEAU[niveau] || 40;
  const motsTotal = totalPages * NB_MOTS_PAR_PAGE;
  const motsParChapitre = Math.floor(motsTotal / totalChapitres);
  
  // Rédiger le chapitre actuel
  const chapitre = plan.plan[indexChapitre];
  const resumePrecedent = resumes.length > 0 ? resumes[resumes.length - 1] : '';
  
  await sendTyping(senderId, true);
  let texte = await redigerChapitre(
    chatWithGemini,
    chapitre.titre,
    chapitre.sousParties,
    resumePrecedent,
    niveau,
    motsParChapitre,
    references
  );
  
  // Relecture automatique
  texte = await relireChapitre(chatWithGemini, texte);
  
  // Détection de répétitions
  const repetitions = detecterRepetitions(texte);
  if (repetitions.length > 0) {
    texte = await corrigerRepetitions(chatWithGemini, texte, repetitions);
  }
  
  const resume = await genererResumeChapitre(chatWithGemini, texte);
  
  chapitres.push({ titre: chapitre.titre, texte });
  resumes.push(resume);
  
  userModes[senderId] = {
    ...etat,
    chapitres,
    resumes,
    indexChapitre: indexChapitre + 1
  };
  
  await sendTyping(senderId, false);
  
  // Message de progression
  const progression = Math.round(((indexChapitre + 1) / totalChapitres) * 100);
  await sendMessage(senderId,
    `📝 **Chapitre ${indexChapitre + 1}/${totalChapitres} terminé (${progression}%)**\n\n` +
    `📌 **${chapitre.titre}**\n` +
    `📄 ${texte.length} caractères\n\n` +
    `📖 **Résumé :**\n${resume}\n\n` +
    `${indexChapitre + 1 < totalChapitres ? '⏳ Rédaction du chapitre suivant en cours...' : '✅ **Tous les chapitres sont rédigés !**\n\nJe finalise maintenant le document...'}`,
    BOUTON_MENU
  );
  
  if (indexChapitre + 1 < totalChapitres) {
    // Passer au chapitre suivant
    setTimeout(() => demarrerRedactionMemoire(
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
    ), 2000);
  } else {
    // Finaliser le mémoire
    await finaliserMemoire(
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
  }
}

async function finaliserMemoire(
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
) {
  const etat = userModes[senderId];
  if (!etat) return;
  
  await sendTyping(senderId, true);
  
  try {
    const { niveau, theme, plan, chapitres, resumes } = etat;
    
    // Rédiger la conclusion (si pas déjà incluse)
    let conclusion = chapitres.find(c => c.titre.includes('Conclusion'));
    if (!conclusion) {
      const resumeTous = resumes.join('\n');
      const promptConclusion = `
À partir des chapitres précédents, rédige une conclusion générale pour ce mémoire sur "${theme}".
Synthèse des chapitres :
${resumeTous}

La conclusion doit comporter : une synthèse, les limites de l'étude, des perspectives.
Réponds uniquement avec le texte de la conclusion.
`;
      const texteConclusion = await chatWithGemini(promptConclusion, 'conclusion_memoire');
      chapitres.push({ titre: 'Conclusion', texte: texteConclusion });
    }
    
    // Bibliographie
    const bibliographie = plan.bibliographie || ['Bibliographie à compléter'];
    
    // Générer le DOCX
    const buffer = await genererMemoireDocx({
      titre: plan.titre || theme,
      auteur: (await getProfile(senderId))?.nom || 'Auteur',
      niveau: niveau,
      annee: new Date().getFullYear().toString(),
      encadreur: 'À préciser',
      universite: 'Université de Madagascar',
      chapitres: chapitres,
      bibliographie: bibliographie
    });
    
    const nomFichier = `Memoire_${(plan.titre || theme).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}.docx`;
    const id = stockerFichierGenere(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', nomFichier);
    const url = `${URL_BASE_PUBLIQUE}/generated-file/${id}`;
    
    // Ajouter XP et badge
    await ajouterXP(senderId, 50, 'memoire');
    
    userModes[senderId] = { 
      mode: 'chat', 
      memoireChapitres: chapitres,
      memoireComplete: true
    };
    
    await sendTyping(senderId, false);
    await sendFile(senderId, url);
    await sendMessage(senderId,
      `📖 **Mémoire terminé !**\n\n` +
      `✅ Fichier DOCX généré avec succès.\n` +
      `📄 ${chapitres.length} chapitres rédigés.\n` +
      `📚 ${bibliographie.length} références bibliographiques.\n\n` +
      `💡 **Vous pouvez demander des modifications :**\n` +
      `Tapez **"corriger chapitre 1"** ou **"corriger tout le mémoire"** avec les instructions de votre encadreur.\n\n` +
      `🌟 +50 XP pour ce mémoire !`,
      BOUTON_MENU
    );
  } catch (err) {
    console.error('Erreur finalisation mémoire:', err);
    await sendTyping(senderId, false);
    await sendMessage(senderId, '❌ Erreur lors de la finalisation du mémoire. Contactez l\'admin.', BOUTON_MENU);
  }
}

// ============================================================
// EXPORT DES FONCTIONS
// ============================================================

module.exports = {
  COUTS_MEMOIRE,
  PAGES_PAR_NIVEAU,
  extraireTexteDocument,
  decouperEnSegments,
  stockerReference,
  getReferencesPertinentes,
  genererPlanMemoire,
  redigerChapitre,
  relireChapitre,
  genererResumeChapitre,
  detecterRepetitions,
  genererMemoireDocx,
  demarrerRedactionMemoire,
  finaliserMemoire
};
