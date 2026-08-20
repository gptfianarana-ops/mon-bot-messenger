const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const url = 'https://bacc.mahajanga-univ.mg/recherche-par-nom?fullname=RAKOTO';
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    const dataPage = JSON.parse($('script[data-page="app"]').html());
    console.log(JSON.stringify(dataPage.props.lookup, null, 2));
}
test();
