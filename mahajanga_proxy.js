const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function getMahajangaResults(query) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    try {
        await page.goto('https://bacc.mahajanga-univ.mg/', { waitUntil: 'networkidle2', timeout: 30000 });

        const isNumeric = /^\d+$/.test(query.trim());
        
        if (isNumeric) {
            await page.waitForSelector('#registration-number');
            await page.type('#registration-number', query.trim());
            await page.keyboard.press('Enter');
        } else {
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const nameBtn = buttons.find(b => b.textContent.includes('Nom et prénom(s)'));
                if (nameBtn) nameBtn.click();
            });
            await page.waitForSelector('#fullname');
            await page.type('#fullname', query.trim());
            await page.keyboard.press('Enter');
        }

        await page.waitForFunction(() => {
            return document.body.innerText.includes('Résultats trouvés') || 
                   document.body.innerText.includes('ADMIS(E)') || 
                   document.body.innerText.includes('Aucun candidat') ||
                   document.body.innerText.includes('Introuvable') ||
                   document.body.innerText.includes('Félicitations');
        }, { timeout: 20000 });

        const data = await page.evaluate(() => {
            const results = [];
            const text = document.body.innerText;
            
            const statusHeader = document.querySelector('h2');
            const isSingleResult = statusHeader && (statusHeader.innerText.includes('ADMIS') || statusHeader.innerText.includes('REFUSE') || text.includes('Félicitations'));
            
            if (isSingleResult) {
                const nomMatch = text.match(/Nom et prénom\(s\)\s*([^\n]*)/i);
                const matriculeMatch = text.match(/Matricule\s*(\d+)/i);
                const serieMatch = text.match(/Série\s*([^\n]*)/i);
                const centreMatch = text.match(/Centre d’examen\s*([^\n]*)/i);
                const mentionMatch = text.match(/Mention\s*:\s*([^\n|]*)/i);
                
                results.push({
                    nom: nomMatch ? nomMatch[1].trim() : '',
                    num: matriculeMatch ? matriculeMatch[1].trim() : '',
                    serie: serieMatch ? serieMatch[1].trim() : '',
                    centre: centreMatch ? centreMatch[1].trim() : '',
                    mention: mentionMatch ? mentionMatch[1].trim() : '',
                    resultat: (statusHeader?.innerText.includes('NON ADMIS') || statusHeader?.innerText.includes('REFUSE') || text.includes('NON ADMIS')) ? 'NON ADMIS' : 'ADMIS'
                });
            } else {
                const items = document.querySelectorAll('h3');
                items.forEach(item => {
                    const nom = item.innerText.trim();
                    const info = item.nextElementSibling?.innerText || '';
                    const matriculeMatch = info.match(/N°\s*(\d+)/);
                    const matricule = matriculeMatch ? matriculeMatch[1] : '';
                    const serieMatch = info.match(/Série\s*([^\n|]*)/);
                    const serie = serieMatch ? serieMatch[1].trim() : '';
                    const resText = info.match(/(Admis\(e\)|Non admis\(e\))/i)?.[1] || '';
                    const centre = item.nextElementSibling?.nextElementSibling?.innerText.trim() || '';
                    
                    results.push({
                        nom,
                        num: matricule,
                        serie,
                        centre,
                        resultat: resText.toLowerCase().includes('non') ? 'NON ADMIS' : 'ADMIS'
                    });
                });
            }
            
            return results;
        });

        return data;
    } catch (error) {
        console.error('Erreur Mahajanga Proxy:', error.message);
        return [];
    } finally {
        await browser.close();
    }
}

module.exports = { getMahajangaResults };

if (require.main === module) {
    const query = process.argv[2];
    if (query) {
        getMahajangaResults(query).then(results => {
            console.log(JSON.stringify(results));
        });
    }
}
