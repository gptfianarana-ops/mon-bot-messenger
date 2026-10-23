#!/usr/bin/env python3
import gzip, json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = ROOT / 'referentiels_analysis' / 'text'
OUT = ROOT / 'referentiel_pedagogique_index.json'
CORPUS = ROOT / 'referentiel_pedagogique_corpus.json.gz'

SUBJECTS = {
    'malagasy': r'\bmalagasy\b|fampianarana ny teny malagasy',
    'français': r'\bfran[cç]ais\b|teny frantsay',
    'mathématiques': r'math[ée]matiques|kajy',
    'sciences': r'\bsciences?\b|siansa',
    'physique': r'\bphysique\b',
    'chimie': r'\bchimie\b',
    'histoire': r'\bhistoire\b|tantara',
    'géographie': r'\bg[ée]ographie\b|jeografia',
    'philosophie': r'\bphilosophie\b|filozofia',
    'anglais': r'\banglais\b|teny anglisy',
    'informatique': r'\binformatique\b|solosaina',
    'éducation civique': r'[ée]ducation civique|fanabeazana olom-pirenena',
    'économie': r'\b[ée]conomie\b|toekarena',
}

def norm(s):
    return unicodedata.normalize('NFKC', s).replace('\x0c', ' ')

def level_from_name(name):
    upper = name.upper()
    if 'PRESCO' in upper or 'PRESCOLAIRE' in upper:
        return 'PRESCO'
    m = re.search(r'(?:^|[^0-9])T(1[0-2]|[1-9])(?:[^0-9]|$)', upper)
    return f'T{m.group(1)}' if m else None

def source_type(name):
    upper = Path(name).name.upper()
    if 'RAPE' in upper: return 'RAPE'
    if 'FOV' in upper or 'MANUEL' in upper or 'GUIDE' in upper: return 'FOV'
    if 'PE' in upper or 'PROGRAMME' in upper: return 'Programme d’études'
    return 'autre'

def series_from_name(name, text):
    upper = Path(name).name.upper()
    found = []
    for serie in ('L', 'S', 'OSE'):
        if re.search(rf'(?:^|[_-]){serie}(?:[_\.-]|$)', upper) or re.search(rf'\bS[ée]rie\s+{serie}\b', text, re.I):
            found.append(serie)
    return found

def headings(text):
    out=[]
    for line in text.splitlines():
        line = re.sub(r'\s+', ' ', line).strip(' -:;,.')
        if 5 <= len(line) <= 140 and (line.isupper() or re.match(r'^(I|II|III|IV|V|VI|VII|VIII|IX|X|[0-9]+)[.) -]', line)):
            if line not in out: out.append(line)
    return out[:80]

def contexts(text, pattern, limit=5):
    out=[]
    for m in re.finditer(pattern, text, re.I):
        a=max(0,m.start()-100); b=min(len(text),m.end()+160)
        snippet=re.sub(r'\s+',' ',text[a:b]).strip()
        if snippet not in out: out.append(snippet)
        if len(out)>=limit: break
    return out

docs=[]
inputs=[]
if TEXT.exists():
    inputs = [(path.name.replace('__','/').removesuffix('.txt'), path.read_text(errors='replace')) for path in sorted(TEXT.glob('*.txt'))]
elif CORPUS.exists():
    with gzip.open(CORPUS, 'rt', encoding='utf8') as handle:
        saved = json.load(handle)
    inputs = [(item.get('file', ''), item.get('text', '')) for item in saved.get('documents', [])]
for name, source_text in inputs:
    raw = norm(source_text)
    level = level_from_name(name)
    subject_hits = {s: len(re.findall(p, raw, re.I)) for s,p in SUBJECTS.items()}
    subjects = [s for s,n in subject_hits.items() if n]
    docs.append({
        'file': name,
        'level': level,
        'source_type': source_type(Path(name).name),
        'series': series_from_name(Path(name).name, raw),
        'language_signals': {'français': len(re.findall(r'\bfran[cç]ais\b', raw, re.I)), 'malagasy': len(re.findall(r'\bmalagasy\b', raw, re.I))},
        'subjects': subjects,
        'subject_hits': subject_hits,
        'pages_text_extracted': len(raw),
        'headings': headings(raw),
        'evidence': {s: contexts(raw, p, 2) for s,p in SUBJECTS.items() if re.search(p, raw, re.I)},
    })
index = {
    'schema_version': 2,
    'generated_from_public_drive_sources': True,
    'warning': 'Index documentaire pour recherche et génération assistée. Vérifier la version officielle, l’arrêté applicable et le calendrier avant usage administratif.',
    'documents_count': len(docs),
    'levels': sorted({d['level'] for d in docs if d['level'] and d['level'] != 'PRESCO'}, key=lambda x:int(x[1:])),
    'documents': docs,
}
if not docs:
    raise SystemExit('Aucune source documentaire trouvée : index non régénéré.')
OUT.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf8')
print(f'index={OUT} documents={len(docs)} levels={index["levels"]}')
