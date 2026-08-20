// Module d'Orientation Post-BACC Intelligent (Français & Malgache) - Tsarafandray Services
// Conçu pour un comportement humain, professionnel et naturel.

const orientationKnowledge = {
    series: {
        'A1': {
            name: 'Série A1 (Littéraire / Langues)',
            nameMg: 'Taranja Literatiora sy Fiteny (A1)',
            filieres: [
                { name: 'Droit et Sciences Politiques', desc: 'Avocat, magistrat, diplomate, administration publique.', duration: '3 à 5 ans (Licence / Master)', univ: 'Antananarivo, Fianarantsoa, Toamasina, UCM, IEP' },
                { name: 'Lettres, Langues et Communication', desc: 'Traducteur, journaliste, communicant, professeur.', duration: '3 à 5 ans', univ: 'Toutes les universités publiques (FLSH)' },
                { name: 'Tourisme et Hôtellerie', desc: 'Gestion hôtelière, guide touristique, management de projets.', duration: '3 ans (Licence professionnelle)', univ: 'Mahajanga, Toliara, Toamasina, Instituts privés' }
            ]
        },
        'A2': {
            name: 'Série A2 (Littéraire / Sciences Humaines)',
            nameMg: 'Taranja Literatiora (A2)',
            filieres: [
                { name: 'Sociologie et Travail Social', desc: 'Développement communautaire, assistant social, ONG.', duration: '3 à 5 ans', univ: 'Antananarivo, Toamasina, Fianarantsoa' },
                { name: 'Droit et Sciences Juridiques', desc: 'Carrières juridiques, notariat, conseil d\'entreprise.', duration: '3 à 5 ans', univ: 'Antananarivo, Mahajanga, Universités privées' },
                { name: 'Communication et Médias', desc: 'Relations publiques, journalisme, community management.', duration: '3 ans', univ: 'Instituts privés spécialisés' }
            ]
        },
        'C': {
            name: 'Série C (Mathématiques / Sciences Physiques)',
            nameMg: 'Taranja Siansa sy Matematika (C)',
            filieres: [
                { name: 'Polytechnique / Ingénierie', desc: 'Génie civil, télécommunications, électricité, hydraulique.', duration: '5 ans (Cycle Ingénieur / Master)', univ: 'ESPA Vontovorona, Antsiranana, ISPM' },
                { name: 'Médecine et Sciences de la Santé', desc: 'Médecine générale, pharmacie, chirurgie dentaire.', duration: '5 à 8 ans', univ: 'Antananarivo, Mahajanga, Toamasina, Fianarantsoa' },
                { name: 'Informatique et Sciences Numériques', desc: 'Développement logiciel, IA, réseaux et sécurité.', duration: '3 à 5 ans', univ: 'ENI Fianarantsoa, IT University, ISPM' }
            ]
        },
        'D': {
            name: 'Série D (Sciences de la Vie et de la Terre)',
            nameMg: 'Taranja Siansa sy Fahasalamana (D)',
            filieres: [
                { name: 'Médecine et Professions Sanitaires', desc: 'Médecine, maïeutique (sages-femmes), soins infirmiers.', duration: '3 à 7 ans', univ: 'Facultés de Médecine publiques et privées' },
                { name: 'Agronomie et Environnement', desc: 'Agriculture, élevage, eaux et forêts, agronomie.', duration: '3 à 5 ans', univ: 'ESSA Antananarivo, Universités régionales' },
                { name: 'Informatique & Sciences Fondamentales', desc: 'Biologie, chimie appliquée, informatique.', duration: '3 ans', univ: 'Faculté des Sciences (Ankatso, etc.)' }
            ]
        },
        'OSE': {
            name: 'Série OSE (Organisation, Société, Économie)',
            nameMg: 'Taranja Toekarena sy Fiarahamonina (OSE)',
            filieres: [
                { name: 'Économie et Gestion d\'Entreprise', desc: 'Comptabilité, audit, finance, gestion des ressources humaines.', duration: '3 à 5 ans', univ: 'Faculté DEGS Antananarivo, INSCAE, ESSCA' },
                { name: 'Administration Économique et Sociale', desc: 'Gestion publique, administration des entreprises.', duration: '3 ans', univ: 'Universités publiques et privées' }
            ]
        },
        'TECH': {
            name: 'Séries Techniques (G1, G2, G3, F, etc.)',
            nameMg: 'Taranja Teknika (Technique)',
            filieres: [
                { name: 'Gestion, Comptabilité et Secrétariat', desc: 'Comptable d\'entreprise, assistant de direction.', duration: '3 ans (BTS / Licence)', univ: 'Instituts techniques supérieurs, IST' },
                { name: 'Génie Industriel / Mécanique / Électronique', desc: 'Technicien supérieur en maintenance, électrotechnique.', duration: '3 à 5 ans', univ: 'IST (Antsiranana, Ambositra), Lycées techniques' }
            ]
        }
    }
};

