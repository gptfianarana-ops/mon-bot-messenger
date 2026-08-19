const { getToliaraResults } = require('./toliara_proxy.js');

async function searchBaccToliaraAutomated(query) {
    try {
        console.log('Tentative extraction automatisée pour Toliara:', query);
        const results = await getToliaraResults(query);
        if (results && results.length > 0) {
            return results;
        }
    } catch (e) {
        console.error('Erreur extraction Toliara:', e.message);
    }
    return null;
}

module.exports = { searchBaccToliaraAutomated };
