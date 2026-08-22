# Créer un bot Messenger automatisé de A à Z
## Cours pratique d’informatique, d’automatisation et de services numériques

**Projet support : Tsarafandray Services**  
**Public :** élèves débutants à intermédiaires en informatique  
**Approche :** apprentissage par projet, avec une progression humaine et vérifiable  
**Auteur pédagogique :** Tsarafandray Services

> Ce cours explique comment concevoir un service numérique réel : on part d’un besoin, on construit une solution, on la teste, on la sécurise et on l’améliore. L’intelligence artificielle est présentée comme un outil placé sous le contrôle du développeur, et non comme un remplacement de la réflexion humaine.

---

## Présentation générale

Un bot Messenger est un programme capable de recevoir un message, de comprendre son contexte, d’exécuter une action et de renvoyer une réponse. Dans notre projet, le bot peut afficher un menu, rechercher des résultats d’examen, guider un bachelier, corriger un texte, générer un CV et analyser des documents pédagogiques.

Le but de ce cours n’est pas de recopier un projet existant. Il est de comprendre les décisions qui permettent de transformer une idée en application utile. À la fin du parcours, l’élève saura expliquer l’architecture du bot, créer un serveur Node.js, connecter un webhook Messenger, gérer une conversation par états, interroger une source externe, utiliser une base de données distante, déployer le projet et protéger les données.

### Compétences finales

| Domaine | Compétence attendue |
|---|---|
| Algorithmique | Décomposer un besoin en entrées, traitements, sorties et erreurs. |
| JavaScript | Écrire des fonctions asynchrones, conditions, objets, tableaux et modules. |
| Web | Comprendre HTTP, routes, requêtes POST, JSON et webhook. |
| Automatisation | Déclencher une action automatiquement à partir d’un message ou d’un événement. |
| Données | Stocker, rechercher et mettre à jour des informations dans Redis ou un fichier structuré. |
| Sécurité | Protéger les secrets, vérifier l’administrateur et limiter les actions sensibles. |
| Qualité | Tester la syntaxe, traiter les erreurs et documenter les choix. |
| Pédagogie numérique | Transformer une source autorisée en leçon, exercice ou fiche enseignant. |

### Prérequis

L’élève doit savoir utiliser un ordinateur, créer un dossier, lire un fichier texte et utiliser un navigateur. La connaissance préalable de JavaScript est utile mais non obligatoire. Le cours commence par les notions essentielles avant d’aborder Express, Messenger et Redis.

---

# Partie I — Penser comme un concepteur

## Leçon 1 — Partir d’un problème réel

Un bon projet informatique ne commence pas par une technologie. Il commence par une difficulté observée. Dans notre cas, les utilisateurs avaient besoin de consulter des résultats, de recevoir des conseils d’orientation et d’obtenir des services numériques depuis leur téléphone.

Avant d’écrire du code, on répond à cinq questions : qui utilise le service, quel problème rencontre-t-il, quelle réponse attend-il, quelles données sont nécessaires et quelles erreurs peuvent se produire ? Cette étape évite de construire une application impressionnante mais inutile.

### Exemple de cahier des charges

| Élément | Décision du projet |
|---|---|
| Utilisateur | Élève, parent, candidat ou administrateur. |
| Canal | Messenger, y compris une utilisation avec Facebook Lite. |
| Entrée | Texte, choix numérique, image, PDF ou message vocal. |
| Traitement | Compréhension du mode, recherche ou analyse du document. |
| Sortie | Réponse textuelle, lien, fichier ou notification. |
| Contraintes | Téléphone simple, connexion variable, données sensibles et quotas. |

### Travail pratique

Écrire le cahier des charges d’un bot qui aide les habitants d’une commune à trouver les horaires d’un service public. Décrire trois utilisateurs, cinq commandes et cinq erreurs possibles.

### Évaluation

Expliquer pourquoi « créer un bot avec une IA » n’est pas un cahier des charges suffisant. L’élève doit citer le public, le problème, les entrées, les sorties et les contraintes.

