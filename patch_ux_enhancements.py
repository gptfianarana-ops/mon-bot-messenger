import sys

with open('/home/ubuntu/mon-bot-messenger/index.js', 'r') as f:
    content = f.read()

# 1. Redéfinition de BOUTON_MENU avec des options plus riches (Menu principal, Autre recherche)
old_bouton_menu = "const BOUTON_MENU = [{ content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }];"
new_bouton_menu = """const BOUTON_MENU = [
  { content_type: 'text', title: '🔁 Menu Principal', payload: 'GET_STARTED' },
  { content_type: 'text', title: '🎓 Résultats', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '💼 Services', payload: 'MENU_SERVICES' }
];"""

content = content.replace(old_bouton_menu, new_bouton_menu)

# 2. Ajout de la gestion des messages de remerciement ou de sortie au début du traitement global
# Cherchons le début de la fonction principale de traitement des messages ou événements
old_handle_start = """  // ============================================================
  // SWITCH DES MODES ACTIFS
  // ============================================================
  switch (etat.mode) {"""

new_handle_start = """  // Gestion intelligente des mots clés conversationnels (merci, salut, aide) même en mode actif
  const txtClean = texteOuPayload.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
  if (/^(merci|misaotra|thank|thanks|ok|d'accord|dac|c'est cool|top|bien joué)$/i.test(txtClean)) {
    userModes[senderId] = { mode: 'chat' };
    await sendMessage(senderId, "🙏 Avec grand plaisir ! N'hésite pas si tu as besoin d'autres services ou résultats chez Tsarafandray Services. 😊", BOUTON_MENU);
    return;
  }
  if (/^(bonjour|salio|salut|coucou|hello|re)$/i.test(txtClean)) {
    userModes[senderId] = { mode: 'chat' };
    return envoyerMenu(senderId, "👋 Bonjour ! Ravi de vous revoir chez Tsarafandray Services.");
  }

  // ============================================================
  // SWITCH DES MODES ACTIFS
  // ============================================================
  switch (etat.mode) {"""

content = content.replace(old_handle_start, new_handle_start)

with open('/home/ubuntu/mon-bot-messenger/index.js', 'w') as f:
    f.write(content)

print("SUCCESS: UX enhancements patch applied!")
