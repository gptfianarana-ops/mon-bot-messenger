# Journal des améliorations autonomes

Ce journal conserve la trace des contrôles et modifications effectués par le cycle autonome. Une modification de code doit toujours être accompagnée de tests, d’un commit identifiable et d’une vérification de déploiement.

## Règles

Le cycle ne modifie jamais les tokens, les secrets, les webhooks Messenger, les permissions Facebook, les paramètres de paiement, les données de résultats BACC ni les décisions d’activation publique sans validation humaine explicite. Il ne lance pas d’envoi massif de messages, de likes, de commentaires ou de notifications. Toute modification doit passer par la vérification de syntaxe et les tests disponibles. En cas d’échec, le cycle conserve le journal et n’effectue aucun déploiement.

## Format d’une entrée

`AAAA-MM-JJ HH:MM UTC — type — résultat — commit ou motif d’absence de commit`

## Historique

`2026-09-05 — installation du cadre de suivi — tests horaires et limites de sécurité préparés — commit à venir`

`2026-09-05 20:46 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-05` — moteur conversationnel — ajout de la détection naturelle pour agronomie, médecine vétérinaire, ENS, environnement, formations et demandes de filière ; séparation renforcée entre orientation et aide informatique — 15 scénarios du routeur validés.

`2026-09-05` — moteur d’orientation — détection exacte des séries A1/A2/L/C/D/S/OSE/Technique ; formulations universitaires rendues prudentes ; durées et admissions signalées comme variables à vérifier — tests d’orientation, routeur et traduction validés.

`2026-09-10` — module Enseignant / Mpampianatra — ajout d’un parcours dédié dans le menu (raccourci 8) pour générer une fiche de préparation, une répartition annuelle, un contenu de cours ou une évaluation ; collecte guidée du niveau T1–T12, de la matière, du thème, de la durée et de la série L/S/OSE ; avertissement obligatoire sur la vérification des référentiels officiels — tests dédiés ajoutés.
`2026-09-10` — réforme scolaire — ajout du dossier `reforme_programme_malgache_2026.md` avec sources consultées et séparation entre informations officielles à confirmer, presse et propositions pédagogiques générées.

`2026-09-10 05:10 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-10` — module Enseignant / Mpampianatra — ajout d’un parcours dédié dans le menu (raccourci 8) pour générer une fiche de préparation, une répartition annuelle, un contenu de cours ou une évaluation ; collecte guidée du niveau T1–T12, de la matière, du thème, de la durée et de la série L/S/OSE ; avertissement obligatoire sur la vérification des référentiels officiels — tests dédiés ajoutés.
`2026-09-10` — réforme scolaire — ajout du dossier `reforme_programme_malgache_2026.md` avec sources consultées et séparation entre informations officielles à confirmer, presse et propositions pédagogiques générées.

`2026-09-10` — contrôle Admin de l’outil Enseignant — ajout du drapeau persistant `feature:teacher_tools_enabled`, désactivé par défaut. Le public ne voit pas l’entrée 8 tant que l’Admin n’utilise pas `enseignant on`. Commandes ajoutées : `enseignant on`, `enseignant off`, `enseignant status` et `enseignant test`. Les tests Admin restent possibles sans ouverture publique.

`2026-09-10 09:40 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-10 14:24 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-10 18:24 UTC` — contrôle horaire — OK — syntax and tests passed
