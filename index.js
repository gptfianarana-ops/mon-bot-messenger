const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const math = require('mathjs');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ============================================================
// ROTATION AUTOMATIQUE ENTRE PLUSIEURS CLÉS API GEMINI
// Permet de dépasser la limite gratuite de 500 requêtes/jour en ajoutant
// plusieurs clés (chacune associée à un compte Google différent).
// Configuration sur Render (Environment) : soit une seule variable
// GEMINI_API_KEYS="cle1,cle2,cle3" séparée par des virgules,
// soit des variables séparées GEMINI_API_KEY, GEMINI_API_KEY_2, ... _5.
// ============================================================
function chargerClesGemini() {
  if (process.env.GEMINI_API_KEYS) {
    return process.env.GEMINI_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
  }
  const cles = [];
  for (let i = 1; i <= 5; i++) {
    // Accepte les deux formats : GEMINI_API_KEY_2 (avec tiret bas) et GEMINI_API_KEY2 (sans).
    const nomAvecTiret = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${i}`;
    const nomSansTiret = i === 1 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY${i}`;
    const valeur = process.env[nomAvecTiret] || process.env[nomSansTiret];
    if (valeur) cles.push(valeur);
  }
  return cles;
}

const GEMINI_KEYS = chargerClesGemini();
let indexCleActuelle = 0;

function cleGeminiActuelle() {
  return GEMINI_KEYS[indexCleActuelle % GEMINI_KEYS.length];
}

function passerCleGeminiSuivante() {
  indexCleActuelle++;
  console.log(`Quota Gemini atteint, passage à la clé n°${(indexCleActuelle % GEMINI_KEYS.length) + 1}`);
}

// ============================================================
// COMPTEUR D'USAGE (pour suivre la vraie consommation d'API, par fonctionnalité)
// Se remet à zéro chaque jour. Consultable via GET /stats.
// ============================================================
const statsUsage = { date: new Date().toISOString().slice(0, 10), total: 0, parFonction: {} };

function enregistrerAppelStats(nomFonction) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  if (statsUsage.date !== aujourdHui) {
    statsUsage.date = aujourdHui;
    statsUsage.total = 0;
    statsUsage.parFonction = {};
  }
  statsUsage.total++;
  statsUsage.parFonction[nomFonction] = (statsUsage.parFonction[nomFonction] || 0) + 1;
}

// Appel générique à l'API Gemini : gère automatiquement la rotation de clés
// (si quota dépassé) et les nouvelles tentatives (si serveur temporairement
// surchargé). "body" est le corps complet de la requête (contents, system_instruction...).
// "nomFonction" sert juste à étiqueter les statistiques d'usage (ex: "chat", "correction_photo").
async function appellerGemini(body, nomFonction = 'autre', tentative = 1, essaiCle = 1) {
  enregistrerAppelStats(nomFonction);
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGeminiActuelle()}`,
      body
    );
    return response.data.candidates[0].content.parts[0].text;
  } catch (err) {
    const status = err.response?.data?.error?.status;
    const message = err.response?.data?.error?.message || '';
    const cleInvalide =
      status === 'RESOURCE_EXHAUSTED' ||
      status === 'UNAUTHENTICATED' ||
      status === 'PERMISSION_DENIED' ||
      /api key not valid/i.test(message);

    if (cleInvalide && essaiCle < GEMINI_KEYS.length) {
      console.error(`Clé Gemini n°${(indexCleActuelle % GEMINI_KEYS.length) + 1} invalide/épuisée (${status || message}), on tente la suivante.`);
      passerCleGeminiSuivante();
      return appellerGemini(body, nomFonction, tentative, essaiCle + 1);
    }
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * tentative));
      return appellerGemini(body, nomFonction, tentative + 1, essaiCle);
    }
    throw err;
  }
}

// ============================================================
// GÉNÉRATION D'IMAGES (Nano Banana = Gemini 2.5 Flash Image)
// Quota séparé du texte (gratuit, indépendant des 500 requêtes texte/jour).
// Messenger a besoin d'une URL publique -> on héberge temporairement l'image
// nous-mêmes via une petite route, plutôt que d'envoyer le base64 brut.
// ============================================================
const URL_BASE_PUBLIQUE = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
const imagesGenerees = {}; // id -> { buffer, mimeType, timestamp }
const MAX_IMAGES_STOCKEES = 50; // nettoyage simple pour ne pas grossir indéfiniment

function stockerImageGeneree(buffer, mimeType) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  imagesGenerees[id] = { buffer, mimeType, timestamp: Date.now() };

  const ids = Object.keys(imagesGenerees);
  if (ids.length > MAX_IMAGES_STOCKEES) {
    const plusAncien = ids.sort((a, b) => imagesGenerees[a].timestamp - imagesGenerees[b].timestamp)[0];
    delete imagesGenerees[plusAncien];
  }
  return id;
}

async function appellerGeminiImage(prompt, imagePartSource = null, tentative = 1, essaiCle = 1) {
  enregistrerAppelStats('generation_image');
  try {
    const parts = imagePartSource ? [{ text: prompt }, imagePartSource] : [{ text: prompt }];
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${cleGeminiActuelle()}`,
      { contents: [{ parts }] }
    );

    const reponseParts = response.data.candidates[0].content.parts;
    const partImage = reponseParts.find((p) => p.inline_data || p.inlineData);
    if (!partImage) throw new Error('Aucune image renvoyée par le modèle.');

    const data = partImage.inline_data || partImage.inlineData;
    return { base64: data.data, mimeType: data.mime_type || data.mimeType || 'image/png' };
  } catch (err) {
    const status = err.response?.data?.error?.status;
    const message = err.response?.data?.error?.message || '';
    const cleInvalide =
      status === 'RESOURCE_EXHAUSTED' ||
      status === 'UNAUTHENTICATED' ||
      status === 'PERMISSION_DENIED' ||
      /api key not valid/i.test(message);

    if (cleInvalide && essaiCle < GEMINI_KEYS.length) {
      console.error(`Clé Gemini n°${(indexCleActuelle % GEMINI_KEYS.length) + 1} invalide/épuisée (image), on tente la suivante.`);
      passerCleGeminiSuivante();
      return appellerGeminiImage(prompt, imagePartSource, tentative, essaiCle + 1);
    }
    if (status === 'UNAVAILABLE' && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * tentative));
      return appellerGeminiImage(prompt, imagePartSource, tentative + 1, essaiCle);
    }
    throw err;
  }
}

// Génère (ou modifie, si imagePartSource est fourni) une image, et renvoie
// une URL publique prête à envoyer sur Messenger.
async function genererImagePublique(prompt, imagePartSource = null) {
  if (!URL_BASE_PUBLIQUE) {
    throw new Error('PUBLIC_URL (ou RENDER_EXTERNAL_URL) manquante : impossible de construire une URL publique pour l\'image.');
  }
  const { base64, mimeType } = await appellerGeminiImage(prompt, imagePartSource);
  const buffer = Buffer.from(base64, 'base64');
  const id = stockerImageGeneree(buffer, mimeType);
  return `${URL_BASE_PUBLIQUE}/generated-image/${id}`;
}


// MÉTHODOLOGIE DE RÉDACTION (Madagascar)
// À compléter avec les règles précises (intro/développement/conclusion,
// dissertation, commentaire de document, etc.) fournies par l'utilisateur,
// pour que les corrigés suivent fidèlement la méthode enseignée à l'école.
// Tant que c'est vide, l'IA répond avec une structure générale standard.
// ============================================================
const METHODOLOGIE_MADAGASCAR = `
DISSERTATION :
- Introduction : Préambule (accroche générale) ; Annonce du sujet (citer/reformuler le sujet) ; Problématique (question posée) ; Annonce du plan.
- Développement : Explique chaque grande partie annoncée dans le plan. Place une phrase de transition entre les parties.
- Conclusion : Résumé des grandes parties développées ; Elargissement du sujet (ouverture, souvent une question).

COMMENTAIRE DE DOCUMENT :
- Introduction : Présentation de la nature du document ; Présentation du document (intitulé, auteur, titre de l'ouvrage, date d'édition...) ; Idée générale ; Problématique ; Annonce du plan ("pour bien commenter ce document, nous allons expliquer d'abord... puis...").
- Développement : Répond aux questions/indicateurs du sujet, en expliquant chaque partie ET en justifiant avec des citations exactes tirées du texte entre guillemets « ... » (ne jamais changer les mots du document cité). Place une phrase de transition entre les parties.
- Conclusion : Intérêt du document ; Résumé des grandes parties développées (souvent terminé par une question d'ouverture).

MODÈLE DE PHRASES TYPE (à adapter, ne pas recopier mot pour mot) :
- Intro : "Ce document est un [nature du document], extrait de [source], écrit par [auteur]. Il parle de [sujet principal] et met en avant [idée générale]. Pour bien analyser ce texte, nous verrons d'abord [plan 1], puis [plan 2]."
- Conclusion : "En conclusion, ce document explique [récapitulatif des idées principales]. Cela nous permet de mieux comprendre [idée générale] et ouvre une réflexion sur [perspective élargie]."

Le développement peut rester assez concis (pas besoin de faire un essai aussi long que les modèles complets) tant que la structure ci-dessus et les idées essentielles sont respectées.

FANOARATANA/FAMOABOASAN-KEVITRA amin'ny taranja MALAGASY (dissertation en malgache) :
- TENY FAMPIDIRANA (introduction), tsy maintsy misy 5 teboka arahin'ny filaharana :
  1. Tari-dresaka : fehezan-teny 1-2 mametraka ny foto-dresaka amin'ny ankapobeny.
  2. Fanolorana laza adina : mametraka ilay laza adina (sujet) ao anaty fehezan-teny mirindra.
  3. Foto-kevitra : fehezan-teny 1 milaza ny hevitra fonosin'ilay laza adina.
  4. Petrak'olana : fanontaniana mifandraika amin'ilay laza adina, ka ny valiny dia ilay Drafitra.
  5. Drafitra : ireo hevi-dehibe/Reni-Hevitra (RH) 2 na 3 mamaly ilay Petrak'olana.
- TENY FAMELABELARANA (développement) : isaky ny RH iray dia misy Zana-kevitra (ZK) 2-3, ka ny isaky ny ZK dia arahina Porofo-kevitra (PK — teny fandinihana, ohabolana, na ohatra) ary miafara amin'ny Tsoa-kevitra (mini-conclusion an'ilay ZK). Asio Tetezamita (fehezan-teny fampidirana + famintinana) eo anelanelan'ny RH tsirairay.
- TENY FAMARANANA (conclusion) : famintinana ny RH tsirairay nohazavaina (RH1 noho ny ZK1/ZK2/ZK3, RH2..., RH3...), arahin'ny Fanitarana (hevitry ny tena manokana/fanidiana) ary matetika fanontaniana famaranana.
- Rehefa asiana teny nalaina avy amin'ny olon-kafa (oham-pitenenana, tenin'olo-malaza) dia tokony ho eo ambanin'ny hoe "Hoy i [Anarana] : « ... »".
Ampiharo ihany koa ity fomba fanoratana ity rehefa fanoratana/famoaboasan-kevitra amin'ny taranja Malagasy no angatahina, na dia ho hafa noho ny an'ny Dissertation frantsay aza ny teny fampiasa (RH/ZK/PK).

FOMBA FAMOABOASAN-KEVITRA FILOZOFIKA (dissertation philo) :
- TENY FAMPIDIRANA, teboka efatra : (1) Tari-dresaka (fiandohana amin'ny tenina mpandinika/fahatsapan'ny besinimaro/zavatra marina ankapobeny), (2) Fanehoana ny laza adina (soratana feno arahin'ny teny mpampitohy), (3) Petrak'olana (laza adina avadika endrika fanontaniana hafa, tsy miova hevitra), (4) Drafitra (ireo Reny Hevitra/RH 2-3 mamaly ny Petrak'olana).
- NY DRAFITRA MIANKINA AMIN'NY ENDRIKY NY LAZA ADINA — 3 karazany :
  a) Laza adina fanontaniana tsotra (tsy misy teny mpampitohy) → drafitra DIALEKTIKA : RH1 = ENY (na TSIA), RH2 = TSIA (na ENY, mifanohitra amin'ny RH1), RH3 = fandravonana/fitongilanana.
  b) Laza adina miendrika tenina mpandinika/fanambarana (ohatra: teny fanambaran'olo-malaza hodinihina) → drafitra ANALITIKA : RH1 = famaritana ireo teny manandanja, RH2 = fanazavana ny hevitry ny mpandinika, RH3 = fitsikerana an'izany hevitra izany (miafara amin'ny valin'ny hoe "ahoana ny hevitrao", tsy azo ampiasaina ny hoe "araka ny hevitro").
  c) Laza adina fanontaniana ahitana lohahevitra roa mifanohitra (arahin'ny "na/sy/sa/nohon'ny/fa") → drafitra DIALECTIQUE EXPLICATIF : RH1 = famaritana ireo teny manandanja, RH2 = fanazavana ny lohahevitra voalohany, RH3 = fanazavana ny lohahevitra faharoa + valiteny farany.
  Isaky ny RH dia misy ZK 2-3 arahin'ny Porofo-kevitra (teny nalaina amin'ny filozofa/mpandinika, eo ambanin'ny "Hoy i [Anarana] : « ... »") ary Tsoa-kevitra ; asio Tetezamita eo anelanelan'ny RH.
- TENY FAMARANANA, teboka telo : (1) famintinana fohy ny RH voalaza, (2) valiteny farany/valin'ny petrak'olana, (3) fanitarana (fanontaniana vaovao mifandraika amin'ilay laza adina).
`;