## Leçon 2 — Dessiner l’architecture

L’architecture décrit les composants et leurs relations. Le téléphone de l’utilisateur envoie un message à Messenger. Meta transmet l’événement au webhook de notre serveur. Le serveur identifie l’utilisateur, lit son état, exécute la logique appropriée et appelle éventuellement un service externe. Enfin, il envoie la réponse par l’API Messenger.

```text
Utilisateur
    |
    v
Messenger / Webhook Meta
    |
    v
Serveur Express Node.js
    |--------> Redis : états, crédits, résultats
    |--------> Portails officiels : recherches autorisées
    |--------> Modèle de langage : aide linguistique et pédagogique
    |
    v
Réponse Messenger
```

Il faut distinguer le code métier, les données, les services externes et l’interface. Cette séparation facilite les tests et empêche une modification locale de casser tout le bot.

### Vocabulaire

**Client :** appareil ou application qui demande un service. **Serveur :** programme qui reçoit et traite la demande. **API :** interface permettant à deux programmes de communiquer. **Webhook :** URL appelée automatiquement lorsqu’un événement se produit. **JSON :** format texte structuré utilisé pour échanger des données.

### Travail pratique

Dessiner sur papier l’architecture d’un bot météo. Indiquer au moins le client, le webhook, le serveur, la source météo et la réponse.

---

# Partie II — Construire le serveur

## Leçon 3 — Installer Node.js et organiser un projet

Node.js permet d’exécuter JavaScript côté serveur. Le fichier `package.json` décrit le projet et ses dépendances. Dans Tsarafandray Services, les principales dépendances sont Express pour le serveur, Axios pour les requêtes HTTP, Cheerio pour lire certaines pages HTML, Multer pour recevoir des fichiers, PDF-Parse et Mammoth pour extraire du texte, et PDFKit pour générer des PDF.

```bash
mkdir mon-bot
cd mon-bot
npm init -y
npm install express axios dotenv
```

Une organisation claire peut contenir `index.js` pour le serveur principal, des modules spécialisés pour l’orientation ou les résultats, un fichier `.env` pour les secrets et un dossier de tests.

> Le fichier `.env` ne doit jamais être publié. Les mots de passe, jetons et clés d’API ne doivent pas être écrits directement dans le code.

## Leçon 4 — Créer une route Express

Express reçoit les requêtes HTTP et choisit le traitement correspondant à leur méthode et à leur chemin.

```js
const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Tsarafandray Services' });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Serveur démarré');
});
```

La route `/health` est importante en production : elle permet de vérifier rapidement si le service répond. Une application professionnelle doit aussi prévoir les erreurs, les délais d’attente et les journaux utiles, sans afficher de secret.

### Travail pratique

Créer une route `/bonjour/:nom` qui répond en JSON. Ajouter un cas d’erreur lorsque le nom est absent ou trop court.

## Leçon 5 — Comprendre le webhook Messenger

Un webhook reçoit généralement deux types de requêtes. La requête GET sert à vérifier l’URL et le jeton de validation. La requête POST reçoit les événements, par exemple un message texte, un bouton, une image ou un fichier.

Le traitement logique est : vérifier la demande, parcourir les événements, récupérer l’identifiant de l’expéditeur, détecter le type de message, puis appeler le gestionnaire adapté.

```js
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});
```

Le serveur doit répondre rapidement à Messenger. Les traitements longs doivent être exécutés après l’accusé de réception ou dans une file de tâches lorsque le volume devient important.

---

# Partie III — Programmer une conversation fiable

## Leçon 6 — Les états de conversation

Un bot ne doit pas interpréter chaque message comme s’il était isolé. Si l’utilisateur a choisi la province de Toamasina, le message suivant « 2708320 » doit être compris comme une recherche dans cette province. Cette mémoire courte est appelée **état de conversation**.

```js
const userModes = {};

userModes[senderId] = {
  mode: 'recherche_bacc',
  province: 'toamasina'
};
```

