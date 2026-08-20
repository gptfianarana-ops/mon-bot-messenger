import sys

with open('/home/ubuntu/mon-bot-messenger/index.js', 'r') as f:
    content = f.read()

old_block_1 = """  // 1. Vérifier les données locales
  const localResults = await getStoredBaccResults(province);
  if (localResults && localResults.length > 0) {
    const valeur = query.trim().toLowerCase();
    const matched = localResults.filter(r => {
      const m = String(r.matricule || '').toLowerCase();
      const n = String(r.nom || '').toLowerCase();
      const p = String(r.prenoms || '').toLowerCase();
      const full = (n + ' ' + p).trim();
      return m.includes(valeur) || n.includes(valeur) || p.includes(valeur) || full.includes(valeur) || valeur.includes(n) || (n.length > 3 && valeur.includes(n));
    });
    if (matched.length > 0) {
      return matched.map(r => formatResultatBaccCustom(r, config.name)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
    }
    // Si aucun résultat local trouvé, on continue vers l'API ou le site officiel si configuré
  }

  // 1.b. Recherche SAVA via CSV local
  if (province === 'sava') {
    const savaData = getSAVAResults();
    if (savaData.length > 0) {
      const valeur = query.trim().toLowerCase();
      const matched = savaData.filter(r => {
        const m = String(r.numero || '').toLowerCase();
        const n = String(r.nom || '').toLowerCase();
        const p = String(r.prenom || '').toLowerCase();
        const full = (n + ' ' + p).trim();
        return m.includes(valeur) || n.includes(valeur) || p.includes(valeur) || full.includes(valeur) || valeur.includes(n) || (n.length > 3 && valeur.includes(n));
      });
      if (matched.length > 0) {
        return matched.map(r => formatResultatSAVA(r)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
      }
      return "🔍❌ *Introuvable*\\n\\nProvince : SAVA\\nRecherche : \\"" + query.trim() + "\\"\\n\\nAucun candidat trouvé. Vérifie l'orthographe ou le numéro.";
    }
  }"""

new_block_1 = """  // 1. Vérifier les données locales
  const localResults = await getStoredBaccResults(province);
  if (localResults && localResults.length > 0) {
    const valeur = query.trim().toLowerCase();
    const tokens = valeur.split(/\\s+/).filter(Boolean);
    const matched = localResults.filter(r => {
      const m = String(r.matricule || '').toLowerCase();
      const n = String(r.nom || '').toLowerCase();
      const p = String(r.prenoms || '').toLowerCase();
      const full = (n + ' ' + p).trim();
      if (m === valeur || (valeur.length >= 3 && m.includes(valeur))) return true;
      if (tokens.length === 0) return false;
      return tokens.every(token => full.includes(token));
    });
    if (matched.length > 0) {
      return matched.map(r => formatResultatBaccCustom(r, config.name)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
    }
    // Si aucun résultat local trouvé, on continue vers l'API ou le site officiel si configuré
  }

  // 1.b. Recherche SAVA via CSV local
  if (province === 'sava') {
    const savaData = getSAVAResults();
    if (savaData.length > 0) {
      const valeur = query.trim().toLowerCase();
      const tokens = valeur.split(/\\s+/).filter(Boolean);
      const matched = savaData.filter(r => {
        const m = String(r.numero || '').toLowerCase();
        const n = String(r.nom || '').toLowerCase();
        const p = String(r.prenom || '').toLowerCase();
        const full = (n + ' ' + p).trim();
        if (m === valeur || (valeur.length >= 3 && m.includes(valeur))) return true;
        if (tokens.length === 0) return false;
        return tokens.every(token => full.includes(token));
      });
      if (matched.length > 0) {
        return matched.map(r => formatResultatSAVA(r)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
      }
      return "🔍❌ *Introuvable*\\n\\nProvince : SAVA\\nRecherche : \\"" + query.trim() + "\\"\\n\\nAucun candidat trouvé. Vérifie l'orthographe ou le numéro.";
    }
  }"""

if old_block_1 in content:
    content = content.replace(old_block_1, new_block_1)
    with open('/home/ubuntu/mon-bot-messenger/index.js', 'w') as f:
        f.write(content)
    print("SUCCESS: Patch applied successfully!")
else:
    print("ERROR: old_block_1 not found in index.js")
    sys.exit(1)
