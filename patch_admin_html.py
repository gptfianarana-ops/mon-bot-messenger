with open('/home/ubuntu/bot_project/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_admin_html = """app.get('/admin', (req, res) => {
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
});"""

new_admin_html = """app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin — Gestion Bot Messenger</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6fb; margin: 0; padding: 24px 16px; color: #1a1a2e; }
  .container { max-width: 420px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
  .carte { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  h1 { font-size: 18px; margin: 0 0 16px; }
  label { display: block; font-size: 13px; margin: 12px 0 4px; color: #444; }
  input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
  button { width: 100%; margin-top: 18px; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  .resultat { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 14px; display: none; }
  .succes { background: #dcfce7; color: #166534; }
  .erreur { background: #fee2e2; color: #991b1b; }
  .code-genere { font-size: 20px; font-weight: 700; letter-spacing: 2px; }
</style>
</head>
<body>
  <div class="container">
    <div class="carte">
      <h1>🔑 Générer un code de crédits</h1>
      <label>Mot de passe admin</label>
      <input type="password" id="motDePasse" />
      <label>Nombre de crédits</label>
      <input type="number" id="credits" value="10" min="1" />
      <label>Code personnalisé (optionnel)</label>
      <input type="text" id="codePerso" placeholder="ex: PROMO2026" />
      <button onclick="genererCode()">Générer le code</button>
      <div id="resultatCode" class="resultat"></div>
    </div>

    <div class="carte">
      <h1>📁 Importer Résultats BACC (Image / PDF)</h1>
      <label>Mot de passe admin</label>
      <input type="password" id="motDePasseRes" />
      <label>Province / Région</label>
      <select id="provinceRes">
        <option value="antananarivo">Antananarivo</option>
        <option value="fianarantsoa">Fianarantsoa</option>
        <option value="toamasina">Toamasina</option>
        <option value="mahajanga">Mahajanga</option>
        <option value="toliara">Toliara</option>
        <option value="antsiranana">Antsiranana</option>
        <option value="itasy">Itasy</option>
        <option value="analanjirofo">Analanjirofo</option>
      </select>
      <label>Fichier de résultats (Image ou PDF)</label>
      <input type="file" id="resultFile" accept="image/*,application/pdf" />
      <button onclick="uploaderResultats()">Analyser et Importer les résultats</button>
      <div id="resultatUpload" class="resultat"></div>
    </div>
  </div>

<script>
async function genererCode() {
  const motDePasse = document.getElementById('motDePasse').value;
  const credits = document.getElementById('credits').value;
  const codePerso = document.getElementById('codePerso').value;
  const resultat = document.getElementById('resultatCode');

  const res = await fetch('/admin/generate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motDePasse, credits, codePerso }),
  });
  const data = await res.json();

  resultat.style.display = 'block';
  if (data.success) {
    resultat.className = 'resultat succes';
    resultat.innerHTML = '✅ Code créé :<br><span class="code-genere">' + data.code + '</span><br>' + data.credits + ' crédits';
  } else {
    resultat.className = 'resultat erreur';
    resultat.textContent = '❌ ' + data.erreur;
  }
}

async function uploaderResultats() {
  const motDePasse = document.getElementById('motDePasseRes').value;
  const province = document.getElementById('provinceRes').value;
  const fileInput = document.getElementById('resultFile');
  const resultat = document.getElementById('resultatUpload');

  if (!fileInput.files[0]) {
    resultat.style.display = 'block';
    resultat.className = 'resultat erreur';
    resultat.textContent = '❌ Veuillez sélectionner un fichier image ou PDF.';
    return;
  }

  const formData = new FormData();
  formData.append('motDePasse', motDePasse);
  formData.append('province', province);
  formData.append('resultFile', fileInput.files[0]);

  resultat.style.display = 'block';
  resultat.className = 'resultat succes';
  resultat.textContent = '⏳ Analyse approfondie et OCR en cours par l\'IA (veuillez patienter)...';

  try {
    const res = await fetch('/admin/upload-results', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (data.success) {
      resultat.className = 'resultat succes';
      resultat.innerHTML = '✅ ' + data.message;
    } else {
      resultat.className = 'resultat erreur';
      resultat.textContent = '❌ ' + data.erreur;
    }
  } catch (err) {
    resultat.className = 'resultat erreur';
    resultat.textContent = '❌ Erreur réseau : ' + err.message;
  }
}
</script>
</body>
</html>`);
});"""

if old_admin_html in content:
    content = content.replace(old_admin_html, new_admin_html)

with open('/home/ubuntu/bot_project/index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Admin HTML patch applied successfully.")
