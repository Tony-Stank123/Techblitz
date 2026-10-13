// api/_lib/admin/start-timer.js
// Admin Handler: Synchronized Timer Start Trigger
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

  // Anchor serverStartTime so that Date.now() - serverStartTime == elapsedMs
  const serverStartTime = new Date(Date.now() - elapsedMs).toISOString();
  const totalDurationMs = 4200000; // 70 minutes

  localStore.event_state.is_started = true;
  localStore.event_state.server_start_time = serverStartTime;
  localStore.event_state.paused_elapsed_ms = null;
  persistStore();

  if (supabase) {
    try {
      await Promise.allSettled([
        supabase
          .from('event_state')
          .update({
            is_started: true,
            server_start_time: serverStartTime,
            total_duration_ms: totalDurationMs,
            updated_at: serverStartTime
          })
          .not('is_started', 'is', null),

        supabase
          .from('event_state')
          .upsert({
            id: 1,
            is_started: true,
            server_start_time: serverStartTime,
            total_duration_ms: totalDurationMs,
            updated_at: serverStartTime
          }, { onConflict: 'id' })
      ]);
    } catch (dbErr) {
      console.warn('[START TIMER DB WARNING]', dbErr.message);
    }
  }

  // Broadcast timer start event to all connected participant browsers in real-time
  await broadcastEvent('event:sync', 'TIMER_STARTED', {
    server_start_time: serverStartTime,
    total_duration_ms: totalDurationMs,
    is_started: true
  });

  return res.status(200).json({
    status: 'started',
    is_started: true,
    server_start_time: serverStartTime,
    total_duration_ms: totalDurationMs
  });
}
