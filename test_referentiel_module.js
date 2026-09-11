'use strict';
const assert = require('assert');
const { rechercherReferentiel, chargerIndex } = require('./referentiel_module');

const index = chargerIndex();
assert.strictEqual(index.documents_count, 25);
assert.deepStrictEqual(index.levels, ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']);
for (const q of [
  { niveau: 'T5', matiere: 'mathématiques', theme: 'fractions' },
  { niveau: 'T11', serie: 'OSE', matiere: 'philosophie', theme: 'conscience' },
  { niveau: 'T12', serie: 'S', matiere: 'physique', theme: 'mouvement' }
]) {
  const refs = rechercherReferentiel(q);
  assert.ok(refs.length > 0, `aucune référence ${q.niveau}`);
  assert.ok(refs.some(x => x.passages.length > 0), `aucun extrait ${q.niveau}`);
}
console.log('OK: index de 25 documents et recherches PE/RAPE validés');
