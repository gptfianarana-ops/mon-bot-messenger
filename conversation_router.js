/**
 * Routeur conversationnel Tsarafandray Services.
 *
 * Rôle : comprendre les demandes fréquentes sans dépendre d'une phrase exacte,
 * puis laisser l'IA traiter uniquement les demandes réellement ouvertes.
 * Aucune action sensible n'est exécutée dans ce module.
 */

const INTENTS = Object.freeze({
  RESULTS: 'resultats',
  ORIENTATION: 'orientation',
  LEARNING: 'hianatra',
  IT_HELP: 'aide_informatique',
  LANGUAGE: 'langues',
  HUMAN: 'humain',
  MENU: 'menu',
  GENERAL: 'general',
  AMBIGUOUS: 'ambigu'
});

function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s'?-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function extractEntities(text) {
  const entities = {};
  const matricule = text.match(/\b\d{5,8}\b/);
  if (matricule) entities.matricule = matricule[0];

  const provinces = [
    ['antananarivo', 'antananarivo'], ['tana', 'antananarivo'], ['ankatso', 'antananarivo'],
    ['fianarantsoa', 'fianarantsoa'], ['fianar', 'fianarantsoa'],
    ['toamasina', 'toamasina'], ['tamatave', 'toamasina'],
    ['mahajanga', 'mahajanga'], ['majunga', 'mahajanga'],
    ['toliara', 'toliara'], ['tulear', 'toliara'],
    ['antsiranana', 'antsiranana'], ['diego', 'antsiranana'],
    ['itasy', 'itasy'], ['analanjirofo', 'analanjirofo'],
    ['vakinankaratra', 'vakinankaratra'], ['antsirabe', 'vakinankaratra'],
    ['sava', 'sava']
  ];
  const province = provinces.find(([alias]) => text.includes(alias));
  if (province) entities.province = province[1];

  const exams = [['bacc', 'bacc'], ['baccalaureat', 'bacc'], ['bepc', 'bepc'], ['cepe', 'cepe']];
  const exam = exams.find(([alias]) => text.includes(alias));
  if (exam) entities.examen = exam[1];

  const series = text.match(/\b(?:serie|série)\s*([a-z0-9]+)/);
  if (series) entities.serie = series[1].toUpperCase();

  return entities;
}

function detectIntent(message, context = {}) {
  const text = normalizeText(message);
  const entities = extractEntities(text);
  const previousIntent = context.previousIntent || context.intent || '';

  if (!text) return { intent: INTENTS.AMBIGUOUS, confidence: 0, entities, normalized: text, reason: 'empty' };
  if (/^(menu|retour|quitter|accueil|principal)$/.test(text)) {
    return { intent: INTENTS.MENU, confidence: 0.99, entities, normalized: text, reason: 'navigation' };
  }

  const asksResults = hasAny(text, [
    'resultat', 'resultats', 'valin', 'valina', 'vokatra', 'ijery', 'jereo', 'hijery',
    'valim-panadinana', 'nahafaka', 'tafavoaka', 'admis', 'matricule', 'numero inscription'
  ]);
  const hasExam = Boolean(entities.examen) || hasAny(text, ['bacc', 'baccalaureat', 'bepc', 'cepe']);
  const directResultRequest = hasAny(text, ['resultat', 'resultats', 'valin', 'vokatra', 'ijery', 'jereo', 'hijery', 'valim-panadinana']);
  const exactExamRequest = /^(bacc|baccalaureat|bepc|cepe)$/.test(text);
  if (exactExamRequest || (asksResults && (hasExam || directResultRequest)) || entities.matricule || (previousIntent === INTENTS.RESULTS && asksResults)) {
    return { intent: INTENTS.RESULTS, confidence: entities.matricule || entities.examen ? 0.97 : 0.9, entities, normalized: text, reason: 'exam_result_request' };
  }

  if (hasAny(text, ['orientation', 'filiere', 'filieres', 'etude', 'etudier', 'universite', 'universitaire', 'agronomie', 'medecine', 'informatique']) &&
      hasAny(text, ['apres bac', 'apres bacc', 'filiere', 'orientation', 'etudier', 'universite', 'serie'])) {
    return { intent: INTENTS.ORIENTATION, confidence: 0.91, entities, normalized: text, reason: 'study_guidance' };
  }

  if (hasAny(text, ['traduction', 'traduire', 'langue', 'anglais', 'francais', 'malagasy', 'teny', 'resaka'])) {
    return { intent: INTENTS.LANGUAGE, confidence: 0.9, entities, normalized: text, reason: 'language_request' };
  }

  if (hasAny(text, ['hianatra', 'apprendre', 'lecon', 'cours', 'exercice', 'fianarana', 'lesona'])) {
    return { intent: INTENTS.LEARNING, confidence: 0.9, entities, normalized: text, reason: 'learning_request' };
  }

  if (hasAny(text, ['informatique', 'ordinateur', 'telephone', 'facebook', 'code', 'bug', 'installation', 'application', 'aide'])) {
    return { intent: INTENTS.IT_HELP, confidence: 0.78, entities, normalized: text, reason: 'it_help_request' };
  }

  if (hasAny(text, ['admin', 'humain', 'olona', 'personne', 'equipe', 'parler a quelqu'])) {
    return { intent: INTENTS.HUMAN, confidence: 0.95, entities, normalized: text, reason: 'human_request' };
  }

  return { intent: INTENTS.GENERAL, confidence: 0.35, entities, normalized: text, reason: 'open_question' };
}

function getClarification(decision) {
  if (decision.intent !== INTENTS.AMBIGUOUS && decision.confidence >= 0.85) return null;
  return 'Je veux bien t’aider. Tu cherches plutôt :\n1) un résultat BACC/BEPC/CEPE\n2) une orientation après le BACC\n3) une leçon ou une aide informatique\n4) parler à l’équipe\n\nRéponds simplement par 1, 2, 3 ou 4.';
}

module.exports = { INTENTS, normalizeText, extractEntities, detectIntent, getClarification };
