// Script de configuration du menu persistant et du bouton "Get Started"
const axios = require('axios');
require('dotenv').config();

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

async function setupMenu() {
  if (!PAGE_ACCESS_TOKEN) {
    console.error('Erreur : PAGE_ACCESS_TOKEN non défini dans les variables d environnement.');
    return;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        get_started: { payload: 'GET_STARTED' },
        greeting: [
          {
            locale: 'default',
            text: 'Bienvenue ! Je suis ton assistant : apprentissage (Hianatra), résultats BACC/BEPC/CEPE, correction de texte et traduction. Appuie sur Commencer pour voir le menu.',
          },
        ],
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              { type: 'postback', title: '📝 Corriger un texte', payload: 'MENU_CORRECTION' },
              { type: 'postback', title: '🎓 Résultats examens', payload: 'MENU_RESULTATS' },
              { type: 'postback', title: '📚 Exercices', payload: 'MENU_EXERCICES' },
              { type: 'postback', title: '🌐 Traducteur', payload: 'MENU_TRADUCTION' },
              { type: 'postback', title: '🎓 Hianatra (Apprendre)', payload: 'MENU_HIANATRA' },
            ],
          },
        ],
      }
    );
    console.log('Configuration réussie :', response.data);
  } catch (err) {
    console.error('Erreur configuration menu:', err.response?.data || err.message);
  }
}

// Permet de l'exécuter soit en ligne de commande (node setup-menu.js), soit via require
if (require.main === module) {
  setupMenu();
}

module.exports = { setupMenu };
