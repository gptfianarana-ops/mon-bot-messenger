const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const query = 'RAKOTO';
        const url = `https://bacc.mahajanga-univ.mg/recherche-par-nom?fullname=${encodeURIComponent(query)}`;
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
            if (dataPage.props && dataPage.props.lookup && dataPage.props.lookup.results) {
                console.log('SUCCESS: Results found!');
                console.log('Count:', dataPage.props.lookup.results.length);
                return;
            }
        }
        console.log('FAILED: Results not found in JSON tag.');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
