// Module d'Orientation Post-BACC Expert (Français & Malgache) - Tsarafandray Services
// Base de données massive et intelligence conversationnelle avancée.

const KNOWLEDGE = {
    series: {
        'A1': { name: 'A1 (Littéraire / Langues)', alias: ['L', 'LITTERAIRE'], mg: 'Taranja A1 (Literatiora sy Fiteny)', filieres: ['Lettres', 'Communication', 'Droit', 'Tourisme', 'Enseignement'] },
        'A2': { name: 'A2 (Sciences Humaines)', alias: ['L', 'LITTERAIRE'], mg: 'Taranja A2 (Siansa Olombelona)', filieres: ['Droit', 'Sociologie', 'Science Politique', 'Administration', 'Journalisme'] },
        'C': { name: 'C (Mathématiques)', alias: ['S', 'SCIENTIFIQUE'], mg: 'Taranja C (Matematika)', filieres: ['Polytechnique', 'Informatique (ENI)', 'Médecine', 'Architecture', 'Énergie'] },
        'D': { name: 'D (Sciences)', alias: ['S', 'SCIENTIFIQUE'], mg: 'Taranja D (Siansa)', filieres: ['Médecine', 'Médecine Vétérinaire', 'Agronomie (ESSA)', 'Biologie', 'Environnement', 'Paramédical'] },
        'OSE': { name: 'OSE (Économie)', alias: ['ECO'], mg: 'Taranja OSE (Toekarena)', filieres: ['Gestion', 'Économie', 'Commerce', 'Marketing', 'Comptabilité'] },
        'TECH': { name: 'Technique (G, F)', alias: ['G', 'F', 'G1', 'G2'], mg: 'Taranja Teknika', filieres: ['IST', 'Génie Civil', 'Électronique', 'Comptabilité', 'Informatique de gestion'] }
    },
    domaines: {
        'INFORMATIQUE': {
            titre: '💻 Informatique & Digital',
            desc: 'Le secteur le plus porteur. Madagascar devient un hub de l\'outsourcing digital.',
            ecoles: '• ENI Fianarantsoa (La référence publique, concours très sélectif).\n• IT University (ITU) Andoharanofotsy : Référence privée, campus moderne.\n• ISPM Antsobolo : Pionnier polytechnique privé.\n• ESPA Vontovorona (Génie Logiciel & Systèmes).',
            metiers: 'Développeur Fullstack, Architecte Cloud, Data Scientist, Expert en Cybersécurité, Product Manager.',
            diplome: 'Licence (L3 - 3 ans) pour être opérationnel, Master (M2 - 5 ans) pour l\'expertise et le management.'
        },
        'SANTE': {
            titre: '🩺 Médecine & Sciences de la Santé',
            desc: 'Vocation humaine. Filières longues mais prestigieuses.',
            ecoles: '• Facultés de Médecine (Ankatso, Mahajanga, Fianar, Toamasina).\n• École de Kinésithérapie (Mahajanga).\n• Instituts de formation paramédicale (Infirmiers, Sages-femmes).',
            metiers: 'Médecin spécialiste, Chirurgien, Pharmacien, Dentiste, Infirmier d\'État, Sage-femme.',
            diplome: 'Paramédical (3 ans), Médecine générale (7-8 ans), Spécialisation (+3 ans).'
        },
        'VETERINAIRE': {
            titre: '🐾 Médecine Vétérinaire',
            desc: 'Spécialité dédiée à la santé animale et à la santé publique (zoonoses).',
            ecoles: '• ESSA Ankatso (École Supérieure des Sciences Agronomiques) - Mention Médecine Vétérinaire.\n• Faculté de Médecine d\'Antananarivo (Département Vétérinaire).',
            metiers: 'Vétérinaire praticien, Inspecteur sanitaire, Chercheur en santé animale, Responsable d\'élevage.',
            diplome: 'Doctorat en Médecine Vétérinaire (DVM) - 6 ans d\'études après le Bac (Concours sélectif).'
        },
        'DROIT': {
            titre: '⚖️ Droit, Justice & Administration',
            desc: 'Pour ceux qui aiment la rigueur, l\'analyse et la justice.',
            ecoles: '• Faculté DEGS (Antananarivo, Mahajanga, Toamasina, Toliara).\n• UCM (Université Catholique de Madagascar).\n• IEP (Institut d\'Études Politiques).',
            metiers: 'Avocat au barreau, Magistrat (Concours ENMG), Notaire, Commissaire-priseur, Juriste d\'affaires, Diplomate.',
            diplome: 'Licence (3 ans), Master (5 ans). L\'entrée à l\'ENMG nécessite souvent un Master.'
        },
        'AGRONOMIE': {
            titre: '🌱 Agronomie, Élevage & Environnement',
            desc: 'Secteur stratégique pour l\'autosuffisance alimentaire et l\'exportation.',
            ecoles: '• ESSA Ankatso (École Supérieure des Sciences Agronomiques).\n• IHSM Toliara (Sciences Marines & Halieutiques).\n• GRESE Antsiranana.',
            metiers: 'Ingénieur Agronome, Manager d\'exploitation agricole, Expert en conservation forestière, Consultant en développement rural.',
            diplome: 'Ingénieur (5 ans) ou Technicien Supérieur (3 ans).'
        },
        'GESTION': {
            titre: '📊 Gestion, Finance & Management',
            desc: 'Le cœur du monde des affaires et de la banque.',
            ecoles: '• INSCAE (Référence en Audit/Finance).\n• ISCAM (Référence en Marketing/Management).\n• Faculté DEGS (Économie & Gestion).\n• ESSCA (Gestion & Comptabilité).',
            metiers: 'Expert-comptable, Auditeur, Directeur Financier (CFO), Manager Marketing, Entrepreneur.',
            diplome: 'Licence (3 ans), Master (5 ans). MBA pour les cadres.'
        },
        'ARCHITECTURE': {
            titre: '🏛️ Architecture & Génie Civil',
            desc: 'Pour les bâtisseurs alliant art et technique.',
            ecoles: '• ESPA Vontovorona (Génie Civil).\n• ISPM (Architecture).\n• ESS Polytechnique Diego.',
            metiers: 'Architecte, Ingénieur BTP, Chef de chantier, Urbaniste.',
            diplome: 'Licence (3 ans), Diplôme d\'Ingénieur/Architecte (5 ans).'
        },
        'TOURISME': {
            titre: '🏨 Tourisme, Hôtellerie & Langues',
            desc: 'Secteur en plein renouveau, idéal pour ceux qui aiment les langues et le contact.',
            ecoles: '• Université de Mahajanga (Tourisme).\n• ESSVA Antsirabe.\n• INTH (Institut National du Tourisme et de l\'Hôtellerie).',
            metiers: 'Manager d\'hôtel, Guide touristique professionnel, Responsable d\'agence de voyage, Interprète.',
            diplome: 'Licence Pro (3 ans).'
        }
    },
    universites: {
        'TANA': 'Université d\'Antananarivo (Ankatso) : La plus grande, multidisciplinaire (ESPA, ESSA, DEGS, FLSH).',
        'FIANAR': 'Université de Fianarantsoa : Leader en Informatique (ENI) et Sciences.',
        'TOAMASINA': 'Université de Toamasina : Spécialisée en Gestion, Commerce et Sciences Marines.',
        'MAHAJANGA': 'Université de Mahajanga : Référence en Santé et Odonto-Stomatologie.',
        'TOLIARA': 'Université de Toliara : Leader en Sciences Marines (IHSM) et Agronomie.',
        'ANTSIRANANA': 'Université d\'Antsiranana : Spécialisée en Polytechnique (Diego) et Énergie.'
    }
};

