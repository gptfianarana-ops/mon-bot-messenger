const axios = require('axios');
const https = require('https');

/**
 * Recherche BAC 2026 pour l'Université d'Antananarivo.
 *
 * Le proxy ne contourne pas le portail : il reproduit son flux public,
 * récupère un CAPTCHA frais, puis transmet la recherche avec les mêmes
 * paramètres tRPC que le formulaire officiel.
 *
 * Retour structuré :
 *   { status: 'ok', results: [...] }
 *   { status: 'not_found', results: [] }
 *   { status: 'captcha_error' | 'unavailable' | 'protocol_error', ... }
 */

const ORIGIN = 'https://www.univ-antananarivo.mg';
const RESULTS_PAGE = `${ORIGIN}/resultats-bac`;
const CAPTCHA_URL = `${ORIGIN}/api/trpc/cms.getBacResultsCaptcha?batch=1&input=%7B%7D`;
const SEARCH_URL = `${ORIGIN}/api/trpc/cms.searchBacResults?batch=1`;

const httpAgent = new https.Agent({
  keepAlive: false,
  minVersion: 'TLSv1.2'
});

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Origin': ORIGIN,
  'Referer': RESULTS_PAGE,
  'Connection': 'close'
};

function getCookieHeader(setCookie) {
  return (setCookie || []).map(value => value.split(';')[0]).join('; ');
}

function extractTrpcJson(response) {
  const item = response?.data?.[0];
  return item?.result?.data?.json ?? null;
}

function normaliserNom(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\\s+/g, ' ');
}

function classifyTransportError(error, stage) {
  const status = error?.response?.status;
  const code = error?.code || '';
  const message = error?.message || 'Erreur inconnue';

  if (status === 400 || status === 401 || status === 403 || status === 422) {
    return { status: 'captcha_error', stage, httpStatus: status, code, details: message };
  }

  if (status === 408 || status === 429 || status >= 500 || ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ERR_SOCKET_CLOSED'].includes(code) || /socket hang up|SSL_ERROR_SYSCALL|SSL connection timeout|network/i.test(message)) {
    return { status: 'unavailable', stage, httpStatus: status || null, code, details: message };
  }

  return { status: 'protocol_error', stage, httpStatus: status || null, code, details: message };
}

async function searchTana(query) {
  const startedAt = Date.now();
  const value = String(query || '').trim();
  if (!value) return { status: 'protocol_error', stage: 'input', details: 'Recherche vide' };

  try {
    const captchaRes = await axios.get(CAPTCHA_URL, {
      timeout: 15000,
      headers: COMMON_HEADERS,
      httpsAgent: httpAgent,
      validateStatus: () => true
    });

    if (captchaRes.status !== 200) {
      return classifyTransportError({ response: { status: captchaRes.status }, code: 'HTTP_STATUS', message: 'CAPTCHA endpoint non-OK' }, 'captcha');
    }

    const captchaData = extractTrpcJson(captchaRes);
    const captchaId = captchaData?.id;
    const svg = captchaData?.svg || '';
    const matches = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)];
    const captchaAnswer = matches.map(match => match[1]).join('').trim();

    if (!captchaId || !captchaAnswer) {
      console.error('[TANA] CAPTCHA illisible', { hasId: Boolean(captchaId), answerLength: captchaAnswer.length });
      return { status: 'captcha_error', stage: 'captcha', code: 'CAPTCHA_UNREADABLE', details: 'SVG sans réponse exploitable' };
    }

    const isNumeric = /^\d+$/.test(value);
    const nameParts = isNumeric ? [] : value.replace(/[,;]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const searchParams = {
      annee: '2026',
      numInscription: isNumeric ? value : '',
      nom: isNumeric ? '' : (nameParts.shift() || '').toUpperCase(),
      prenoms: isNumeric ? '' : nameParts.join(' '),
      captchaId,
      captchaAnswer
    };

    const searchRes = await axios.post(SEARCH_URL, { '0': { json: searchParams } }, {
      timeout: 20000,
      headers: {
        ...COMMON_HEADERS,
        'Content-Type': 'application/json',
        ...(getCookieHeader(captchaRes.headers['set-cookie']) ? { Cookie: getCookieHeader(captchaRes.headers['set-cookie']) } : {})
      },
      httpsAgent: httpAgent,
      validateStatus: () => true
    });

    if (searchRes.status !== 200) {
      return classifyTransportError({ response: { status: searchRes.status }, code: 'HTTP_STATUS', message: 'Recherche endpoint non-OK' }, 'search');
    }

    const data = extractTrpcJson(searchRes);
    if (!data || !Array.isArray(data.results)) {
      const errorCode = searchRes.data?.[0]?.error?.data?.code || 'TRPC_INVALID_RESPONSE';
      if (errorCode === 'BAD_REQUEST') {
        return { status: 'captcha_error', stage: 'search', code: errorCode, details: 'Réponse BAD_REQUEST du portail' };
      }
      if (errorCode === 'INTERNAL_SERVER_ERROR' || errorCode === 'TIMEOUT' || errorCode === 'TOO_MANY_REQUESTS') {
        return { status: 'unavailable', stage: 'search', code: errorCode, details: 'Erreur interne ou surcharge tRPC' };
      }
      return { status: 'protocol_error', stage: 'search', code: errorCode, details: 'Structure tRPC inattendue' };
    }

    const results = data.results.map(candidate => {
      const mention = candidate.mention || 'Passable';
      const resultat = String(candidate.resultat || '').toLowerCase();
      const admis = candidate.admis !== undefined
        ? Boolean(candidate.admis)
        : !/(non\s*admis|ajourne|refuse|exclu)/i.test(resultat + ' ' + mention);
      return {
        matricule: candidate.numInscription || candidate.matricule || '',
        nom: candidate.nom || '',
        prenoms: candidate.prenom || candidate.prenoms || '',
        serie: candidate.serie || 'N/A',
        mention,
        resultat: candidate.resultat || '',
        centre: candidate.centre || 'N/A',
        etablissement: candidate.etablissement || '',
        province: 'Antananarivo',
        admis
      };
    });

    let filteredResults = results;
    if (!isNumeric && nameParts.length > 0) {
      const requested = normaliserNom(value);
      const exact = results.filter(candidate => normaliserNom(`${candidate.nom} ${candidate.prenoms}`) === requested);
      if (exact.length > 0) {
        filteredResults = exact;
      } else if (nameParts.length >= 1) {
        const tokens = requested.split(' ').filter(Boolean);
        const partial = results.filter(candidate => {
          const full = normaliserNom(`${candidate.nom} ${candidate.prenoms}`);
          return tokens.every(token => full.split(' ').includes(token));
        });
        if (partial.length > 0) filteredResults = partial;
      }
    }

    console.log('[TANA] recherche terminée', { found: filteredResults.length, rawFound: results.length, durationMs: Date.now() - startedAt });
    return filteredResults.length > 0 ? { status: 'ok', results: filteredResults } : { status: 'not_found', results: [] };
  } catch (error) {
    const classified = classifyTransportError(error, 'request');
    console.error('[TANA] échec transport', { status: classified.status, stage: classified.stage, code: classified.code, httpStatus: classified.httpStatus, durationMs: Date.now() - startedAt, details: classified.details });
    return classified;
  }
}

module.exports = { searchTana };
