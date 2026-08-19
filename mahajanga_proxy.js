const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function searchMahajanga(query) {
    let browser;
    try {
        const isMatricule = /^\d{7}$/.test(query);
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto('https://bacc.mahajanga-univ.mg/', { waitUntil: 'networkidle2' });

        if (!isMatricule) {
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent.includes('Nom et prénom(s)'));
                if (btn) btn.click();
            });
            await page.waitForSelector('input[placeholder*="Ex. RAKOTO"]', { timeout: 5000 }).catch(() => {});
            await page.type('input[placeholder*="Ex. RAKOTO"]', query);
        } else {
            await page.waitForSelector('#registration-number', { timeout: 5000 });
            await page.type('#registration-number', query);
        }

        await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
        });

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        
        const html = await page.content();
        const $ = cheerio.load(html);
        
        if ($('h2:contains("ADMIS")').length > 0) {
            const nom = $('p:contains("Nom et prénom(s)")').next().text().trim();
            const matricule = $('dt:contains("Matricule")').next().text().trim();
            const serie = $('dt:contains("Série")').next().text().trim();
            const centre = $('dt:contains("Centre d’examen")').next().text().trim();
            const mention = $('p:contains("Mention")').text().replace('Mention :', '').trim();

            await browser.close();
            return {
                found: true,
                nom,
                matricule,
                serie,
                centre,
                mention,
                status: 'ADMIS(E)'
            };
        }

        await browser.close();
        return { found: false };
    } catch (error) {
        if (browser) await browser.close();
        return { found: false, error: error.message };
    }
}

module.exports = { searchMahajanga };

if (require.main === module) {
    const q = process.argv[2] || '2619185';
    searchMahajanga(q).then(res => console.log(JSON.stringify(res, null, 2)));
}
