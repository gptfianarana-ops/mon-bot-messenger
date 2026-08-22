// Moteur pédagogique Tsarafandray Services
// Transformation de documents autorisés en contenus originaux et vérifiables.

const NIVEAUX = {
  PRESCOLAIRE: 'Préscolaire',
  PRIMAIRE: 'Primaire',
  COLLEGE: 'Collège',
  LYCEE: 'Lycée',
  TERMINALE: 'Terminale'
};

const LANGUES = ['français', 'malgache', 'bilingue'];

function normaliserNiveau(value = '') {
  const t = String(value).trim().toLowerCase();
  if (/préscol|prescol/.test(t)) return NIVEAUX.PRESCOLAIRE;
  if (/primaire|epp|cp|ce1|ce2|cm1|cm2/.test(t)) return NIVEAUX.PRIMAIRE;
  if (/collège|college|6e|5e|4e|3e/.test(t)) return NIVEAUX.COLLEGE;
  if (/terminale/.test(t)) return NIVEAUX.TERMINALE;
  if (/lycée|lycee|seconde|première|premiere|2nde|1ere/.test(t)) return NIVEAUX.LYCEE;
  return NIVEAUX.COLLEGE;
}

function construirePromptLecon({ source, titre, niveau, matiere, langue = 'bilingue', objectif = '' }) {
  const niveauNormalise = normaliserNiveau(niveau);
  const langueFinale = LANGUES.includes(String(langue).toLowerCase()) ? String(langue).toLowerCase() : 'bilingue';
  return `Tu es un concepteur pédagogique professionnel pour Madagascar. Transforme la source ci-dessous en une leçon ORIGINALE et fidèle, sans recopier longuement le document.

RÈGLES DE PRÉCISION OBLIGATOIRES :
1. N'invente aucune donnée absente de la source. Si une information est incertaine, écris « À vérifier dans la source ».
2. Conserve exactement les formules, dates, noms propres, définitions et unités ; ne les paraphrase pas lorsqu'une erreur pourrait changer le sens.
3. Distingue clairement les faits tirés de la source des exemples pédagogiques que tu ajoutes.
4. Pour le malgache, utilise une formulation naturelle, correcte et adaptée à l'enseignement. N'invente pas de traduction technique : conserve le terme français entre parenthèses si nécessaire et ajoute-le au glossaire.
5. Relis chaque phrase : accord, conjugaison, ponctuation, accents, cohérence des pronoms et vocabulaire.
6. Ne prétends pas que le contenu est officiel si la source ne l'est pas.
7. Ajoute les repères [Source: section ou page inconnue] uniquement lorsque le passage est présent dans le texte fourni ; ne fabrique jamais de numéro de page.

PARAMÈTRES :
Titre : ${titre || 'À déterminer à partir de la source'}
Matière : ${matiere || 'À déterminer'}
Niveau : ${niveauNormalise}
Langue de sortie : ${langueFinale}
Objectif particulier : ${objectif || 'Comprendre et réutiliser les notions essentielles'}

FORMAT STRICT DE SORTIE :
1. Titre de la leçon
2. Objectifs d'apprentissage mesurables
3. Prérequis
4. Vocabulaire clé et glossaire français–malgache
5. Explication structurée par notions
6. Exemple contextualisé à Madagascar, identifié comme exemple
7. Activités graduées : facile, moyen, avancé
8. Corrigé séparé
9. Évaluation courte avec barème
10. Résumé en français puis en malgache
11. Points à vérifier et limites de la source

SOURCE À TRANSFORMER :
${String(source || '').slice(0, 50000)}`;
}

function construirePromptFicheEnseignant({ lecon, niveau, matiere, duree = '55 minutes', langue = 'français' }) {
  return `À partir de la leçon ci-dessous, crée une fiche de préparation destinée à un enseignant malgache.

CONSIGNES : reste fidèle à la leçon ; n'ajoute aucun fait non justifié ; écris un français professionnel et, lorsque demandé, un malgache naturel ; signale toute ambiguïté par « À vérifier ».

Champs obligatoires : niveau (${normaliserNiveau(niveau)}), matière (${matiere || 'à préciser'}), durée (${duree}), compétence visée, objectifs opérationnels, prérequis, matériel, vocabulaire, déroulement minuté, rôle de l'enseignant, activité des élèves, différenciation, erreurs prévisibles, remédiation, évaluation et devoir.

LEÇON :
${String(lecon || '').slice(0, 40000)}`;
}

function controlerSortie(text = '') {
  const erreursPotentielles = [];
  const contenu = String(text);
  if (contenu.length < 120) erreursPotentielles.push('Contenu trop court pour une leçon complète.');
  if (/je ne sais pas|information inventée|hallucination/i.test(contenu)) erreursPotentielles.push('La sortie contient un avertissement d’incertitude à examiner.');
  if (!/objectif/i.test(contenu)) erreursPotentielles.push('Section « Objectifs » absente ou non détectée.');
  if (!/(corrigé|corrige)/i.test(contenu)) erreursPotentielles.push('Corrigé absent ou non détecté.');
  if (!/(malgache|malagasy)/i.test(contenu)) erreursPotentielles.push('La version ou le contrôle malgache n’est pas détecté.');
  const score = Math.max(0, 100 - erreursPotentielles.length * 15);
  return { score, valide: erreursPotentielles.length <= 1, erreursPotentielles };
}

module.exports = { NIVEAUX, normaliserNiveau, construirePromptLecon, construirePromptFicheEnseignant, controlerSortie };

// Toute sortie doit être relue par un humain avant publication officielle.
