// api/_lib/admin/reset.js
// Admin Handler: Complete Event Reset (Timer, Submissions, Scores, Accusations, Requests)
// PRESERVES: Registered users and admins roster
import { supabase, localStore, persistStore } from '../db.js';
import { requireAdmin } from '../auth.js';
import { broadcastEvent } from '../realtime.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const nowIso = new Date().toISOString();

  // 1. Authoritative localStore reset
  localStore.event_state.is_started = false;
  localStore.event_state.server_start_time = null;
  localStore.event_state.scores_revealed = false;
  localStore.submissions = [];
  localStore.fullscreen_requests = [];

  for (const [k, p] of localStore.participant_sessions.entries()) {
    localStore.participant_sessions.set(k, {
      register_number: p.register_number,
      score: 0,
      hints_used: 0,
      penalty_seconds: 0,
      accusation_suspect: null,
      is_blocked: false,
      last_active_at: nowIso
    });
  }

  persistStore();

  // 2. Database reset (if Supabase is connected)
  if (supabase) {
    try {
      // 1. Reset event_state across ALL rows
      await supabase
        .from('event_state')
        .update({
          is_started: false,
          server_start_time: null,
          scores_revealed: false,
          updated_at: nowIso
        })
        .not('is_started', 'is', null);

      // Upsert default row 1
      await supabase
        .from('event_state')
        .upsert({
          id: 1,
          is_started: false,
          server_start_time: null,
          total_duration_ms: 4200000,
          scores_revealed: false,
          updated_at: nowIso
        }, { onConflict: 'id' });

      // 2. Clear all recorded submissions
      await supabase
        .from('submissions')
        .delete()
        .not('puzzle_id', 'is', null);

      // 3. Clear all fullscreen violation requests
      await supabase
        .from('fullscreen_requests')
        .delete()
        .not('status', 'is', null);

      // 4. Reset all participant session metrics (scores, hints, penalty, accusations)
      await supabase
        .from('participant_sessions')
        .update({
          score: 0,
          hints_used: 0,
          penalty_seconds: 0,
          accusation_suspect: null,
          is_blocked: false,
          last_active_at: nowIso
        })
        .not('register_number', 'is', null);
    } catch (dbErr) {
      console.warn('[RESET DB WARNING]', dbErr.message);
    }
  }

  // 3. Broadcast reset event across all participant and admin terminals
  await broadcastEvent('event:sync', 'EVENT_RESET', {
    is_started: false,
    server_start_time: null,
    scores_revealed: false
  });
  await broadcastEvent('admin:live', 'EVENT_RESET', {
    reset_at: nowIso
  });

  return res.status(200).json({
    success: true,
    message: 'Event completely reset. Timer, submissions, accusations, and scores cleared. User roster preserved.'
  });
}
