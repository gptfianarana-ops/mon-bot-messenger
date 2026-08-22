// Module d'Orientation Post-BACC Expert (Français & Malgache) - Tsarafandray Services
// Base de données massive et intelligence conversationnelle avancée (Expert UA 2026).

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
            titre: '⚖️ Droit & Science Politique (FDSP)',
            desc: 'Formation de profils rigoureux pour la justice et l\'administration publique.',
            ecoles: '• **Faculté de Droit (Ankatso)** : Droit Privé, Droit Public, Science Politique.\n• **IESAV Antsirabe** : Gestion & Développement territorial.',
            metiers: 'Avocat, Magistrat, Juriste, Notaire, Administrateur public, Diplomate.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Test d\'accès.',
            site: 'http://fdsp.univ-antananarivo.mg'
        },
        'ECONOMIE': {
            titre: '📊 Économie, Gestion & Sociologie (FEGS)',
            desc: 'Piloter l\'entreprise et analyser les transformations économiques.',
            ecoles: '• **Faculté EGS (Ankatso)** : Économie, Gestion, Sociologie.\n• **INSCAE / ISCAM** : Références privées en Business.',
            metiers: 'Économiste, Gestionnaire, Auditeur, Analyste, Sociologue, DRH.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Examen d\'entrée.',
            site: 'http://egs.univ-antananarivo.mg'
        },
        'LETTRES': {
            titre: '📚 Lettres, Langues & Sciences Humaines (FLSH)',
            desc: 'Analyse, médiation culturelle et transmission du patrimoine.',
            ecoles: '• **Faculté FLSH (Ankatso)** : Malgache, Français, Anglais, Histoire, Géo, Communication.',
            metiers: 'Enseignant, Journaliste, Traducteur, Communicant, Éditeur.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Concours d\'entrée.',
            site: 'http://flsh.univ-antananarivo.mg'
        },
        'MEDECINE': {
            titre: '🩺 Médecine humaine & Vétérinaire',
            desc: 'Excellence en santé, pratique clinique et recherche biomédicale.',
            ecoles: '• **Faculté de Médecine (Ankatso)** : Médecine, Pharmacie, Sciences infirmières.\n• **ESSA Vétérinaire** : Santé animale.',
            metiers: 'Médecin, Chirurgien, Vétérinaire, Pharmacien, Chercheur en santé.',
            diplome: 'Doctorat (7-8 ans), Paramédical (3 ans). Accès : Sélection sur dossier / Concours.',
            site: 'http://medecine.univ-antananarivo.mg'
        },
        'ESPA': {
            titre: '🏗️ Sciences de l\'Ingénieur (ESPA)',
            desc: 'Ingénierie, innovation et résolution de problèmes complexes.',
            ecoles: '• **Polytechnique Vontovorona** : Génie Civil, Informatique, Télécoms, Mines, Électronique.',
            metiers: 'Ingénieur, Chef de projet, Conducteur de travaux, Expert Télécoms.',
            diplome: 'Ingénieur (5 ans). Accès : Concours national.',
            site: 'http://espa.univ-antananarivo.mg'
        },
        'ESSA': {
            titre: '🌱 Agronomie & Développement Rural (ESSA)',
            desc: 'Leader en production, foresterie, agroalimentaire et aménagement rural.',
            ecoles: '• **ESSA Ankatso** : Agriculture, Élevage, Foresterie, Agro-management.',
            metiers: 'Ingénieur Agronome, Conseiller agricole, Responsable de production.',
            diplome: 'Ingénieur (5 ans). Accès : Concours d\'entrée.',
            site: 'http://essa.univ-antananarivo.mg'
        },
        'ENS': {
            titre: '🎓 École Normale Supérieure (ENS)',
            desc: 'Formation des professionnels de l\'éducation et de la pédagogie.',
            ecoles: '• **ENS Ampefiloha** : Langues, Sciences Humaines, Sciences Exactes, EPS.',
            metiers: 'Enseignant de Lycée, Conseiller pédagogique, Formateur.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Concours d\'entrée.',
            site: 'http://ens.univ-antananarivo.mg'
        },
        'SCIENCES': {
            titre: '🔬 Faculté des Sciences',
            desc: 'Bases scientifiques solides et recherche utile au développement.',
            ecoles: '• **Faculté des Sciences (Ankatso)** : Biologie, Physique, Chimie, Mathématiques, Informatique.',
            metiers: 'Chercheur, Biologiste, Écologue, Technicien de laboratoire.',
            diplome: 'Licence (3 ans), Master (5 ans). Accès : Sélection sur dossier.',
            site: 'http://sciences.univ-antananarivo.mg'
        },
        'INFORMATIQUE': {
            titre: '💻 Informatique & Digital',
            desc: 'Secteur en pleine explosion. Madagascar hub du digital.',
            ecoles: '• **ENI Fianarantsoa** (Référence).\n• **ESPA / Faculté des Sciences** (Public).\n• **IT University / ISPM** (Privé).',
            metiers: 'Développeur, Architecte Cloud, Data Scientist, Expert Cybersécurité.',
            diplome: 'Licence (3 ans), Master (5 ans).',
            site: 'http://eni.univ-fianar.mg'
        }
    },
    universites: {
        'TANA': '🏛️ **Université d\'Antananarivo** : Le centre d\'excellence. 8 Facultés, 2 Écoles (ESPA, ESSA), 1 Institut (ENS). Accueille plus de 16 formations majeures.',
        'FIANAR': '💡 **Université de Fianarantsoa** : Leader en Informatique (ENI) et Pédagogie.',
        'TOAMASINA': '🚢 **Université de Toamasina** : Spécialiste en Logistique, Commerce et Droit.',
        'MAHAJANGA': '🦷 **Université de Mahajanga** : Pôle Santé (Médecine, Dentaire) et Tourisme.',
        'TOLIARA': '🌊 **Université de Toliara** : Référence mondiale en Sciences Marines (IHSM).',
        'ANTSIRANANA': '⚙️ **Université d\'Antsiranana** : Pôle Polytechnique et Énergies.',
        'VAKINAKARATRA': '🚜 **Université de Vakinankaratra** : Agronomie (IESAV) et Génie Rural.',
        'ANALANJIROFO': '🌴 **Université d\'Ananalanjirofo** : Agro-management et Informatique.'
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
                   `💬 *Afaka manontany mivantana koa ianao (ohatra: "Inona ny filière misy ao amin'ny ESPA?").*`,
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
    if (t.includes('DROIT') || t.includes('LALANA') || t.includes('FDSP')) return getDomaineInfo('DROIT');
    if (t.includes('ECONOMIE') || t.includes('GESTION') || t.includes('FEGS') || t.includes('EGS')) return getDomaineInfo('ECONOMIE');
    if (t.includes('LETTRES') || t.includes('LANGUES') || t.includes('FLSH')) return getDomaineInfo('LETTRES');
    if (t.includes('MEDECINE') || t.includes('DOKOTERA') || t.includes('SANTE')) return getDomaineInfo('MEDECINE');
    if (t.includes('ESPA') || t.includes('POLYTECH') || t.includes('VONTOVORONA')) return getDomaineInfo('ESPA');
    if (t.includes('ESSA') || t.includes('AGRO') || t.includes('VOLY')) return getDomaineInfo('ESSA');
    if (t.includes('ENS') || t.includes('MPAMPIANATRA')) return getDomaineInfo('ENS');
    if (t.includes('SCIENCES') || t.includes('SIANSA')) return getDomaineInfo('SCIENCES');
    if (t.includes('INFO') || t.includes('DIGITAL') || t.includes('ENI')) return getDomaineInfo('INFORMATIQUE');

    // Logique de série
    if (userState.step === 'WAITING_SERIE') {
        let serie = null;
        if (t.includes('A1') || t.includes('A2') || t === 'L') serie = 'A2'; 
        else if (t.includes('C') || t.includes('D') || t === 'S') serie = 'D'; 
        else if (t.includes('OSE')) serie = 'OSE';
        else if (t.includes('TECH')) serie = 'TECH';

        if (serie) {
            userState.currentSerie = serie;
            userState.step = 'MENU_EXPERT';
            const data = KNOWLEDGE.series[serie];
            return {
                reply: `✅ **Série ${data.name}** voaray.\n\n` +
                       `Inona no tianao ho fantatra?\n\n` +
                       `1️⃣ **Filières** : Inona ny fianarana azoko atao?\n` +
                       `2️⃣ **Écoles** : Sekoly aiza no tena tsara?\n` +
                       `3️⃣ **Accès** : Inona ny fomba idirana (Concours/Dossier)?\n` +
                       `4️⃣ **Débouchés** : Inona ny asa azo atao?\n\n` +
                       `👉 *Soraty ny laharana (1-4).*`,
                quickReplies: ['1. Filières', '2. Écoles', '3. Accès', '4. Débouchés']
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
                quickReplies: ['2. Écoles', '3. Accès', '🔁 Retour']
            };
        }
        if (t === '2' || t.includes('ECOLE')) {
            return {
                reply: `🏫 **Écoles & Facultés recommandées :**\n\n` +
                       Object.values(KNOWLEDGE.universites).join('\n\n'),
                quickReplies: ['1. Filières', '3. Accès', '🔁 Retour']
            };
        }
        if (t === '3' || t.includes('ACCES') || t.includes('FOMBA')) {
            return {
                reply: `🔑 **Modalités d'accès (UA 2026) :**\n\n` +
                       `• **ESPA/ESSA/ENS** : Concours national (Septembre/Octobre).\n` +
                       `• **Droit/EGS/FLSH** : Test d'accès ou Examen d'entrée.\n` +
                       `• **Médecine/Sciences** : Sélection sur dossier (Très sélectif).\n\n` +
                       `⚠️ *Jereo tsara ny daty fametrahana dossier.*`,
                quickReplies: ['4. Débouchés', '1. Filières', '🔁 Retour']
            };
        }
        if (t === '4' || t.includes('DEBOUCHE')) {
            return {
                reply: `💼 **Débouchés & Carrières :**\n\n` +
                       `Ny diplôme Licence (L) dia manokatra varavarana amin'ny asa teknika, fa ny Master (M) kosa no ilaina amin'ny tosy andraikitra ambony (Cadre).\n\n` +
                       `🌟 *Ohatra:* Ingénieur (5 taona), Médecin (8 taona), Avocat (Master + Stage).`,
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
        quickReplies: ['1. Filières', '2. Écoles', '🔁 Retour']
    };
}

function getUnivInfo(key) {
    const info = KNOWLEDGE.universites[key];
    return {
        reply: `🏫 **Détails Université :**\n\n${info}\n\n💡 *Manontania filière iray raha mila fanazavana fanampiny.*`,
        quickReplies: ['1. Filières', '2. Écoles', '🔁 Retour']
    };
}

module.exports = { handleOrientationMessage };
