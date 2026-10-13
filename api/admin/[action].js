// api/admin/[action].js
// Consolidated Admin Serverless Function (Vercel Dynamic Route: 1 function instead of 6)
import overviewHandler from '../_lib/admin/overview.js';
import startTimerHandler from '../_lib/admin/start-timer.js';
import addUserHandler from '../_lib/admin/add-user.js';
import removeUserHandler from '../_lib/admin/remove-user.js';
import unblockHandler from '../_lib/admin/unblock.js';
import revealScoresHandler from '../_lib/admin/reveal-scores.js';
import resetHandler from '../_lib/admin/reset.js';

const handlers = {
  'overview': overviewHandler,
  'start-timer': startTimerHandler,
  'start': startTimerHandler,
  'timer': startTimerHandler,
  'add-user': addUserHandler,
  'adduser': addUserHandler,
  'remove-user': removeUserHandler,
  'removeuser': removeUserHandler,
  'unblock': unblockHandler,
  'reveal-scores': revealScoresHandler,
  'reveal': revealScoresHandler,
  'reset': resetHandler,
  'reset-event': resetHandler,
  'resetevent': resetHandler,
  'download': overviewHandler,
  'export': overviewHandler
};

export default async function handler(req, res) {
  let action = '';
  if (req.query?.action) {
    action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  }

  if (!action || action === '[action]') {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      action = urlObj.searchParams.get('action');
      if (!action || action === '[action]') {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        const last = parts.pop();
        if (last && last !== '[action]') {
          action = last;
        }
      }
    } catch {
      // ignore
    }
  }

  if (action) {
    action = String(action).replace(/\.js$/, '').toLowerCase().trim();
  }

  const fn = handlers[action];
  if (!fn) {
    return res.status(404).json({ error: `Admin action '${action}' not found` });
  }

  return fn(req, res);
}
