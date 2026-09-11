#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/referentiels_sources"
OUT="$ROOT/referentiels_analysis"
mkdir -p "$OUT/text" "$OUT/metadata"
: > "$OUT/metadata/summary.tsv"
while IFS= read -r -d '' pdf; do
  rel="${pdf#$SRC/}"
  stem="${rel%.pdf}"
  safe="${stem//\//__}"
  txt="$OUT/text/${safe}.txt"
  pdftotext -layout "$pdf" "$txt" 2>"$OUT/metadata/${safe}.stderr" || true
  pages=$(pdfinfo "$pdf" 2>/dev/null | awk -F: '/^Pages/{gsub(/ /,"",$2);print $2}')
  size=$(stat -c%s "$pdf")
  chars=$(wc -m < "$txt")
  words=$(wc -w < "$txt")
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$rel" "${pages:-0}" "$size" "$chars" "$words" "$(tr '\n' ' ' < "$txt" | sed 's/[[:space:]]\+/ /g' | cut -c1-240)" >> "$OUT/metadata/summary.tsv"
done < <(find "$SRC" -type f -iname '*.pdf' -print0 | sort -z)
python3 - "$OUT/metadata/summary.tsv" "$OUT/metadata/report.json" <<'PY'
import csv, json, sys
rows=[]
with open(sys.argv[1], encoding='utf-8') as f:
    for r in csv.reader(f, delimiter='\t'):
        if r: rows.append({'file':r[0],'pages':int(r[1] or 0),'bytes':int(r[2]),'chars':int(r[3]),'words':int(r[4]),'preview':r[5]})
report={'count':len(rows),'total_bytes':sum(x['bytes'] for x in rows),'total_pages':sum(x['pages'] for x in rows),'documents':rows}
json.dump(report, open(sys.argv[2],'w',encoding='utf-8'), ensure_ascii=False, indent=2)
print(json.dumps({'count':report['count'],'total_pages':report['total_pages'],'total_bytes':report['total_bytes']}, ensure_ascii=False))
PY
