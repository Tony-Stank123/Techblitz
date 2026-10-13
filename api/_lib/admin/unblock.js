// api/_lib/admin/unblock.js
// Admin Handler: Accept Fullscreen Exit Request & Unblock Participant
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

  const { request_id, register_number } = req.body || {};
  const regNum = String(register_number || '').trim();

  if (!regNum) {
    return res.status(400).json({ error: 'register_number is required' });
  }

  const nowIso = new Date().toISOString();

  if (supabase) {
    // 1. Resolve fullscreen request record
    if (request_id) {
      await supabase
        .from('fullscreen_requests')
        .update({
          status: 'accepted',
          resolved_at: nowIso,
          resolved_by: auth.user.register_number
        })
        .eq('id', request_id);
    } else {
      await supabase
        .from('fullscreen_requests')
        .update({
          status: 'accepted',
          resolved_at: nowIso,
          resolved_by: auth.user.register_number
        })
        .eq('register_number', regNum)
        .eq('status', 'pending');
    }

    // 2. Unblock participant session
    await supabase
      .from('participant_sessions')
      .update({ is_blocked: false, last_active_at: nowIso })
      .eq('register_number', regNum);
  } else {
    const session = localStore.participant_sessions.get(regNum);
    if (session) {
      session.is_blocked = false;
      session.last_active_at = nowIso;
    }
    const r = localStore.fullscreen_requests.find(reqItem => reqItem.register_number === regNum && reqItem.status === 'pending');
    if (r) {
      r.status = 'accepted';
      r.resolved_at = nowIso;
      r.resolved_by = auth.user.register_number;
    }
  }

  // 3. Notify participant directly via their private realtime channel
  await broadcastEvent(`participant:${regNum}`, 'UNBLOCK_APPROVED', {
    register_number: regNum,
    unblocked_at: nowIso
  });

  return res.status(200).json({
    status: 'unblocked',
    unblocked: true,
    register_number: regNum
  });
}
