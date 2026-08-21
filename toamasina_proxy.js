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
        
        await page.goto('https://bacc.univ-toamasina.mg/fr/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        const isNumber = /^\d+$/.test(query.trim());
        
        if (isNumber) {
            await page.click('#id_search_type_0'); // N° d'inscription
            await page.waitForSelector('input[name="search_number"]');
            await page.type('input[name="search_number"]', query.trim());
        } else {
            await page.click('#id_search_type_1'); // Nom et Prénoms
            await page.waitForSelector('input[name="search_name"]');
            await page.type('input[name="search_name"]', query.trim());
        }
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);

        // Attendre que le tableau DataTables se charge
        await page.waitForSelector('#table tbody tr', { timeout: 10000 }).catch(() => {});

        const results = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#table tbody tr'));
            return rows.map(row => {
                const cols = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
                if (cols.length < 8 || cols[0].includes('Aucun')) return null;
                return {
                    matricule: cols[0],
                    mention: cols[1],
                    nom: cols[2],
                    prenoms: cols[3],
                    date_naissance: cols[4],
                    serie: cols[5],
                    etablissement: cols[6],
                    centre: cols[7]
                };
            }).filter(r => r !== null);
        });

        await browser.close();
        return results;
    } catch (err) {
        console.error('[ToamasinaProxy] Erreur:', err.message);
        if (browser) await browser.close();
        return [];
    }
}

module.exports = { searchToamasina };