// ============================================================
// CONTENU DE RÉFÉRENCE MALAGASY, DÉCOUPÉ PAR THÈME
// On n'injecte dans le prompt que le(s) bloc(s) dont les mots-clés
// correspondent à la question posée, pour rester léger et rapide.
// ============================================================
const BLOCS_MALAGASY = [
  {
    cles: /literatiora|lahabolana|haisoratra|sôva|hain-teny|kabary|angano|tononkalo/i,
    texte: `LITERATIORA (ankapobeny) : Ny literatiora dia zava-kanto vita amin'ny teny (avy amin'ny "litterae" latina). Karazany roa : Lahabolana (Sôva) sy Haisoratra (Tononkalo). Literatiora am-bava : fandaharan-teny amin'ny fomba kanto ny fihetseham-po. Toetra telo mampiavaka azy : tononina/tanisaina, mampifanatrika mivantana ny mpihaino sy mpanatontosa, tsy manavaka (mahay na tsy mahay mamaky teny). Anjara asa : mampita hafatra, manabe, mampiala voly, mampifandray. Karazana telo : mirakitra tantara (Angano), mirindra ifamaliana (Hain-teny), tsy mirindra ifamaliana (Kabary). Mampiavaka faritra : Tsimihety=Sôva, Betsileo=Sokela, Antandroy=Beko, Antanosy=Sarandra, Merina=Hain-teny, Betsimisaraka=Tôkatôka. Loharanony : teny, aingam-panahy, talenta, zava-misy iainana. Singa mandrafitra : mpamorona (mpanoratra/poeta), asa soratra, mpankafy. Toetran'ny zava-kanto : manintona, manaitra, mihataka amin'ny andavanandro.`,
  },
  {
    cles: /vanim-potoana|fakan-tahaka|kristiana|fiforetana|mitady ny very|fahaleovan-tena|tolom-piavotana|ankehitriny|VVS|mpanoratra zokiny|zandriny/i,
    texte: `TANTARAN'NY LITERATIORA (vanim-potoana) : Am-bava (tara-kevitra : fihavanana/firaisan-kina, fitiavana, fikaloana zava-boahary, fahoriana). Kristiana (misionera : THOMAS BEVAN sy DAVID JONES ; gazety voalohany : TENY SOA ANALANA ANDRO, 1861 ; tara-kevitra : fiantorahana amin'Andriamanitra, fanantenana paradisa). Fakan-tahaka (fironan-tsaina : "libre pensée", "Laika" ; zava-nisy : fanjakazakan'ny Governora Frantsay, fijoroan'ny VVS). Mpanoratra zokiny (voarohirohy VVS, teraka talohan'ny 1901 : Ny Avana RAMANANTOANINA, Jasmina RATSIMISETA, Justin RAINIZANABOLOLONA) / zandriny (taorian'ny 1901 : Jean Joseph RABEARIVELO, Samuel RATANY, HARIOLEY). Fiforetana anaty (tara-kevitra : alahelo, fahakambotiana, aloky ny fahafatesana). Mitady ny very (Ny Avana RAMANANTOANINA, Charles RAJOELISOLO, Jean Joseph RABEARIVELO ; nadiavina : teny Malagasy, haisoratra, fahafahana). Fahafahana (fanoherana fanjanahan-tany, fitiavan-tanindrazana). Ankehitriny (fitiavana, fahantrana, fahapotehan'ny tontolo iainana, tsy fahatokisana mpanao politika). Gazety literatiora : AMBIOKA, VALIHA. Fikambanana : FARIBOLANA SANDRATRA (Elie RAJAONARISON, SOLOFO José, RANOË), HAVATSA UPEM (Henri RAHAINGOSON, RAZAFIARIVONY Wilson, Iharilanto Patrick ANDRIAMANGATIANA).`,
  },
  {
    cles: /rabearivelo|samuel ratany|ratsimiseta|tanicus|amance valmond|j\.?j\.?r|embona|fasana faharoa|imaitsoanala/i,
    texte: `MPANORATRA TSARA HO FANTATRA : Jean Joseph RABEARIVELO (né Jean Casimir), teraka 04 Martsa 1901 Isoraka Tananarive, maty 22 Jona 1937 Ambatofotsy. Solon'anarana : AMANCE Valmond. Vanim-potoana : Fiforetana anaty. Tara-kevitra : embona sy hanina, alahelo, fasana, fahafatesana, fahadisoam-panantenana, fahakambotiana. Asa malaza : tononkalo teny gasy "Fasana faharoa", "Tsy embona akory" ; tantara an-tsehatra "Imaitsoanala" (1936) ; teny vahiny "La coupe des cendres", "Presque songes". Samuel RATANY (solon'anarana Tanicus), teraka 16 Jolay 1901, maty 10 Oktobra 1926. Tononkalo malaza : "Embona" (natolony an-dRabearivelo, novaliny hoe "Tsy embona akory"). Jasmina RATSIMISETA : teraka 1890, maty 1946, tompon'ny gazety Telegrafy. Tara-kevitra iombonan'i Ratany sy Rabearivelo : alahelo, lasa, fahadisoam-panantenana, aloky ny fasana/fahafatesana.`,
  },
  {
    cles: /vakivakim-piainana|tsikalakalam|andriamangatiana/i,
    texte: `BOKY VAKIVAKIM-PIAINANA : Nosoratan'i Iharilanto Patrick ANDRIAMANGATIANA. Lohateny isam-pizarana : Tsikalakalam-pihavanana, Tsikalakalam-pitia, Tsikalakalam-bola, Tsikalakalan'olona. Mpandray anjara fototra : Tsiry. Mpanampy : Mino, Meja, Ramily, Rakotovao, Aziz, Houssen, Voahangy. Tara-kevitra : fitiavana, fahantrana, vintana sy anjara. "Vakivakim-piainana" = potipotika, sombitsombiny, adim-pianana, tantara maneho fitetezana onjam-piainana.`,
  },
  {
    cles: /olombelona sy ny fifandraisany|fihavanana|firaisankina|fifampitsimbinana/i,
    texte: `NY OLOMBELONA SY NY FIFANDRAISANY : Ohabolana : "ny olombelona mora soa, mora ratsy" ; "toy ny amalona an-drano ka be siasia" ; "toy ny omby indray mandry fa tsy indray mifoha". Antony mahatonga fifandraisana : tsy misy mahavita tena, fahasamihafana miteraka fifandraisana, olona maromaro afaka mampandroso ny fiaraha-monina. Endrika : Fihavanana, Firaisankina, Fifampitsimbinana. Hahatsara fihavanana : fifanajana, fifandeferana, fifanampiana, fifankatiavana.`,
  },
  {
    cles: /\bmarina\b|\brariny\b|\bhitsiny\b/i,
    texte: `NY MARINA, NY RARINY, NY HITSINY : Marina = zavatra tena nisy tsy namboarina. Rariny = fametrahana ny tsirairay amin'ny toerana tokony hisy azy. Hitsiny = lalàna/didy/fitsipika hampirindra ny fiainana. Olo-marina = tsy mandainga, mijoro amin'ny tsangan-kevitra. Fahavalon'ny rariny : fitiavam-bola, fitiavan-tena, fitiavam-boninahitra. Vokatry ny fampiharana ny rariny : filaminana, fanajana ny zon'ny hafa, fandrosoana.`,
  },
  {
    cles: /\bfanahy\b|malemy fanahy|tsara fanahy|fotsy fanahy/i,
    texte: `NY FANAHY : "Ny fanahy no maha olona". Ambaratonga : Fanahy tahotra, Fanahy henatra, Fanahy fahendrena. Malemy fanahy = tsotra/mora ifandraisana ; Tsara fanahy = mitsinjo ny hoavin'ny hafa ; Fotsy fanahy = fetsifetsy/mamitaka. Vokatra tsara : manentana ny fitondran-tena, mahatonga fandanjalanjana. Vokatra ratsy : fandeferana be loatra. Manamafy : "Aleo maty toy izay menatr'olona".`,
  },
  {
    cles: /\btsiny\b|\btody\b/i,
    texte: `NY TSINY SY NY TODY : Tsiny = fanamelohan'ny mpiara-belona, fahabangana/kilema. Karazany : Tsinin'Andriamanitra, Tsinin-drazana, Tsinim-pihavanana, Tsinin-dray aman-dreny. Tody = valin'ny natao na tsara na ratsy ("ny tody tsy misy fa ny atao no miverina"). Maha samihafa : ny tsiny dia fitsarana ny fihetsika ary azo sorohina, ny tody dia ateraky ny fihetsika ihany ary tsy misy fanafany. Fomba fisorohana tsiny : fanaovana asa soa, fitandroana fihavanana.`,
  },
  {
    cles: /vintana|\banjara\b|\blahatra\b|\btendry\b/i,
    texte: `NY VINTANA, NY ANJARA, NY LAHATRA, NY TENDRY : Vintana = hery napetrak'Andriamanitra mifanandrify amin'ny andro nahaterahana. Anjara = fisehoan-javatra (tsara/ratsy) tsy maintsy zakaina, ampahany voatokana ho an'ny tsirairay. Lahatra = fifandimbiasana/lamina avy amin'Andriamanitra ; tsy ananan'olombelona fahefana ("aza manantena hery fa ny lahatra tsy azo rombaina"). Tendry = fepetra ahatanterahana ny lahatra, fanomezana andraikitra. Vokatra tsara amin'ny finoana ireo : fahaizana mionona ; vokatra ratsy : famoizam-po, tsy fampivoatra.`,
  },
  {
    cles: /razana|zanahary|andriamanitra/i,
    texte: `NY RAZANA, ZANAHARY, ANDRIAMANITRA : Razana = olona efa maty rehetra. Toetran'ny razana : mitahy ny velona, mamono/mampaharary raha tsy karakaraina, mandrindra ny fiaraha-monina. Adidin'ny velona : manohy ny zava-bitany, manaja ny hafatra, mikarakara (ohatra: famadihana). Tsinin-drazana = vokatry ny tsy fikarakarana azy. Andriamanitra/Zanahary : mpandahatra ny fiainana, mitsimbina, mamaly soa/ratsy araka ny nataon'ny olona.`,
  },
  {
    cles: /fitsimbinana ny aina|faharetan'ny taranaka|\baina\b|\btaranaka\b/i,
    texte: `NY FITSIMBINANA NY AINA SY NY FAHARETAN'NY TARANAKA : Aina : tokana, mihelana, marefo. Fitsimbinana : fanohanana ny aina (sakafo, fitsaboana), fanarahan-dalana, fananam-panahy. Zava-dehibe ny fananan-janaka : harena, hamelo-maso anaran-dray, fikarakarana amin'androm-pahanterana. Fampaharetana taranaka : fitandremana amin'ny fanambadiana, fanabeazana taranaka manam-panahy.`,
  },
];