function handleOrientationMessage(text, userState) {
    const cleanText = text.trim().toUpperCase();
    
    // Si l'utilisateur vient de lancer l'orientation ou demande de l'aide
    if (!userState.step || cleanText === 'ORIENTATION' || cleanText === 'HIANATRA') {
        userState.step = 'WAITING_SERIE';
        return {
            reply: `🎓 **MANDRA-PANAMPIANA AMIN'NY FIDIRANA AMIN'NY LALANA TAONA (ORIENTATION POST-BACC)**\n\n` +
                   `Miarahaba anao! Eto ianao dia afaka manontany na mitady torohevitra momba ny lalan-tany sahaza anao aorian'ny BACC.\n\n` +
                   `📍 **Safidio ny Taranja (Série) niavianao raha azo atao:**\n` +
                   `• **A1** (Literatiora)\n` +
                   `• **A2** (Siansa Olombelona)\n` +
                   `• **C** (Matematika)\n` +
                   `• **D** (Siansa / Tontolo Iainana)\n` +
                   `• **OSE** (Toekarena)\n` +
                   `• **TECH** (Teknika)\n\n` +
                   `💬 *Na tsotra izao, soraty eto ny taranja na ny tianao ho fantatra (ohatra: "Inona no tsara ho an'ny serie D?", "Ohatrinona ny fianarana médecine?").*`,
            quickReplies: ['Série A1/A2', 'Série C', 'Série D', 'Série OSE', 'Série Tech']
        };
    }

    // Analyse de la série choisie
    if (userState.step === 'WAITING_SERIE') {
        let serieKey = null;
        if (cleanText.includes('A1')) serieKey = 'A1';
        else if (cleanText.includes('A2')) serieKey = 'A2';
        else if (cleanText.includes('C')) serieKey = 'C';
        else if (cleanText.includes('D')) serieKey = 'D';
        else if (cleanText.includes('OSE')) serieKey = 'OSE';
        else if (cleanText.includes('TECH') || cleanText.includes('G1') || cleanText.includes('G2')) serieKey = 'TECH';

        if (serieKey && orientationKnowledge.series[serieKey]) {
            const data = orientationKnowledge.series[serieKey];
            userState.currentSerie = serieKey;
            userState.step = 'EXPLORING_FILIERES';

            let response = `📚 **${data.name}**\n*( ${data.nameMg} )*\n\n` +
                           `Inty ny safidy lehibe indrindra sy mety aminao aorian'ny BACC:\n\n`;
            
            data.filieres.forEach((f, idx) => {
                response += `📌 **${idx + 1}. ${f.name}**\n` +
                            `   • *Asa azo atao:* ${f.desc}\n` +
                            `   • *Faharetana:* ${f.duration}\n` +
                            `   • *Toerana (Oniversite):* ${f.univ}\n\n`;
            });

            response += `💡 *Te hahafantatra antsipiriany bebe kokoa momba ny filière iray ve ianao? Na te hanontany oniversite manokana (ohatra: Ankatso, ENI, ESPA, ITU)? Manorata fotsiny eto!*`;

            return {
                reply: response,
                quickReplies: ['Hafa (Université)', 'Iray amin\'ireo', 'Hiverina amin\'ny BACC']
            };
        } else {
            // Recherche en langage naturel (français ou malgache)
            return {
                reply: `🤖 **Mpanolotsaina Tsarafandray:**\n\n` +
                       `Voarako ny hafatrao. Raha mikaroka momba ny oniversite na filière manokana ianao (ohatra: *Médecine, Informatique, Droit, Gestion*), dia azonao atao ny manontany mazava tsara eto ary hasehoko anao ny antsipiriany (faharetana, diplaoma, sy toerana).\n\n` +
                       `*Tsio-drivotra ny safidy etsy ambany raha mila torohevitra araka ny série ianao:*`,
                quickReplies: ['Série C', 'Série D', 'Série A1/A2', 'Série OSE']
            };
        }
    }

    // Mode conversation libre et experte
    return {
        reply: `🎯 **Torohevitra momba ny Fianarana Ambony:**\n\n` +
               `Araka ny fanontanianao, ny lalana tsara indrindra dia miankina amin'ny fahaizanao sy ny tanjonao. \n\n` +
               `• Raha tia **Teknolojia sy Informatika** ianao: Ny *ENI Fianarantsoa* na *IT University* no tsara (3 ka hatramin'ny 5 taona, Diplaoma Licence/Master).\n` +
               `• Raha tia **Fahasalamana** ianao: Ny *Faculté de Médecine* (5 ka hatramin'ny 8 taona).\n` +
               `• Raha tia **Toekarena/Fitantanana** ianao: Ny *DEGS Ankatso* na *INSCAE*.\n\n` +
               `Mbola misy fanontaniana manokana momba ny tanàna tianao hianarana ve (Antananarivo, Fianarantsoa, Toamasina, Mahajanga, Toliara, Antsiranana)?`,
        quickReplies: ['Universités Publiques', 'Écoles Privées', 'Miverina amin\'ny BACC']
    };
}

module.exports = { handleOrientationMessage };
