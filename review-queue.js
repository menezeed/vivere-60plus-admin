(function (root) {
  const kinds = ['activities', 'venues'];
  const apiStatuses = { pending: 'pending_review', approved: 'approved', rejected: 'rejected' };
  const productionProjectRef = 'ccpqngyupukdefaqvzgl';
  const messages = {
    configuration: 'A configuração de staging está pendente.',
    session: 'Inicie uma sessão de staging válida para consultar a fila.',
    401: 'A sessão de staging expirou ou foi recusada.',
    403: 'A sessão de staging não tem acesso à fila.',
    409: 'A fila mudou. Atualize a consulta.',
    network: 'A API de staging está indisponível ou bloqueou a origem do Admin.',
    response: 'A API de staging devolveu uma resposta inesperada.',
  };

  function fail(code) {
    throw Object.assign(new Error(messages[code]), { code });
  }

  function httpsUrl(value) {
    let url;
    try { url = new URL(value); } catch { fail('configuration'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      fail('configuration');
    }
    return url;
  }

  function validSession(token, issuer) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part))) return false;
    try {
      const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return claims.iss === issuer && Number.isFinite(claims.exp) && claims.exp > Date.now() / 1000;
    } catch {
      return false;
    }
  }

  function createClient({
    enabled = false, stagingOrigin, stagingIssuer, getStagingToken, fetchImpl = globalThis.fetch,
  } = {}) {
    if (enabled !== true) return null;
    const origin = httpsUrl(stagingOrigin);
    const issuer = httpsUrl(stagingIssuer);
    if (origin.origin !== stagingOrigin || stagingIssuer !== issuer.href ||
        [origin.href, issuer.href].some(url => url.includes(productionProjectRef)) ||
        typeof getStagingToken !== 'function' || typeof fetchImpl !== 'function') fail('configuration');

    return Object.freeze({
      async list({ kind, status, page, signal }) {
        if (!kinds.includes(kind) || !Object.hasOwn(apiStatuses, status) ||
            !Number.isSafeInteger(page) || page < 1) fail('configuration');
        const url = new URL(`/api/${kind}`, origin);
        url.search = new URLSearchParams({ page, pageSize: 20, status: apiStatuses[status] });
        let token;
        try { token = await getStagingToken(); } catch { fail('session'); }
        if (!validSession(token, stagingIssuer)) fail('session');

        let response;
        try {
          response = await fetchImpl(url.href, {
            method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            signal,
          });
        } catch { fail('network'); }
        if (!response.ok) fail([401, 403, 409].includes(response.status) ? response.status : 'response');

        let result;
        try { result = await response.json(); }
        catch { fail('response'); }
        if (!Array.isArray(result?.items) || result.page !== page ||
            !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
            result.items.some(item => typeof item?.id !== 'string' || !item.id ||
              item.proposal_status !== apiStatuses[status])) fail('response');
        const items = result.items.map(item => {
          const label = kind === 'activities' ? item.title : item.name;
          return {
            id: item.id, status, label: typeof label === 'string' && label.trim() ? label : 'Sem nome',
            venue: typeof item.venue_mention_raw_text === 'string' ? item.venue_mention_raw_text : null,
          };
        });
        return { items, hasNext: page < result.totalPages };
      },
    });
  }

  const api = { createClient, messages: Object.freeze(messages) };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VivereReviewQueue = api;
})(globalThis);
