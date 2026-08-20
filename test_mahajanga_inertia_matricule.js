const axios = require('axios');
const cheerio = require('cheerio');

async function testMahajanga() {
    try {
        const response = await axios.get('https://bacc.mahajanga-univ.mg/', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = response.headers['set-cookie'];
        const dataPage = JSON.parse($('script[data-page="app"]').html());
        const inertiaVersion = dataPage.version;

        const searchRes = await axios.post('https://bacc.mahajanga-univ.mg/resultats/rechercher', 
        {
            registration_number: '2619185'
        },
        {
            headers: {
                'X-CSRF-TOKEN': csrfToken,
                'X-Inertia': 'true',
                'X-Inertia-Version': inertiaVersion,
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookies.map(c => c.split(';')[0]).join('; '),
                'Referer': 'https://bacc.mahajanga-univ.mg/',
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        console.log('Status:', searchRes.status);
        const data = searchRes.data;
        if (data && data.props && data.props.candidate) {
            console.log('SUCCÈS !');
            console.log(JSON.stringify(data.props.candidate, null, 2));
        } else {
            console.log('ÉCHEC : Candidat non trouvé.');
            console.log(JSON.stringify(data).substring(0, 500));
        }
    } catch (error) {
        console.error('Erreur:', error.message);
    }
}
testMahajanga();
