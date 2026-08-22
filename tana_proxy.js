const axios = require('axios');

/**
 * Proxy de recherche pour l'Université d'Antananarivo 2026
 * Résout automatiquement le Captcha SVG via extraction de texte
 */
async function searchTana(query) {
    try {
        // 1. Récupérer un Captcha frais
        const captchaRes = await axios.get("https://univ-antananarivo.mg/api/trpc/cms.getBacResultsCaptcha?batch=1&input=%7B%7D", {
            timeout: 5000
        });
        
        const captchaData = captchaRes.data[0].result.data.json;
        const captchaId = captchaData.id;
        const svg = captchaData.svg;

        // 2. Résoudre le Captcha (Extraction Silicon Valley)
        const matches = svg.match(/>([^<])<\/text>/g);
        const captchaAnswer = matches ? matches.map(m => m.replace(/>([^<])<\/text>/, '$1')).join('') : "";

        if (!captchaAnswer) throw new Error("Impossible de décoder le Captcha");

        // 3. Préparer les critères de recherche
        const isNumeric = /^\d+$/.test(query.trim());
        const searchParams = {
            annee: "2026",
            matricule: isNumeric ? query.trim() : "",
            nom: !isNumeric ? query.trim().toUpperCase() : "",
            prenoms: "",
            captchaId: captchaId,
            captchaAnswer: captchaAnswer
        };

        // 4. Envoyer la requête de recherche
        const searchPayload = { "0": { "json": searchParams } };
        const searchRes = await axios.post("https://univ-antananarivo.mg/api/trpc/cms.searchBacResults?batch=1", searchPayload, {
            timeout: 8000
        });

        const data = searchRes.data[0].result.data.json;
        
        if (data.results && data.results.length > 0) {
            return data.results.map(c => ({
                matricule: c.matricule,
                nom: c.nom,
                prenoms: c.prenoms || "",
                serie: c.serie || "N/A",
                mention: c.mention || "Passable",
                centre: c.centre || "N/A",
                province: "Antananarivo",
                admis: true
            }));
        }

        return [];
    } catch (error) {
        console.error("Erreur Tana Proxy:", error.message);
        return null; // Indique une erreur technique
    }
}

module.exports = { searchTana };
