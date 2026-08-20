// Module d'Orientation Post-BACC Expert (Français & Malgache) - Tsarafandray Services
// Base de données massive et intelligence conversationnelle avancée.

const KNOWLEDGE = {
    series: {
        'A1': { name: 'A1 (Littéraire / Langues)', alias: ['L', 'LITTERAIRE'], mg: 'Taranja A1 (Literatiora sy Fiteny)', filieres: ['Lettres', 'Communication', 'Droit', 'Tourisme', 'ENS (Enseignement)', 'Langues (Chinois, Japonais, Allemand)', 'Journalisme'] },
        'A2': { name: 'A2 (Sciences Humaines)', alias: ['L', 'LITTERAIRE'], mg: 'Taranja A2 (Siansa Olombelona)', filieres: ['Droit', 'Sociologie', 'Science Politique', 'Administration', 'Journalisme', 'ENS', 'Histoire/Géo'] },
        'C': { name: 'C (Mathématiques)', alias: ['S', 'SCIENTIFIQUE'], mg: 'Taranja C (Matematika)', filieres: ['Polytechnique (ESPA)', 'Informatique (ENI)', 'Médecine', 'Architecture', 'Énergie', 'ENS (Sciences)', 'IHSM (Sciences Marines)'] },
        'D': { name: 'D (Sciences)', alias: ['S', 'SCIENTIFIQUE'], mg: 'Taranja D (Siansa)', filieres: ['Médecine', 'Médecine Vétérinaire', 'Agronomie (ESSA)', 'IHSM (Halieutique)', 'Biologie', 'Paramédical', 'ENS (SVT/Chimie)'] },
        'OSE': { name: 'OSE (Économie)', alias: ['ECO'], mg: 'Taranja OSE (Toekarena)', filieres: ['Gestion', 'Économie', 'Commerce', 'Marketing', 'Comptabilité', 'INSCAE', 'ISCAM', 'Administration'] },
        'TECH': { name: 'Technique (G, F)', alias: ['G', 'F', 'G1', 'G2'], mg: 'Taranja Teknika', filieres: ['IST', 'Génie Civil', 'Électronique', 'Comptabilité', 'Informatique de gestion', 'Polytechnique Diego'] }
    },
    domaines: {
        'INFORMATIQUE': {
            titre: '💻 Informatique & Digital',
            desc: 'Le secteur le plus porteur. Madagascar devient un hub de l\'outsourcing digital.',
            ecoles: '• **ENI Fianarantsoa** : La référence publique (Génie Logiciel, Réseaux).\n• **IT University (ITU)** : Référence privée, Andoharanofotsy.\n• **ISPM Antsobolo** : Informatique & Robotique.\n• **ESPA Vontovorona** : Génie Logiciel & Systèmes.',
            metiers: 'Développeur Fullstack, Architecte Cloud, Data Scientist, Expert en Cybersécurité.',
            diplome: 'Licence (3 ans), Master (5 ans).'
        },
        'ENS': {
            titre: '🎓 ENS (École Normale Supérieure)',
            desc: 'Formation des futurs enseignants et cadres de l\'éducation.',
            ecoles: '• **ENS Antananarivo** (Ampefiloha) : Lettres, Sciences, Histoire-Géo.\n• **ENS Fianarantsoa** : Spécialisée en Pédagogie et Sciences.',
            metiers: 'Professeur de Lycée/Collège, Inspecteur de l\'éducation, Concepteur de programmes scolaires.',
            diplome: 'Licence d\'enseignement (3 ans), Master (5 ans). Accès sur concours national.'
        },
        'IHSM': {
            titre: '🌊 IHSM (Institut Halieutique et des Sciences Marines)',
            desc: 'Unique centre d\'excellence en océanographie et gestion des ressources marines.',
            ecoles: '• **IHSM Toliara** : Sciences Marines, Halieutique, Environnement côtier.',
            metiers: 'Ingénieur Halieute, Océanographe, Gestionnaire d\'aires marines protégées, Expert en aquaculture.',
            diplome: 'Licence (3 ans), Ingéniorat (5 ans), Master (5 ans). Concours pour les séries C et D.'
        },
        'ESSA': {
            titre: '🌱 ESSA (École Supérieure des Sciences Agronomiques)',
            desc: 'Formation des leaders de l\'agriculture et du développement rural.',
            ecoles: '• **ESSA Ankatso** : Agriculture, Élevage, Eaux et Forêts, Agro-management, Industries Agricoles.',
            metiers: 'Ingénieur Agronome, Manager d\'exploitation, Expert environnemental.',
            diplome: 'Ingénieur Agronome (5 ans). Concours très sélectif en Octobre.'
        },
        'ESPA': {
            titre: '🏗️ ESPA (Polytechnique Vontovorona)',
            desc: 'Formation des ingénieurs bâtisseurs de la nation.',
            ecoles: '• **ESPA Antananarivo** : Génie Civil, Télécoms, Mines, Météorologie, Hydraulique, BTP.',
            metiers: 'Ingénieur BTP, Ingénieur Mines, Expert Télécoms, Urbaniste.',
            diplome: 'Ingénieur (5 ans). Concours national.'
        },
        'SANTE': {
            titre: '🩺 Médecine & Sciences de la Santé',
            desc: 'Vocation humaine. Filières longues mais prestigieuses.',
            ecoles: '• **Facultés de Médecine** (Tana, Mahajanga, Fianar, Toamasina).\n• **IOSTM Mahajanga** (Dentaire).\n• **INFRP** (Paramédical).',
            metiers: 'Médecin, Chirurgien, Pharmacien, Dentiste, Infirmier, Sage-femme.',
            diplome: 'Paramédical (3 ans), Médecine (7-8 ans).'
        },
        'VETERINAIRE': {
            titre: '🐾 Médecine Vétérinaire',
            desc: 'Santé animale et sécurité alimentaire.',
            ecoles: '• **ESSA Vétérinaire** (Antananarivo) : Seule école publique de formation vétérinaire.',
            metiers: 'Vétérinaire, Inspecteur sanitaire, Expert en élevage.',
            diplome: 'Doctorat en Médecine Vétérinaire (6 ans).'
        },
        'DROIT': {
            titre: '⚖️ Droit & Science Politique',
            desc: 'Pour les carrières juridiques et administratives.',
            ecoles: '• **Faculté DEGS** (Toutes provinces).\n• **ENMG** (Magistrature - après Master).\n• **IEP Antananarivo** (Sciences Po).',
            metiers: 'Avocat, Magistrat, Notaire, Diplomate, Juriste.',
            diplome: 'Licence (3 ans), Master (5 ans).'
        },
        'GESTION': {
            titre: '📊 Gestion & Business',
            desc: 'Management, Audit et Entrepreneuriat.',
            ecoles: '• **INSCAE** (Référence Audit/Finance).\n• **ISCAM** (Référence Management).\n• **DEGS Gestion**.',
            metiers: 'Expert-comptable, Manager, Auditeur, Directeur financier.',
            diplome: 'Licence (3 ans), Master (5 ans).'
        }
    },
    universites: {
        'TANA': '🏛️ **Université d\'Antananarivo** (Ankatso) : La plus prestigieuse. Comprend ESPA, ESSA, ENS, DEGS, Médecine, FLSH.',
        'FIANAR': '💡 **Université de Fianarantsoa** : Leader en Informatique (ENI) et Droit.',
        'TOAMASINA': '🚢 **Université de Toamasina** : Forte en Gestion, Commerce et Droit.',
        'MAHAJANGA': '🦷 **Université de Mahajanga** : Spécialisée en Santé (Médecine, Dentaire) et Tourisme.',
        'TOLIARA': '🌊 **Université de Toliara** : Leader mondial en Sciences Marines (IHSM) et Agronomie.',
        'ANTSIRANANA': '⚙️ **Université d\'Antsiranana** (Diego) : Référence en Polytechnique et Énergie.'
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
                   `💬 *Afaka manontany mivantana koa ianao (ohatra: "Inona no fianarana ENS tsara indrindra?").*`,
            quickReplies: ['A1/A2 (L)', 'C/D (S)', 'OSE', 'Technique']
        };
    }

    // Détection d'intention naturelle (Priorité aux termes spécifiques)
    if (t.includes('ENS') || t.includes('ENSEIGNEMENT') || t.includes('MPAMPIANATRA')) return getDomaineInfo('ENS');
    if (t.includes('IHSM') || t.includes('MER') || t.includes('HALIEUTIQUE') || t.includes('RANO') || t.includes('TOLIARA')) return getDomaineInfo('IHSM');
    if (t.includes('ESSA') || t.includes('AGRO') || t.includes('VOLY') || t.includes('OMBY')) return getDomaineInfo('ESSA');
    if (t.includes('ESPA') || t.includes('POLYTECH') || t.includes('VONTOVORONA') || t.includes('INGENIEUR')) return getDomaineInfo('ESPA');
    if (t.includes('VETERINAIRE') || t.includes('VETO') || t.includes('BIBY')) return getDomaineInfo('VETERINAIRE');
    if (t.includes('INFO') || t.includes('DIGITAL') || t.includes('ORDINATEUR') || t.includes('CODAGE') || t.includes('ENI')) return getDomaineInfo('INFORMATIQUE');
    if (t.includes('MEDECINE') || t.includes('SANTE') || t.includes('DOKOTERA') || t.includes('FAHASALAMANA')) return getDomaineInfo('SANTE');
    if (t.includes('DROIT') || t.includes('LALANA') || t.includes('JURIDIQUE')) return getDomaineInfo('DROIT');
    if (t.includes('GESTION') || t.includes('COMMERCE') || t.includes('FITANTANANA') || t.includes('INSCAE')) return getDomaineInfo('GESTION');

    // Gestion de la série (Numérique ou Texte)
    if (userState.step === 'WAITING_SERIE') {
        let serie = null;
        if (t.includes('A1') || t.includes('A2') || t === 'L' || t === '1') serie = 'A2'; 
        else if (t.includes('C') || t.includes('D') || t === 'S' || t === '2') serie = 'D'; 
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
                       `\n\n💡 *Te hahafantatra momba ny iray amin'ireo ve ianao? Soraty fotsiny ny anarany (ohatra: "ENS" na "IHSM").*`,
                quickReplies: ['2. Universités', '3. Débouchés', '🔁 Retour']
            };
        }
        if (t === '2' || t.includes('UNIV')) {
            return {
                reply: `🏫 **Universités & Grandes Écoles à Madagascar :**\n\n` +
                       Object.values(KNOWLEDGE.universites).join('\n\n') +
                       `\n\n🌟 *Misy koa ny sekoly ambony privé (INSCAE, ITU, ISCAM, ACEEM...) ho an'ny fidirana haingana amin'ny asa.*`,
                quickReplies: ['1. Filières', '3. Débouchés', '🔁 Retour']
            };
        }
        if (t === '3' || t.includes('DEBOUCHE') || t.includes('ASA')) {
            return {
                reply: `💼 **Débouchés et Métiers Porteurs (2026) :**\n\n` +
                       `1. **Digital** : Développeur, Expert Sécurité (ENI, ITU).\n` +
                       `2. **Agronomie** : Ingénieur rural, Expert export (ESSA).\n` +
                       `3. **Éducation** : Enseignant certifié (ENS).\n` +
                       `4. **Économie Bleue** : Expert Halieutique (IHSM).\n` +
                       `5. **BTP/Mines** : Ingénieur Civil (ESPA).\n\n` +
                       `💡 *Ny sekoly lehibe (Grandes Écoles) no manome antoka asa haingana indrindra.*`,
                quickReplies: ['4. Système LMD', '1. Filières', '🔁 Retour']
            };
        }
        if (t === '4' || t.includes('LMD') || t.includes('TAONA')) {
            return {
                reply: `⏳ **Système LMD (Licence-Master-Doctorat) :**\n\n` +
                       `• **Licence (L)** : 3 taona (Bac+3). Ho lasa Technicien Supérieur.\n` +
                       `• **Master (M)** : 5 taona (Bac+5). Ho lasa Ingénieur na Manager.\n` +
                       `• **Doctorat (D)** : 8 taona (Bac+8). Ho lasa Expert na Chercheur.\n\n` +
                       `🔔 *Tandremo: Mila manao concours ny ankamaroan'ny sekoly lehibe (ESPA, ENI, Médecine, ENS, IHSM).*`,
                quickReplies: ['1. Filières', '2. Universités', '🔁 Retour']
            };
        }
    }

    // Réponse par défaut si rien n'est compris
    return {
        reply: `🤖 **Mpanolotsaina Tsarafandray :**\n\n` +
               `Tsy azoko tsara ny fanontanianao. Afaka manontany momba ny filière (Informatique, ENS, IHSM, ESSA, Médecine...), ny oniversite, na ny série-nao ianao.\n\n` +
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
