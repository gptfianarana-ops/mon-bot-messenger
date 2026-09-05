// Module d'Orientation Post-BACC Expert (Français & Malgache) - Tsarafandray Services
// Base de données massive et intelligence conversationnelle avancée (Expert Madagascar 2026).

const KNOWLEDGE = {
    series: {
        'A1': { name: 'A1 (Littéraire / Langues)', alias: ['L', 'LITTERAIRE'], mg: 'Taranja A1 (Literatiora sy Fiteny)', filieres: ['Droit', 'Lettres', 'Langues', 'Communication', 'ENS', 'Journalisme', 'Tourisme'] },
        'A2': { name: 'A2 (Sciences Humaines)', alias: ['L', 'LITTERAIRE'], mg: 'Taranja A2 (Siansa Olombelona)', filieres: ['Droit', 'Sociologie', 'Économie', 'Gestion', 'ENS', 'Histoire/Géo', 'Journalisme'] },
        'L': { name: 'L (Littéraire)', alias: ['A1', 'A2'], mg: 'Taranja L', filieres: ['Droit', 'Lettres', 'Langues', 'Communication', 'ENS', 'Journalisme'] },
        'C': { name: 'C (Mathématiques)', alias: ['S', 'SCIENTIFIQUE'], mg: 'Taranja C (Matematika)', filieres: ['Polytechnique (ESPA)', 'Sciences', 'Informatique (ENI)', 'Médecine', 'ESSA (Agro)', 'ENS (Sciences)', 'IHSM'] },
        'D': { name: 'D (Sciences)', alias: ['S', 'SCIENTIFIQUE'], mg: 'Taranja D (Siansa)', filieres: ['Médecine', 'Sciences Naturelles', 'Agronomie (ESSA)', 'Polytechnique (ESPA)', 'Paramédical', 'ENS (Sciences)', 'Vétérinaire'] },
        'S': { name: 'S (Scientifique)', alias: ['C', 'D'], mg: 'Taranja S', filieres: ['Médecine', 'Sciences', 'Polytechnique', 'Agronomie', 'Informatique'] },
        'OSE': { name: 'OSE (Économie)', alias: ['ECO'], mg: 'Taranja OSE (Toekarena)', filieres: ['Gestion', 'Économie', 'Sociologie', 'Commerce', 'Comptabilité', 'ISCAM', 'INSCAE'] },
        'TECH': { name: 'Technique', alias: ['G', 'F', 'AGRI', 'INDUS', 'TERTIAIRE'], mg: 'Taranja Teknika', filieres: ['Génie Civil', 'Architecture', 'Agriculture', 'Mines', 'IST', 'Polytechnique'] }
    },
    domaines: {
        'DROIT': {
            titre: '⚖️ Droit & Science Politique',
            desc: 'Formation pour la justice, l\'administration et la diplomatie.',
            ecoles: '• **UA Antananarivo** : FDSP (Ankatso).\n• **Univ. Fianar / Toliara / Toamasina** : Facultés DEGS.\n• **ENMG** : École Nationale de la Magistrature (après Master).',
            metiers: 'Avocat, Magistrat, Juriste, Notaire, Administrateur public.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Test d\'accès / Dossier.',
            site: 'http://fdsp.univ-antananarivo.mg'
        },
        'ECONOMIE': {
            titre: '📊 Économie, Gestion & Business',
            desc: 'Piloter l\'entreprise et le commerce international.',
            ecoles: '• **Université de Toamasina** : formations liées au commerce, à la logistique et à l’économie maritime.\n• **Université d’Antananarivo** : parcours en économie et gestion.\n• **INSCAE / ISCAM** : établissements privés spécialisés ; modalités à vérifier auprès de chaque établissement.',
            metiers: 'Économiste, Gestionnaire, Auditeur, Analyste financier, Logisticien.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Concours / Test.',
            site: 'http://egs.univ-antananarivo.mg'
        },
        'MEDECINE': {
            titre: '🩺 Médecine & Santé',
            desc: 'Domaine consacré aux soins, à la santé et aux formations paramédicales.',
            ecoles: '• **Univ. Mahajanga** : Pôle d\'excellence Santé, Dentaire et Kinésithérapie.\n• **UA Antananarivo / Fianar / Toamasina** : Facultés de Médecine.',
            metiers: 'Médecin, Chirurgien, Pharmacien, Dentiste, Infirmier.',
            diplome: 'Parcours médical long ; les durées et diplômes dépendent de la filière. Les formations paramédicales sont organisées sur plusieurs années. Accès et calendrier : à vérifier auprès de l’établissement concerné.',
            site: 'http://medecine.univ-antananarivo.mg'
        },
        'POLYTECHNIQUE': {
            titre: '🏗️ Sciences de l\'Ingénieur (ESP)',
            desc: 'Innovation technologique et industrielle.',
            ecoles: '• **ESPA Antananarivo (Vontovorona)** : Génie Civil, Informatique, Télécoms.\n• **ESPA Antsiranana (Diego)** : Ingénierie Industrielle, Énergie, Mécanique.',
            metiers: 'Ingénieur, Chef de projet, Expert Énergie, Automaticien.',
            diplome: 'Ingénieur (5 ans). Accès : Concours national (Novembre).',
            site: 'http://espa.univ-antananarivo.mg'
        },
        'AGRONOMIE': {
            titre: '🌱 Agronomie & Environnement',
            desc: 'Agriculture, élevage et développement rural durable.',
            ecoles: '• **ESSA Antananarivo (Ankatso)** : Référence historique.\n• **IESAV Antsirabe (Vakinankaratra)** : Génie Rural et Paysage.\n• **Univ. Analanjirofo (Fenerive-Est)** : Agro-management.',
            metiers: 'Ingénieur Agronome, Conseiller agricole, Responsable environnement.',
            diplome: 'Ingénieur (5 ans). Accès : Concours d\'entrée.',
            site: 'http://essa.univ-antananarivo.mg'
        },
        'MARINES': {
            titre: '🌊 Sciences Marines & Halieutiques',
            desc: 'Économie bleue et gestion des ressources marines.',
            ecoles: '• **IHSM Toliara** : Leader en Océanographie et Aquaculture.\n• **Univ. Antsiranana** : Institut de la Mer.',
            metiers: 'Ingénieur Halieute, Océanographe, Expert en aquaculture.',
            diplome: 'Licence (3 ans), Ingénieur (5 ans). Accès : Concours (Séries C, D).',
            site: 'http://ihsm.mg'
        },
        'ENS': {
            titre: '🎓 Éducation (ENS)',
            desc: 'Formation des enseignants et cadres pédagogiques.',
            ecoles: '• **ENS Antananarivo** : Ampefiloha.\n• **ENS Fianarantsoa** : Réputée pour son excellence pédagogique.',
            metiers: 'Enseignant de Lycée, Conseiller pédagogique, Inspecteur.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Concours national.',
            site: 'http://ens.univ-antananarivo.mg'
        },
        'INFORMATIQUE': {
            titre: '💻 Informatique & Digital',
            desc: 'Domaine couvrant le développement logiciel, les réseaux, les données et les services numériques.',
            ecoles: '• **ENI Fianarantsoa** : formations en informatique et technologies.\n• **IT University (ITU)** : établissement privé spécialisé.\n• **Universités régionales** : certaines proposent des parcours informatiques ; vérifier l’offre et les conditions pour l’année concernée.',
            metiers: 'Développeur, Architecte Cloud, Expert Cyber.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Concours (ENI) / Test.',
            site: 'http://eni.univ-fianar.mg'
        }
    },
    universites: {
        'TANA': '🏛️ **Université d\'Antananarivo (Ankatso)** : propose notamment des parcours à l’ESPA, l’ESSA, l’ENS, en médecine et dans les domaines DEGS. Les filières et conditions doivent être vérifiées sur les avis officiels.',
        'FIANAR': '💡 **Université de Fianarantsoa** : comprend notamment l’ENI et des parcours de formation pédagogique. Les filières ouvertes et les modalités d’accès varient selon l’année.',
        'TOAMASINA': '🚢 **Université de Toamasina** : Spécialisée en Commerce International, Logistique Portuaire et Économie Maritime.',
        'MAHAJANGA': '🦷 **Université de Mahajanga** : propose notamment des parcours en médecine, dentaire, kinésithérapie et tourisme ; vérifier l’offre et les conditions de l’année.',
        'TOLIARA': '🌊 **Université de Toliara** : propose notamment des parcours liés aux sciences marines, à l’environnement et à l’agronomie ; vérifier les filières ouvertes auprès des sources officielles.',
        'ANTSIRANANA': '⚙️ **Université d\'Antsiranana (Diego)** : propose notamment des parcours en ingénierie, industrie, énergie et sciences de la mer ; vérifier les filières ouvertes.',
        'VAKINAKARATRA': '🚜 **Université de Vakinankaratra (Antsirabe)** : propose notamment des parcours en génie rural, agronomie et développement local ; vérifier l’offre officielle.',
        'ANALANJIROFO': '🌴 **Université d’Analanjirofo (Fenerive-Est)** : peut proposer des parcours liés à l’agriculture, à la gestion et à l’informatique ; vérifier l’offre officielle de l’année.'
    }
};

