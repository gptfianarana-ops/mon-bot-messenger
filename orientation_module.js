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
        'FIANAR': '💡 **Université de Fianarantsoa** : Leader en Informatique (ENI), Droit et Sciences.',
        'TOAMASINA': '🚢 **Université de Toamasina** : Forte en Gestion, Commerce, Droit et Logistique Portuaire.',
        'MAHAJANGA': '🦷 **Université de Mahajanga** : Spécialisée en Santé (Médecine, Dentaire) et Tourisme/Hôtellerie.',
        'TOLIARA': '🌊 **Université de Toliara** : Leader mondial en Sciences Marines (IHSM) et Agronomie.',
        'ANTSIRANANA': '⚙️ **Université d\'Antsiranana** (Diego) : Référence en Polytechnique (Génie Mécanique, Énergie) et Lettres.',
        'VAKINAKARATRA': '🚜 **Université de Vakinankaratra** (Antsirabe) : Spécialisée en Génie Rural, Agronomie (IES-AV) et Info-Com.',
        'ANALANJIROFO': '🌴 **Université d\'Ananalanjirofo** (Fenerive-Est) : Agro-management, Agro-production et Informatique.'
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
                   `💬 *Afaka manontany mivantana koa ianao (ohatra: "Inona no filière misy any Toliara?").*`,
            quickReplies: ['A1/A2 (L)', 'C/D (S)', 'OSE', 'Technique']
        };
    }

    // Détection d'intentions régionales
    if (t.includes('TOLIARA') || t.includes('TOLIARY')) return getUnivInfo('TOLIARA');
    if (t.includes('TOAMASINA') || t.includes('TAMATAVE')) return getUnivInfo('TOAMASINA');
    if (t.includes('MAHAJANGA') || t.includes('MAJANGA')) return getUnivInfo('MAHAJANGA');
    if (t.includes('ANTSIRANANA') || t.includes('DIEGO')) return getUnivInfo('ANTSIRANANA');
    if (t.includes('FIANAR') || t.includes('FIANARANTSOA')) return getUnivInfo('FIANAR');
    if (t.includes('TANA') || t.includes('ANTANANARIVO') || t.includes('ANKATSO')) return getUnivInfo('TANA');
    if (t.includes('VAKINAKARATRA') || t.includes('ANTSIRABE')) return getUnivInfo('VAKINAKARATRA');
    if (t.includes('ANALANJIROFO') || t.includes('FENERIVE')) return getUnivInfo('ANALANJIROFO');

    // Détection d'intention naturelle (Domaines)
    if (t.includes('ENS') || t.includes('ENSEIGNEMENT') || t.includes('MPAMPIANATRA')) return getDomaineInfo('ENS');
    if (t.includes('IHSM') || t.includes('MER') || t.includes('HALIEUTIQUE') || t.includes('RANO')) return getDomaineInfo('IHSM');
    if (t.includes('ESSA') || t.includes('AGRO') || t.includes('VOLY') || t.includes('OMBY')) return getDomaineInfo('ESSA');
    if (t.includes('ESPA') || t.includes('POLYTECH') || t.includes('VONTOVORONA') || t.includes('INGENIEUR')) return getDomaineInfo('ESPA');
    if (t.includes('VETERINAIRE') || t.includes('VETO')) return getDomaineInfo('VETERINAIRE');
    if (t.includes('INFO') || t.includes('DIGITAL') || t.includes('ORDINATEUR') || t.includes('ENI')) return getDomaineInfo('INFORMATIQUE');
    if (t.includes('MEDECINE') || t.includes('SANTE') || t.includes('DOKOTERA')) return getDomaineInfo('SANTE');
    if (t.includes('DROIT') || t.includes('LALANA') || t.includes('JURIDIQUE')) return getDomaineInfo('DROIT');
    if (t.includes('GESTION') || t.includes('COMMERCE') || t.includes('INSCAE')) return getDomaineInfo('GESTION');

    // Gestion de la série
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
                       `\n\n💡 *Te hahafantatra momba ny iray amin'ireo ve ianao? Soraty ny anarany (ohatra: "IHSM", "ENS", "Toliara").*`,
                quickReplies: ['2. Universités', '3. Débouchés', '🔁 Retour']
            };
        }
        if (t === '2' || t.includes('UNIV')) {
            return {
                reply: `🏫 **Universités & Grandes Écoles à Madagascar :**\n\n` +
                       Object.values(KNOWLEDGE.universites).join('\n\n') +
                       `\n\n🌟 *Afaka manoratra anaran-tanàna ianao raha mila ny antsipiriany (ohatra: "Antsirabe", "Fenerive").*`,
                quickReplies: ['1. Filières', '3. Débouchés', '🔁 Retour']
            };
        }
        if (t === '3' || t.includes('DEBOUCHE') || t.includes('ASA')) {
            return {
                reply: `💼 **Débouchés et Métiers Porteurs (2026) :**\n\n` +
                       `1. **Digital** : Développeur (ENI Fianar, ITU Tana).\n` +
                       `2. **Agronomie** : Ingénieur rural (ESSA Tana, UniVak Antsirabe).\n` +
                       `3. **Éducation** : Enseignant (ENS Tana/Fianar).\n` +
                       `4. **Économie Bleue** : Expert Halieutique (IHSM Toliara).\n\n` +
                       `💡 *Ny sekoly lehibe (Grandes Écoles) no manome antoka asa haingana indrindra.*`,
                quickReplies: ['4. Système LMD', '1. Filières', '🔁 Retour']
            };
        }
        if (t === '4' || t.includes('LMD') || t.includes('TAONA')) {
            return {
                reply: `⏳ **Système LMD (Licence-Master-Doctorat) :**\n\n` +
                       `• **Licence (L)** : 3 taona (Bac+3).\n` +
                       `• **Master (M)** : 5 taona (Bac+5).\n` +
                       `• **Doctorat (D)** : 8 taona (Bac+8).\n\n` +
                       `🔔 *Tandremo: Mila manao concours ny ankamaroan'ny sekoly lehibe (ESPA, ENI, Médecine, ENS, IHSM).*`,
                quickReplies: ['1. Filières', '2. Universités', '🔁 Retour']
            };
        }
    }

    // Réponse par défaut
    return {
        reply: `🤖 **Mpanolotsaina Tsarafandray :**\n\n` +
               `Tsy azoko tsara ny fanontanianao. Afaka manontany momba ny filière (Informatique, ENS, IHSM...), ny oniversite (Toliara, Antsirabe, Fenerive...), na ny série-nao ianao.\n\n` +
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

function getUnivInfo(key) {
    const info = KNOWLEDGE.universites[key];
    return {
        reply: `🏫 **Détails Université :**\n\n${info}\n\n💡 *Te hahafantatra momba ny filière iray ve ianao? Soraty ny anarany (ohatra: "Droit", "Gestion", "Agronomie").*`,
        quickReplies: ['1. Filières', '2. Universités', '🔁 Retour']
    };
}

module.exports = { handleOrientationMessage };
