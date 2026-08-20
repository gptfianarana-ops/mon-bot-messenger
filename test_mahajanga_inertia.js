const axios = require('axios');
const cheerio = require('cheerio');

async function testMahajanga() {
    try {
        console.log('--- Étape 1 : Récupération du CSRF, Cookies et Version Inertia ---');
        const response = await axios.get('https://bacc.mahajanga-univ.mg/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,all'
            }
        });

        const $ = cheerio.load(response.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = response.headers['set-cookie'];
        
        // Extraction de la version Inertia depuis le div #app data-page
        const appDiv = $('#app');
        let inertiaVersion = '';
        if (appDiv.length > 0 && appDiv.attr('data-page')) {
            const dataPage = JSON.parse(appDiv.attr('data-page'));
            inertiaVersion = dataPage.version;
        }

        console.log('CSRF Token:', csrfToken);
        console.log('Inertia Version:', inertiaVersion);

        console.log('\n--- Étape 2 : Tentative de recherche via Inertia (Matricule 2619185) ---');
        const searchRes = await axios.post('https://bacc.mahajanga-univ.mg/resultats/rechercher', 
        {
            registration_number: '2619185'
        },
        {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-CSRF-TOKEN': csrfToken,
                'X-Inertia': 'true',
                'X-Inertia-Version': inertiaVersion,
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '',
                'Referer': 'https://bacc.mahajanga-univ.mg/',
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        });

        console.log('Statut Réponse:', searchRes.status);
        // console.log('Type de contenu:', searchRes.headers['content-type']);
        
        const data = searchRes.data;
        if (data && data.props && data.props.candidate) {
            console.log('SUCCÈS : Candidat trouvé via Inertia API !');
            console.log('Nom:', data.props.candidate.fullname);
            console.log('Résultat:', data.props.candidate.status);
        } else if (JSON.stringify(data).includes('ANDRIAMANGATIANA')) {
             console.log('SUCCÈS : Données trouvées dans le JSON brut !');
        } else {
            console.log('ÉCHEC : Structure de données inattendue.');
            console.log(JSON.stringify(data).substring(0, 500));
        }

    } catch (error) {
        console.error('Erreur lors du test:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            // console.log('Data:', JSON.stringify(error.response.data).substring(0, 500));
        }
    }
}

testMahajanga();