function handleOrientationMessage(text, userState) {
    const t = text.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Initialisation
    if (t === 'ORIENTATION' || t === 'MENU' || t === 'START') {
        userState.step = 'WAITING_SERIE';
        return {
            reply: `🧭 **GUIDE EXPERT ORIENTATION (Tsarafandray)**\n\n` +
                   `Miarahaba anao! Izaho no mpanolotsaina matihanina hanampy anao amin'ny dingana manaraka.\n\n` +
                   `📍 **Inona ny Série-nao? (Soraty na safidio):**\n` +
                   `• **A1 / A2 / L** (Littéraire)\n` +
                   `• **C / D / S** (Scientifique)\n` +
                   `• **OSE** (Économie)\n` +
                   `• **TECH** (Technique)\n\n` +
                   `💬 *Afaka manontany mivantana koa ianao (ohatra: "Aiza no misy an'i Fianarantsoa?", "Inona ny filière any Toliara?").*`,
            quickReplies: ['A1/A2/L', 'C/D/S', 'OSE', 'Technique']
        };
    }

    // Détection Régions
    if (t.includes('TANA') || t.includes('ANTANANARIVO') || t.includes('ANKATSO')) return getUnivInfo('TANA');
    if (t.includes('FIANAR')) return getUnivInfo('FIANAR');
    if (t.includes('TOAMASINA') || t.includes('TAMATAVE')) return getUnivInfo('TOAMASINA');
    if (t.includes('MAHAJANGA')) return getUnivInfo('MAHAJANGA');
    if (t.includes('TOLIARA')) return getUnivInfo('TOLIARA');
    if (t.includes('DIEGO') || t.includes('ANTSIRANANA')) return getUnivInfo('ANTSIRANANA');
    if (t.includes('ANTSIRABE') || t.includes('VAKINAKARATRA')) return getUnivInfo('VAKINAKARATRA');
    if (t.includes('FENERIVE') || t.includes('ANALANJIROFO')) return getUnivInfo('ANALANJIROFO');

    // Détection Domaines / Écoles
    if (t.includes('DROIT') || t.includes('LALANA')) return getDomaineInfo('DROIT');
    if (t.includes('ECONOMIE') || t.includes('GESTION') || t.includes('COMMERCE')) return getDomaineInfo('ECONOMIE');
    if (t.includes('MEDECINE') || t.includes('DOKOTERA') || t.includes('SANTE')) return getDomaineInfo('MEDECINE');
    if (t.includes('POLYTECH') || t.includes('INGENIEUR') || t.includes('ESPA')) return getDomaineInfo('POLYTECHNIQUE');
    if (t.includes('AGRO') || t.includes('ESSA') || t.includes('VOLY')) return getDomaineInfo('AGRONOMIE');
    if (t.includes('MARIN') || t.includes('RANO') || t.includes('IHSM')) return getDomaineInfo('MARINES');
    if (t.includes('ENS') || t.includes('MPAMPIANATRA')) return getDomaineInfo('ENS');
    if (t.includes('INFO') || t.includes('DIGITAL') || t.includes('ENI')) return getDomaineInfo('INFORMATIQUE');

    // Logique de série
    if (userState.step === 'WAITING_SERIE') {
        let serie = null;
        const tokens = new Set(t.split(/[^A-Z0-9]+/).filter(Boolean));
        if (tokens.has('A1') || tokens.has('A2') || tokens.has('L')) serie = tokens.has('A1') ? 'A1' : (tokens.has('A2') ? 'A2' : 'L');
        else if (tokens.has('C') || tokens.has('D') || tokens.has('S')) serie = tokens.has('C') ? 'C' : (tokens.has('D') ? 'D' : 'S');
        else if (tokens.has('OSE') || tokens.has('ECO')) serie = 'OSE';
        else if (tokens.has('TECH') || tokens.has('TECHNIQUE') || tokens.has('G') || tokens.has('F') || tokens.has('AGRI') || tokens.has('INDUS') || tokens.has('TERTIAIRE')) serie = 'TECH';

        if (serie) {
            userState.currentSerie = serie;
            userState.step = 'MENU_EXPERT';
            const data = KNOWLEDGE.series[serie];
            return {
                reply: `✅ **Série ${data.name}** voaray.\n\n` +
                       `Inona no tianao ho fantatra?\n\n` +
                       `1️⃣ **Filières** : Inona ny fianarana azoko atao?\n` +
                       `2️⃣ **Universités** : Aiza ny oniversite tsara indrindra?\n` +
                       `3️⃣ **Concours** : Inona ny fomba idirana (Concours/Dossier)?\n` +
                       `4️⃣ **Débouchés** : Inona ny asa azo atao?\n\n` +
                       `👉 *Soraty ny laharana (1-4).*`,
                quickReplies: ['1. Filières', '2. Universités', '3. Concours', '4. Débouchés']
            };
        }
    }

    // Menu Expert
    if (userState.step === 'MENU_EXPERT') {
        const serie = userState.currentSerie;
        const data = KNOWLEDGE.series[serie];
        if (t === '1' || t.includes('FILIERE')) {
            return {
                reply: `📚 **Filières possibles pour ${serie} :**\n\n` +
                       data.filieres.map(f => `🔹 ${f}`).join('\n') + 
                       `\n\n💡 *Soraty ny anaran'ny filière iray raha mila ny antsipiriany.*`,
                quickReplies: ['2. Universités', '3. Concours', '🔁 Retour']
            };
        }
        if (t === '2' || t.includes('UNIV')) {
            return {
                reply: `🏫 **Universités & Grandes Écoles (2026) :**\n\n` +
                       Object.values(KNOWLEDGE.universites).join('\n\n'),
                quickReplies: ['1. Filières', '3. Concours', '🔁 Retour']
            };
        }
        if (t === '3' || t.includes('CONCOURS') || t.includes('FOMBA')) {
            return {
                reply: `🔑 **Modalités d'accès (Madagascar 2026) :**\n\n` +
                       `• **Polytechnique (ESPA/ESPD)** : Concours national (Novembre).\n` +
                       `• **Médecine** : Sélection sur dossier (PACES).\n` +
                       `• **ENI / ESSA / ENS / IHSM** : Concours d'entrée (Septembre/Octobre).\n` +
                       `• **DEGS / FLSH** : Test d'accès ou sélection sur dossier.\n\n` +
                       `⚠️ *Tandremo ny daty fametrahana dossier.*`,
                quickReplies: ['4. Débouchés', '1. Filières', '🔁 Retour']
            };
        }
        if (t === '4' || t.includes('DEBOUCHE')) {
            return {
                reply: `💼 **Débouchés & Métiers :**\n\n` +
                       `Ny diplôme Licence (L) dia manokatra varavarana amin'ny asa teknika, fa ny Master (M) kosa no ilaina amin'ny tosy andraikitra ambony (Cadre).\n\n` +
                       `🌟 *Expertise régionale:* Logistique (Toamasina), Santé (Mahajanga), Informatique (Fianar), Marines (Toliara).`,
                quickReplies: ['1. Filières', '🔁 Retour']
            };
        }
    }

    return {
        reply: `🤖 **Mpanolotsaina Tsarafandray :**\n\n` +
               `Tsy azoko tsara ny fanontanianao. Afaka manontany momba ny filière, ny oniversite, na ny série-nao ianao.\n\n` +
               `👉 *Soraty "menu" raha hiverina amin'ny fiantombohana.*`,
        quickReplies: ['A1/A2/L', 'C/D/S', 'OSE', 'Technique']
    };
}

function getDomaineInfo(key) {
    const d = KNOWLEDGE.domaines[key];
    return {
        reply: `${d.titre}\n\n` +
               `📖 **Description:** ${d.desc}\n` +
               `🏫 **Écoles:** ${d.ecoles}\n` +
               `💼 **Métiers:** ${d.metiers}\n` +
               `⏳ **Diplôme:** ${d.diplome}\n` +
               `🌐 **Site:** ${d.site}`,
        quickReplies: ['1. Filières', '2. Universités', '🔁 Retour']
    };
}

function getUnivInfo(key) {
    const info = KNOWLEDGE.universites[key];
    return {
        reply: `🏫 **Détails Université :**\n\n${info}\n\n💡 *Manontania filière iray raha mila fanazavana fanampiny.*`,
        quickReplies: ['1. Filières', '2. Universités', '🔁 Retour']
    };
}

module.exports = { handleOrientationMessage };
