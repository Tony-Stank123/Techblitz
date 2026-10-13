// api/_lib/admin/pause-timer.js
// Admin Handler: Synchronized Timer Pause/Stop Trigger
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

  let elapsedMs = 0;
  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    if (body && typeof body.elapsed_ms === 'number') {
      elapsedMs = Math.max(0, Math.floor(body.elapsed_ms));
    }
  } catch {
    // ignore parse error
  }

  const nowIso = new Date().toISOString();

  localStore.event_state.is_started = false;
  localStore.event_state.paused_elapsed_ms = elapsedMs;
  persistStore();

  if (supabase) {
    try {
      await Promise.allSettled([
        supabase
          .from('event_state')
          .update({
            is_started: false,
            updated_at: nowIso
          })
          .not('is_started', 'is', null),

        supabase
          .from('event_state')
          .upsert({
            id: 1,
            is_started: false,
            total_duration_ms: 4200000,
            updated_at: nowIso
          }, { onConflict: 'id' })
      ]);
    } catch (dbErr) {
      console.warn('[PAUSE DB WARNING]', dbErr.message);
    }
  }

  // Broadcast timer paused event to all connected participant terminals
  await broadcastEvent('event:sync', 'TIMER_PAUSED', {
    is_started: false,
    paused_elapsed_ms: elapsedMs
  });

  return res.status(200).json({
    status: 'paused',
    is_started: false,
    paused_elapsed_ms: elapsedMs
  });
}
