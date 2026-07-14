// Script à lancer UNE SEULE FOIS (en local ou sur Render via "Shell")
// pour configurer le bouton "Get Started" et le menu persistant (icône ☰).
// Usage : node setup-menu.js

const axios = require('axios');
require('dotenv').config();

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

async function setup() {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        get_started: { payload: 'GET_STARTED' },
        greeting: [
          {
            locale: 'default',
            text: 'Bienvenue ! Je suis ton assistant : correction de texte, résultats BEPC/CEPE, exercices et traduction. Appuie sur Commencer pour voir le menu.',
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

setup();
