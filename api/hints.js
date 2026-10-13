// api/hints.js
// Authoritative Hint Request Endpoint (Enforces penalty & returns server-only hint text)
import { supabase, localStore } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { getHint } from './_lib/answers.js';
import { broadcastEvent } from './_lib/realtime.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { puzzle_id } = req.body || {};
  const regNum = auth.user.register_number;

  if (!puzzle_id) {
    return res.status(400).json({ error: 'puzzle_id is required' });
  }

  const hintText = getHint(puzzle_id);
  const nowIso = new Date().toISOString();

  // Enforce authoritative event clock: close hints when time expires
  const es = localStore.event_state;
  if (es?.is_started && es.server_start_time) {
    const elapsed = Date.now() - new Date(es.server_start_time).getTime();
    const maxDuration = (es.total_duration_ms || 4200000) + 15000;
    if (elapsed > maxDuration) {
      return res.status(403).json({ error: 'Investigation time limit has ended. Hints are closed.' });
    }
  }

  if (supabase) {
    const { data: session } = await supabase
      .from('participant_sessions')
      .select('score, hints_used, penalty_seconds')
      .eq('register_number', regNum)
      .single();

    if (session) {
      const newHints = (session.hints_used || 0) + 1;
      const newPenalty = (session.penalty_seconds || 0) + 60; // +60s penalty per hint rule

      await supabase
        .from('participant_sessions')
        .update({
          hints_used: newHints,
          penalty_seconds: newPenalty,
          last_active_at: nowIso
        })
        .eq('register_number', regNum);

      // Broadcast update to Admin leaderboard
      await broadcastEvent('admin:live', 'SCORE_UPDATED', {
        register_number: regNum,
        score: session.score || 0,
        hints_used: newHints,
        penalty_seconds: newPenalty,
        last_solved_puzzle: null,
        recorded_at: nowIso
      });
    }
  } else {
    const session = localStore.participant_sessions.get(regNum);
    if (session) {
      session.hints_used = (session.hints_used || 0) + 1;
      session.penalty_seconds = (session.penalty_seconds || 0) + 60;
      session.last_active_at = nowIso;
    }
  }

  return res.status(200).json({
    status: 'logged',
    hint: hintText,
    recorded_at: nowIso
  });
}
