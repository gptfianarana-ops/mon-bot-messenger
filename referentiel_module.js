'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const INDEX_PATH = path.join(ROOT, 'referentiel_pedagogique_index.json');
const CORPUS_PATH = path.join(ROOT, 'referentiel_pedagogique_corpus.json.gz');

let indexCache = null;
let corpusCache = null;

function normaliser(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function chargerIndex() {
  if (!indexCache) {
    try { indexCache = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
    catch (_) { indexCache = { documents: [] }; }
  }
  return indexCache;
}

function chargerCorpus() {
  if (!corpusCache) {
    try { corpusCache = JSON.parse(zlib.gunzipSync(fs.readFileSync(CORPUS_PATH)).toString('utf8')); }
    catch (_) { corpusCache = { documents: [] }; }
  }
  return corpusCache;
}

function mots(value) {
  return new Set(normaliser(value).split(/[^a-z0-9]+/).filter(w => w.length > 2));
}

function extrairePassages(text, terms, limit = 4) {
  const compact = String(text || '').replace(/\s+/g, ' ');
  const sentences = compact.split(/(?<=[.!?;])\s+/);
  const scored = sentences.map(sentence => {
    const s = normaliser(sentence);
    const score = [...terms].reduce((n, term) => n + (s.includes(term) ? 1 : 0), 0);
    return { sentence: sentence.trim(), score };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.sentence.length - b.sentence.length);
  const direct = scored.slice(0, limit).map(x => x.sentence).filter(Boolean);
  if (direct.length) return direct;
  const fallback = [];
  for (const term of terms) {
    const re = new RegExp(`.{0,140}${term}.{0,220}`, 'i');
    const match = compact.match(re);
    if (match && !fallback.includes(match[0])) fallback.push(match[0].trim());
    if (fallback.length >= limit) break;
  }
  return fallback;
}

function rechercherReferentiel({ niveau, matiere, theme, serie, limit = 5 } = {}) {
  const idx = chargerIndex();
  const corpus = chargerCorpus();
  const queryTerms = new Set([...mots(matiere), ...mots(theme), ...mots(serie)]);
  const wantedLevel = String(niveau || '').toUpperCase();
  const docs = idx.documents.map(meta => {
    let score = 0;
    if (meta.level === wantedLevel) score += 10;
    if (meta.source_type === 'RAPE') score += 3;
    for (const subject of (meta.subjects || [])) {
      if (queryTerms.has(normaliser(subject))) score += 4;
    }
    const corpusDoc = corpus.documents.find(d => d.file === meta.file);
    const passages = corpusDoc ? extrairePassages(corpusDoc.text, queryTerms, 4) : [];
    score += passages.length;
    return { file: meta.file, level: meta.level, source_type: meta.source_type, subjects: meta.subjects || [], score, passages };
  }).filter(x => x.score > 0 && (!wantedLevel || x.level === wantedLevel));
  return docs.sort((a,b) => b.score - a.score).slice(0, limit);
}

function formaterReferences(results) {
  if (!results.length) return 'Aucun extrait local pertinent trouvé ; vérifier le référentiel officiel avant de présenter une information comme obligatoire.';
  return results.map((r, i) => `Référence ${i + 1} — ${r.file} (${r.source_type})\n${r.passages.slice(0, 2).join(' ')}`).join('\n');
}

module.exports = { rechercherReferentiel, formaterReferences, chargerIndex };
