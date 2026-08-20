const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function test() {
    try {
        const baseUrl = 'https://bacc.mahajanga-univ.mg';
        
        // 1. GET initial pour cookies et CSRF
        const initialRes = await axios.get(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $initial = cheerio.load(initialRes.data);
        const csrfToken = $initial('meta[name="csrf-token"]').attr('content');
        const cookies = initialRes.headers['set-cookie'];
        const cookieHeader = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

        // 2. POST search standard
        const searchRes = await axios.post(`${baseUrl}/resultats/rechercher`, 
        qs.stringify({ 
            _token: csrfToken,
            registration_number: '2619185' 
        }),
        {
            headers: {
                'Cookie': cookieHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': baseUrl,
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const $ = cheerio.load(searchRes.data);
        if ($('h2:contains("ADMIS")').length > 0) {
            console.log('SUCCESS: Candidate found in HTML!');
            return;
        }
        console.log('FAILED: Candidate not found.');
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