Le champ `mode` indique la situation actuelle. Exemples : `chat`, `resultats_bacc`, `admin_menu`, `creation_cv` ou `admin_pedagogie_document`.

La règle essentielle est de ne pas activer une fonction sensible à partir d’un mot isolé dans une conversation sans contexte. Le mot « BACC » ne doit pas lancer une recherche si l’utilisateur n’est pas dans le mode résultats ou s’il n’a pas explicitement demandé ce service.

## Leçon 7 — Menus, boutons et Facebook Lite

Les boutons sont agréables dans Messenger, mais certains utilisateurs écrivent directement les choix ou utilisent Facebook Lite. Il faut donc accepter les deux formes : un payload de bouton et une commande numérique.

```js
const RACCOURCIS_NUM = {
  '1': 'MENU_BACC',
  '2': 'MENU_SERVICES',
  '3': 'MENU_ORIENTATION'
};
```

Chaque menu doit expliquer quoi écrire ensuite. Un bon message contient une action claire, un exemple et une manière de revenir en arrière. Il faut toujours prévoir `menu`, `quitter` ou `retour`.

### Travail pratique

Créer un menu de trois options utilisable à la fois avec des boutons et avec les chiffres 1, 2 et 3. Tester un choix invalide et un retour au menu.

## Leçon 8 — Recherche BACC et données fiables

Une recherche de résultat doit distinguer trois situations : résultat trouvé, candidat absent de la liste et résultats non encore publiés. « Introuvable » ne doit pas être utilisé lorsque la province est simplement désactivée par l’administrateur.

Les sources officielles peuvent avoir des fonctionnements différents. Certaines proposent un fichier ou une API lisible ; d’autres utilisent un formulaire, un CAPTCHA ou une protection anti-automatisation. Il faut respecter les conditions du site et ne pas inventer de résultat.

La configuration peut contenir le nom de la province, son état de disponibilité, l’URL officielle et la fonction de recherche. La recherche doit normaliser les noms et les matricules, mais conserver les informations originales dans la réponse.

> Un résultat douteux vaut mieux qu’une réponse fausse : le bot doit dire « introuvable » ou « à vérifier » plutôt que d’attribuer le résultat d’un autre candidat.

---

# Partie IV — Données, administration et automatisation

## Leçon 9 — Redis et la mémoire distante

Un serveur gratuit peut redémarrer. Une variable en mémoire peut alors être perdue. Redis permet de stocker les états, les crédits, les résultats et les indicateurs de disponibilité dans un espace distant.

Une clé doit avoir un nom prévisible et une donnée clairement structurée. Exemples : `availability:toamasina`, `credits:<id>` et `reference:doc:<id>`.

Toute donnée lue doit être vérifiée avant `JSON.parse`. Toute donnée sensible doit être limitée à l’utilisateur autorisé. Les fichiers temporaires doivent être supprimés après traitement.

## Leçon 10 — Construire un espace administrateur

L’administration permet de générer des crédits, importer une liste, activer une province, envoyer une alerte et gérer les références. Ces fonctions ne doivent jamais être accessibles uniquement parce qu’un utilisateur a écrit « admin ».

Le flux recommandé est : commande admin, identifiant, mot de passe, vérification, création d’une session admin et expiration de cette session. Le mot de passe doit être une variable d’environnement. Les actions doivent être journalisées sans enregistrer le mot de passe.

La séparation admin–utilisateur est une règle de sécurité et de conception. Toliara peut rester disponible dans l’espace admin tout en affichant un message spécial côté utilisateur ; cette décision doit être explicitement représentée dans le code.

## Leçon 11 — Notifications et surveillance

Un watcher est un programme qui vérifie périodiquement une source. Il compare l’état actuel avec l’état précédent, puis déclenche une action uniquement lors d’un changement réel. Sans cette comparaison, le bot risque d’envoyer la même alerte toutes les quinze minutes.

```text
Toutes les 15 minutes
        |
Lire la source officielle
        |
Résultats nouveaux ?
   | oui          | non
Publier/alerter   Attendre
```

