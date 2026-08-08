with open('/home/ubuntu/bot_project/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add storage helpers and updated searchBacc before BACC_CONFIG or around line 2600
helpers_code = """
async function getStoredBaccResults(province) {
  const raw = await redisGet(`bacc_results:${province}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

async function saveStoredBaccResults(province, results) {
  await redisSet(`bacc_results:${province}`, JSON.stringify(results));
}

function formatResultatBaccCustom(r, provinceName) {
  const nom = r.nom || 'Inconnu';
  const prenoms = r.prenoms || '';
  const num = r.matricule || 'Inconnu';
  const mention = r.mention || 'Passable';

  return (
    `🎓✨ RÉSULTAT BACCALAURÉAT ✨🎓\\n` +
    `📍 Province / Région : ${provinceName}\\n\\n` +
    `🎉🎊 Félicitations ${nom} ${prenoms} !\\n` +
    `🥳 Vous êtes ADMIS(E) au BACC.\\n\\n` +
    `🪪 N° Inscription : ${num}\\n` +
    `🎖️ Mention : ${mention}\\n\\n` +
    `🍾 Alefaso ny arrosage e! 😄🥳\\n` +
    `📸 Capture-o dia zarao!`
  );
}
"""

if 'getStoredBaccResults' not in content:
    content = content.replace('const BACC_CONFIG = {', helpers_code + '\nconst BACC_CONFIG = {')

# 2. Replace searchBacc function
old_search_bacc = """async function searchBacc(query, province, tentative = 1) {
  const config = BACC_CONFIG[province];
  if (!config) return "❌ Province non reconnue.";

  const valeur = query.trim();
  const typeRc = /^\\d{7}$/.test(valeur) ? 'mle' : 'nom';
  const url = `${config.baseUrl}${config.endpoints[typeRc]}${encodeURIComponent(valeur)}`;

  try {
    const response = await axios.get(url, { timeout: 30000 });
    const data = response.data;

    // Structure typique des APIs UGD/Univ : { count: X, bacc: [...] }
    if (!data || !data.bacc || data.bacc.length === 0) {
      return `🔍❌ *Introuvable*\\n\\nProvince : ${config.name}\\nRecherche : "${valeur}"\\n\\nAucun candidat trouvé. Vérifie l'orthographe ou le numéro d'inscription.`;
    }

    return data.bacc.map(r => formatResultatBacc(r, config.name)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
  } catch (err) {
    console.error(`Erreur BACC ${province}:`, err.message);
    if (tentative < 3) {
      await new Promise(r => setTimeout(r, 2000));
      return searchBacc(query, province, tentative + 1);
    }
    return `⏳ Le serveur de ${config.name} ne répond pas. Il est probablement surchargé par les nombreuses demandes. Réessaie dans quelques minutes.`;
  }
}"""

new_search_bacc = """async function searchBacc(query, province, tentative = 1) {
  const config = BACC_CONFIG[province];
  if (!config) return "❌ Province / Région non reconnue.";

  const valeur = query.trim().toLowerCase();

  // 1. Check local/admin uploaded custom results first
  const customResults = await getStoredBaccResults(province);
  if (customResults && customResults.length > 0) {
    const matched = customResults.filter(r => {
      const m = String(r.matricule || '').toLowerCase();
      const nom = String(r.nom || '').toLowerCase();
      const pre = String(r.prenoms || '').toLowerCase();
      return m.includes(valeur) || nom.includes(valeur) || pre.includes(valeur) || (nom + ' ' + pre).includes(valeur);
    });

    if (matched.length > 0) {
      return matched.map(r => formatResultatBaccCustom(r, config.name)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
    }
  }

  // 2. If config has baseUrl, query official API
  if (config.baseUrl) {
    const typeRc = /^\\d{7}$/.test(query.trim()) ? 'mle' : 'nom';
    const url = `${config.baseUrl}${config.endpoints[typeRc]}/${encodeURIComponent(query.trim())}`;
    try {
      const response = await axios.get(url, { timeout: 30000 });
      const data = response.data;
      if (data && data.bacc && data.bacc.length > 0) {
        return data.bacc.map(r => formatResultatBacc(r, config.name)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
      }
    } catch (err) {
      console.error(`Erreur BACC API ${province}:`, err.message);
    }
  }

  // 3. Introuvable fallback with precise user instruction
  return `🔍❌ *Introuvable*\\n\\nProvince / Région : ${config.name}\\nRecherche : "${query.trim()}"\\n\\nAucun candidat trouvé avec cette information. *Vérifie sur la liste officielle* pour éviter toute interruption ou erreur, etc.`;
}"""

if old_search_bacc in content:
    content = content.replace(old_search_bacc, new_search_bacc)

# 3. Add /admin/upload-results route after /admin/generate-code route
upload_route = """
app.post('/admin/upload-results', upload.single('resultFile'), async (req, res) => {
  const { motDePasse, province } = req.body;
  if (!process.env.ADMIN_PASSWORD || motDePasse !== process.env.ADMIN_PASSWORD) {
    return res.json({ success: false, erreur: 'Mot de passe incorrect ou non configuré.' });
  }
  if (!province || !BACC_CONFIG[province]) {
    return res.json({ success: false, erreur: 'Province ou région invalide.' });
  }
  if (!req.file) {
    return res.json({ success: false, erreur: 'Aucun fichier (image ou PDF) fourni.' });
  }

  try {
    let imagesToProcess = [];
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    if (mimeType === 'application/pdf' || req.file.originalname.endsWith('.pdf')) {
      const outputPrefix = `/tmp/pdf_res_${Date.now()}`;
      execSync(`pdftoppm -png -r 150 "${filePath}" "${outputPrefix}"`);
      const files = fs.readdirSync('/tmp').filter(f => f.startsWith(outputPrefix.replace('/tmp/', '')) && f.endsWith('.png'));
      files.sort();
      for (const f of files) {
        const p = `/tmp/${f}`;
        const buf = fs.readFileSync(p);
        imagesToProcess.push({ buffer: buf, mimeType: 'image/png' });
        try { fs.unlinkSync(p); } catch(e){}
      }
    } else {
      const buf = fs.readFileSync(filePath);
      imagesToProcess.push({ buffer: buf, mimeType: mimeType || 'image/jpeg' });
    }

    try { fs.unlinkSync(filePath); } catch(e){}

    let tousLesCandidats = [];
    for (const img of imagesToProcess) {
      const base64Img = img.buffer.toString('base64');
      const imagePart = { inline_data: { mime_type: img.mimeType, data: base64Img } };

      const prompt = `Analyse exhaustivement ce document officiel de résultats d'examen (BACC pour la région/province de ${BACC_CONFIG[province].name}). Extrait TOUS les candidats mentionnés sous forme de tableau JSON strict.
Pour chaque candidat admis, fournis un objet avec ces propriétés exactes :
- "matricule" (numéro d'inscription)
- "nom" (nom de famille)
- "prenoms" (prénoms)
- "mention" (mention si indiquée, ex: Passable, Assez-Bien, Bien, ou "")
- "admis" (true si le candidat est admis, false sinon)

RÈGLES STRICTES DE FIABILITÉ :
1. Analyse approfondie et intégrale : ne rate aucun candidat.
2. Si une ligne ou un texte est illisible, douteux ou ambigu, IGNORE-LA COMPLÈTEMENT. N'invente jamais aucune donnée (mieux vaut omettre que d'envoyer un faux résultat).
3. Réponds UNIQUEMENT avec un tableau JSON valide sans markdown superflu : [{"matricule": "...", "nom": "...", "prenoms": "...", "mention": "...", "admis": true}, ...]`;

      const bodyVision = {
        contents: [
          {
            parts: [
              { text: prompt },
              imagePart
            ]
          }
        ]
      };

      const reponseText = await appellerGemini(bodyVision, 'admin_upload_results');
      let jsonStr = reponseText.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();

      const candidats = JSON.parse(jsonStr);
      if (Array.isArray(candidats)) {
        tousLesCandidats.push(...candidats.filter(c => c && c.matricule && c.admis));
      }
    }

    const existants = await getStoredBaccResults(province);
    const map = new Map();
    for (const c of existants) map.set(String(c.matricule), c);
    for (const c of tousLesCandidats) map.set(String(c.matricule), c);
    const fusion = Array.from(map.values());

    await saveStoredBaccResults(province, fusion);

    res.json({
      success: true,
      message: `${tousLesCandidats.length} candidats admis extraits et enregistrés avec succès pour ${BACC_CONFIG[province].name} (Total enregistrés : ${fusion.length}).`
    });
  } catch (err) {
    console.error('Erreur upload-results:', err);
    res.json({ success: false, erreur: 'Erreur lors de l\'analyse du fichier par l\'IA : ' + err.message });
  }
});
"""

if 'upload-results' not in content:
    # Insert after app.post('/admin/generate-code', ...) block
    marker = "app.post('/admin/generate-code', async (req, res) => {"
    # Find where generate-code ends
    pos = content.find("app.post('/admin/generate-code'")
    if pos != -1:
        # Find closing brace of generate-code handler
        brace_count = 0
        started = False
        end_pos = pos
        for i in range(pos, len(content)):
            if content[i] == '{':
                brace_count += 1
                started = True
            elif content[i] == '}':
                brace_count -= 1
                if started and brace_count == 0:
                    end_pos = i + 1
                    break
        content = content[:end_pos] + "\n\n" + upload_route + content[end_pos:]

with open('/home/ubuntu/bot_project/index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Advanced patch applied successfully.")