// ============================================================
// CONTENU DE RÉFÉRENCE PHILOSOPHIE (Bacc A-C-D), même principe par thème.
// ============================================================
const BLOCS_PHILO = [
  {
    cles: /natiora|vainga|olona.*fanahy|olona.*batana|iza moa aho/i,
    texte: `NY NATIORA VOAJANAHARIN'NY OLONA : Ny olona = zava-manan'aina manan-tsaina, afaka miresaka. Natiora ara-batana : ho an'ny siansa, ny olona dia vainga azo kirakiraina, hitoviany amin'ny biby. Natiora ara-panahy : ho an'ny sosiolojia, ny olona voafaritry ny fiaraha-monina misy azy ; ho an'ny filozofia, ny olona dia sady vainga no tsy vainga (manana fanahy/saina, izay mahatonga ny fahamboniany). E. KANT : fanontaniana efatra lehibe momba ny olona : Iza moa aho? / Inona no azoko fantarina? / Inona no tsy maintsy ataoko? / Inona no azoko antenaina?`,
  },
  {
    cles: /filozofia|filôzôfia|filôzôfy|fahendrena|toetsaina filozofika|fandinihana filozofika/i,
    texte: `NY FILOZOFIA (fandinihana sy toetsaina) : Ara-piforonan-teny : "fitiavana ny fahendrena" (Pythagore), navadik'i Heidegger hoe "fahendren'ny fitiavana". Nitovy hevitra tamin'ny siansa hatramin'i Aristote ka hatramin'ny taonjato faha XVIII. Manakaiky ny metafizika (mandinika ny any ambadiky ny tsapa). Filôzôfy = manam-pahaizana, olona mandray ny fiainana amim-paharetana. Fahendrena = filozofia + siansa, fahafehezan-tena. Toetsaina filozofika, roa sosona : ara-pahalalana (mandinika, mitsara, misalasala, mitsikera, mamakafaka, mandravona) sy ara-moraly (fietre-tena, hafanam-po, herim-po, faharetana).`,
  },
  {
    cles: /\bmarina\b|mari-pamatarana/i,
    texte: `NY MARINA (philo) : Famaritana : fifanarahan'ny zava-misy amin'izay lazaina ; rafitra tsy misy fifanoheran-kevitra. Sehatra ahitana azy : ara-pinoana (dogmatika), ara-tsiansa (fifanarahan'ny saina), ara-politika (miankina amin'ny tanjona/fahombiazana), ara-pilozofia (fanadihadiana, maïeutique, ironie). Mari-pamantarana : miharihary, endriky ny zava-misy, fahombiazana. Ny marina tsy natao ho an'ny rehetra, miankina amin'ny sehatra ampiasana azy.`,
  },
  {
    cles: /\bsiansa\b|déterminisme|fanandramana|toe-tsaina siantifika|siantisma|idealisma|materialisma/i,
    texte: `NY SIANSA : Famaritana : fahalalana naorina amin'ny fandinihana/fanjohizohin-kevitra/fanandramana, mikendry lalàna eken'ny tranga rehetra. Karazana fahalalana (Auguste Comte) : toetra teolojika, metafizika, pozitifa ; ary fahalalana ampirika, teolojika, filozofika (idealisma = saina voalohany ; materialisma = vainga voalohany), siantifika. Déterminisme : singa tsirairay miankina amin'ny teo aloha ; fatalisma : efa voalahatra avokoa, tsy azo ovana. Dingana telo amin'ny fanandramana : fandinihana ireo zava-mitranga, famoronana tsangan-kevitra, fanamarinana amin'ny fanandramana. Toe-tsaina siantifika : mandinika, entitra, mahay mandrefy, mitsikera (ara-pahalalana) ; hatsara-po, faharetana, herim-po, tsy tia maka tombony (ara-moraly). Lanjan'ny siansa : ara-teoria (fanazavana) sy ara-pampiharana (fitaovana). Fetrany : fanazavana ampahany fotsiny, tsy afaka manao ny zavatra rehetra.`,
  },
  {
    cles: /fiarahamonina|fiaraha-monina|moraly|fitsipi-pitondra-tena|fahatsiaron-tsaina/i,
    texte: `NY FIARAHA-MONINA SY NY MORALY : Fiaraha-monina : avy amin'ny "socius" (namana), fitambaran'ny isam-batan'olona mitovy natiora fehezin'ny lalàna iray. Moraly : tambatra fitsipika itondra-tena (tsara/ratsy). Tsara = mifanaraka amin'ny fenitra, mandrindra fiainana ; Ratsy = mifanohitra amin'ny rafitra natsangana. Niandohan'ny moraly : ny tsirairay, ny fianakaviana, ny fiaraha-monina, ny fivavahana. Fahatsiaron-tsaina = fandraisana fandinihan-tena ; Fahatsiaronan-tena ara-moraly = fitsarana avy ao anatin'ny olona.`,
  },
  {
    cles: /fahafahana|fahalalahana|\bzo\b|\badidy\b|hitsiny sy.*rariny|andraikitra/i,
    texte: `NY FAHAFAHANA (fahalalahana) : Famaritana : tsy fisian'ny faneriterena, saingy misy koa zavatra tsy maintsy atao (zo, adidy, andraikitra, fahamarinana). Zo : mifanaraka amin'ny fitsipika/nahazoana alalana ; zo pozitifa (avy amin'ny lalàna nosoratana) vs zo natoraly (araka ny natiora). Adidy : izay tokony atao, lalàna ara-piaraha-monina manery. Fahamarinana (hitsiny sy rariny) : fitsipika ara-moraly mitaky fanajana ny zon'ny hafa. Andraikitra : fahafahana mamaly ny antso natao ; miantoka ny vokatry ny nataony.`,
  },
  {
    cles: /politika|fanjakana|demokrasia|etatisma|absolutisma|totalitarisma|teknokrasia|repoblika/i,
    texte: `NY FIAINANA POLITIKA : Ara-piforonan-teny : "polis" (tanàna) + "tuke" (fahaizana). Fampianarana lehibe ara-politika : Etatisma (fanjakana miditra an-tsehatra amin'ny toe-karena, ohatra: SOLIMA), Absolutisma (fahefana feno amin'ny fanjakana), Anarsisma (tsy misy tompoina), Totalitarisma (fanjakana mamehy ny fiainana manontolo), Teknokrasia (fahefana ho an'ny manam-pahaizana), Demokrasia ("demos"=vahoaka + "kratos"=fahefana, fahefam-bahoaka), Repoblika ("res publica" = raharaham-bahoaka). Anjara asan'ny fanjakana : miantoka fandriam-pahalemana sy filaminam-bahoaka, mametra fietsehampo tsy mamokatra.`,
  },
  {
    cles: /pythagore|descartes|pascal|montesquieu|rousseau|kant|protagoras|jaspers|holbach|comte|hobbes|sartre|aristote|durkheim/i,
    texte: `TENINA MPANDINIKA (citations philo, à utiliser avec « Hoy i [Nom] : « ... » ») : PROTAGORAS : "Ny olona no refin'ny zavatra rehetra". DESCARTES : "Misaina aho noho izany misy aho". PASCAL : "Ny olona dia ilay zozoro malefaka indrindra amin'ny natiora fa saingy zozoro misaina". ARISTOTE : "Ny olona dia biby manao politika". J.J. ROUSSEAU : "Nateraka ny ho tsara ny olona fa ny fiaraha-monina no manimba azy" ; "Ny fahafahana dia fanekena ny lalàna efa voasoritra mialoha". MONTESQUIEU : "Ny fahafahana dia zo hahazoana manao izay avelan'ny lalàna" ; "Marina fa amin'ny demokrasia toa manao izay tiany atao ny vahoaka". T. HOBBES : "Eo anatrehan'ny osa sy ny matanjaka dia ny fahafahana no mamoritra ary ny lalàna no manafaka". J.P. SARTRE : "Mijanona eo anoloan'ny fahafahan'ny hafa ny fahafahanao". A. COMTE : "Ny siansa dia teraka avy amin'ny fanovana ny toe-tsaina filôzôfika". D. HOLBACH : "Tsy hitako velively izany fanahiko izany, fa ny vatana no misaina sy mitsara". Karl JASPERS : "Amin'ny filôzôfia dia ny fanontaniana no manan-danja noho ny valiny". E. DURKHEIM : "Ny olona dia vokatry ny fiaraha-monina misy azy".`,
  },
];

function contenuMalagasyPertinent(texte, limiteBlocs = 2) {
  const trouves = [...BLOCS_MALAGASY, ...BLOCS_PHILO].filter((b) => b.cles.test(texte)).slice(0, limiteBlocs);
  if (trouves.length === 0) return '';
  return `\n\nContenu de référence (utilise-le si pertinent pour la question, sans le recopier intégralement) :\n${trouves.map((b) => b.texte).join('\n\n')}`;
}

