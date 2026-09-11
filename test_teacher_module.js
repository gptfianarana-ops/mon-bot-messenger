'use strict';
const assert = require('assert');
const t = require('./teacher_module');
const r = require('./referentiel_module');

assert.strictEqual(t.detecterNiveau('préparer une séance pour T1'), 'T1');
assert.strictEqual(t.detecterNiveau('contenu de T12'), 'T12');
assert.strictEqual(t.detecterSerie('série L'), 'L');
assert.strictEqual(t.detecterSerie('série S'), 'S');
assert.strictEqual(t.detecterSerie('série OSE'), 'OSE');

for (const [choix, type] of [['1', 'fiche'], ['2', 'repartition'], ['3', 'cours'], ['4', 'evaluation']]) {
  const etat = t.creerEtatEnseignant();
  t.appliquerReponse(etat, choix);
  assert.strictEqual(etat.donnees.type, type);
}

const etat = t.creerEtatEnseignant();
for (const valeur of ['1', 'T12', 'Sciences économiques et sociales', 'La vie en société', '55 minutes', 'OSE']) t.appliquerReponse(etat, valeur);
assert.deepStrictEqual(etat.donnees, { type: 'fiche', niveau: 'T12', matiere: 'Sciences économiques et sociales', theme: 'La vie en société', duree: '55 minutes', serie: 'OSE' });
assert.ok(t.construirePromptEnseignant(etat.donnees).includes('Proposition Tsarafandray'));
assert.ok(t.construirePromptEnseignant(etat.donnees).includes('Références documentaires locales'));
for (const q of [
  { niveau: 'T5', matiere: 'mathématiques', theme: 'fractions' },
  { niveau: 'T11', serie: 'OSE', matiere: 'philosophie', theme: 'conscience' },
  { niveau: 'T12', serie: 'S', matiere: 'physique', theme: 'mouvement' }
]) {
  const refs = r.rechercherReferentiel(q);
  assert.ok(refs.length >= 1, `référence absente pour ${q.niveau}`);
  assert.ok(refs.some(x => x.passages.length > 0), `extrait absent pour ${q.niveau}`);
}
console.log('OK: 14 tests du module enseignant et du référentiel validés');
