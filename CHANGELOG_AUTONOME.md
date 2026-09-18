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
`2026-09-10 21:35 UTC` — contrôle horaire — OK — syntax and tests passed
`2026-09-11 00:07 UTC` — contrôle horaire — OK — syntax and tests passed
`2026-09-11 04:34 UTC` — contrôle horaire — OK — syntax and tests passed
`2026-09-11` — référentiel pédagogique — téléchargement contrôlé de 25 documents publics Drive : 13 programmes d’études et 12 répartitions annuelles RAPE, représentant 3 891 pages ; création d’un index par niveau, matière, source et série, ainsi qu’un corpus compressé de 2,0 Mo exploitable par le moteur Enseignant ; ajout de recherches et tests T5, T11/OSE et T12/S. L’outil Enseignant reste désactivé pour le public et l’intégration est destinée au mode Admin/test.
`2026-09-11 06:56 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-11 09:37 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-11 14:23 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-11 18:29 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-11 21:41 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 00:15 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 04:34 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 09:16 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 12:53 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 16:17 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 19:18 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 22:14 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-12 23:59 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-13 04:41 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-13 10:13 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-13 14:21 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-13 18:10 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-13 20:45 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-13 23:07 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-14 01:01 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-14 06:14 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-14 12:44 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-14 18:35 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-14 22:28 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-15 01:25 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-15 07:40 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-15 13:30 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-15 18:09 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-15 21:17 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-16 00:16 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-16 04:50 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-16 09:54 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-16 14:56 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-16 18:52 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-16 22:08 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-17 00:27 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-17 06:07 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-17 11:36 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-17 16:56 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-17 20:18 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-17 23:32 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-18 04:38 UTC` — contrôle horaire — OK — syntax and tests passed

`2026-09-18 09:42 UTC` — contrôle horaire — OK — syntax and tests passed
