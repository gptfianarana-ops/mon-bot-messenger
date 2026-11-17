# Tsarafandray Services — Bot Messenger

Assistant Messenger consacré à l’apprentissage, à l’orientation et à l’accompagnement scolaire à Madagascar. Le bot utilise Gemini pour les réponses générées et des modules spécialisés pour certains parcours.

## Fonctionnalités

- **Apprentissage** : tutorat en informatique, en langues et sur les leçons.
- **Exercices interactifs** : exercice adapté au niveau, réponse de l’élève, indice progressif, correction après tentative ou sur demande.
- **Outils pédagogiques** : cours, exercices, évaluations et fiches pour enseignants, selon l’activation administrateur.
- **Orientation post-BACC** : informations par série, filière, domaine et université.
- **Examens** : parcours de consultation des résultats CEPE, BEPC et BACC disponibles.
- **Autres outils** : correction de texte, traduction, simulation de moyenne au BACC, CV et accompagnement à la rédaction.

Les contenus générés sont des aides pédagogiques. Les résultats d’examens, les programmes, les calendriers et les conditions d’admission doivent être vérifiés auprès de leurs sources officielles.

## Parcours d’exercice interactif

Dans Messenger, ouvre **Exercices**, puis envoie une matière ou un thème (par exemple : « fractions », « accord du participe passé » ou « loi d’Ohm »).

Le bot présente un énoncé sans le corrigé. Réponds en montrant tes étapes, puis utilise au besoin :

- `INDICE` pour obtenir une aide sans révéler la solution ;
- `SOLUTION` pour demander le corrigé complet ;
- `NOUVEAU` pour commencer un autre exercice ;
- `MENU` pour quitter le parcours.

Le niveau scolaire et, si disponible, la matière favorite du profil servent à adapter l’exercice.

## Installation locale

Prérequis : Node.js compatible avec les dépendances du projet.

```bash
npm install
npm start
```

Configure les variables dans l’environnement avant de démarrer :

- `VERIFY_TOKEN` : jeton de vérification du webhook Meta ;
- `PAGE_ACCESS_TOKEN` : jeton d’accès de la Page Messenger ;
- `GEMINI_API_KEY` : clé Gemini. Des clés supplémentaires peuvent être configurées avec `GEMINI_API_KEY_2` à `GEMINI_API_KEY_5` ou via `GEMINI_API_KEYS` (séparées par des virgules).

Ne publie jamais de clés ou de jetons dans le dépôt.

## Webhook Messenger

Dans l’application Meta, configure l’URL de callback du service sur `https://<ton-domaine>/webhook`, renseigne le même `VERIFY_TOKEN`, puis abonne la Page aux événements de messages. Pour Render, utilise l’URL fournie par le service et ajoute les variables d’environnement dans les paramètres du déploiement.

## Précision et validation

Les réponses de l’IA peuvent contenir des erreurs. Pour les usages en classe, vérifie les faits, les formules, les traductions et toute référence au programme auprès d’un enseignant ou d’une source officielle. Les modules pédagogiques signalent les limites documentaires lorsqu’ils ne peuvent pas confirmer une information.
