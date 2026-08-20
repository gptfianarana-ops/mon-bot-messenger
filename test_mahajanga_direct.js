const axios = require('axios');
const cheerio = require('cheerio');

async function testMahajanga() {
    try {
        console.log('--- Étape 1 : Récupération du CSRF et Cookies ---');
        const response = await axios.get('https://bacc.mahajanga-univ.mg/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = response.headers['set-cookie'];
        
        console.log('CSRF Token:', csrfToken);
        console.log('Cookies:', cookies ? cookies.join('; ') : 'Aucun');

        console.log('\n--- Étape 2 : Tentative de recherche directe (Matricule 2619185) ---');
        // Note: Mahajanga semble utiliser des routes nommées, essayons le POST direct
        const searchRes = await axios.post('https://bacc.mahajanga-univ.mg/resultats/rechercher', 
        {
            registration_number: '2619185'
        },
        {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-CSRF-TOKEN': csrfToken,
                'Cookie': cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '',
                'Referer': 'https://bacc.mahajanga-univ.mg/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,all'
            },
            maxRedirects: 5
        });

        console.log('Statut Réponse:', searchRes.status);
        if (searchRes.data.includes('ANDRIAMANGATIANA')) {
            console.log('SUCCÈS : Données trouvées dans le HTML !');
        } else {
            console.log('ÉCHEC : Données non trouvées dans le corps de la réponse.');
            // console.log(searchRes.data.substring(0, 500));
        }

    } catch (error) {
        console.error('Erreur lors du test:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            // console.log('Data:', error.response.data);
        }
    }
}

testMahajanga();
