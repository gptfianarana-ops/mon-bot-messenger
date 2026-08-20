const { searchMahajanga } = require('./mahajanga_proxy.js');

async function searchBaccMahajangaAutomated(query) {
    try {
        console.log('Tentative extraction automatisée pour Mahajanga:', query);
        const res = await searchMahajanga(query);
        if (res && res.found) {
            // Transformer le résultat unique en tableau pour la compatibilité
            return [res];
        }
    } catch (e) {
        console.error('Erreur extraction Mahajanga:', e.message);
    }
    return null;
}

module.exports = { searchBaccMahajangaAutomated };
