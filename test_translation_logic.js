const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('index.js', 'utf8');
const start = source.indexOf('function normaliserLangueTraduction');
const end = source.indexOf('\n\nasync function analyserEtTraduire', start);
if (start < 0 || end < 0) throw new Error('Bloc de traduction introuvable');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const cases = [
  ['normaliserLangueTraduction', context.normaliserLangueTraduction('en français'), 'français'],
  ['normaliserLangueTraduction', context.normaliserLangueTraduction('English'), 'anglais'],
  ['detecterLangueTraduction', context.detecterLangueTraduction('Bonjour, je voudrais traduire ce texte.'), 'français'],
  ['detecterLangueTraduction', context.detecterLangueTraduction('Hello, please translate this text.'), 'anglais'],
  ['detecterLangueTraduction', context.detecterLangueTraduction('Salama, azafady adikao amin’ny teny malagasy ity.'), 'malgache'],
  ['extraireLangueCibleTraduction', context.extraireLangueCibleTraduction('traduis ce texte en anglais'), 'anglais'],
  ['estDemandeLangueSeule', context.estDemandeLangueSeule('en français'), true],
];
for (const [name, actual, expected] of cases) {
  if (actual !== expected) throw new Error(`${name}: attendu ${expected}, obtenu ${actual}`);
}
console.log(`OK: ${cases.length} scénarios de traduction déterministe validés`);
