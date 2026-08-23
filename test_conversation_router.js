const assert = require('assert');
const { INTENTS, detectIntent } = require('./conversation_router');

const cases = [
  ['BACC', INTENTS.RESULTS],
  ['ijery valina bacc', INTENTS.RESULTS],
  ['jereo ny resultat-ko any Tana', INTENTS.RESULTS],
  ['te hahita ny valim-panadinana', INTENTS.RESULTS],
  ['je veux une orientation après le bac', INTENTS.ORIENTATION],
  ['mila fanampiana amin informatique', INTENTS.IT_HELP],
  ['apprendre anglais', INTENTS.LANGUAGE],
  ['hianatra lesona', INTENTS.LEARNING],
  ['parler à une personne', INTENTS.HUMAN]
];

for (const [message, expected] of cases) {
  const result = detectIntent(message);
  assert.strictEqual(result.intent, expected, `${message}: ${result.intent} !== ${expected}`);
}

const result = detectIntent('cherche mon bacc à Antsirabe numéro 2240205');
assert.strictEqual(result.intent, INTENTS.RESULTS);
assert.strictEqual(result.entities.matricule, '2240205');
assert.strictEqual(result.entities.province, 'vakinankaratra');

console.log(`OK: ${cases.length + 1} scénarios du routeur validés`);
