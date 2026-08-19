const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function getToliaraResults(query) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://bacc.digital.gov.mg/?province=toliara', { waitUntil: 'networkidle2' });
        
        // Attendre le champ de saisie
        await page.waitForSelector('input[placeholder="Anarana feno"]', { timeout: 10000 });
        
        // Saisir la recherche
        await page.type('input[placeholder="Anarana feno"]', query);
        await page.keyboard.press('Enter');
        
        // Attendre les résultats ou l'échec (le reCAPTCHA peut apparaître)
        // On attend l'apparition d'un élément de résultat ou d'un délai
        await new Promise(r => setTimeout(r, 5000));
        
        // Extraire les données de la page
        const results = await page.evaluate(() => {
            // Cette partie dépend de la structure HTML après recherche
            // On va essayer d'extraire tout texte qui ressemble à un résultat
            const data = [];
            const rows = document.querySelectorAll('table tr'); // Hypothèse de structure
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    data.push({
                        matricule: cells[0].innerText.trim(),
                        nom: cells[1].innerText.trim(),
                        serie: cells[2].innerText.trim(),
                        mention: cells[3] ? cells[3].innerText.trim() : 'Passable',
                        admis: cells[4] ? cells[4].innerText.includes('Admis') : true
                    });
                }
            });
            return data;
        });
        
        await browser.close();
        return results;
    } catch (e) {
        await browser.close();
        throw e;
    }
}

// Test si lancé directement
if (require.main === module) {
    const query = process.argv[2] || 'RAKOTO';
    getToliaraResults(query).then(res => console.log(JSON.stringify(res))).catch(err => console.error(err));
}

module.exports = { getToliaraResults };
