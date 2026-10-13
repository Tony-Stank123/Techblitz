// api/admin/[action].js
// Consolidated Admin Serverless Function (Vercel Dynamic Route: 1 function instead of 6)
import overviewHandler from '../_lib/admin/overview.js';
import startTimerHandler from '../_lib/admin/start-timer.js';
import addUserHandler from '../_lib/admin/add-user.js';
import removeUserHandler from '../_lib/admin/remove-user.js';
import unblockHandler from '../_lib/admin/unblock.js';
import revealScoresHandler from '../_lib/admin/reveal-scores.js';

const handlers = {
  'overview': overviewHandler,
  'start-timer': startTimerHandler,
  'add-user': addUserHandler,
  'remove-user': removeUserHandler,
  'unblock': unblockHandler,
  'reveal-scores': revealScoresHandler
};

export default async function handler(req, res) {
  const urlObj = req.url ? new URL(req.url, 'http://localhost') : null;
  const pathAction = urlObj ? urlObj.pathname.split('/').filter(Boolean).pop() : '';
  const action = req.query?.action || pathAction;

  const fn = handlers[action];
  if (!fn) {
    return res.status(404).json({ error: `Admin action '${action}' not found` });
  }

  return fn(req, res);
}
