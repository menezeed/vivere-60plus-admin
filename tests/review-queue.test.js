const assert = require('node:assert/strict');
const test = require('node:test');
const { createClient } = require('../review-queue');

const stagingOrigin = 'https://review.staging.example';
const stagingIssuer = 'https://auth.staging.example/auth/v1';
const legacyOrigin = 'https://ccpqngyupukdefaqvzgl.supabase.co';
const query = { kind: 'activities', status: 'pending', page: 1 };
const empty = { items: [], hasNext: false };

function fixtureToken(claims = {}) {
  const payload = Buffer.from(JSON.stringify({
    iss: stagingIssuer, exp: Date.now() / 1000 + 3600, ...claims,
  })).toString('base64url');
  return `header.${payload}.signature`;
}

function client(options = {}) {
  return createClient({
    enabled: true, stagingOrigin, stagingIssuer,
    getStagingToken: fixtureToken,
    fetchImpl: async () => ({ ok: true, json: async () => ({ items: [], page: 1, totalPages: 0 }) }),
    ...options,
  });
}

test('disabled by default and fails closed for incomplete or legacy production configuration', () => {
  assert.equal(createClient(), null);
  assert.throws(() => createClient({ enabled: true }), { code: 'configuration' });
  assert.throws(() => client({ stagingOrigin: legacyOrigin }), { code: 'configuration' });
  assert.throws(() => client({ stagingIssuer: `${legacyOrigin}/auth/v1` }), { code: 'configuration' });
  assert.throws(() => client({ stagingOrigin: stagingOrigin + '/api' }), { code: 'configuration' });
});

test('lists with GET only, keeping staging authentication and pagination scoped', async () => {
  const token = fixtureToken();
  const signal = new AbortController().signal;
  const data = { items: [{ id: '1', title: 'Atividade', proposal_status: 'approved' }], page: 2, totalPages: 3 };
  const api = client({
    getStagingToken: () => token,
    fetchImpl: async (url, options) => {
      assert.equal(url, `${stagingOrigin}/api/activities?page=2&pageSize=20&status=approved`);
      assert.deepEqual(options, {
        method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal,
      });
      return { ok: true, json: async () => data };
    },
  });
  assert.deepEqual(Object.keys(api), ['list']);
  assert.deepEqual(await api.list({ ...query, status: 'approved', page: 2, signal }), {
    items: [{ id: '1', label: 'Atividade', status: 'approved', venue: null }], hasNext: true,
  });
  assert.deepEqual(await client().list(query), empty);
});

test('uses pending_review on the venues route and reads the venue name', async () => {
  const api = client({ fetchImpl: async url => {
    assert.equal(url, `${stagingOrigin}/api/venues?page=1&pageSize=20&status=pending_review`);
    return { ok: true, json: async () => ({
      items: [{ id: '2', name: 'Biblioteca', proposal_status: 'pending_review' }], page: 1, totalPages: 1,
    }) };
  } });
  assert.deepEqual(await api.list({ ...query, kind: 'venues' }), {
    items: [{ id: '2', label: 'Biblioteca', status: 'pending', venue: null }], hasNext: false,
  });
});

test('rejects invalid scope before obtaining a token', async () => {
  let calls = 0;
  const api = client({ getStagingToken: () => { calls++; } });
  await assert.rejects(api.list({ ...query, page: 0 }), { code: 'configuration' });
  await assert.rejects(api.list({ ...query, kind: '//elsewhere.example/list' }), { code: 'configuration' });
  await assert.rejects(api.list({ ...query, status: 'promoted' }), { code: 'configuration' });
  assert.equal(calls, 0);
});

test('missing, expired or legacy tokens never reach fetch', async () => {
  for (const token of [null, 'invalid', fixtureToken({ exp: 1 }), fixtureToken({ iss: `${legacyOrigin}/auth/v1` })]) {
    let calls = 0;
    const api = client({ getStagingToken: () => token, fetchImpl: () => { calls++; } });
    await assert.rejects(api.list(query), { code: 'session' });
    assert.equal(calls, 0);
  }
});

test('401, 403 and 409 retain distinct codes without exposing response bodies', async () => {
  for (const status of [401, 403, 409]) {
    let bodyReads = 0;
    const api = client({ fetchImpl: async () => ({ ok: false, status, json: () => { bodyReads++; } }) });
    await assert.rejects(api.list(query), { code: status });
    assert.equal(bodyReads, 0);
  }
});

test('maps network/CORS and rejects malformed data', async () => {
  await assert.rejects(client({ fetchImpl: async () => { throw new TypeError('fixture'); } }).list(query),
    { code: 'network' });
  await assert.rejects(client({ fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }) }).list(query),
    { code: 'response' });
});