Il faut respecter les limites du site, prévoir les erreurs réseau, éviter les boucles agressives et fournir une commande admin pour activer ou désactiver la diffusion.

## Leçon 12 — GitHub et Render

Git enregistre l’historique du code. Une petite modification doit être testée avant d’être commitée.

```bash
git status
git diff --check
node --check index.js
git add index.js educational_engine.js
git commit -m "Ajoute une fonctionnalite"
git push origin main
```

Render peut reconstruire et redémarrer le service après un push sur `main`. Les variables d’environnement doivent être configurées dans Render, et non dans GitHub. En cas d’erreur, on lit les journaux : port utilisé, module absent, variable manquante, quota dépassé ou erreur d’API.

---

# Partie V — IA, documents et pédagogie

## Leçon 13 — Utiliser l’IA avec contrôle humain

Un modèle de langage peut aider à corriger, résumer, traduire ou produire une structure, mais il peut se tromper. Le développeur doit donc fournir un contexte précis, limiter la taille des données, demander un format déterminé et contrôler le résultat.

Une consigne professionnelle impose notamment : ne pas inventer, conserver les formules et noms propres, distinguer la source des exemples et marquer les passages incertains. Pour le malgache, le système doit éviter les traductions littérales étranges et signaler les termes techniques qui nécessitent une validation humaine.

## Leçon 14 — Transformer un document en leçon

Le module pédagogique suit plusieurs étapes : réception d’un document autorisé, extraction du texte, contrôle de lisibilité, découpage en segments, adaptation au niveau, génération de la leçon, contrôle et relecture.

La transformation ne signifie pas reproduire un livre protégé. Elle consiste à expliquer une notion, créer une structure pédagogique originale et citer la source lorsque cela est possible. Les documents doivent être libres de droits, fournis par l’administrateur ou utilisés avec autorisation.

### Structure d’une leçon

| Section | Question pédagogique |
|---|---|
| Objectifs | Que l’élève saura-t-il faire à la fin ? |
| Prérequis | Que doit-il déjà connaître ? |
| Vocabulaire | Quels mots doivent être compris ? |
| Explication | Quelle notion est construite progressivement ? |
| Exemple | Comment relier la notion à une situation réelle ? |
| Activités | Comment l’élève va-t-il pratiquer ? |
| Corrigé | Comment vérifier le raisonnement ? |
| Évaluation | Quelle preuve de compréhension demande-t-on ? |
| À vérifier | Quelles limites ou incertitudes subsistent ? |

## Leçon 15 — Produire du malgache pédagogique de qualité

La qualité du malgache ne se résume pas à traduire chaque mot. Il faut respecter la construction de la phrase, le registre, le vocabulaire scolaire et le sens de la notion. Une phrase techniquement correcte mais inhabituelle pour un enseignant peut nuire à la compréhension.

La méthode recommandée est de produire une version française contrôlée, une version malgache naturelle, puis un glossaire bilingue. Pour les termes sans équivalent établi, conserver le terme international entre parenthèses est préférable à une traduction inventée.

Avant publication, un locuteur compétent doit relire : les titres, les consignes, les définitions, les exemples, les exercices, les corrigés et les nombres. Le bot doit afficher qu’un contenu généré automatiquement doit être vérifié avant son utilisation en classe.

---

# Partie VI — Qualité, sécurité et projet final

## Leçon 16 — Tester comme un professionnel

Un test ne consiste pas seulement à vérifier le cas heureux. Pour une recherche BACC, on teste un numéro valide, un nom accentué, un nom inexistant, une province désactivée, une province inconnue, un site indisponible et deux recherches successives.

Pour un administrateur, on teste un mauvais identifiant, un mauvais mot de passe, une session expirée, une pièce jointe illisible et un fichier trop volumineux. Pour le malgache, on teste les caractères accentués, les mots composés et les phrases longues.

```bash
node --check index.js
node --check educational_engine.js
git diff --check
```