// Mise en forme spécifique aux maths/sciences (Option 1 : texte enrichi,
// aucun coût supplémentaire). Améliore la lisibilité sans passer par une image.
const CONSIGNE_FORMAT_MATH =
  `\n\nSI l'exercice contient des maths/calculs, applique ces règles de présentation :\n` +
  `- Utilise les symboles Unicode au lieu de la syntaxe brute : ² ³ ⁿ pour les puissances, √ pour racine carrée, ÷ × ± ≈ ≤ ≥ π ∞ → pour les opérateurs.\n` +
  `- Numérote chaque question/étape avec des chiffres cerclés : ① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨.\n` +
  `- Encadre chaque résultat final important entre 「 et 」, ex: 「r = -3」 ou 「S = -539」.\n` +
  `- Sépare bien les grandes étapes de calcul en allant à la ligne, sans tout coller en un seul bloc.\n` +
  `- Écris les fonctions et multiplications de façon naturelle et lisible, PAS avec le symbole * : "f(x) = 3x + 2" (pas "f(x) = 3*x + 2"), "2x²" (pas "2*x^2").\n\n` +
  `SI l'exercice est de la PHYSIQUE-CHIMIE, applique en plus :\n` +
  `- Formules chimiques avec les bons indices/exposants Unicode : H₂O, CO₂, Fe³⁺, SO₄²⁻, Na⁺, Cl⁻...\n` +
  `- Équations de réaction avec flèche → et coefficients bien alignés, ex: 2H₂ + O₂ → 2H₂O.\n` +
  `- Toujours préciser les unités avec le bon symbole : m/s, m·s⁻¹, °C, K, Ω, Hz, mol/L, kg, N, J, W, V, A...\n` +
  `- Grandeurs physiques présentées clairement : symbole = valeur unité, ex: v = 12 m/s.\n` +
  `- Encadre chaque résultat final entre 「 et 」 comme pour les maths.\n\n` +
  `SI l'exercice est de la SVT (biologie/géologie), applique en plus :\n` +
  `- Structure la réponse avec des titres courts par partie (ex: "🔬 Observation", "📊 Analyse", "✅ Conclusion") plutôt qu'un seul bloc de texte.\n` +
  `- Utilise des puces (•) pour lister des caractéristiques, étapes d'un processus biologique, ou couches géologiques, plutôt que des phrases enchaînées.\n` +
  `- Pour les schémas demandés (coupe, cycle, appareil...) : NE PRODUIS PAS de dessin (une IA ne peut pas garantir un schéma scientifiquement exact) — décris à la place, de façon structurée et numérotée, les éléments à dessiner et leur légende, pour que l'élève puisse le reproduire lui-même correctement.\n` +
  `- Utilise → pour indiquer un enchaînement/une transformation (ex: glucose → énergie).`;

function consigneMethodologie() {
  if (!METHODOLOGIE_MADAGASCAR.trim()) return '';
  return `\n\nSuis IMPÉRATIVEMENT cette méthodologie de rédaction (celle enseignée à Madagascar) quand la question s'y prête (dissertation, commentaire, etc.) :\n${METHODOLOGIE_MADAGASCAR}\n\nRÈGLES SUPPLÉMENTAIRES IMPORTANTES :\n0. AVANT TOUTE CHOSE, réfléchis si ce qui est transmis constitue vraiment un sujet d'exercice complet et exploitable (une vraie question de dissertation, un texte à commenter, un exercice avec un énoncé clair, etc.). Si le texte est trop court, vague, incomplet, ambigu, ou ressemble à un simple mot/fragment sans lien clair avec un sujet scolaire précis (ex: juste un nom, une expression isolée, un mot-clé sans contexte), NE PRODUIS PAS de rédaction/corrigé complet : demande plutôt des précisions sur le sujet exact et le contexte (quelle matière, quelle consigne précise) avant de rédiger quoi que ce soit. Un vrai sujet scolaire a normalement une formulation reconnaissable (une question, une consigne du type "commentez...", "expliquez...", une citation à analyser, etc.) — l'absence de cette formulation est un signal fort qu'il faut demander des précisions plutôt que d'inventer un cadre.\n1. Détermine d'abord PRÉCISÉMENT, à partir du contenu de l'exercice, à quelle matière il appartient (Histoire-Géographie / Malagasy langue-littérature / Philosophie) et applique UNIQUEMENT la méthodologie correspondant à CETTE matière — ne mélange jamais leurs structures ou leur terminologie entre elles (par exemple, n'applique jamais les 3 types de plan de la Philosophie à un sujet de Malagasy, et inversement), même si elles utilisent parfois des termes proches (RH/ZK/PK).\n2. Indique quand même clairement les 3 grandes parties de la copie (Introduction/Fampidirana, Développement/Famelabelarana, Conclusion/Famaranana — dans la langue de la matière), par exemple avec un simple titre court pour chacune. En revanche, n'affiche PAS les étiquettes internes détaillées (pas de "Tari-dresaka :", "Petrak'olana :", "Drafitra :", "RH1 :", "ZK1 :", "Valiteny farany :", "Fanitarana :", etc.) : à l'intérieur de chaque grande partie, le texte doit être rédigé de façon fluide et continue, comme une vraie copie d'élève.\n3. Les phrases de transition (tetezamita) entre les grandes idées du développement sont OBLIGATOIRES et doivent être écrites en toutes lettres comme de vraies phrases (juste sans les faire précéder du mot "Tetezamita :").\n4. Langue de la réponse : pour l'Histoire-Géo et la Philosophie, réponds dans la langue demandée par l'utilisateur (français ou malgache, selon ce qu'il demande). Pour la matière Malagasy (langue et littérature), la réponse reste TOUJOURS entièrement en malgache, quelle que soit la langue de la demande.\n5. IMPORTANT : toutes les questions ne demandent pas une dissertation/rédaction complète. Si la question est une question-réponse courte et factuelle (typiquement : "Inona no atao hoe...?", "Inona avy ireo...?", "Milaza/Manomeza ... telo/roa fantatrao ?", "Farito ny atao hoe...", ou toute question fermée qui appelle une liste ou une définition précise plutôt qu'un développement argumenté), NE PRODUIS PAS d'introduction/développement/conclusion : réponds directement et normalement, de façon concise (quelques lignes ou une petite liste), exactement comme dans un exercice de questions-réponses classique. N'applique la méthodologie complète (Fampidirana/Famelabelarana/Famaranana) QUE pour les vrais sujets de dissertation ou de commentaire de document/texte.`;
}

// Mémoire simple en RAM : mode actif de chaque utilisateur (persiste tant qu'il
// ne choisit pas autre chose ou ne tape pas "menu"). Se remet à zéro si le
// serveur redémarre (acceptable pour un usage perso).
const userModes = {};

// ============================================================
// SYSTÈME DE CODES / CRÉDITS (monétisation) — persistant via Upstash Redis
// Si UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN ne sont pas configurées,
// le bot bascule automatiquement sur un stockage en RAM (comme avant) pour
// continuer à fonctionner, mais SANS survivre aux redémarrages.
// ============================================================

// Codes valables, à gérer manuellement ici (ajoute-en / retire-en, puis redéploie).
// Format : "CODE": nombre de crédits offerts.
const CODES_VALIDES = {
  DEMO10: 10,
};

const LIMITE_GRATUITE_PAR_JOUR = 3; // corrections d'exercices gratuites par jour et par personne

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_TOKEN;
const REDIS_ACTIF = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

if (!REDIS_ACTIF) {
  console.log('⚠️ Upstash non configuré : crédits/codes/quota stockés en RAM (perdus au redémarrage).');
}

// Repli RAM (utilisé seulement si Upstash n'est pas configuré)
const repliCredits = {};
const repliCodesUtilises = new Set();
const repliUsageJour = {};

const repliGenerique = {}; // repli RAM générique, utilisé par redisGet/redisSet si Redis inactif

