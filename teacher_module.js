'use strict';

const { rechercherReferentiel, formaterReferences } = require('./referentiel_module');

const NIVEAUX = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);
const SERIES = ['L', 'S', 'OSE'];
const LANGUES = ['français', 'malagasy', 'bilingue'];
const TYPES = {
  fiche: 'Fiche de préparation de séance',
  repartition: 'Répartition du programme',
  cours: 'Contenu de cours complet',
  exercices: 'Série d’exercices progressive',
  corrige: 'Corrigé détaillé',
  evaluation: 'Évaluation et corrigé'
};

function normaliserTexte(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function detecterTypeEnseignant(text) {
  const t = normaliserTexte(text).toLowerCase();
  if (/répartition|repartition|progression|annuel|annuelle|trimestr|période|periode/.test(t)) return 'repartition';
  if (/corrigé|corrige|solution|valiny|fanitsiana/.test(t) && !/évaluation|evaluation|devoir|contrôle|controle/.test(t)) return 'corrige';
  if (/exercice|exercices|série d'exercices|serie d'exercices|fanazarana|fanazaran-tena/.test(t)) return 'exercices';
  if (/évaluation|evaluation|devoir|contrôle|controle|quiz|test/.test(t)) return 'evaluation';
  if (/cours|leçon|lecon|séquence|sequence|chapitre|contenu|lesona|taranja/.test(t)) return 'cours';
  return 'fiche';
}

function detecterNiveau(text) {
  const t = normaliserTexte(text).toUpperCase();
  const match = t.match(/\bT(?:1[0-2]|[1-9])\b/);
  if (match) return match[0];
  if (/TERMINALE|TERM\.?\b|TLE\b/.test(t)) return 'T12';
  if (/1(?:ÈRE|ERE|RE|È|E)\s*(?:L|S|OSE)?\b|PREMIERE|PREMIÈRE/.test(t)) return 'T11';
  if (/SECONDE|2NDE/.test(t)) return 'T10';
  return null;
}

function detecterSerie(text) {
  const t = normaliserTexte(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const tokens = new Set(t.split(/[^A-Z0-9]+/).filter(Boolean));
  return SERIES.find(s => tokens.has(s)) || null;
}

function detecterLangue(text) {
  const t = normaliserTexte(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/bilingue|français et malagasy|francais et malagasy|les deux|teny roa/.test(t)) return 'bilingue';
  if (/malagasy|malgache|amin'ny teny gasy|amin ny teny gasy/.test(t)) return 'malagasy';
  return 'français';
}

function detecterPeriode(text) {
  const t = normaliserTexte(text).toLowerCase();
  if (/trimestr|trimester|telovolana/.test(t)) return 'trimestrielle';
  if (/semestr|semestre/.test(t)) return 'semestrielle';
  return 'annuelle';
}

function extraireChapitre(text) {
  const t = normaliserTexte(text);
  const match = t.match(/\b(?:chapitre|leçon|lecon|lesson|toko)\s*([IVXLCDM]+|\d+)\b/i);
  return match ? `Chapitre ${match[1].toUpperCase()}` : null;
}

function extraireMatiere(text) {
  const t = normaliserTexte(text);
  const matieres = ['histoire', 'géographie', 'geographie', 'malagasy', 'français', 'francais', 'mathématiques', 'mathematiques', 'physique', 'chimie', 'sciences', 'philosophie', 'anglais', 'économie', 'economie', 'droit', 'informatique', 'éducation civique', 'education civique'];
  const found = matieres.find(m => t.toLowerCase().includes(m));
  return found ? found.replace(/^./, c => c.toUpperCase()) : null;
}

function extraireDemandeInitiale(text) {
  const t = normaliserTexte(text);
  const lower = t.toLowerCase();
  const hasTypeSignal = /fiche|préparation|preparation|répartition|repartition|progression|annuel|trimestr|cours|leçon|lecon|contenu|lesona|exercice|fanazarana|corrigé|corrige|solution|évaluation|evaluation|devoir|contrôle|controle/i.test(t);
  const data = { type: hasTypeSignal ? detecterTypeEnseignant(t) : null, niveau: detecterNiveau(t), serie: detecterSerie(t), matiere: extraireMatiere(t), theme: extraireChapitre(t) };
  if (/français|francais/.test(lower) && /malagasy|malgache/.test(lower)) data.langue = 'bilingue';
  else if (/malagasy|malgache/.test(lower)) data.langue = 'malagasy';
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value));
}

function creerEtatEnseignant() {
  return { mode: 'enseignant', etape: 'type', donnees: {} };
}

function questionSuivante(etat) {
  const d = etat.donnees;
  if (!d.type) return 'Quel outil veux-tu créer ?\n1. Fiche de préparation\n2. Répartition annuelle ou trimestrielle\n3. Contenu de cours\n4. Exercices\n5. Corrigé\n6. Évaluation et corrigé';
  if (!d.niveau) return 'Pour quel niveau ? Écris T1 à T12. Pour le second cycle, ajoute L, S ou OSE.';
  if ((d.niveau === 'T11' || d.niveau === 'T12') && !d.serie) return 'Pour le second cycle, indique la série : L, S ou OSE.';
  if (!d.matiere) return 'Quelle est la matière ou le taranja ?';
  if (!d.theme) return 'Quel est le thème, chapitre ou lesona ?';
  if (!d.langue) return 'Dans quelle langue ? Français, malagasy ou bilingue ?';
  if (d.type === 'repartition' && !d.periode) return 'Quelle organisation ? Annuelle, trimestrielle ou semestrielle ?';
  if ((d.type === 'fiche' || d.type === 'evaluation') && !d.duree) return 'Quelle durée ou quel format ? Exemple : 55 minutes, devoir d’une heure, contrôle sur 20 points.';
  if ((d.type === 'exercices' || d.type === 'corrige') && !d.quantite) return 'Combien d’exercices souhaites-tu et pour quel niveau de difficulté ?';
  return null;
}

function appliquerReponse(etat, message) {
  const texte = normaliserTexte(message);
  const d = etat.donnees;
  if (!d.type) {
    Object.assign(d, extraireDemandeInitiale(texte));
    const n = texte.toLowerCase();
    d.type = d.type || (/^1$|fiche|préparation|preparation/.test(n) ? 'fiche'
      : /^2$|répartition|repartition|progression|annuel|trimestr/.test(n) ? 'repartition'
      : /^3$|cours|leçon|lecon|contenu|lesona/.test(n) ? 'cours'
      : /^4$|exercice|fanazarana/.test(n) ? 'exercices'
      : /^5$|corrigé|corrige|solution|valiny/.test(n) ? 'corrige'
      : /^6$|évaluation|evaluation|devoir|contrôle|controle/.test(n) ? 'evaluation'
      : detecterTypeEnseignant(texte));
  } else if (!d.niveau) {
    d.niveau = detecterNiveau(texte);
    d.serie = d.serie || detecterSerie(texte);
  }
  else if ((d.niveau === 'T11' || d.niveau === 'T12') && !d.serie) d.serie = detecterSerie(texte);
  else if (!d.matiere) d.matiere = texte;
  else if (!d.theme) d.theme = texte;
  else if (!d.langue) d.langue = detecterLangue(texte);
  else if (d.type === 'repartition' && !d.periode) d.periode = detecterPeriode(texte);
  else if ((d.type === 'fiche' || d.type === 'evaluation') && !d.duree) d.duree = texte;
  else if ((d.type === 'exercices' || d.type === 'corrige') && !d.quantite) d.quantite = texte;
  return etat;
}

function construirePromptEnseignant(d) {
  const type = TYPES[d.type] || TYPES.fiche;
  const langue = d.langue || 'français';
  const objectif = d.type === 'repartition' ? `${d.periode || 'annuelle'} répartition` : type;
  const references = formaterReferences(rechercherReferentiel({
    niveau: d.niveau,
    matiere: d.matiere,
    theme: d.theme,
    serie: d.serie,
    objectif
  }));
  const langueInstruction = langue === 'malagasy'
    ? 'Rédige en malagasy professionnel. Si un terme pédagogique français est indispensable, donne-le entre parenthèses et explique-le.'
    : langue === 'bilingue'
      ? 'Rédige en français clair et ajoute les formulations malagasy utiles pour les consignes, notions clés et feedbacks.'
      : 'Rédige en français professionnel et ajoute les termes malagasy seulement lorsqu’ils améliorent la compréhension.';
  const structure = {
    fiche: 'titre, niveau et série, compétences, prérequis, objectifs observables, matériel, déroulement minuté, consignes exactes, activités enseignant/apprenants, différenciation, évaluation formative, remédiation et devoir',
    cours: 'un document élève directement recopiable, sans introduction méta : « CHAPITRE I — ... », puis 1. Titre de la leçon, 2. Objectif, 3. Mots-clés, 4. Cours à recopier avec définitions et explications complètes, 5. Exemples, 6. À retenir, 7. Exercices, 8. Corrigé séparé, 9. Questions de vérification et 10. Devoir ; chaque chapitre doit être livré séparément sur demande',
    repartition: `périodes de ${d.periode || 'répartition annuelle'}, chapitres issus prioritairement du RAPE, compétences, durée indicative, activités et colonne « statut de vérification » ; ne jamais inventer un volume horaire officiel`,
    exercices: 'une série progressive du simple au complexe, consignes sans ambiguïté, barème indicatif, compétences ciblées, contexte et espace de réponse ; ne pas réutiliser mot pour mot un document protégé',
    corrige: 'rappel de la compétence évaluée, solution étape par étape, justification, barème, erreurs typiques, remédiation et version courte pour correction en classe',
    evaluation: 'sujet complet, consignes, durée, barème, compétences, exercices équilibrés, corrigé détaillé et critères de réussite'
  }[d.type] || 'réponse structurée directement utilisable par un enseignant';
  return `Tu es un auteur de manuels scolaires et conseiller pédagogique spécialisé dans le système scolaire malgache et dans la réforme T1–T12. Tu dois produire une ${type} complète, exploitable en classe et adaptée à l’âge des apprenants.

Contexte : niveau=${d.niveau}; série=${d.serie || 'non concernée'}; matière=${d.matiere}; thème=${d.theme}; langue=${langue}; période=${d.periode || 'non concernée'}; durée/quantité=${d.duree || d.quantite || 'à proposer prudemment'}.

${langueInstruction}

RÈGLES DE FIABILITÉ :
1. Utilise d’abord les extraits du référentiel local ci-dessous comme base documentaire. Ne commence pas par « selon le programme » : commence directement par le document demandé.
2. Distingue visiblement « Référentiel officiel identifié », « Proposition pédagogique Tsarafandray » et « Point à vérifier ».
3. N’invente ni chapitre obligatoire, ni coefficient, ni volume horaire, ni calendrier, ni diplôme.
4. Si le référentiel ne confirme pas une information, dis-le clairement et propose une formulation prudente.
5. Respecte le niveau, la série L/S/OSE, les compétences observables, l’inclusion, la différenciation et le contexte matériel réaliste de Madagascar.
6. Pour les exercices et corrigés, crée du contenu original ; ne reproduis pas un livre ou un PDF chapitre par chapitre.
7. Pour un contenu de cours, écris le texte exact que les élèves peuvent recopier. Utilise des titres et une numérotation continue. N’écris pas seulement un plan, des conseils à l’enseignant ou une liste de thèmes.
8. Si le chapitre n’est pas précisé, demande uniquement le numéro ou le titre du chapitre avant de générer. Ne demande pas à nouveau le niveau ou la série déjà détectés.

RÉFÉRENCES LOCALES :
${references}

STRUCTURE OBLIGATOIRE : ${structure}.
Réponds en Markdown propre. Termine par « Sources et vérifications » avec les fichiers utilisés et les points qui nécessitent une validation humaine avant diffusion. Si la demande est trop vague pour éviter une erreur, pose une seule question ciblée au lieu d’inventer.`;
}

module.exports = {
  NIVEAUX, SERIES, LANGUES, TYPES, creerEtatEnseignant, questionSuivante,
  appliquerReponse, construirePromptEnseignant, detecterNiveau, detecterSerie,
  detecterLangue, detecterPeriode, detecterTypeEnseignant
};
