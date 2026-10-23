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

console.log('OK: formats fiche/cours/répartition/exercices/corrigé et langues validés');