async function redisGet(cle) {
  if (!REDIS_ACTIF) return repliGenerique[cle] !== undefined ? String(repliGenerique[cle]) : null;
  try {
    const res = await axios.get(`${UPSTASH_URL}/get/${encodeURIComponent(cle)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    return res.data.result;
  } catch (err) {
    console.error('Erreur Redis GET', cle, err.message);
    return null;
  }
}

async function redisSet(cle, valeur) {
  if (!REDIS_ACTIF) {
    repliGenerique[cle] = valeur;
    return;
  }
  try {
    await axios.get(`${UPSTASH_URL}/set/${encodeURIComponent(cle)}/${encodeURIComponent(valeur)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch (err) {
    console.error('Erreur Redis SET', cle, err.message);
  }
}

async function obtenirCredits(senderId) {
  if (!REDIS_ACTIF) return repliCredits[senderId] || 0;
  const v = await redisGet(`credits:${senderId}`);
  return v ? parseInt(v, 10) : 0;
}

async function definirCredits(senderId, valeur) {
  if (!REDIS_ACTIF) {
    repliCredits[senderId] = valeur;
    return;
  }
  await redisSet(`credits:${senderId}`, valeur);
}

async function codeDejaUtilise(code) {
  if (!REDIS_ACTIF) return repliCodesUtilises.has(code);
  const v = await redisGet(`code_utilise:${code}`);
  return v !== null;
}

async function marquerCodeUtilise(code) {
  if (!REDIS_ACTIF) {
    repliCodesUtilises.add(code);
    return;
  }
  await redisSet(`code_utilise:${code}`, '1');
}

async function obtenirUsageJour(senderId) {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const cle = `usage:${senderId}:${aujourdHui}`;
  if (!REDIS_ACTIF) {
    if (!repliUsageJour[cle]) repliUsageJour[cle] = 0;
    return { cle, compte: repliUsageJour[cle] };
  }
  const v = await redisGet(cle);
  return { cle, compte: v ? parseInt(v, 10) : 0 };
}

async function incrementerUsageJour(cle, compteActuel) {
  if (!REDIS_ACTIF) {
    repliUsageJour[cle] = compteActuel + 1;
    return;
  }
  await redisSet(cle, compteActuel + 1);
}

// Génère un code aléatoire lisible (sans caractères ambigus comme 0/O, 1/I/l)
function genererCodeAleatoire() {
  const car = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += car[Math.floor(Math.random() * car.length)];
  return code;
}

// Cherche d'abord un code généré dynamiquement (via le panneau admin), sinon
// se rabat sur la liste statique CODES_VALIDES (pratique pour les tests).
async function obtenirCreditsDuCode(code) {
  const dynamique = await redisGet(`code_credits:${code}`);
  if (dynamique) return parseInt(dynamique, 10);
  return CODES_VALIDES[code] || null;
}

// Vérifie si la personne peut utiliser une fonctionnalité payante (correction
// d'exercice) : quota gratuit journalier d'abord, puis crédits achetés.
async function verifierEtConsommerCredit(senderId) {
  const { cle, compte } = await obtenirUsageJour(senderId);

  if (compte < LIMITE_GRATUITE_PAR_JOUR) {
    await incrementerUsageJour(cle, compte);
    return { autorise: true, restantGratuit: LIMITE_GRATUITE_PAR_JOUR - compte - 1 };
  }

  const credits = await obtenirCredits(senderId);
  if (credits > 0) {
    await definirCredits(senderId, credits - 1);
    return { autorise: true, viaCredit: true, creditsRestants: credits - 1 };
  }

  return { autorise: false };
}

// ============================================================
// 1. VERIFICATION DU WEBHOOK
// ============================================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook vérifié');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Consultable directement dans un navigateur : https://ton-bot.onrender.com/stats
app.get('/stats', (req, res) => {
  res.json({
    date: statsUsage.date,
    totalAppelsGemini: statsUsage.total,
    parFonctionnalite: statsUsage.parFonction,
    nombreDeClesConfigurees: GEMINI_KEYS.length,
    quotaGratuitEstimeParJour: GEMINI_KEYS.length * 500,
  });
});

// Sert les images générées par l'IA (Nano Banana) via une URL publique
app.get('/generated-image/:id', (req, res) => {
  const img = imagesGenerees[req.params.id];
  if (!img) return res.sendStatus(404);
  res.set('Content-Type', img.mimeType);
  res.send(img.buffer);
});

// ============================================================
// PANNEAU ADMIN : génère des codes à la demande (ex: après un paiement
// Mobile Money vérifié manuellement), sans avoir à modifier le code.
// Protégé par un mot de passe (variable d'environnement ADMIN_PASSWORD).
// ============================================================
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin — Générer un code</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6fb; margin: 0; padding: 24px 16px; color: #1a1a2e; }
  .carte { background: white; border-radius: 12px; padding: 20px; max-width: 360px; margin: 0 auto; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  h1 { font-size: 18px; margin: 0 0 16px; }
  label { display: block; font-size: 13px; margin: 12px 0 4px; color: #444; }
  input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
  button { width: 100%; margin-top: 18px; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  #resultat { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 14px; display: none; }
  .succes { background: #dcfce7; color: #166534; }
  .erreur { background: #fee2e2; color: #991b1b; }
  .code-genere { font-size: 20px; font-weight: 700; letter-spacing: 2px; }
</style>
</head>
<body>
  <div class="carte">
    <h1>🔑 Générer un code de crédits</h1>
    <label>Mot de passe admin</label>
    <input type="password" id="motDePasse" />
    <label>Nombre de crédits</label>
    <input type="number" id="credits" value="10" min="1" />
    <label>Code personnalisé (optionnel — laisse vide pour un code aléatoire)</label>
    <input type="text" id="codePerso" placeholder="ex: PROMO2026" />
    <button onclick="genererCode()">Générer le code</button>
    <div id="resultat"></div>
  </div>

<script>
async function genererCode() {
  const motDePasse = document.getElementById('motDePasse').value;
  const credits = document.getElementById('credits').value;
  const codePerso = document.getElementById('codePerso').value;
  const resultat = document.getElementById('resultat');

  const res = await fetch('/admin/generate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motDePasse, credits, codePerso }),
  });
  const data = await res.json();

  resultat.style.display = 'block';
  if (data.success) {
    resultat.className = 'succes';
    resultat.innerHTML = '✅ Code créé :<br><span class="code-genere">' + data.code + '</span><br>' + data.credits + ' crédits';
  } else {
    resultat.className = 'erreur';
    resultat.textContent = '❌ ' + data.erreur;
  }
}
</script>
</body>
</html>`);
});

app.post('/admin/generate-code', async (req, res) => {
  const { motDePasse, credits, codePerso } = req.body;

  if (!process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'ADMIN_PASSWORD n\'est pas configuré sur le serveur.' });
  }
  if (motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'Mot de passe incorrect.' });
  }

  const creditsNum = parseInt(credits, 10);
  if (!creditsNum || creditsNum <= 0) {
    return res.json({ success: false, erreur: 'Nombre de crédits invalide.' });
  }

  const code = (codePerso && codePerso.trim()) ? codePerso.trim().toUpperCase() : genererCodeAleatoire();

  if (await codeDejaUtilise(code)) {
    return res.json({ success: false, erreur: 'Ce code existe déjà et a été utilisé.' });
  }

  await redisSet(`code_credits:${code}`, creditsNum);
  res.json({ success: true, code, credits: creditsNum });
});

// Tableau de bord visuel : https://ton-bot.onrender.com/dashboard
app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tableau de bord — Tsarafandray Services</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f4f6fb;
    margin: 0;
    padding: 24px 16px;
    color: #1a1a2e;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sous-titre { color: #666; font-size: 14px; margin-bottom: 24px; }
  .cartes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }
  .carte {
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    text-align: center;
  }
  .carte .valeur { font-size: 28px; font-weight: 700; color: #2563eb; }
  .carte .label { font-size: 12px; color: #666; margin-top: 4px; }
  .bloc-graphique {
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
  .bloc-graphique h2 { font-size: 15px; margin: 0 0 12px; }
  .actualiser {
    display: inline-block;
    margin-top: 16px;
    font-size: 13px;
    color: #2563eb;
    cursor: pointer;
    text-decoration: underline;
  }
  .vide { text-align: center; color: #999; padding: 40px 0; }
</style>
</head>
<body>
  <h1>📊 Tableau de bord — Tsarafandray Services</h1>
  <div class="sous-titre" id="sousTitre">Chargement...</div>

  <div class="cartes" id="cartes"></div>

  <div class="bloc-graphique">
    <h2>Appels API par fonctionnalité (aujourd'hui)</h2>
    <canvas id="graphique" height="180"></canvas>
    <div id="videMessage" class="vide" style="display:none;">Aucun appel enregistré pour le moment aujourd'hui.</div>
  </div>

  <a class="actualiser" onclick="charger()">🔄 Actualiser</a>

<script>
let graphiqueActuel = null;

async function charger() {
  const res = await fetch('/stats');
  const data = await res.json();

  document.getElementById('sousTitre').textContent =
    'Journée du ' + data.date + ' — quota gratuit estimé : ' + data.quotaGratuitEstimeParJour + ' requêtes (' + data.nombreDeClesConfigurees + ' clé(s) configurée(s))';

  const restant = Math.max(data.quotaGratuitEstimeParJour - data.totalAppelsGemini, 0);
  const pourcentage = data.quotaGratuitEstimeParJour > 0
    ? Math.round((data.totalAppelsGemini / data.quotaGratuitEstimeParJour) * 100)
    : 0;

  document.getElementById('cartes').innerHTML =
    '<div class="carte"><div class="valeur">' + data.totalAppelsGemini + '</div><div class="label">Appels utilisés</div></div>' +
    '<div class="carte"><div class="valeur">' + restant + '</div><div class="label">Requêtes restantes (estim.)</div></div>' +
    '<div class="carte"><div class="valeur">' + pourcentage + '%</div><div class="label">Quota consommé</div></div>' +
    '<div class="carte"><div class="valeur">' + data.nombreDeClesConfigurees + '</div><div class="label">Clés API actives</div></div>';

  const entrees = Object.entries(data.parFonctionnalite || {});
  const canvas = document.getElementById('graphique');
  const videMessage = document.getElementById('videMessage');

  if (entrees.length === 0) {
    canvas.style.display = 'none';
    videMessage.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  videMessage.style.display = 'none';

  const labels = entrees.map(([k]) => k);
  const valeurs = entrees.map(([, v]) => v);

  if (graphiqueActuel) graphiqueActuel.destroy();
  graphiqueActuel = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Appels', data: valeurs, backgroundColor: '#2563eb', borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

charger();
setInterval(charger, 30000); // actualisation auto toutes les 30s
</script>
</body>
</html>`);
});

// ============================================================
// 2. RECEPTION DES MESSAGES
// ============================================================
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('Webhook reçu:', JSON.stringify(body));

  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');

    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      const imageAttachment = event.message?.attachments?.find((a) => a.type === 'image');
      if (imageAttachment) {
        handleImageEvent(senderId, imageAttachment.payload.url).catch((err) =>
          console.error('Erreur handleImageEvent:', err)
        );
      } else if (event.message && event.message.text) {
        const payload = event.message.quick_reply?.payload;
        const userText = event.message.text.trim();
        handleEvent(senderId, payload || userText, !!payload).catch((err) =>
          console.error('Erreur handleEvent:', err)
        );
      }

      if (event.postback && event.postback.payload) {
        handleEvent(senderId, event.postback.payload, true).catch((err) =>
          console.error('Erreur handleEvent (postback):', err)
        );
      }
    }
  } else {
    res.sendStatus(404);
  }
});

// ============================================================
// 3. LE MENU PRINCIPAL (Quick Replies)
// ============================================================
const MENU_QUICK_REPLIES = [
  { content_type: 'text', title: '📝 Corriger un texte', payload: 'MENU_CORRECTION' },
  { content_type: 'text', title: '🖊️ Corriger un exercice', payload: 'MENU_CORRECTION_EXERCICES' },
  { content_type: 'text', title: '🎓 Résultats examens', payload: 'MENU_RESULTATS' },
  { content_type: 'text', title: '📚 Exercices', payload: 'MENU_EXERCICES' },
  { content_type: 'text', title: '🌐 Traducteur', payload: 'MENU_TRADUCTION' },
  { content_type: 'text', title: '💬 Discuter librement', payload: 'MENU_CHAT' },
  { content_type: 'text', title: '🔑 Activer un code', payload: 'MENU_CODE' },
  { content_type: 'text', title: '🎨 Créer une image', payload: 'MENU_IMAGE' },
];

async function envoyerMenu(senderId, texteIntro) {
  const texte =
    `${texteIntro || '👋 Salut ! Que veux-tu faire ?'}\n\n` +
    `1️⃣ 🎓 Résultats examens\n` +
    `2️⃣ 📝 Corriger un texte\n` +
    `3️⃣ 📚 Exercices\n` +
    `4️⃣ 🌐 Traducteur\n` +
    `5️⃣ 💬 Discuter librement\n` +
    `6️⃣ 🖊️ Corriger un exercice (texte ou photo)\n` +
    `7️⃣ 🔑 Activer un code\n` +
    `8️⃣ 🎨 Créer une image\n\n` +
    `(Tape le numéro, ou utilise les boutons ci-dessous si tu les vois)`;
  await sendMessage(senderId, texte, MENU_QUICK_REPLIES);
}

// Petit bouton à coller sur chaque réponse, pour changer de mode en 1 clic
// sans avoir à taper "menu" à la main.
// CORRIGÉ : le payload pointe maintenant vers GET_STARTED (menu principal),
// et non plus vers MENU_CHAT (qui ouvre le sous-choix IA/Admin).
const BOUTON_MENU = [{ content_type: 'text', title: '🔁 Menu', payload: 'GET_STARTED' }];

// ============================================================
// 4. ROUTEUR PRINCIPAL — un mode reste actif tant qu'on n'en choisit pas un autre
// ============================================================
const MOTS_CLES_BEPC = /\b(bepc|cepe|resultat|résultat)\b/i;
const MOTS_CLES_MENU = /^(menu|aide|help|salut|bonjour|bonsoir|hello|coucou)$/i;
const MOTS_CLES_CORRECTION = /^(corrige|correction)$/i;
const MOTS_CLES_EXERCICES = /^(exercice|exercices)$/i;
const MOTS_CLES_TRADUCTION = /^(traduire|traduction|traducteur)$/i;
const MOTS_CLES_CHAT = /^(chat|discuter|discussion|discuter librement)$/i;
const MOTS_CLES_CHAT_IA = /^(ia|ai|robot|bot)$/i;
const MOTS_CLES_CHAT_HUMAIN = /^(humain|admin|administrateur|page|personne)$/i;
const MOTS_CLES_CORRECTION_EXERCICES = /^(devoir|devoirs|corriger exercice|correction exercice)$/i;
const MOTS_CLES_CODE = /^(code|credit|crédit|credits|crédits|activer)$/i;
const MOTS_CLES_IMAGE = /^(image|creer image|cr[ée]er une image|dessine|dessiner|generer image)$/i;

