// api/_lib/admin/overview.js
// Admin Handler: Full State Snapshot for Admin Dashboard
import { supabase, localStore } from '../db.js';
import { requireAdmin } from '../auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let eventState = { is_started: false, server_start_time: null, total_duration_ms: 4200000, scores_revealed: false };
  let leaderboard = [];
  let requests = [];
  let roster = [];

  if (supabase) {
    try {
      // 1. Event State
      const { data: eState } = await supabase
        .from('event_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (eState) eventState = eState;

      // 2. User Roster
      const { data: users } = await supabase
        .from('users')
        .select('register_number, role, created_at')
        .order('created_at', { ascending: false });
      if (users && users.length > 0) roster = users;

      // 3. Live Leaderboard
      const { data: board } = await supabase
        .from('participant_sessions')
        .select('register_number, score, hints_used, penalty_seconds, accusation_suspect, is_blocked, last_active_at')
        .order('score', { ascending: false })
        .order('penalty_seconds', { ascending: true })
        .order('last_active_at', { ascending: false });
      if (board) leaderboard = board;

      // 4. Pending Fullscreen Requests
      const { data: reqs } = await supabase
        .from('fullscreen_requests')
        .select('id, register_number, status, exited_at')
        .eq('status', 'pending')
        .order('exited_at', { ascending: false });
      if (reqs) requests = reqs;

      // 5. Cross-check verified submissions count
      const { data: correctSubs } = await supabase
        .from('submissions')
        .select('register_number')
        .eq('is_correct', true);

      if (correctSubs && correctSubs.length > 0) {
        const counts = {};
        for (const sub of correctSubs) {
          const k = sub.register_number.toLowerCase();
          counts[k] = (counts[k] || 0) + 1;
        }
        for (const b of leaderboard) {
          const k = b.register_number.toLowerCase();
          if (counts[k] && counts[k] > (b.score || 0)) {
            b.score = counts[k];
          }
        }
      }
    } catch (err) {
      console.warn('[Admin Overview Supabase Warning]', err.message);
    }
  }

  // Fallback / merge with localStore
  if (!supabase) {
    eventState = { ...localStore.event_state };
  } else if (!eventState.server_start_time && localStore.event_state.is_started) {
    eventState = localStore.event_state;
  }
  if (roster.length === 0) {
    roster = [...localStore.users.values()];
  }
  if (requests.length === 0) {
    requests = localStore.fullscreen_requests.filter(r => r.status === 'pending');
  }

  // Build merged leaderboard: ensure all registered participants appear
  const boardMap = new Map();
  for (const b of leaderboard) {
    boardMap.set(b.register_number.toLowerCase(), { ...b });
  }

  // Merge localStore participant sessions
  for (const [k, s] of localStore.participant_sessions.entries()) {
    const key = (s.register_number || k).toLowerCase();
    const existing = boardMap.get(key);
    if (!existing) {
      boardMap.set(key, { ...s });
    } else if ((s.score || 0) > (existing.score || 0)) {
      existing.score = s.score;
      existing.last_active_at = s.last_active_at || existing.last_active_at;
    }
  }

  // Cross-verify with verified submissions in localStore
  for (const sub of localStore.submissions) {
    if (sub.is_correct) {
      const key = sub.register_number.toLowerCase();
      const existing = boardMap.get(key);
      if (existing) {
        const count = localStore.submissions.filter(
          x => x.register_number.toLowerCase() === key && x.is_correct
        ).length;
        if (count > (existing.score || 0)) {
          existing.score = count;
        }
      }
    }
  }

  // Ensure every participant in the roster appears on the leaderboard
  for (const u of roster) {
    if (u.role === 'participant') {
      const key = u.register_number.toLowerCase();
      if (!boardMap.has(key)) {
        boardMap.set(key, {
          register_number: u.register_number,
          score: 0,
          hints_used: 0,
          penalty_seconds: 0,
          accusation_suspect: null,
          is_blocked: false,
          last_active_at: u.created_at || new Date().toISOString()
        });
      }
    }
  }

  leaderboard = [...boardMap.values()].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }
    if ((a.penalty_seconds || 0) !== (b.penalty_seconds || 0)) {
      return (a.penalty_seconds || 0) - (b.penalty_seconds || 0);
    }
    const timeA = new Date(a.last_active_at || 0).getTime();
    const timeB = new Date(b.last_active_at || 0).getTime();
    return timeB - timeA;
  });

  return res.status(200).json({
    event_state: eventState,
    leaderboard,
    requests,
    roster
  });
}
