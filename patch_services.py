import sys

with open('/home/ubuntu/mon-bot-messenger/index.js', 'r') as f:
    content = f.read()

# 1. Mise à jour des Quick Replies
old_qr = """const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '📝 Corriger un texte', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🖊️ Corriger un exercice', payload: 'MENU_CORRECTION_EXERCICES' },
  { content_type: 'text', title: '🎓 Résultats examens', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '📚 Exercices', payload: 'MENU_EXERCICES' },
  { content_type: 'text', title: '🌐 Traducteur', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Discuter librement', payload: 'MENU_CHAT' },
  { content_type: 'text', title: '🔑 Activer un code', payload: 'MENU_CODE' },
  { content_type: 'text', title: '📄 Créer mon CV', payload: 'MENU_CV' },
  { content_type: 'text', title: '🧮 Simulateur Bac', payload: 'MENU_BAC' },
  { content_type: 'text', title: '🎓 Hianatra (Apprendre)', payload: 'MENU_HIANATRA' },
  { content_type: 'text', title: '📖 Rédaction Mémoire', payload: 'MENU_MEMOIRE' },
];"""

new_qr = """const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '🎓 Résultats', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '💼 Nos Services', payload: 'MENU_SERVICES' },
  { content_type: 'text', title: '🎓 Hianatra', payload: 'MENU_HIANATRA' },
  { content_type: 'text', title: '📝 Correction', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🌐 Traduction', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Chat IA', payload: 'CHAT_IA' },
];"""

content = content.replace(old_qr, new_qr)

# 2. Mise à jour de envoyerMenu
old_envoyer_menu = """async function envoyerMenu(senderId, texteIntro) {
  const profile = await getProfile(senderId);
  const xp = await getXP(senderId);
  const level = await getLevel(senderId);
  const niveauTitre = SEUILS_NIVEAUX.find(s => s.niveau === level)?.titre || '';
  const nom = profile?.nom || '';
  const texte = `${texteIntro || '👋 Salut ! Que veux-tu faire ?'}\\n\\n${nom ? `Bonjour ${nom} ! ` : ''}Niveau ${level} (${niveauTitre}) | XP : ${xp}\\n\\n` +
    `🔔 Pour être alerté des résultats : tapez "alerte [province]" (ex: alerte itasy)\\n\\n` +
    `1️⃣ 🎓 Résultats examens\\n` +
    `2️⃣ 📝 Corriger un texte\\n` +
    `3️⃣ 📚 Exercices\\n` +
    `4️⃣ 🌐 Traducteur\\n` +
    `5️⃣ 💬 Discuter librement\\n` +
    `6️⃣ 🖊️ Corriger un exercice (texte ou photo)\\n` +
    `7️⃣ 🔑 Activer un code\\n` +
    `8️⃣ 📄 Créer mon CV (premium)\\n` +
    `9️⃣ 🧮 Simulateur Bac (premium)\\n` +
    `🔟 📖 Rédaction Mémoire (premium)`;
  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}"""

new_envoyer_menu = """async function envoyerMenu(senderId, texteIntro) {
  const profile = await getProfile(senderId);
  const xp = await getXP(senderId);
  const level = await getLevel(senderId);
  const niveauTitre = SEUILS_NIVEAUX.find(s => s.niveau === level)?.titre || '';
  const nom = profile?.nom || '';
  const texte = `${texteIntro || '👋 Bienvenue chez Tsarafandray Services !'}\\n\\n` +
    `${nom ? `Ravi de vous revoir, ${nom} ! ` : ''}Niveau ${level} | XP : ${xp}\\n\\n` +
    `🚀 **NOS SERVICES PRINCIPAUX**\\n` +
    `1️⃣ 🎓 Résultats BACC/BEPC/CEPE\\n` +
    `2️⃣ 💼 Services Pro & Premium (CV, Mémoire, Bac)\\n` +
    `3️⃣ 🎓 Hianatra (Apprentissage Informatique, Langues, Leçons)\\n` +
    `4️⃣ 📝 Correction & Traduction\\n` +
    `5️⃣ 💬 Chat IA & Assistance\\n\\n` +
    `👉 Tapez un numéro ou utilisez les boutons ci-dessous.`;
  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}"""

content = content.replace(old_envoyer_menu, new_envoyer_menu)

# 3. Ajout du handler MENU_SERVICES dans handleEvent
old_handle_event_start = """  if (peutChanger) {
    // ---------- MENU MEMOIRE ----------"""

new_handle_event_start = """  if (peutChanger) {
    // ---------- MENU SERVICES ----------
    if (texteOuPayload === 'MENU_SERVICES' || texteOuPayload === '2' || /^services$|^pro$/i.test(texteOuPayload)) {
      const credits = await obtenirCredits(senderId);
      await sendMessage(senderId,
        `💼 **SERVICES PROFESSIONNELS & PREMIUM**\\n\\n` +
        `Boostez votre carrière et vos études avec nos outils spécialisés :\\n\\n` +
        `📄 **Création de CV Pro** : Un CV moderne en PDF prêt à l'emploi.\\n` +
        `📖 **Rédaction de Mémoire** : Accompagnement complet (Licence, Master, CAPEN).\\n` +
        `🧮 **Simulateur BACC** : Calculez vos points et chances de réussite.\\n` +
        `🔑 **Codes & Crédits** : Gérez vos accès aux fonctions premium.\\n\\n` +
        `💳 Vos crédits actuels : ${credits}\\n\\n` +
        `Choisissez un service :`,
        [
          { content_type: 'text', title: '📄 Créer un CV', payload: 'MENU_CV' },
          { content_type: 'text', title: '📖 Mémoire Pro', payload: 'MENU_MEMOIRE' },
          { content_type: 'text', title: '🧮 Simulateur Bac', payload: 'MENU_BAC' },
          { content_type: 'text', title: '🔑 Activer Code', payload: 'MENU_CODE' },
        ]
      );
      return;
    }

    // ---------- MENU MEMOIRE ----------"""

content = content.replace(old_handle_event_start, new_handle_event_start)

# 4. Correction des raccourcis numériques
old_raccourcis = """const RACCOURCIS_NUM = { 
  1:'MENU_RESULTATS', 
  2:'MENU_CORRECTION', 
  3:'MENU_EXERCICES', 
  4:'MENU_TRADUCTION', 
  5:'MENU_CHAT', 
  6:'MENU_CORRECTION_EXERCICES', 
  7:'MENU_CODE', 
  8:'MENU_CV', 
  9:'MENU_BAC', 
  10:'MENU_MEMOIRE', 
  11:'MENU_HIANATRA' 
};"""

new_raccourcis = """const RACCOURCIS_NUM = { 
  1:'MENU_RESULTATS', 
  2:'MENU_SERVICES', 
  3:'MENU_HIANATRA', 
  4:'MENU_CORRECTION', 
  5:'MENU_CHAT', 
  6:'MENU_TRADUCTION',
  7:'MENU_CODE'
};"""

content = content.replace(old_raccourcis, new_raccourcis)

with open('/home/ubuntu/mon-bot-messenger/index.js', 'w') as f:
    f.write(content)