// Questions sur l'identité/nature du bot -> réponse fixe, jamais via l'IA,
// pour ne jamais risquer une mention d'IA/Gemini/Google.
const MOTS_CLES_IDENTITE = /\b(qui es[- ]?tu|c'?est quoi (ce|cet) bot|qui a (cr[ée][ée]?|fond[ée]) (ce|cet) bot|qui t'?a (cr[ée][ée]?|fait|programm[ée])|pr[ée]sente[- ]toi|iza (ianao|no nanao)|es[- ]?tu (une|un) (ia|robot|intelligence artificielle)|c'?est quoi tsarafandray)\b/i;

const PRESENTATION_BOT =
  `👋 Salut ! Je suis l'assistant virtuel de 🏢 Tsarafandray Services.\n\n` +
  `Tsarafandray Services est une entreprise multiservices informatique, fondée par M. Emeraldo, qui accompagne élèves, étudiants et particuliers avec des solutions pratiques au quotidien.\n\n` +
  `Ici, je peux t'aider à :\n` +
  `🎓 Vérifier tes résultats d'examens (BEPC/CEPE)\n` +
  `📝 Corriger tes textes\n` +
  `🖊️ Corriger tes exercices et devoirs (toutes matières)\n` +
  `📚 Générer des exercices\n` +
  `🌐 Traduire\n` +
  `💬 Discuter librement\n\n` +
  `Tape "menu" à tout moment pour voir toutes les options !`;

// Raccourcis numériques (message EXACT uniquement, ex: juste "1"), pratiques
// pour Facebook Lite où les boutons ne s'affichent pas.
const RACCOURCIS_NUM = {
  1: 'MENU_RESULTATS',
  2: 'MENU_CORRECTION',
  3: 'MENU_EXERCICES',
  4: 'MENU_TRADUCTION',
  5: 'MENU_CHAT',
  6: 'MENU_CORRECTION_EXERCICES',
  7: 'MENU_CODE',
  8: 'MENU_IMAGE',
};

async function handleEvent(senderId, texteOuPayload, estUnBouton) {
  if (!estUnBouton && RACCOURCIS_NUM[texteOuPayload.trim()]) {
    texteOuPayload = RACCOURCIS_NUM[texteOuPayload.trim()];
  }

  // Question sur l'identité du bot -> réponse fixe (jamais via l'IA), quel que soit le mode actif
  if (MOTS_CLES_IDENTITE.test(texteOuPayload)) {
    return sendMessage(senderId, PRESENTATION_BOT, BOUTON_MENU);
  }

  // ---------- A. Changement explicite de mode (bouton menu ou mot-clé) ----------
  if (texteOuPayload === 'GET_STARTED' || MOTS_CLES_MENU.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'chat' };
    return envoyerMenu(senderId, '👋 Bienvenue ! Que veux-tu faire ?');
  }

  // "Discuter librement" -> on demande d'abord si c'est avec l'IA ou avec un admin
  if (texteOuPayload === 'MENU_CHAT' || MOTS_CLES_CHAT.test(texteOuPayload)) {
    await sendMessage(
      senderId,
      '💬 Discuter avec qui ?\n\n🤖 L\'IA (réponse automatique instantanée)\n👤 Un administrateur de la Page (réponse manuelle, peut prendre du temps)\n\n(Tape "ia" ou "admin", ou utilise les boutons)',
      [
        { content_type: 'text', title: '🤖 IA', payload: 'CHAT_IA' },
        { content_type: 'text', title: '👤 Admin', payload: 'CHAT_HUMAIN' },
      ]
    );
    return;
  }

  if (texteOuPayload === 'CHAT_IA' || MOTS_CLES_CHAT_IA.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'chat' };
    resetHistorique(senderId);
    await sendMessage(senderId, '🤖 Tu discutes avec l\'IA. Pose-moi tes questions !', BOUTON_MENU);
    return;
  }

  if (texteOuPayload === 'CHAT_HUMAIN' || MOTS_CLES_CHAT_HUMAIN.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'humain' };
    await sendMessage(
      senderId,
      '👤 Un administrateur de la Page va te répondre directement ici. Le bot ne répondra plus automatiquement dans cette conversation.\n\nTape "menu" à tout moment pour reprendre avec le bot.'
    );
    return;
  }

  if (texteOuPayload === 'MENU_RESULTATS' || MOTS_CLES_BEPC.test(texteOuPayload)) {
    const typeExam = /cepe/i.test(texteOuPayload) ? 'cepe' : 'bepc';
    userModes[senderId] = { mode: 'resultats', typeExam };
    await sendMessage(
      senderId,
      `🎓 Mode Résultats ${typeExam.toUpperCase()} activé.\n\nAlefaso eto ny n°matricule (ex: 12345678-A12/12) na anarana feno,⏳ Miandrasa kely dia ahavoaray résultats ianao. 📢Raha ijery n°hafa dia avy hatrany alefaso Manaraka izany.`,
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_CORRECTION' || MOTS_CLES_CORRECTION.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'correction' };
    await sendMessage(
      senderId,
      '📝 Mode Correction activé.\n\nEnvoie-moi tes textes, je les corrige un par un.',
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_TRADUCTION' || MOTS_CLES_TRADUCTION.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'traduction', langue: null };
    await sendMessage(senderId, '🌐 Vers quelle langue veux-tu traduire ? (ex: anglais, malgache...)', BOUTON_MENU);
    return;
  }

  if (texteOuPayload === 'MENU_EXERCICES' || MOTS_CLES_EXERCICES.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'exercices' };
    await sendMessage(
      senderId,
      '📚 Mode Exercices activé.\n\nEnvoie-moi un sujet/matière (ex: "conjugaison du présent"), je génère un exercice à chaque fois.',
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_CORRECTION_EXERCICES' || MOTS_CLES_CORRECTION_EXERCICES.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'correction_exercices' };
    await sendMessage(
      senderId,
      '🖊️ Mode Correction d\'exercices activé (toutes matières).\n\nEnvoie-moi le texte de l\'exercice/devoir/sujet, (ou directement une 📷 photo de la fiche), et je te donne le corrigé complet.',
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_CODE' || MOTS_CLES_CODE.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'attente_code' };
    const creditsActuels = await obtenirCredits(senderId);
    await sendMessage(
      senderId,
      `🔑 Il te reste actuellement ${creditsActuels} crédit(s) payant(s), plus ${LIMITE_GRATUITE_PAR_JOUR} corrections gratuites chaque jour.\n\nEnvoie ton code d'activation pour ajouter des crédits.`,
      BOUTON_MENU
    );
    return;
  }

  if (texteOuPayload === 'MENU_IMAGE' || MOTS_CLES_IMAGE.test(texteOuPayload)) {
    userModes[senderId] = { mode: 'creation_image' };
    await sendMessage(
      senderId,
      '🎨 Mode Création d\'image activé.\n\nDécris-moi l\'image que tu veux (ex: "un lémurien qui lit un livre, style dessin animé") et je te la génère — ou envoie-moi directement une 📷 photo si tu veux que je la modifie.',
      BOUTON_MENU
    );
    return;
  }

  // ---------- B. Comportement selon le mode actif ----------
  const etat = userModes[senderId] || { mode: 'chat' };

  switch (etat.mode) {
    case 'attente_code': {
      const code = texteOuPayload.trim().toUpperCase();
      userModes[senderId] = { mode: 'chat' };

      const creditsDuCode = await obtenirCreditsDuCode(code);
      if (!creditsDuCode) {
        await sendMessage(senderId, '❌ Ce code n\'est pas valide. Vérifie qu\'il est bien écrit, ou contacte Tsarafandray Services pour en obtenir un.', BOUTON_MENU);
        return;
      }
      if (await codeDejaUtilise(code)) {
        await sendMessage(senderId, '⚠️ Ce code a déjà été utilisé.', BOUTON_MENU);
        return;
      }

      await marquerCodeUtilise(code);
      const creditsActuels = await obtenirCredits(senderId);
      const nouveauTotal = creditsActuels + creditsDuCode;
      await definirCredits(senderId, nouveauTotal);
      await sendMessage(
        senderId,
        `✅ Code activé ! +${creditsDuCode} crédits.\n💳 Total actuel : ${nouveauTotal} crédits.`,
        BOUTON_MENU
      );
      return;
    }

    case 'humain': {
      return;
    }

    case 'resultats': {
      await sendTyping(senderId, true);
      const resultat = await searchBepc(texteOuPayload, etat.typeExam);
      await sendTyping(senderId, false);
      await sendMessage(senderId, resultat, BOUTON_MENU);
      return;
    }

    case 'correction': {
      await sendTyping(senderId, true);
      const corrige = await correctText(texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, `✅ Texte corrigé :\n\n${corrige}`, BOUTON_MENU);
      return;
    }

    case 'traduction': {
      if (!etat.langue) {
        userModes[senderId] = { mode: 'traduction', langue: texteOuPayload };
        await sendMessage(senderId, `Ok, envoie-moi tes textes, je les traduis en ${texteOuPayload}.`, BOUTON_MENU);
        return;
      }
      await sendTyping(senderId, true);
      const traduction = await chatWithGemini(
        `Traduis le texte suivant en ${etat.langue}. Réponds uniquement avec la traduction, sans explication :\n\n"${texteOuPayload}"`,
        'traduction'
      );
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🌐 ${traduction}`, BOUTON_MENU);
      return;
    }

    case 'correction_exercices': {
      const acces = await verifierEtConsommerCredit(senderId);
      if (!acces.autorise) {
        await sendMessage(
          senderId,
          `🔒 Tu as utilisé tes ${LIMITE_GRATUITE_PAR_JOUR} corrections gratuites d'aujourd'hui, et tu n'as plus de crédits.\n\nRevien demain pour de nouvelles corrections gratuites, ou tape "code" pour activer des crédits supplémentaires.`,
          BOUTON_MENU
        );
        return;
      }

      await sendTyping(senderId, true);

      const demandePOSeule = /\bp\.?\s*o\.?\b/i.test(texteOuPayload);
      let correction;

      if (demandePOSeule) {
        const sujetSeul = texteOuPayload.replace(/\bp\.?\s*o\.?\b/i, '').trim();
        correction = await chatWithGemini(
          `Voici un sujet/laza adina scolaire : "${sujetSeul}". Détermine la matière (Histoire-Géo français / Malagasy / Philosophie) et rédige UNIQUEMENT la problématique (petrak'olana) correspondant à ce sujet, sous forme d'une seule question bien formulée selon la méthodologie appropriée. Ne donne rien d'autre : pas d'introduction complète, pas de développement, pas de conclusion, pas d'étiquette du type "Petrak'olana :" — juste la question elle-même. N'utilise aucun markdown.${consigneMethodologie()}${contenuMalagasyPertinent(sujetSeul)}`,
          'correction_exercice_po'
        );
        await sendTyping(senderId, false);
        await sendMessage(senderId, `❓ ${correction}`, BOUTON_MENU);
        return;
      }

      correction = await chatWithGemini(
        `Voici un exercice ou devoir scolaire (n'importe quelle matière) : "${texteOuPayload}". Fais-en le corrigé complet : réponds à chaque question/sujet posé, de façon claire et structurée. N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer.${consigneMethodologie()}${CONSIGNE_FORMAT_MATH}${contenuMalagasyPertinent(texteOuPayload)}`,
        'correction_exercice_texte'
      );
      await sendTyping(senderId, false);
      await sendMessage(senderId, `🖊️ ${correction}`, BOUTON_MENU);

      // Si l'énoncé demande une courbe/un graphique, on tente d'en générer un
      // précis (calculé, pas deviné par une IA d'image).
      if (MOTS_CLES_GRAPHIQUE.test(texteOuPayload)) {
        const donnees = await extraireFonctionGraphique(texteOuPayload);
        if (donnees) {
          const urlGraphique = await genererGraphiqueMath(donnees.formule, donnees.xMin, donnees.xMax);
          if (urlGraphique) {
            await sendImage(senderId, urlGraphique);
          }
        }
      }
      return;
    }

    case 'exercices': {
      await sendTyping(senderId, true);
      const exercice = await chatWithGemini(
        `Crée un court exercice scolaire (avec sa correction en dessous, séparée par "---CORRECTION---") sur le sujet suivant, adapté à un élève : "${texteOuPayload}". Reste concis. N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer.${consigneMethodologie()}${CONSIGNE_FORMAT_MATH}${contenuMalagasyPertinent(texteOuPayload)}`,
        'generation_exercice'
      );
      await sendTyping(senderId, false);
      await sendMessage(senderId, `📚 ${exercice}`, BOUTON_MENU);
      return;
    }

    case 'creation_image': {
      await sendTyping(senderId, true);
      try {
        const imageSource = etat.imageEnAttente
          ? { inline_data: { mime_type: etat.imageEnAttenteMime, data: etat.imageEnAttente } }
          : null;
        const urlImage = await genererImagePublique(texteOuPayload, imageSource);
        // On repasse en mode "création simple" (sans image en attente) après usage.
        userModes[senderId] = { mode: 'creation_image' };
        await sendTyping(senderId, false);
        await sendImage(senderId, urlImage);
        await sendMessage(
          senderId,
          imageSource
            ? '🎨 Voilà la version modifiée ! Envoie une nouvelle photo à modifier, ou décris une nouvelle image à créer.'
            : '🎨 Voilà ! Envoie une autre description, ou une photo à modifier.',
          BOUTON_MENU
        );
      } catch (err) {
        console.error('Erreur création image:', err.response?.data || err.message);
        userModes[senderId] = { mode: 'creation_image' };
        await sendTyping(senderId, false);
        await sendMessage(senderId, "Désolé, je n'ai pas réussi à générer cette image. Réessaie avec une autre description.", BOUTON_MENU);
      }
      return;
    }

    default: {
      await sendTyping(senderId, true);
      const reponse = await chatAvecHistorique(senderId, texteOuPayload);
      await sendTyping(senderId, false);
      await sendMessage(senderId, reponse, BOUTON_MENU);
      return;
    }
  }
}

