with open('/home/ubuntu/mon-bot-messenger/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remplacer la gestion de mahajanga pour renvoyer le lien officiel propre
old_target = """  if (province === 'mahajanga') {"""

# On cherche où est géré mahajanga pour le remplacer proprement
if "mahajanga" in content:
    # Remplacer toute la fonction de recherche de mahajanga par le message de redirection officielle
    import re
    # Pattern pour trouver le bloc mahajanga dans searchBacc
    pattern = r'if\s*\(province\s*===\s*[\'"]mahajanga[\'"]\)\s*\{[^}]+\}'
    replacement = """if (province === 'mahajanga') {
    return "🎓📋 *RÉSULTAT BACCALAURÉAT 2026*\\n" +
           "📍 Province : Mahajanga\\n" +
           "🔍 Recherche : \\"" + query.trim() + "\\"\\n\\n" +
           "🛡️ En raison de la sécurité renforcée (anti-robot) du portail officiel de l'Université de Mahajanga, la consultation se fait directement sur leur plateforme officielle sécurisée.\\n\\n" +
           "👉 **Cliquez sur le lien ci-dessous pour voir votre résultat instantanément :**\\n" +
           "https://2026.mahajanga-univ.mg/\\n\\n" +
           "💡 *Entrez simplement votre numéro (ex: 2619185) sur le site pour voir votre mention !*";
  }"""
    
    new_content, count = re.subn(pattern, replacement, content)
    if count > 0:
        content = new_content
        print("Mahajanga block replaced successfully via regex!")
    else:
        print("Could not find mahajanga block via regex.")

with open('/home/ubuntu/mon-bot-messenger/index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Index.js successfully updated with full code and clean Mahajanga redirect!")
