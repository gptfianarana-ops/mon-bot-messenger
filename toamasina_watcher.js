// Script de surveillance automatique et publication - BACC Toamasina 2026
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const URL_TOAMASINA = 'https://bacc.univ-toamasina.mg/';
const IMAGE_AFFICHE = './emeraldo_toamasina.png';

// Ces fonctions seront injectées depuis index.js
let redisGetFunc = null;
let redisSetFunc = null;
let activerResultatsFunc = null;

function injecterDependances(get, set, activer) {
    redisGetFunc = get;
    redisSetFunc = set;
    activerResultatsFunc = activer;
}

async function publierSurFacebook(message) {
    const pageId = process.env.FB_PAGE_ID;
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
        console.log('⚠️ FB_PAGE_ID ou FB_PAGE_ACCESS_TOKEN non configuré. Publication Facebook ignorée.');
        return false;
    }

    try {
        if (fs.existsSync(IMAGE_AFFICHE)) {
            const form = new FormData();
            form.append('source', fs.createReadStream(IMAGE_AFFICHE));
            form.append('caption', message);
            form.append('access_token', accessToken);

            const url = `https://graph.facebook.com/v18.0/${pageId}/photos`;
            const res = await axios.post(url, form, { headers: form.getHeaders() });
            console.log('✅ Affiche publiée avec succès sur Facebook ! ID:', res.data.id);
            return true;
        } else {
            const url = `https://graph.facebook.com/v18.0/${pageId}/feed`;
            const res = await axios.post(url, {
                message: message,
                access_token: accessToken
            });
            console.log('✅ Message publié avec succès sur Facebook ! ID:', res.data.id);
            return true;
        }
    } catch (err) {
        console.error('❌ Erreur lors de la publication Facebook:', err.response?.data || err.message);
        return false;
    }
}

async function verifierDisponibiliteToamasina() {
    try {
        console.log(`[${new Date().toISOString()}] Vérification du site Toamasina...`);
        const response = await axios.get(URL_TOAMASINA, { timeout: 15000 });
        const html = response.data;

        // Détection plus robuste : si le formulaire de recherche existe et que le message d'attente n'y est plus
        const aFormulaire = html.includes('id="search_field"') || html.includes('search_type');
        const estPret = !html.includes('pas encore disponible') && !html.includes('Mbola tsy vonona');
        
        if (aFormulaire && estPret) {
            console.log('🎉 RÉSULTATS TOAMASINA DÉTECTÉS !');
            
            // Vérifier le statut actuel via Redis
            const dejaDispo = await redisGetFunc('bacc_available:toamasina');
            if (dejaDispo === '1') {
                console.log('ℹ️ Toamasina est déjà actif dans le bot.');
                return true;
            }

            // Activation automatique dans le bot (Redis + Notifications)
            console.log('🚀 Activation automatique de Toamasina...');
            const nbNotifs = await activerResultatsFunc('toamasina');
            console.log(`✅ Toamasina activé ! ${nbNotifs} notifications envoyées.`);
            
            // Publication Facebook
            const message = `🚨 𝗕𝗥𝗘𝗔𝗞𝗜𝗡𝗚 𝗡𝗘𝗪𝗦 ! 𝗥𝗘́𝗦𝗨𝗟𝗧𝗔𝗧 𝗕𝗔𝗖𝗖 𝗧𝗢𝗔𝗠𝗔𝗦𝗜𝗡𝗔 𝟮𝟬𝟮𝟲\n\n` +
                            `📢 Efa afaka jerena atao ny valim-panadinana Baccalauréat ho an'ny Faritra Toamasina !\n\n` +
                            `👉 Midira mivantana ao amin'ny Bot Messenger **Tsarafandray Services** mba hijery ny anaranao na ny laharan'ny mpiadinao avy hatrany.\n\n` +
                            `🔔 Aza adino ny manaraka (Abonné) ny pejy raha te hahazo ny vaovao haingana indrindra !\n` +
                            `#TsarafandrayServices #BACC2026 #Toamasina #Madagascar`;
            
            await publierSurFacebook(message);
            
            return true;
        } else {
            console.log('⏳ Résultats de Toamasina toujours en attente sur le site officiel.');
        }
    } catch (err) {
        console.error('⚠️ Erreur lors de la vérification Toamasina:', err.message);
    }
    return false;
}

module.exports = { verifierDisponibiliteToamasina, injecterDependances };
