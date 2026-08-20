// Script de surveillance automatique et publication - BACC Toamasina 2026
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const URL_TOAMASINA = 'https://bacc.univ-toamasina.mg/';
const STATUT_CONFIG = './admin_config.json';
const IMAGE_AFFICHE = './emeraldo_toamasina.png';

async function publierSurFacebook(message) {
    const pageId = process.env.FB_PAGE_ID;
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
        console.log('⚠️ FB_PAGE_ID ou FB_PAGE_ACCESS_TOKEN non configuré. Publication Facebook ignorée.');
        return false;
    }

    try {
        if (fs.existsSync(IMAGE_AFFICHE)) {
            // Publier une photo avec légende
            const form = new FormData();
            form.append('source', fs.createReadStream(IMAGE_AFFICHE));
            form.append('caption', message);
            form.append('access_token', accessToken);

            const url = `https://graph.facebook.com/v18.0/${pageId}/photos`;
            const res = await axios.post(url, form, { headers: form.getHeaders() });
            console.log('✅ Affiche publiée avec succès sur Facebook ! ID:', res.data.id);
            return true;
        } else {
            // Publier un message texte si l'image n'est pas trouvée
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
        const response = await axios.get(URL_TOAMASINA, { timeout: 10000 });
        const html = response.data;

        // Si le texte "pas encore disponible" n'est plus présent
        const dispo = !html.includes('pas encore disponible') && !html.includes('Mbola tsy vonona');
        
        if (dispo) {
            console.log('🎉 RÉSULTATS TOAMASINA DISPONIBLES EN LIGNE !');
            
            // Mettre à jour la configuration admin automatiquement
            let config = {};
            if (fs.existsSync(STATUT_CONFIG)) {
                config = JSON.parse(fs.readFileSync(STATUT_CONFIG, 'utf-8'));
            }
            
            // Si déjà activé, ne pas republier
            if (config.toamasina_disponible) {
                console.log('ℹ️ Toamasina était déjà marqué comme disponible.');
                return true;
            }

            config.toamasina_disponible = true;
            fs.writeFileSync(STATUT_CONFIG, JSON.stringify(config, null, 2));
            console.log('✅ Mode admin mis à jour : Toamasina activé automatiquement.');
            
            // Publier automatiquement sur Facebook avec l'affiche
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

module.exports = { verifierDisponibiliteToamasina, publierSurFacebook };
