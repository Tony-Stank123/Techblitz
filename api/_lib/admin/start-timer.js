// api/_lib/admin/start-timer.js
// Admin Handler: Synchronized Timer Start Trigger
import { supabase, localStore } from '../db.js';
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

  const serverStartTime = new Date().toISOString();
  const totalDurationMs = 4200000; // 70 minutes

  if (supabase) {
    // Authoritatively persist timer start in PostgreSQL
    const { error } = await supabase
      .from('event_state')
      .update({
        is_started: true,
        server_start_time: serverStartTime,
        total_duration_ms: totalDurationMs,
        updated_at: serverStartTime
      })
      .eq('id', 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to record timer start in database' });
    }
  } else {
    localStore.event_state.is_started = true;
    localStore.event_state.server_start_time = serverStartTime;
  }

  // Broadcast timer start event to all connected participant browsers in real-time
  await broadcastEvent('event:sync', 'TIMER_STARTED', {
    server_start_time: serverStartTime,
    total_duration_ms: totalDurationMs
  });

  return res.status(200).json({
    status: 'started',
    is_started: true,
    server_start_time: serverStartTime,
    total_duration_ms: totalDurationMs
  });
}
