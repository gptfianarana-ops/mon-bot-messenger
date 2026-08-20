const axios = require('axios');
const cheerio = require('cheerio');

async function testMahajanga() {
    try {
        console.log('--- Étape 1 : Récupération du CSRF et Cookies ---');
        const response = await axios.get('https://bacc.mahajanga-univ.mg/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,all'
            }
        });

        const $ = cheerio.load(response.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = response.headers['set-cookie'];
        
        console.log('CSRF Token:', csrfToken);

        console.log('\n--- Étape 2 : Tentative de recherche POST simple (Matricule 2619185) ---');
        const searchRes = await axios.post('https://bacc.mahajanga-univ.mg/resultats/rechercher', 
        new URLSearchParams({
            '_token': csrfToken,
            'registration_number': '2619185'
        }).toString(),
        {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '',
                'Referer': 'https://bacc.mahajanga-univ.mg/',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,all'
            },
            maxRedirects: 5
        });

        console.log('Statut Réponse:', searchRes.status);
        if (searchRes.data.includes('ANDRIAMANGATIANA')) {
            console.log('SUCCÈS : Candidat trouvé dans le HTML !');
        } else {
            console.log('ÉCHEC : Candidat non trouvé.');
            // console.log(searchRes.data.substring(0, 1000));
        }

    } catch (error) {
        console.error('Erreur lors du test:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
        }
    }
}

testMahajanga();
