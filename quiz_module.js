'use strict';

const MAX_TOPIC_LENGTH = 240;

function normaliserCommandeQuiz(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\/+/, '')
    .replace(/\s+/g, ' ');
}

function detecterCommandeQuiz(value) {
  const text = normaliserCommandeQuiz(value);
  if (/^(indice|aide|hint)$/.test(text)) return 'indice';
  if (/^(solution|corrige|correction|reponse)$/.test(text)) return 'solution';
  if (/^(nouveau|nouvel exercice|autre exercice)$/.test(text)) return 'nouveau';
  if (/^(menu|quitter|retour|stop)$/.test(text)) return 'menu';
  return 'reponse';
}

function construirePromptExerciceInteractif({ sujet, niveau = 'collège', matiere = '' } = {}) {
  const topic = String(sujet || '').trim().slice(0, MAX_TOPIC_LENGTH);
  return `Tu es un tuteur scolaire précis et bienveillant. Prépare UN seul exercice original sur le sujet « ${topic || 'à préciser'} », pour un élève de niveau ${niveau || 'collège'}${matiere ? `, matière : ${matiere}` : ''}.

RÈGLES :
- Commence par le titre, le niveau et la compétence travaillée.
- Donne un énoncé autonome, clair, sans ambiguïté, avec toutes les données nécessaires et des unités cohérentes.
- Choisis une difficulté adaptée et une seule tâche principale.
- N'inclus ni réponse, ni corrigé, ni résultat final, ni indice dans ce premier message.
- Si le sujet manque de précision ou dépend d'un programme officiel que tu ne peux pas confirmer, pose une seule question ou signale la limite au lieu d'inventer.
- Termine par : « Réponds avec tes étapes. Écris INDICE pour un indice, SOLUTION pour le corrigé ou MENU pour arrêter. »`;
}

function construirePromptIndice({ question, niveau = 'collège' } = {}) {
  return `Tu aides un élève de niveau ${niveau} à résoudre l'exercice ci-dessous. Donne UN indice progressif qui aide à démarrer sans révéler la réponse finale ni dérouler tout le corrigé. Utilise une formulation simple et demande à l'élève de tenter l'étape suivante.

EXERCICE :
${String(question || '').slice(0, 12000)}`;
}

function construirePromptEvaluation({ question, reponse, niveau = 'collège', revelerSolution = false } = {}) {
  const consigneCorrige = revelerSolution
    ? 'Après le retour, donne le corrigé complet étape par étape et vérifie les calculs, unités et hypothèses.'
    : 'Si la réponse est correcte, valide-la et justifie brièvement. Si elle est partielle ou incorrecte, précise ce qui est juste, indique l’étape à revoir et donne un seul indice ; ne révèle pas encore le résultat final.';
  return `Tu es un correcteur pédagogique rigoureux et encourageant. Compare la réponse de l'élève à l'exercice. Accepte les méthodes équivalentes et les réponses correctement arrondies lorsque l'énoncé le permet. Ne déclare pas une réponse correcte si le raisonnement ou les unités la contredisent. Si les informations ne suffisent pas, dis-le.

Commence obligatoirement par une seule ligne parmi :
[VERDICT: correct]
[VERDICT: partiel]
[VERDICT: incorrect]
[VERDICT: incertain]

Puis donne « Retour pédagogique » avec une explication adaptée au niveau ${niveau || 'collège'}. ${consigneCorrige}

EXERCICE :
${String(question || '').slice(0, 12000)}

RÉPONSE DE L'ÉLÈVE :
${String(reponse || '').slice(0, 4000)}`;
}

module.exports = {
  detecterCommandeQuiz,
  construirePromptExerciceInteractif,
  construirePromptIndice,
  construirePromptEvaluation
};
