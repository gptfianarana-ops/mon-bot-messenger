const axios = require('axios');
const https = require('https');

const agent = new https.Agent({  
  rejectUnauthorized: false
});

async function testApi() {
    const urls = [
        "https://toamasina-api.bacc.digital.gov.mg/api/search/num/2708320",
        "https://toamasina-api.bacc.digital.gov.mg/api/search/name/RANDRIANIRINA",
        "https://bacc.univ-toamasina.mg/"
    ];

    for (const url of urls) {
        try {
            console.log(`Test URL: ${url}`);
            const res = await axios.get(url, { httpsAgent: agent, timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            console.log(`Succès ${url}:`, res.status, typeof res.data === 'string' ? res.data.substring(0, 100) : res.data);
        } catch (e) {
            console.log(`Erreur ${url}:`, e.response ? e.response.status : e.message);
        }
    }
}

testApi();
