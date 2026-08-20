const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const query = '2619185';
        const url = `https://bacc.mahajanga-univ.mg/resultats/rechercher?registration_number=${query}`;
        console.log('Testing URL:', url);
        
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(res.data);
        const scriptTag = $('script[data-page="app"]');
        
        if (scriptTag.length > 0) {
            const dataPage = JSON.parse(scriptTag.html());
            if (dataPage.props && dataPage.props.candidate) {
                console.log('SUCCESS: Candidate found!');
                console.log(JSON.stringify(dataPage.props.candidate, null, 2));
                return;
            }
        }
        console.log('FAILED: Candidate not found in JSON tag.');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
