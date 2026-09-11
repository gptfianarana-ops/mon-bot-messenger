#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/referentiels_drive_manifest.json"
OUT="$ROOT/referentiels_sources"
mkdir -p "$OUT/programmes" "$OUT/rape" "$OUT/logs"
python3 - "$MANIFEST" "$OUT" <<'PY'
import json, pathlib, subprocess, sys
manifest = json.load(open(sys.argv[1], encoding='utf-8'))
out = pathlib.Path(sys.argv[2])
for category, spec in manifest['sources'].items():
    target_dir = out / ('programmes' if category == 'programmes' else 'rape')
    for name, file_id in spec['files'].items():
        target = target_dir / name
        url = f'https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t'
        print(f'DOWNLOAD {category}/{name}')
        result = subprocess.run(['curl','-L','--fail','--silent','--show-error','--retry','3','-o',str(target),url], text=True)
        if result.returncode:
            raise SystemExit(result.returncode)
        size = target.stat().st_size
        if size < 1000:
            raise SystemExit(f'Fichier trop petit ou erreur de téléchargement: {target} ({size} octets)')
        print(f'OK {target} {size} bytes')
PY
find "$OUT" -type f -name '*.pdf' -printf '%p\t%s bytes\n' | sort | tee "$OUT/logs/download_manifest.tsv"
