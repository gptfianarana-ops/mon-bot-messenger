'use strict';

const NIVEAUX = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);
const SERIES = ['L', 'S', 'OSE'];
const TYPES = {
  fiche: 'Fiche de préparation de séance',
  repartition: 'Répartition annuelle',
  cours: 'Contenu de cours',
  evaluation: 'Évaluation et corrigé'
};

function normaliserTexte(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function detecterTypeEnseignant(text) {
  const t = normaliserTexte(text).toLowerCase();
  if (/répartition|repartition|progression|annuel|annuelle/.test(t)) return 'repartition';
  if (/évaluation|evaluation|devoir|contrôle|controle|quiz|corrigé|corrige/.test(t)) return 'evaluation';
  if (/cours|leçon|lecon|séquence|sequence|chapitre|contenu/.test(t)) return 'cours';
  return 'fiche';
}

function detecterNiveau(text) {
  const t = normaliserTexte(text).toUpperCase();
  const match = t.match(/\bT(?:1[0-2]|[1-9])\b/);
  return match ? match[0] : null;
}

function detecterSerie(text) {
  const t = normaliserTexte(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const tokens = new Set(t.split(/[^A-Z0-9]+/).filter(Boolean));
  return SERIES.find(s => tokens.has(s)) || null;
}

function creerEtatEnseignant() {
  return { mode: 'enseignant', etape: 'type', donnees: {} };
}

function questionSuivante(etat) {
  const d = etat.donnees;
  if (!d.type) return 'Quel outil veux-tu créer ?\n1. Fiche de préparation\n2. Répartition annuelle\n3. Contenu de cours\n4. Évaluation et corrigé';
  if (!d.niveau) return 'Pour quel niveau ? Écris par exemple T1, T5, T10 ou T12.';
  if (!d.matiere) return 'Quelle est la matière ?';
  if (!d.theme) return 'Quel est le thème ou le chapitre ?';
  if ((d.type === 'fiche' || d.type === 'evaluation') && !d.duree) return 'Quelle durée ou quel format ? Exemple : 55 minutes, devoir d’une heure, contrôle de 20 points.';
  if ((d.niveau === 'T11' || d.niveau === 'T12') && !d.serie) return 'Pour le second cycle, indique la série : L, S ou OSE.';
  return null;
}

function appliquerReponse(etat, message) {
  const texte = normaliserTexte(message);
  const d = etat.donnees;
  if (!d.type) {
    const n = texte.toLowerCase();
    d.type = /^1$|fiche|préparation|preparation/.test(n) ? 'fiche' : /^2$|répartition|repartition|progression/.test(n) ? 'repartition' : /^3$|cours|leçon|lecon/.test(n) ? 'cours' : /^4$|évaluation|evaluation|devoir|contrôle|controle/.test(n) ? 'evaluation' : detecterTypeEnseignant(texte);
  } else if (!d.niveau) d.niveau = detecterNiveau(texte);
  else if (!d.matiere) d.matiere = texte;
  else if (!d.theme) d.theme = texte;
  else if ((d.type === 'fiche' || d.type === 'evaluation') && !d.duree) d.duree = texte;
  else if ((d.niveau === 'T11' || d.niveau === 'T12') && !d.serie) d.serie = detecterSerie(texte);
  return etat;
}

function construirePromptEnseignant(d) {
  const type = TYPES[d.type] || TYPES.fiche;
  return `Tu es un conseiller pédagogique spécialisé dans le système scolaire malgache. Produis une ${type} professionnelle en français, avec possibilité d'insérer les termes malgaches utiles.\n\nContexte fourni par l'enseignant : niveau=${d.niveau}; série=${d.serie || 'non concernée ou non précisée'}; matière=${d.matiere}; thème=${d.theme}; durée/format=${d.duree || 'à proposer prudemment'}.\n\nRègles strictes : distingue les faits officiels des propositions pédagogiques ; n'invente ni programme ministériel, ni volume horaire, ni coefficient, ni objectif officiellement homologué ; indique « Proposition Tsarafandray » pour les éléments générés ; adapte les objectifs à l'âge et au niveau ; privilégie les compétences observables, la différenciation, l'inclusion, l'évaluation formative et les ressources réalistes à Madagascar. Si le niveau ou le thème est insuffisant, pose une question au lieu d'inventer.\n\nStructure attendue : titre, contexte, compétences visées, prérequis, objectifs mesurables, matériel, déroulement minuté, activités de l'enseignant, activités des apprenants, différenciation, évaluation, corrigé ou critères de réussite, devoir/prolongement, points à vérifier dans le référentiel officiel. Pour une répartition annuelle, ajoute périodes, séquences, compétences, durée indicative et colonne « à confirmer selon calendrier officiel ». Pour un cours, ajoute une progression claire, exemples, vocabulaire bilingue si pertinent et questions de vérification. Réponds en Markdown propre et directement utilisable en classe.`;
}

module.exports = { NIVEAUX, SERIES, TYPES, creerEtatEnseignant, questionSuivante, appliquerReponse, construirePromptEnseignant, detecterNiveau, detecterSerie, detecterTypeEnseignant };
