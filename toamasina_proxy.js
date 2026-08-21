const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function searchToamasina(query) {
    console.log(`[ToamasinaProxy] Recherche pour: ${query}`);
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36');
        
        // Augmenter le timeout et attendre le chargement
        await page.goto('https://bacc.univ-toamasina.mg/fr/', { waitUntil: 'networkidle2', timeout: 45000 });
        
        const isNumber = /^\d+$/.test(query.trim().replace(/\s/g, ''));
        
        if (isNumber) {
            await page.click('#id_search_type_0'); // N° d'inscription
            await page.waitForSelector('input[name="search_number"]', { visible: true });
            await page.type('input[name="search_number"]', query.trim());
        } else {
            await page.click('#id_search_type_1'); // Nom et Prénoms
            await page.waitForSelector('input[name="search_name"]', { visible: true });
            await page.type('input[name="search_name"]', query.trim());
        }
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);

        // Attendre que le tableau DataTables se charge et contienne des données
        // On attend que la ligne "Aucune donnée disponible" disparaisse ou qu'une ligne de donnée apparaisse
        await page.waitForFunction(() => {
            const row = document.querySelector('#table tbody tr');
            return row && !row.innerText.includes('Chargement') && !row.innerText.includes('Traitement');
        }, { timeout: 15000 }).catch(() => {});

        const results = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#table tbody tr'));
            return rows.map(row => {
                const cols = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
                // Si la ligne dit "Aucun résultat" ou "Aucune donnée", on ignore
                if (cols.length < 5 || cols[0].toLowerCase().includes('aucun')) return null;
                
                return {
                    matricule: cols[0],
                    mention: cols[1],
                    nom: cols[2],
                    prenoms: cols[3],
                    date_naissance: cols[4] || '',
                    serie: cols[5] || '',
                    etablissement: cols[6] || '',
                    centre: cols[7] || ''
                };
            }).filter(r => r !== null);
        });

        console.log(`[ToamasinaProxy] ${results.length} résultats trouvés.`);
        await browser.close();
        return results;
    } catch (err) {
        console.error('[ToamasinaProxy] Erreur critique:', err.message);
        if (browser) await browser.close();
        return [];
    }
}

module.exports = { searchToamasina };
