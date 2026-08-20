// Script de surveillance automatique - BACC Toamasina 2026
const axios = require('axios');
const fs = require('fs');

const URL_TOAMASINA = 'https://bacc.univ-toamasina.mg/';
const STATUT_CONFIG = './admin_config.json';

async function verifierDisponibiliteToamasina() {
    try {
        console.log(`[${new Date().toISOString()}] Vérification du site Toamasina...`);
        const response = await axios.get(URL_TOAMASINA, { timeout: 10000 });
        const html = response.data;

        // Si le texte "pas encore disponible" n'est plus présent ou si le formulaire de recherche est actif
        const dispo = !html.includes('pas encore disponible') && !html.includes('Mbola tsy vonona');
        
        if (dispo) {
            console.log('🎉 RÉSULTATS TOAMASINA DISPONIBLES EN LIGNE !');
            
            // Mettre à jour la configuration admin automatiquement
            let config = {};
            if (fs.existsSync(STATUT_CONFIG)) {
                config = JSON.parse(fs.readFileSync(STATUT_CONFIG, 'utf-8'));
            }
            config.toamasina_disponible = true;
            fs.writeFileSync(STATUT_CONFIG, JSON.stringify(config, null, 2));
            console.log('✅ Mode admin mis à jour : Toamasina activé automatiquement.');
            
            return true;
        } else {
            console.log('⏳ Résultats de Toamasina toujours en attente sur le site officiel.');
        }
    } catch (err) {
        console.error('⚠️ Erreur lors de la vérification Toamasina:', err.message);
    }
    return false;
}

module.exports = { verifierDisponibiliteToamasina };