// ============================================================
// 4bis. GESTION DES IMAGES REÇUES (ex: photo de fiche d'exercice)
// ============================================================
async function handleImageEvent(senderId, imageUrl) {
  const etat = userModes[senderId] || { mode: 'chat' };

  if (etat.mode === 'correction_exercices') {
    const acces = await verifierEtConsommerCredit(senderId);
    if (!acces.autorise) {
      await sendMessage(
        senderId,
        `🔒 Tu as utilisé tes ${LIMITE_GRATUITE_PAR_JOUR} corrections gratuites d'aujourd'hui, et tu n'as plus de crédits.\n\nRevien demain pour de nouvelles corrections gratuites, ou tape "code" pour activer des crédits supplémentaires.`,
        BOUTON_MENU
      );
      return;
    }

    await sendTyping(senderId, true);
    const { correction, transcription } = await correctExerciseImage(imageUrl);
    await sendTyping(senderId, false);
    await sendMessage(senderId, `🖊️📷 ${correction}`, BOUTON_MENU);

    if (transcription && MOTS_CLES_GRAPHIQUE.test(transcription)) {
      const donnees = await extraireFonctionGraphique(transcription);
      if (donnees) {
        const urlGraphique = await genererGraphiqueMath(donnees.formule, donnees.xMin, donnees.xMax);
        if (urlGraphique) {
          await sendImage(senderId, urlGraphique);
        }
      }
    }
    return;
  }

  if (etat.mode === 'creation_image') {
    try {
      const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const base64Image = Buffer.from(imgResponse.data).toString('base64');
      const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';

      userModes[senderId] = {
        mode: 'creation_image',
        imageEnAttente: base64Image,
        imageEnAttenteMime: mimeType,
      };

      await sendMessage(
        senderId,
        '🎨 Photo bien reçue ! Décris-moi ce que tu veux modifier dessus (ex: "change le fond en plage", "ajoute un chapeau", "transforme en style dessin animé").',
        BOUTON_MENU
      );
    } catch (err) {
      console.error('Erreur réception image à modifier:', err.message);
      await sendMessage(senderId, "Désolé, je n'ai pas réussi à récupérer cette photo. Réessaie.", BOUTON_MENU);
    }
    return;
  }

  await sendMessage(
    senderId,
    '📷 J\'ai bien reçu ta photo ! Pour que je la corrige automatiquement, active d\'abord le mode "Corriger un exercice" (👉soraty "devoir" na tsindrio ny "6"), ary avereno alefa ny sary.',
    BOUTON_MENU
  );
}

async function correctExerciseImage(imageUrl) {
  try {
    const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const base64Image = Buffer.from(imgResponse.data).toString('base64');
    const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';
    const imagePart = { inline_data: { mime_type: mimeType, data: base64Image } };

    // Appel 1 (léger) : transcrire juste les questions, pour savoir quel
    // contenu de référence (blocs Malagasy/Philo) injecter dans le 2e appel.
    let texteTranscrit = '';
    try {
      texteTranscrit = await appellerGemini(
        {
          contents: [
            {
              parts: [
                { text: 'Transcris uniquement le texte des questions/sujets visibles sur cette image, sans les réponses, le plus brièvement possible.' },
                imagePart,
              ],
            },
          ],
        },
        'transcription_photo'
      );
    } catch (e) {
      // Si cette étape échoue, on continue simplement sans contenu de référence additionnel.
    }

    const extraContenu = texteTranscrit ? contenuMalagasyPertinent(texteTranscrit) : '';

    // Appel 2 : le vrai corrigé, méthodologie + contenu de référence pertinent inclus.
    const reponse = await appellerGemini(
      {
        contents: [
          {
            parts: [
              {
                text:
                  "Voici une photo d'une fiche d'exercice ou de devoir scolaire (n'importe quelle matière : maths, français, histoire, sciences...). Fais-en le CORRIGÉ complet : réponds à chaque question/sujet posé, de façon claire et structurée (reprends chaque numéro de question puis donne la réponse/l'explication). N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise plutôt des émojis/icônes (📌 ✅ 👉 etc.) pour structurer visuellement, adapté à une conversation Messenger." +
                  consigneMethodologie() +
                  CONSIGNE_FORMAT_MATH +
                  extraContenu,
              },
              imagePart,
            ],
          },
        ],
      },
      'correction_exercice_photo'
    );

    return { correction: reponse.trim(), transcription: texteTranscrit };
  } catch (err) {
    console.error('Erreur correction image:', err.response?.data || err.message);
    return {
      correction: "Désolé, je n'ai pas réussi à analyser cette photo. Vérifie qu'elle est bien lisible, ou envoie plutôt le texte de l'exercice.",
      transcription: '',
    };
  }
}

// ============================================================
// 5. CHAT GENERAL VIA GEMINI
// ============================================================
const chatHistories = {};
const MAX_TOURS_HISTORIQUE = 16;

function resetHistorique(senderId) {
  delete chatHistories[senderId];
}

async function chatAvecHistorique(senderId, text) {
  if (!chatHistories[senderId]) chatHistories[senderId] = [];
  const historique = chatHistories[senderId];

  historique.push({ role: 'user', parts: [{ text }] });
  if (historique.length > MAX_TOURS_HISTORIQUE) historique.splice(0, historique.length - MAX_TOURS_HISTORIQUE);

  try {
    const reponse = (
      await appellerGemini(
        {
          system_instruction: {
            parts: [
              {
                text: 'Tu es l\'assistant virtuel de Tsarafandray Services, une entreprise multiservices informatique fondée par M. Emeraldo. Si on te demande qui tu es, ce que tu es, ou qui t\'a créé, réponds TOUJOURS que tu es l\'assistant de Tsarafandray Services (jamais que tu es une IA, un modèle de langage, Gemini, ou fait par Google). Réponds de façon claire et raisonnablement concise, en tenant compte de tout ce qui a été dit avant dans la conversation. N\'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer si besoin.',
              },
            ],
          },
          contents: historique,
        },
        'chat'
      )
    ).trim();

    historique.push({ role: 'model', parts: [{ text: reponse }] });
    return reponse;
  } catch (err) {
    console.error('Erreur chat IA:', err.response?.data || err.message);
    historique.pop();
    return "Désolé, je n'arrive pas à répondre pour le moment. Réessaie dans une minute.";
  }
}

async function chatWithGemini(text, nomFonction = 'texte_generique') {
  try {
    const reponse = await appellerGemini(
      {
        contents: [
          {
            parts: [
              {
                text: `Réponds de façon claire et raisonnablement concise (adaptée à une conversation Messenger, évite les pavés interminables sauf si vraiment nécessaire) à ce message : "${text}". N'utilise JAMAIS de markdown (pas de **gras**, pas de #titre) : utilise des émojis/icônes pour structurer si besoin.`,
              },
            ],
          },
        ],
      },
      nomFonction
    );
    return reponse.trim();
  } catch (err) {
    console.error('Erreur chat IA:', err.response?.data || err.message);
    return "Désolé, je n'arrive pas à répondre pour le moment. Réessaie dans une minute.";
  }
}

// ============================================================
// 6. CORRECTION DE TEXTE VIA GEMINI
// ============================================================
async function correctText(text) {
  try {
    const corrected = await appellerGemini(
      {
        contents: [
          {
            parts: [
              {
                text: `Corrige uniquement l'orthographe et la grammaire du texte suivant. Renvoie SEULEMENT le texte corrigé, sans aucune explication ni introduction :\n\n"${text}"`,
              },
            ],
          },
        ],
      },
      'correction_texte'
    );
    return corrected.trim();
  } catch (err) {
    console.error('Erreur correction IA:', err.response?.data || err.message);
    return 'Désolé, le service de correction est très sollicité en ce moment. Réessaie dans une minute.';
  }
}

// ============================================================
// 6bis. TRACÉ DE COURBES MATHÉMATIQUES (précis, via QuickChart.io)
// ============================================================
const MOTS_CLES_GRAPHIQUE = /\b(courbe|graphique|trac(e|é)|repr[ée]sente(r)?\s+graphiquement|diagramme)\b/i;

