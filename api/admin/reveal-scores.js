// api/admin/reveal-scores.js
// Admin Endpoint: Toggle / Trigger Public Score & Solution Reveal
import { supabase, localStore, persistStore } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { broadcastEvent } from '../_lib/realtime.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { revealed = true } = req.body || {};

  // 1. Authoritative local store update
  localStore.event_state.scores_revealed = Boolean(revealed);
  persistStore();

  // 2. Database persistence
  if (supabase) {
    try {
      await supabase
        .from('event_state')
        .update({
          scores_revealed: Boolean(revealed),
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);
    } catch (err) {
      console.warn('[REVEAL SCORES DB WARNING]', err.message);
    }
  }

  // 3. Broadcast to all participants in real time
  await broadcastEvent('event:sync', 'SCORES_REVEALED', {
    scores_revealed: Boolean(revealed)
  });

  return res.status(200).json({
    success: true,
    scores_revealed: Boolean(revealed)
  });
}
