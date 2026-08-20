import sys

with open('/home/ubuntu/mon-bot-messenger/index.js', 'r') as f:
    content = f.read()

old_block = """  // 1. Vérifier les données locales
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

new_block = """  // 1. Vérifier les données locales
  const localResults = await getStoredBaccResults(province);
  if (localResults && localResults.length > 0) {
    const valeur = query.trim().toLowerCase();
    const tokens = valeur.split(/\\s+/).filter(Boolean);
    const matched = localResults.filter(r => {
      const m = String(r.matricule || '').toLowerCase();
      const n = String(r.nom || '').toLowerCase();
      const p = String(r.prenoms || '').toLowerCase();
      const full = (n + ' ' + p).trim();
      const words = full.split(/\\s+/);
      if (m === valeur || (valeur.length >= 3 && m.includes(valeur))) return true;
      if (tokens.length === 0) return false;
      return tokens.every(token => {
        if (token.length <= 2) return words.some(w => w === token);
        return words.some(w => w.includes(token));
      });
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
        const words = full.split(/\\s+/);
        if (m === valeur || (valeur.length >= 3 && m.includes(valeur))) return true;
        if (tokens.length === 0) return false;
        return tokens.every(token => {
          if (token.length <= 2) return words.some(w => w === token);
          return words.some(w => w.includes(token));
        });
      });
      if (matched.length > 0) {
        return matched.map(r => formatResultatSAVA(r)).join('\\n\\n━━━━━━━━━━━━\\n\\n');
      }
      return "🔍❌ *Introuvable*\\n\\nProvince : SAVA\\nRecherche : \\"" + query.trim() + "\\"\\n\\nAucun candidat trouvé. Vérifie l'orthographe ou le numéro.";
    }
  }"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('/home/ubuntu/mon-bot-messenger/index.js', 'w') as f:
        f.write(content)
    print("SUCCESS: Refined search patch applied!")
else:
    print("ERROR: old_block not found in index.js")
    sys.exit(1)
