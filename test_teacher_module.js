'use strict';
const assert = require('assert');
const {
  TYPES, creerEtatEnseignant, questionSuivante, appliquerReponse,
  construirePromptEnseignant, detecterLangue, detecterPeriode, detecterTypeEnseignant
} = require('./teacher_module');

assert.ok(TYPES.cours && TYPES.fiche && TYPES.repartition && TYPES.exercices && TYPES.corrige);
assert.strictEqual(detecterTypeEnseignant('manaova fanazaran-tena momba ny fractions'), 'exercices');
assert.strictEqual(detecterTypeEnseignant('corrigé détaillé'), 'corrige');
assert.strictEqual(detecterLangue('Ataovy amin\'ny teny malagasy'), 'malagasy');
assert.strictEqual(detecterLangue('français et malagasy'), 'bilingue');
assert.strictEqual(detecterPeriode('répartition trimestrielle'), 'trimestrielle');

let etat = creerEtatEnseignant();
appliquerReponse(etat, '4');
appliquerReponse(etat, 'T5');
appliquerReponse(etat, 'Mathématiques');
appliquerReponse(etat, 'Fractions');
appliquerReponse(etat, 'malagasy');
appliquerReponse(etat, '12 exercices progressifs');
assert.strictEqual(etat.donnees.type, 'exercices');
assert.strictEqual(etat.donnees.niveau, 'T5');
assert.strictEqual(etat.donnees.langue, 'malagasy');
assert.ok(construirePromptEnseignant(etat.donnees).includes('RÉFÉRENCES LOCALES'));
assert.ok(construirePromptEnseignant(etat.donnees).includes('contenu original'));

etat = creerEtatEnseignant();
appliquerReponse(etat, '2');
appliquerReponse(etat, 'T12');
appliquerReponse(etat, 'L');
appliquerReponse(etat, 'Français');
appliquerReponse(etat, 'Littérature');
appliquerReponse(etat, 'bilingue');
appliquerReponse(etat, 'trimestrielle');
assert.strictEqual(etat.donnees.type, 'repartition');
assert.strictEqual(etat.donnees.serie, 'L');
assert.strictEqual(etat.donnees.periode, 'trimestrielle');
assert.strictEqual(questionSuivante(etat), null);

// Demande naturelle en une phrase et réponse combinée « T11 L ».
etat = creerEtatEnseignant();
appliquerReponse(etat, 'Crée-moi des contenus des leçons Histoire 1ère L');
assert.strictEqual(etat.donnees.type, 'cours');
assert.strictEqual(etat.donnees.niveau, 'T11');
assert.strictEqual(etat.donnees.serie, 'L');
assert.strictEqual(etat.donnees.matiere, 'Histoire');
assert.strictEqual(questionSuivante(etat), 'Quel est le thème, chapitre ou lesona ?');
appliquerReponse(etat, 'Chapitre I');
assert.strictEqual(etat.donnees.theme, 'Chapitre I');
const promptCours = construirePromptEnseignant(etat.donnees);
assert.ok(promptCours.includes('texte exact que les élèves peuvent recopier'));
assert.ok(promptCours.includes('CHAPITRE I'));

etat = creerEtatEnseignant();
appliquerReponse(etat, '3');
appliquerReponse(etat, 'T11 L');
assert.strictEqual(etat.donnees.niveau, 'T11');
assert.strictEqual(etat.donnees.serie, 'L');

console.log('OK: formats fiche/cours/répartition/exercices/corrigé et langues validés');
