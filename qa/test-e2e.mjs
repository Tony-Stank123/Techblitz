// Comprehensive End-to-End Test for TECH BLITZ: The Jane Protocol Backend & API Flow
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8089;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.js': 'text/javascript; charset=utf-8'
};

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  if (p.startsWith('/api/')) {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        req.body = bodyStr ? JSON.parse(bodyStr) : {};
      } catch {
        req.body = {};
      }

      res.status = code => { res.statusCode = code; return res; };
      res.json = data => {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(res.statusCode || 200);
        res.end(JSON.stringify(data));
        return res;
      };

      const relPath = p.replace(/^\/api\//, '');
      let modulePath = join(ROOT, 'api', relPath + '.js');

      if (!existsSync(modulePath)) {
        const parts = relPath.split('/');
        if (parts.length > 1) {
          const dynamicPath = join(ROOT, 'api', parts[0], '[action].js');
          if (existsSync(dynamicPath)) {
            modulePath = dynamicPath;
            req.query = { ...(req.query || {}), action: parts[1] };
          }
        }
      }

      if (!existsSync(modulePath)) {
        res.status(404).json({ error: `API route not found: ${p}` });
        return;
      }

      try {
        const mod = await import(`file://${modulePath}?t=${Date.now()}`);
        await mod.default(req, res);
      } catch (err) {
        res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    });
    return;
  }

  if (p === '/') p = '/tech-blitz-jane-protocol.html';
  const file = normalize(join(ROOT, p));

  if (!file.startsWith(ROOT) || file.includes('server-only')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

await new Promise(resolve => server.listen(PORT, resolve));
console.log(`Test server running on http://localhost:${PORT}`);

const BASE = `http://localhost:${PORT}`;

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

try {
  console.log('\n--- 1. Static Index & Security Gate ---');
  const indexRes = await fetch(`${BASE}/`);
  assert.equal(indexRes.status, 200);
  const html = await indexRes.text();
  assert.ok(html.includes('TECH BLITZ'));
  console.log('✓ Root route serves HTML correctly');

  const secretRes = await fetch(`${BASE}/puzzles/server-only/puzzles.answers.json`);
  assert.equal(secretRes.status, 403);
  console.log('✓ Server-only answer files are strictly forbidden');

  console.log('\n--- 2. Single Login Endpoint ---');
  // Unknown user
  const failLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ register_number: 'RANDOM_USER_999' })
  });
  assert.equal(failLogin.status, 403);
  console.log('✓ Unwhitelisted participant is rejected (403)');

  // Admin auto-detection
  const adminLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ register_number: 'Gowtham123' })
  });
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.data.role, 'admin');
  assert.ok(adminLogin.data.token);
  const adminToken = adminLogin.data.token;
  console.log('✓ Gowtham123 automatically authenticated as admin');

  // Whitelisted participant
  const partLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ register_number: '21BCE1001' })
  });
  assert.equal(partLogin.status, 200);
  assert.equal(partLogin.data.role, 'participant');
  assert.ok(partLogin.data.token);
  const partToken = partLogin.data.token;
  console.log('✓ Whitelisted participant 21BCE1001 authenticated');

  console.log('\n--- 3. Clock Sync ---');
  const sync = await req('/api/clock/sync');
  assert.equal(sync.status, 200);
  assert.ok(typeof sync.data.server_time === 'number');
  console.log('✓ Clock sync returns valid authoritative timestamp:', sync.data.server_time);

  console.log('\n--- 4. Authoritative Admin Start Timer ---');
  // Participant cannot start timer
  const deniedStart = await req('/api/admin/start-timer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${partToken}` }
  });
  assert.equal(deniedStart.status, 403);
  console.log('✓ Participant cannot start timer');

  // Admin starts timer
  const startTimer = await req('/api/admin/start-timer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(startTimer.status, 200);
  assert.ok(startTimer.data.server_start_time);
  assert.equal(startTimer.data.is_started, true);
  console.log('✓ Admin successfully started timer at:', startTimer.data.server_start_time);

  console.log('\n--- 5. Submission & Score Evaluation ---');
  // Submit correct answer to cho-a
  const sub = await req('/api/submissions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${partToken}` },
    body: JSON.stringify({
      puzzle_id: 'cho-a',
      submitted_answer: ' 9:43 ',
      timestamp: new Date().toISOString()
    })
  });
  assert.equal(sub.status, 200);
  assert.equal(sub.data.status, 'recorded');
  assert.ok(sub.data.recorded_at);
  // CRITICAL: Participant receipt MUST NOT leak correctness!
  assert.equal(sub.data.is_correct, undefined);
  assert.equal(sub.data.points, undefined);
  console.log('✓ Answer recorded without leaking verdict to participant');

  console.log('\n--- 6. Admin Overview & Live Score Leaderboard ---');
  const overview = await req('/api/admin/overview', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(overview.status, 200);
  assert.ok(overview.data.leaderboard);
  const entry = overview.data.leaderboard.find(l => l.register_number === '21BCE1001');
  assert.ok(entry);
  assert.equal(entry.score, 1);
  console.log('✓ Admin Live Scores leaderboard updated immediately with +1 point');

  console.log('\n--- 7. Fullscreen Exit & Admin Unblock Protocol ---');
  // Participant reports fullscreen exit
  const exitRes = await req('/api/fullscreen/exit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${partToken}` }
  });
  assert.equal(exitRes.status, 200);
  assert.equal(exitRes.data.is_blocked, true);
  console.log('✓ Participant marked blocked upon fullscreen exit');

  // Admin checks unblock requests
  const ovRequests = await req('/api/admin/overview', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const unblockReq = (ovRequests.data.requests || []).find(r => r.register_number === '21BCE1001');
  assert.ok(unblockReq);
  console.log('✓ Fullscreen unblock request appears in Admin dashboard');

  // Admin accepts and unblocks
  const unblockAction = await req('/api/admin/unblock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      request_id: unblockReq.id,
      register_number: '21BCE1001'
    })
  });
  assert.equal(unblockAction.status, 200);
  assert.equal(unblockAction.data.unblocked, true);
  console.log('✓ Admin successfully unblocks participant');

  // Check participant session rehydration
  const sess = await req('/api/auth/session', {
    headers: { Authorization: `Bearer ${partToken}` }
  });
  assert.equal(sess.status, 200);
  assert.equal(sess.data.is_blocked, false);
  console.log('✓ Participant session rehydrates unblocked state');

  console.log('\n--- 8. Hints & Accusations ---');
  const hintRes = await req('/api/hints', {
    method: 'POST',
    headers: { Authorization: `Bearer ${partToken}` },
    body: JSON.stringify({
      puzzle_id: 'cho-a',
      timestamp: new Date().toISOString()
    })
  });
  assert.equal(hintRes.status, 200);
  assert.equal(hintRes.data.status, 'logged');
  assert.ok(hintRes.data.hint);
  console.log('✓ Secret hint returned and penalty registered');

  const accRes = await req('/api/accusation', {
    method: 'POST',
    headers: { Authorization: `Bearer ${partToken}` },
    body: JSON.stringify({
      suspect_id: 'sam',
      timestamp: new Date().toISOString()
    })
  });
  assert.equal(accRes.status, 200);
  assert.equal(accRes.data.status, 'recorded');
  console.log('✓ Final accusation submitted and registered');

  console.log('\n========================================');
  console.log('ALL END-TO-END INTEGRATION TESTS PASSED!');
  console.log('========================================');
} finally {
  server.close();
}
