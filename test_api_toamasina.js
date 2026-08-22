const axios = require('axios');

async function testApi() {
    const urls = [
        "https://toamasina-api.bacc.digital.gov.mg/api/search/num/2708320",
        "https://toamasina-api.bacc.digital.gov.mg/api/search/num/?q=2708320",
        "https://toamasina-api.bacc.digital.gov.mg/api/search?q=2708320"
    ];

    for (const url of urls) {
        try {
            console.log(`Test URL: ${url}`);
            const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            console.log(`Succès ${url}:`, res.status, res.data);
        } catch (e) {
            console.log(`Erreur ${url}:`, e.response ? e.response.status : e.message);
        }
    }
}

testApi();
