const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function searchToamasina(query) {
    console.log(`[ToamasinaProxy] Recherche Axios/Cheerio pour: ${query}`);
    try {
        const client = axios.create({
            withCredentials: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
            }
        });

        // 1. Get CSRF token and cookie from home page
        const homeRes = await client.get('https://bacc.univ-toamasina.mg/fr/', { timeout: 15000 });
        const cookies = homeRes.headers['set-cookie'];
        const $home = cheerio.load(homeRes.data);
        const csrfToken = $home('input[name="csrfmiddlewaretoken"]').val();

        // 2. Post search request
        const isNumber = /^\d+$/.test(query.trim());
        const formData = {
            csrfmiddlewaretoken: csrfToken,
            search_year: '2026',
            search_type: isNumber ? 'numero' : 'nom_et_prenoms'
        };

        if (isNumber) {
            formData.search_number = query.trim();
        } else {
            formData.search_name = query.trim();
        }

        const postRes = await client.post('https://bacc.univ-toamasina.mg/fr/', qs.stringify(formData), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies ? cookies.join('; ') : '',
                'Referer': 'https://bacc.univ-toamasina.mg/fr/'
            },
            timeout: 15000
        });

        // 3. Parse results
        const $ = cheerio.load(postRes.data);
        const results = [];
        $('#table tbody tr').each((i, row) => {
            const cols = $(row).find('td').map((j, td) => $(td).text().trim()).get();
            if (cols.length >= 5 && !cols[0].toLowerCase().includes('aucun')) {
                results.push({
                    matricule: cols[0],
                    mention: cols[1],
                    nom: cols[2],
                    prenoms: cols[3],
                    date_naissance: cols[4] || '',
                    serie: cols[5] || '',
                    etablissement: cols[6] || '',
                    centre: cols[7] || ''
                });
            }
        });

        console.log(`[ToamasinaProxy] ${results.length} résultats trouvés via Axios/Cheerio.`);
        return results;
    } catch (err) {
        console.error('[ToamasinaProxy] Erreur Axios/Cheerio:', err.message);
        return [];
    }
}

module.exports = { searchToamasina };