Les tests doivent aussi vérifier que les erreurs sont expliquées à l’utilisateur sans exposer la clé API, le mot de passe, l’URL privée ou la trace complète du serveur.

## Leçon 17 — Protéger les utilisateurs

Le bot traite parfois des matricules, noms, fichiers et conversations. Il faut collecter uniquement ce qui est nécessaire, éviter de conserver des données sans raison, supprimer les fichiers temporaires et prévoir une manière de demander l’effacement.

Les secrets doivent être stockés dans des variables d’environnement. Les routes d’administration doivent vérifier l’authentification. Les services externes doivent être utilisés conformément à leurs conditions. Un CAPTCHA, un paywall ou une restriction de téléchargement ne doit pas être contourné.

## Projet final — Construire un mini-assistant automatisé

L’élève doit créer un bot ou une application qui propose trois services : un menu, une recherche dans une petite base de données et un mode administrateur. Le projet doit être réalisé avec Node.js et Express, recevoir au moins une requête JSON, utiliser un état de conversation et traiter une erreur.

### Livrables

1. Un schéma d’architecture.
2. Un cahier des charges de deux pages.
3. Le code commenté.
4. Une liste de tests.
5. Une courte vidéo ou démonstration orale.
6. Une réflexion sur la sécurité et les limites.

### Barème proposé

| Critère | Points |
|---|---:|
| Analyse du besoin et architecture | 15 |
| Fonctionnement du serveur | 20 |
| Gestion de la conversation | 20 |
| Traitement des erreurs | 15 |
| Sécurité et respect des données | 15 |
| Qualité de la documentation et présentation | 15 |
| **Total** | **100** |

---

# Glossaire essentiel

**Asynchrone :** opération dont le résultat arrive plus tard, par exemple une requête réseau. **Backend :** partie serveur d’une application. **Captcha :** contrôle destiné à distinguer un humain d’un programme automatisé. **Commit :** enregistrement d’un ensemble de modifications Git. **Endpoint :** adresse d’une fonction accessible par HTTP. **OCR :** reconnaissance de caractères dans une image. **Payload :** données transportées par un bouton ou un événement. **Proxy :** serveur intermédiaire ; son utilisation doit respecter les règles du service ciblé. **Scraping :** extraction automatisée de données d’une page ; elle doit être autorisée et raisonnable. **Session :** période pendant laquelle un utilisateur conserve un état de conversation ou une authentification. **Webhook :** adresse appelée automatiquement par un service externe.

# Méthode de travail recommandée pour l’enseignant

Chaque séance doit commencer par une situation concrète, continuer par une explication courte, puis proposer une manipulation. L’enseignant doit demander aux élèves de prédire le résultat avant d’exécuter le code. Après l’exécution, les élèves comparent la prédiction et l’observation. Cette méthode transforme les erreurs en occasions d’apprentissage.

Il est préférable de construire progressivement un seul projet plutôt que de présenter dix exemples sans lien. Le bot de démonstration doit être simplifié pour la classe : les clés privées et les données réelles ne doivent jamais être distribuées aux élèves. On utilise des données fictives et des comptes de test.

> Un développeur professionnel ne se reconnaît pas seulement à la quantité de code écrite. Il se reconnaît à sa capacité à expliquer ses choix, tester ses limites, protéger les utilisateurs et corriger proprement ses erreurs.

# Conclusion

La création de Tsarafandray Services montre qu’un service numérique complet naît de plusieurs compétences réunies : analyse, programmation, communication web, données, automatisation, sécurité, rédaction et pédagogie. L’IA peut accélérer certaines tâches, mais la qualité finale dépend toujours de la vérification humaine et de la responsabilité du concepteur.

Ce cours peut ensuite être divisé en séances hebdomadaires. Les premiers chapitres conviennent aux débutants ; les webhooks, Redis, déploiements et contrôles pédagogiques conviennent à un niveau intermédiaire. Chaque classe peut créer une version plus simple, puis l’améliorer à la manière d’une équipe professionnelle.

**Fin du support de cours — version pédagogique initiale.**
