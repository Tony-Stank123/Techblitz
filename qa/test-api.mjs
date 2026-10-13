// qa/test-api.mjs - Quick test for API endpoints
import syncHandler from '../api/clock/sync.js';
import loginHandler from '../api/auth/login.js';
import { checkAnswer, getHint, checkAccusation } from '../api/_lib/answers.js';
import { signToken, verifyToken } from '../api/_lib/auth.js';

console.log('--- Testing Answer Evaluation ---');
console.assert(checkAnswer('cho-a', '9:43') === true, 'cho-a 9:43 should be true');
console.assert(checkAnswer('cho-a', '  9:43 PM  ') === true, 'cho-a with spaces/PM should be true');
console.assert(checkAnswer('cho-a', '10:00') === false, 'cho-a wrong time should be false');
console.assert(checkAnswer('lisbon-a', '5') === true, 'lisbon-a 5 should be true');
console.assert(checkAnswer('lisbon-a', 'mine = 5') === true, 'lisbon-a mine=5 should be true');
console.assert(checkAccusation('sam') === true, 'Accusation sam should be true');
console.assert(checkAccusation('owen') === false, 'Accusation owen should be false');
console.assert(getHint('cho-a') !== null, 'Hint for cho-a should exist');
console.log('Answer checks passed.');

console.log('--- Testing JWT Auth Tokens ---');
const token = signToken({ register_number: 'Gowtham123', role: 'admin' });
const verified = verifyToken(token);
console.assert(verified !== null && verified.role === 'admin', 'Token verification should succeed with role admin');
console.assert(verifyToken(token + 'tampered') === null, 'Tampered token must fail');
console.log('Auth checks passed.');

console.log('--- Testing API Handlers ---');
const mockRes = () => {
  const r = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { r.headers[k] = v; },
    status(c) { r.statusCode = c; return r; },
    json(d) { r.data = d; return r; }
  };
  return r;
};

// Clock sync test
const syncRes = mockRes();
syncHandler({ method: 'GET', headers: {} }, syncRes);
console.assert(typeof syncRes.data.server_time === 'number', 'server_time should be a number');
console.log('Sync handler returned:', syncRes.data);

// Login test
const loginRes = mockRes();
await loginHandler({ method: 'POST', body: { register_number: 'Gowtham123' } }, loginRes);
console.assert(loginRes.data.role === 'admin', 'Gowtham123 must receive admin role');
console.assert(typeof loginRes.data.token === 'string', 'Login must issue token');
console.log('Login handler returned:', loginRes.data.role, loginRes.data.register_number);

import adminActionHandler from '../api/admin/[action].js';
import { localStore } from '../api/_lib/db.js';

// Admin Reset Event Test
const adminToken = token;
localStore.submissions.push({ id: 999, register_number: '21BCE1001', puzzle_id: 'cho-a', recorded_at: new Date().toISOString() });
localStore.event_state.is_started = true;
localStore.event_state.scores_revealed = true;
const userCountBefore = localStore.users.size;

const resetRes = mockRes();
await adminActionHandler({
  method: 'POST',
  headers: { authorization: `Bearer ${adminToken}` },
  query: { action: 'reset-event' }
}, resetRes);

console.assert(resetRes.data.success === true, 'Reset event should succeed');
console.assert(localStore.event_state.is_started === false, 'Event state is_started should be false');
console.assert(localStore.event_state.scores_revealed === false, 'Scores revealed should be false');
console.assert(localStore.submissions.length === 0, 'Submissions should be cleared');
console.assert(localStore.users.size === userCountBefore, 'All users and admins must be preserved');
console.assert(localStore.users.has('gowtham123') === true, 'Admin Gowtham123 must remain in roster');
console.log('Admin reset test passed: timer stopped, scores reset, submissions cleared, users & admins preserved.');

console.log('ALL MILESTONE 1 BACKEND TESTS PASSED SUCCESSFULLY!');
