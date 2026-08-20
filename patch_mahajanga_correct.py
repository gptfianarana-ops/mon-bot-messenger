with open('/home/ubuntu/mon-bot-messenger/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Trouver le début de searchBacc et insérer la gestion de Mahajanga tout en haut (juste après la vérification de disponibilité)
target = """  // 1. Vérifier les données locales
  const localResults = await getStoredBaccResults(province);"""

mahajanga_handler = """  // 🛡️ REDIRECTION OFFICIELLE POUR MAHAJANGA 2026
  if (province === 'mahajanga') {
    return "🎓📋 *RÉSULTAT BACCALAURÉAT 2026*\\n" +
           "📍 Province : Mahajanga\\n" +
           "🔍 Recherche : \\"" + query.trim() + "\\"\\n\\n" +
           "🛡️ En raison de la sécurité renforcée (anti-robot) du portail officiel de l'Université de Mahajanga, la consultation se fait directement sur leur plateforme officielle sécurisée.\\n\\n" +
           "👉 **Cliquez sur le lien ci-dessous pour voir votre résultat instantanément :**\\n" +
           "https://2026.mahajanga-univ.mg/\\n\\n" +
           "💡 *Entrez simplement votre numéro (ex: 2619185) sur le site pour voir votre mention !*";
  }

  // 1. Vérifier les données locales"""

if target in content:
    content = content.replace(target, mahajanga_handler)
    with open('/home/ubuntu/mon-bot-messenger/index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Mahajanga handler successfully injected into searchBacc!")
else:
    print("Error: Target not found in index.js")
