
import sys
import os
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import textwrap

def generate_poster(bg_url, title, subtitle, footer, output_path):
    # 1. Charger le fond
    try:
        if bg_url.startswith('http'):
            response = requests.get(bg_url, stream=True, timeout=20)
            bg = Image.open(response.raw).convert("RGBA")
        else:
            bg = Image.open(bg_url).convert("RGBA")
    except Exception as e:
        print(f"Erreur chargement fond: {e}")
        bg = Image.new("RGBA", (1024, 1024), (30, 60, 120, 255)) # Fond de secours bleu

    # Redimensionner en format carré standard si besoin
    bg = bg.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # 2. Créer un calque pour le texte
    txt_layer = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    # Chemins des polices (Nimbus Sans est une bonne alternative à Helvetica)
    font_bold = "/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf"
    font_reg = "/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf"
    
    # 3. Ajouter un dégradé ou un overlay pour la lisibilité
    overlay = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    # Rectangle semi-transparent au centre/bas pour le texte
    ov_draw.rectangle([50, 200, 974, 900], fill=(0, 0, 0, 140))
    bg = Image.alpha_composite(bg, overlay)

    # 4. Dessiner le Titre
    try:
        f_title = ImageFont.truetype(font_bold, 80)
        f_sub = ImageFont.truetype(font_reg, 50)
        f_footer = ImageFont.truetype(font_bold, 40)
    except:
        f_title = f_sub = f_footer = ImageFont.load_default()

    # Wrap title text
    lines = textwrap.wrap(title.upper(), width=20)
    y_text = 250
    for line in lines:
        w = draw.textlength(line, font=f_title)
        draw.text(((1024 - w) / 2, y_text), line, font=f_title, fill=(255, 215, 0, 255)) # Or
        y_text += 90

    # Dessiner le Sous-titre
    y_text += 40
    sub_lines = textwrap.wrap(subtitle, width=35)
    for line in sub_lines:
        w = draw.textlength(line, font=f_sub)
        draw.text(((1024 - w) / 2, y_text), line, font=f_sub, fill=(255, 255, 255, 255))
        y_text += 60

    # Dessiner le Footer (Branding)
    footer_text = footer.upper()
    w_f = draw.textlength(footer_text, font=f_footer)
    # Petit badge pour le branding
    draw.rectangle([(1024-w_f)/2 - 20, 800, (1024+w_f)/2 + 20, 870], fill=(255, 215, 0, 255))
    draw.text(((1024 - w_f) / 2, 815), footer_text, font=f_footer, fill=(0, 0, 0, 255))

    # 5. Fusionner et sauvegarder
    final = Image.alpha_composite(bg, txt_layer)
    final = final.convert("RGB")
    final.save(output_path, "JPEG", quality=90)
    print(f"Poster sauvegardé: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python3 poster_engine.py bg_url title subtitle footer output_path")
        sys.exit(1)
    
    generate_poster(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