// Demande à l'IA d'extraire juste les données utiles (formule, intervalle),
// sous forme de JSON strict, à partir de l'énoncé.
async function extraireFonctionGraphique(texte) {
  try {
    const reponse = await chatWithGemini(
      `Voici un énoncé d'exercice de mathématiques : "${texte}"\n\n` +
      `S'il demande de tracer/représenter graphiquement une fonction, réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans aucun texte autour, sans markdown :\n` +
      `{"formule": "x^2 - 3*x + 2", "xMin": -5, "xMax": 5}\n` +
      `La "formule" doit être une expression valide pour la bibliothèque mathjs, avec la variable x. Règles STRICTES de syntaxe :\n` +
      `- Toujours mettre le symbole * pour une multiplication explicite : "3*x" et non "3x", "2*x^2" et non "2x^2".\n` +
      `- Utiliser ^ pour les puissances (x^2), sqrt(x) pour la racine carrée, sin(x)/cos(x)/tan(x) pour la trigonométrie, exp(x) pour l'exponentielle.\n` +
      `- Ne jamais utiliser "f(x)=" dans la formule : uniquement l'expression, ex "2*x + 1" et non "f(x) = 2*x + 1".\n` +
      `Si l'exercice ne demande PAS de tracer de courbe, réponds UNIQUEMENT avec : {"formule": null}`,
      'extraction_graphique'
    );

    const nettoye = reponse.replace(/```json|```/g, '').trim();
    const data = JSON.parse(nettoye);
    if (!data.formule) return null;
    return {
      formule: data.formule,
      xMin: typeof data.xMin === 'number' ? data.xMin : -10,
      xMax: typeof data.xMax === 'number' ? data.xMax : 10,
    };
  } catch (err) {
    console.error('Erreur extraction fonction graphique:', err.message);
    return null;
  }
}

// Corrige les multiplications implicites que l'IA laisse parfois passer
// malgré la consigne (ex: "3x" -> "3*x", "2(x+1)" -> "2*(x+1)").
function normaliserFormule(formule) {
  return formule
    .replace(/(\d)(x)/gi, '$1*$2')
    .replace(/(\d|x)\(/gi, '$1*(')
    .replace(/\)(x|\()/gi, ')*$1');
}

// Pour l'AFFICHAGE seulement (titre du graphique) : "3*x" -> "3x", plus naturel
// à lire pour un élève. Le calcul, lui, reste toujours fait avec la forme stricte.
function formuleAffichage(formule) {
  return formule.replace(/(\d)\*([a-zA-Z(])/g, '$1$2').replace(/\*/g, '');
}

// Calcule les vrais points de la fonction (avec mathjs) et génère un graphique
// précis via QuickChart.io (gratuit, pas de clé API nécessaire).
async function genererGraphiqueMath(formule, xMin, xMax) {
  try {
    const formuleNettoyee = normaliserFormule(formule);
    const noeud = math.compile(formuleNettoyee);
    const nbPoints = 100;
    const pas = (xMax - xMin) / nbPoints;
    const labels = [];
    const valeurs = [];

    for (let i = 0; i <= nbPoints; i++) {
      const x = xMin + i * pas;
      let y;
      try {
        y = noeud.evaluate({ x });
        if (typeof y !== 'number' || !isFinite(y)) y = null;
      } catch (e) {
        y = null;
      }
      labels.push(Number(x.toFixed(2)));
      valeurs.push(y);
    }

    // Si presque tous les points sont invalides, la formule est probablement
    // mal formée : mieux vaut ne pas envoyer un graphique vide.
    const nbPointsValides = valeurs.filter((v) => v !== null).length;
    if (nbPointsValides < nbPoints * 0.2) {
      console.error(`Graphique non généré : formule "${formule}" (normalisée: "${formuleNettoyee}") a produit trop peu de points valides (${nbPointsValides}/${nbPoints}).`);
      return null;
    }

    const chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `f(x) = ${formuleAffichage(formule)}`,
            data: valeurs,
            borderColor: 'rgb(37, 99, 235)',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            spanGaps: false,
          },
        ],
      },
      options: {
        title: { display: true, text: `f(x) = ${formuleAffichage(formule)}` },
        scales: {
          xAxes: [{ scaleLabel: { display: true, labelString: 'x' } }],
          yAxes: [{ scaleLabel: { display: true, labelString: 'f(x)' } }],
        },
      },
    };

    const reponse = await axios.post('https://quickchart.io/chart/create', {
      chart: chartConfig,
      version: '2',
      width: 600,
      height: 400,
      backgroundColor: 'white',
    });

    if (reponse.data && reponse.data.success) {
      return reponse.data.url;
    }
    return null;
  } catch (err) {
    console.error('Erreur génération graphique:', err.message);
    return null;
  }
}

// Envoie une image (URL publique) directement dans Messenger.
async function sendImage(recipientId, imageUrl) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: {
          attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } },
        },
      }
    );
  } catch (err) {
    console.error('Erreur envoi image:', err.response?.data || err.message);
  }
}


// ============================================================
// 7. RECHERCHE BEPC/CEPE
// ============================================================
async function searchBepc(query, typeExam = 'bepc', tentative = 1) {
  const valeur = query.trim();
  const matriculeReg = /^\d{3}[0-9A-Z]{0,2}\d{5}-[A-Z]?\d{2}\/\d{2}(-\d{0,2})?$/;
  const typeRc = matriculeReg.test(valeur) ? 'mle' : 'nom';

  try {
    const response = await axios.post(
      'http://102.18.117.117/gre-men/web/app.php/ajaxres-cb.html',
      new URLSearchParams({ etype: typeExam, typeRc, mle: valeur }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 50000,
      }
    );

    const $ = cheerio.load(response.data);
    const resultats = [];

    $('tr').each((i, el) => {
      const cols = $(el).find('td');
      if (cols.length >= 5) {
        resultats.push({
          matricule: $(cols[0]).text().trim(),
          nom: $(cols[1]).text().trim(),
          cisco: $(cols[2]).text().trim(),
          ecole: $(cols[3]).text().trim(),
          observation: $(cols[4]).text().trim(),
        });
      }
    });

    if (resultats.length === 0) {
      return `🔍❌ *Introuvable*\n\nRecherche : "${valeur}" (${typeExam.toUpperCase()})\n\nAucun candidat trouvé avec cette information. Vérifie l'orthographe ou le format du matricule et réessaie (🔴⏳na mbola tsy nivaly ny amin'ny toerana misy anao).`;
    }

    return resultats.map((r) => formatResultat(r, typeExam)).join('\n\n━━━━━━━━━━━━\n\n');
  } catch (err) {
    const estTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message);
    if (estTimeout && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1000));
      return searchBepc(query, typeExam, tentative + 1);
    }
    console.error('Erreur recherche BEPC:', err.message);
    return estTimeout
      ? "⏳ Le site officiel met trop de temps à répondre en ce moment (serveur lent ou surchargé). Réessaie dans quelques minutes.Maro ny mandefa message ka manasa anao hiverina afaka fotoana fohy"
      : 'Désolé, la recherche a échoué (le site est peut-être indisponible). Réessaie plus tard.';
  }
}

function formatResultat(r, typeExam = 'bepc') {
  const obs = (r.observation || '').toUpperCase();
  const estAdmis = obs.includes('ADMIS') && !obs.includes('NON ADMIS');
  const estAjourne = obs.includes('AJOURNE') || obs.includes('NON ADMIS') || obs.includes('REDOUBL');

  if (estAdmis) {
    return (
      `🎓✨ RÉSULTAT ${typeExam.toUpperCase()} ✨🎓\n\n` +
      `🎉🎊 Félicitations ${r.nom} !\n` +
      `🥳 Vous êtes officiellement ADMIS(E) au ${typeExam.toUpperCase()}.\n\n` +
      `🪪 Matricule : ${r.matricule}\n` +
      `🏫 Établissement : ${r.ecole}\n` +
      `📍 CISCO : ${r.cisco}\n` +
      `✅ Résultats 👏: ${r.observation}\n\n` +
      `🍾 Alefaso ny arrosage e! 😄🥳\n` +
      `📸 Ataovy capture ary zarao amin'ny namanao!`
    );
  }

  if (estAjourne) {
    return (
      `🎓📋 RÉSULTAT ${typeExam.toUpperCase()}\n\n` +
      `👤 Candidat : ${r.nom}\n\n` +
      `🪪 Matricule : ${r.matricule}\n` +
      `🏫 Établissement : ${r.ecole}\n` +
      `📍 CISCO : ${r.cisco}\n` +
      `❌ Résultats 😭: ${r.observation}\n\n` +
      `💪 Courage! Aza mora kivy.\n` +
      `📚 Mianara tsara. ✍️Eto amin'ny pejy ianao dia aka mianatra sy mamerin-desona`
    );
  }

  return (
    `🎓📋 RÉSULTAT ${typeExam.toUpperCase()}\n\n` +
    `👤 Candidat : ${r.nom}\n\n` +
    `🪪 Matricule : ${r.matricule}\n` +
    `🏫 Établissement : ${r.ecole}\n` +
    `📍 CISCO : ${r.cisco}\n` +
    `ℹ️ Observation : ${r.observation}\n\n` +
    `⏳ Le résultat officiel n'est pas encore disponible pour ce candidat.\n` +
    `🔄 Merci de réessayer un peu plus tard.`
  );
}

// ============================================================
// 8. ENVOI DE MESSAGE / INDICATEUR DE FRAPPE
// ============================================================
const LIMITE_MESSENGER = 1900;

function nettoyerMarkdown(text) {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s*(.*)$/gm, '▶️ $1')
    .replace(/^[-•]\s+/gm, '• ')
    .trim();
}

async function sendMessage(recipientId, text, quickReplies) {
  const morceaux = decouperTexte(nettoyerMarkdown(text), LIMITE_MESSENGER);

  for (let i = 0; i < morceaux.length; i++) {
    const estLeDernier = i === morceaux.length - 1;
    try {
      const message = { text: morceaux[i] };
      if (estLeDernier && quickReplies) message.quick_replies = quickReplies;

      await axios.post(
        `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
        { recipient: { id: recipientId }, message }
      );
    } catch (err) {
      console.error('Erreur envoi message:', err.response?.data || err.message);
    }
  }
}

function decouperTexte(text, limite) {
  if (text.length <= limite) return [text];

  const morceaux = [];
  let reste = text;

  while (reste.length > limite) {
    let coupeA = reste.lastIndexOf('\n', limite);
    if (coupeA < limite * 0.5) coupeA = reste.lastIndexOf(' ', limite);
    if (coupeA < limite * 0.5) coupeA = limite;

    morceaux.push(reste.slice(0, coupeA).trim());
    reste = reste.slice(coupeA).trim();
  }
  if (reste) morceaux.push(reste);

  return morceaux;
}

async function sendTyping(recipientId, actif) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      { recipient: { id: recipientId }, sender_action: actif ? 'typing_on' : 'typing_off' }
    );
  } catch (err) {
    console.error('Erreur sender_action:', err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
