const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const baseUrl = 'https://bacc.mahajanga-univ.mg';
        
        // 1. GET initial pour cookies et CSRF
        console.log('Step 1: Getting CSRF and Cookies...');
        const initialRes = await axios.get(baseUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(initialRes.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = initialRes.headers['set-cookie'];
        const cookieHeader = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';
        const dataPage = JSON.parse($('script[data-page="app"]').html());
        const version = dataPage.version;

        console.log('CSRF:', csrfToken);
        console.log('Version:', version);

        // 2. POST search
        console.log('Step 2: Sending POST search...');
        const searchRes = await axios.post(`${baseUrl}/resultats/rechercher`, 
        { registration_number: '2619185' },
        {
            headers: {
                'X-CSRF-TOKEN': csrfToken,
                'X-Inertia': 'true',
                'X-Inertia-Version': version,
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookieHeader,
                'Referer': baseUrl,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        console.log('Response Status:', searchRes.status);
        console.log('Data:', JSON.stringify(searchRes.data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Data:', JSON.stringify(e.response.data, null, 2));
        }
    }
}

test();