function handleOrientationMessage(text, userState) {
    const t = text.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Initialisation ou retour au début
    if (t === 'ORIENTATION' || t === 'MENU' || t === 'START') {
        userState.step = 'WAITING_SERIE';
        return {
            reply: `🧭 **CONSEILLER EXPERT EN ORIENTATION (Tsarafandray)**\n\n` +
                   `Miarahaba anao! Izaho no mpanolotsaina anao amin'ny dingana manaraka aorian'ny BACC.\n\n` +
                   `📍 **Inona ny Série-nao? (Soraty na safidio):**\n` +
                   `• **A1 / A2** (Littéraire / L)\n` +
                   `• **C / D** (Scientifique / S)\n` +
                   `• **OSE** (Économie)\n` +
                   `• **TECH** (Technique)\n\n` +
                   `💬 *Afaka manontany mivantana koa ianao (ohatra: "Inona no fianarana informatique tsara indrindra?").*`,
            quickReplies: ['A1/A2 (L)', 'C/D (S)', 'OSE', 'Technique']
        };
    }

    // Détection d'intention naturelle (Priorité aux termes spécifiques)
    if (t.includes('VETERINAIRE') || t.includes('VETO') || t.includes('BIBY')) return getDomaineInfo('VETERINAIRE');
    if (t.includes('INFO') || t.includes('DIGITAL') || t.includes('ORDINATEUR') || t.includes('CODAGE')) return getDomaineInfo('INFORMATIQUE');
    if (t.includes('MEDECINE') || t.includes('SANTE') || t.includes('DOKOTERA') || t.includes('FAHASALAMANA')) return getDomaineInfo('SANTE');
    if (t.includes('DROIT') || t.includes('LALANA') || t.includes('JURIDIQUE')) return getDomaineInfo('DROIT');
    if (t.includes('AGRO') || t.includes('AGRONOMIE') || t.includes('VOLY') || t.includes('OMBY')) return getDomaineInfo('AGRONOMIE');
    if (t.includes('GESTION') || t.includes('COMMERCE') || t.includes('FITANTANANA') || t.includes('AUDIT')) return getDomaineInfo('GESTION');
    if (t.includes('ARCHI') || t.includes('ARCHITECTURE') || t.includes('BTP') || t.includes('TRANO')) return getDomaineInfo('ARCHITECTURE');
    if (t.includes('TOURISM') || t.includes('HOTEL') || t.includes('FITANTANANA NY MPIHANTRA')) return getDomaineInfo('TOURISME');

    // Gestion de la série (Numérique ou Texte)
    if (userState.step === 'WAITING_SERIE') {
        let serie = null;
        if (t.includes('A1') || t.includes('A2') || t === 'L' || t === '1') serie = 'A2'; // A2 par défaut pour L
        else if (t.includes('C') || t.includes('D') || t === 'S' || t === '2') serie = 'D'; // D par défaut pour S
        else if (t.includes('OSE') || t === '3') serie = 'OSE';
        else if (t.includes('TECH') || t === '4') serie = 'TECH';

        if (serie) {
            userState.currentSerie = serie;
            userState.step = 'MENU_EXPERT';
            const data = KNOWLEDGE.series[serie];
            return {
                reply: `✅ **Série ${data.name}** voaray.\n\n` +
                       `Inona no tianao ho fantatra manokana?\n\n` +
                       `1️⃣ **Filières** : Inona no fianarana azoko atao?\n` +
                       `2️⃣ **Universités** : Oniversite aiza no misy an'izany?\n` +
                       `3️⃣ **Débouchés** : Inona ny asa azo atao any aoriana?\n` +
                       `4️⃣ **LMD** : Haharitra firy taona ny fianarana?\n\n` +
                       `👉 *Soraty ny laharana (1-4) na safidio ny bokotra.*`,
                quickReplies: ['1. Filières', '2. Universités', '3. Débouchés', '4. Système LMD']
            };
        }
    }

    // Navigation numérique dans le MENU_EXPERT
    if (userState.step === 'MENU_EXPERT') {
        if (t === '1' || t.includes('FILIERE')) {
            const data = KNOWLEDGE.series[userState.currentSerie];
            return {
                reply: `📚 **Filières possibles pour ${userState.currentSerie} :**\n\n` +
                       data.filieres.map(f => `🔹 ${f}`).join('\n') + 
                       `\n\n💡 *Te hahafantatra momba ny iray amin'ireo ve ianao? Soraty fotsiny ny anarany.*`,
                quickReplies: ['2. Universités', '3. Débouchés', '🔁 Retour']
            };
        }
        if (t === '2' || t.includes('UNIV')) {
            return {
                reply: `🏫 **Universités Publiques à Madagascar :**\n\n` +
                       Object.values(KNOWLEDGE.universites).join('\n\n') +
                       `\n\n🌟 *Misy koa ny sekoly ambony privé (ITU, ISPM, ISCAM...) ho an'ny fidirana haingana amin'ny asa.*`,
                quickReplies: ['1. Filières', '3. Débouchés', '🔁 Retour']
            };
        }
        if (t === '3' || t.includes('DEBOUCHE') || t.includes('ASA')) {
            return {
                reply: `💼 **Débouchés et Métiers Porteurs (2026) :**\n\n` +
                       `1. **Digital** : Développeur, Expert Sécurité.\n` +
                       `2. **Agronomie** : Ingénieur rural, Expert export.\n` +
                       `3. **Santé** : Médecin, Paramédical, Vétérinaire.\n` +
                       `4. **Droit/Gestion** : Juriste, Comptable.\n\n` +
                       `💡 *Ny fianarana teknika (IST) no manome asa haingana indrindra (3 taona).*`,
                quickReplies: ['4. Système LMD', '1. Filières', '🔁 Retour']
            };
        }
        if (t === '4' || t.includes('LMD') || t.includes('TAONA')) {
            return {
                reply: `⏳ **Système LMD (Licence-Master-Doctorat) :**\n\n` +
                       `• **Licence (L)** : 3 taona (Bac+3). Ho lasa Technicien Supérieur.\n` +
                       `• **Master (M)** : 5 taona (Bac+5). Ho lasa Ingénieur na Manager.\n` +
                       `• **Doctorat (D)** : 8 taona (Bac+8). Ho lasa Expert na Chercheur.\n\n` +
                       `🔔 *Tandremo: Mila manao concours ny ankamaroan'ny sekoly lehibe (ESPA, ENI, Médecine).*`,
                quickReplies: ['1. Filières', '2. Universités', '🔁 Retour']
            };
        }
    }

    // Réponse par défaut si rien n'est compris
    return {
        reply: `🤖 **Mpanolotsaina Tsarafandray :**\n\n` +
               `Tsy azoko tsara ny fanontanianao. Afaka manontany momba ny filière (Informatique, Médecine, Vétérinaire, Droit...), ny oniversite, na ny série-nao ianao.\n\n` +
               `👉 *Soraty "menu" raha hiverina amin'ny fiantombohana.*`,
        quickReplies: ['A1/A2', 'C/D', 'OSE', 'Technique']
    };
}

function getDomaineInfo(key) {
    const d = KNOWLEDGE.domaines[key];
    return {
        reply: `${d.titre}\n\n` +
               `📖 **Description:** ${d.desc}\n` +
               `🏫 **Écoles:** ${d.ecoles}\n` +
               `💼 **Métiers:** ${d.metiers}\n` +
               `⏳ **Diplôme:** ${d.diplome}`,
        quickReplies: ['1. Filières', '2. Universités', '🔁 Retour']
    };
}

module.exports = { handleOrientationMessage };
