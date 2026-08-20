import sys

with open('/home/ubuntu/mon-bot-messenger/index.js', 'r') as f:
    content = f.read()

# 1. Mettre à jour MENU_QUICK_REPLIES pour ajouter "👤 Olona (Admin)"
old_qr = """const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '🎓 Résultats', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '💼 Nos Services', payload: 'MENU_SERVICES' },
  { content_type: 'text', title: '🎓 Hianatra', payload: 'MENU_HIANATRA' },
  { content_type: 'text', title: '📝 Correction', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🌐 Traduction', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Chat IA', payload: 'CHAT_IA' },
];"""

new_qr = """const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '🎓 Résultats', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '💼 Services', payload: 'MENU_SERVICES' },
  { content_type: 'text', title: '👤 Olona (Admin)', payload: 'MENU_HUMAIN' },
  { content_type: 'text', title: '🎓 Hianatra', payload: 'MENU_HIANATRA' },
  { content_type: 'text', title: '💬 Chat IA', payload: 'CHAT_IA' },
];"""

content = content.replace(old_qr, new_qr)

# 2. Mettre à jour envoyerMenu pour inclure explicitement l'option Olona / Parler à l'admin
old_envoyer_menu = """async function envoyerMenu(senderId, texteIntro) {
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
    `2️⃣ 💼 Services Pro (CV, Mémoire, Bac)\\n` +
    `3️⃣ 🎓 Hianatra (Apprentissage & Leçons)\\n` +
    `4️⃣ 👤 **Parler à un humain (Olona)**\\n` +
    `5️⃣ 💬 Chat IA & Assistance\\n\\n` +
    `👉 Tapez un numéro ou utilisez les boutons ci-dessous.`;
  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}"""

content = content.replace(old_envoyer_menu, new_envoyer_menu)

# 3. Ajouter la gestion de MENU_HUMAIN dans handleEvent
old_handle_start = """  if (peutChanger) {
    // ---------- MENU SERVICES ----------"""

new_handle_start = """  if (peutChanger) {
    // ---------- MENU HUMAIN (OLONA) ----------
    if (texteOuPayload === 'MENU_HUMAIN' || texteOuPayload === '4' || /^olona$|^humain$|^admin human$|^contact$/i.test(texteOuPayload)) {
      userModes[senderId] = { mode: 'chat_humain' };
      await sendMessage(senderId,
        `👤 **MODE CONTACT HUMAIN (OLONA)**\\n\\n` +
        `Vous souhaitez parler directement à l'équipe de **Tsarafandray Services** ?\\n` +
        `Laissez votre message ici, notre équipe vous répondra dans les plus brefs délais sur Messenger !\\n\\n` +
        `*(Tapez "menu" ou cliquez sur le bouton pour revenir au bot automatique)*`,
        [{ content_type: 'text', title: '🔁 Menu Principal', payload: 'GET_STARTED' }]
      );
      return;
    }

    // ---------- MENU SERVICES ----------"""

content = content.replace(old_handle_start, new_handle_start)

# 4. Gérer le like sticker Facebook (ignorer ou remercier poliment au lieu de lancer l'OCR image)
old_image_event = """      if (imageAttachment) {
        handleImageEvent(senderId, imageAttachment.payload.url).catch(e => console.error(e));
      }"""

new_image_event = """      if (imageAttachment) {
        // Vérifier si c'est un sticker like / pouce bleu (souvent une URL fbcdn avec un sticker spécifique ou un sticker_id dans l'event)
        const urlLower = imageAttachment.payload.url.toLowerCase();
        if (urlLower.includes('sticker') || event.message?.sticker_id) {
          await sendMessage(senderId, "👍 Merci pour votre réaction ! Comment puis-je vous aider aujourd'hui ? 😊", BOUTON_MENU);
        } else {
          handleImageEvent(senderId, imageAttachment.payload.url).catch(e => console.error(e));
        }
      }"""

content = content.replace(old_image_event, new_image_event)

with open('/home/ubuntu/mon-bot-messenger/index.js', 'w') as f:
    f.write(content)

print("SUCCESS: Olona and sticker patch applied!")
