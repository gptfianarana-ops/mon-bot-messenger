const { getMahajangaResults } = require('./mahajanga_proxy.js');

async function searchBaccMahajangaAutomated(query) {
    try {
        console.log('Tentative extraction automatisée pour Mahajanga:', query);
        const results = await getMahajangaResults(query);
        if (results && results.length > 0) {
            return results;
        }
    } catch (e) {
        console.error('Erreur extraction Mahajanga:', e.message);
    }
    return null;
}

module.exports = { searchBaccMahajangaAutomated };
