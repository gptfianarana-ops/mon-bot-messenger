#!/usr/bin/env python3
import gzip, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
text_dir = ROOT / 'referentiels_analysis' / 'text'
out = ROOT / 'referentiel_pedagogique_corpus.json.gz'
docs=[]
for path in sorted(text_dir.glob('*.txt')):
    name = path.name.replace('__','/').removesuffix('.txt')
    docs.append({'file': name, 'text': path.read_text(errors='replace')})
with gzip.open(out, 'wt', encoding='utf-8') as f:
    json.dump({'schema_version':1,'documents':docs}, f, ensure_ascii=False, separators=(',', ':'))
print(f'{out} documents={len(docs)} bytes={out.stat().st_size}')
