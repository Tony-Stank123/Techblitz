// api/_lib/admin/remove-user.js
// Admin Handler: Remove Student from Registered User Database
import { supabase, localStore } from '../db.js';
import { requireAdmin } from '../auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { register_number } = req.body || {};
  const regNum = String(register_number || '').trim();

  if (!regNum) {
    return res.status(400).json({ error: 'Register number is required' });
  }

  if (regNum.toLowerCase() === 'gowtham123') {
    return res.status(400).json({ error: 'Cannot remove primary administrator account' });
  }

  if (supabase) {
    // 1. Remove participant records
    await supabase.from('submissions').delete().eq('register_number', regNum);
    await supabase.from('fullscreen_requests').delete().eq('register_number', regNum);
    await supabase.from('participant_sessions').delete().eq('register_number', regNum);
    
    // 2. Remove user from users table
    const { error: delError } = await supabase
      .from('users')
      .delete()
      .eq('register_number', regNum);

    if (delError) {
      return res.status(500).json({ error: 'Database delete failed: ' + delError.message });
    }
  } else {
    // Local store cleanup
    for (const [k, u] of localStore.users.entries()) {
      if (u.register_number.toLowerCase() === regNum.toLowerCase()) {
        localStore.users.delete(k);
      }
    }
    for (const [k, p] of localStore.participant_sessions.entries()) {
      if (p.register_number.toLowerCase() === regNum.toLowerCase()) {
        localStore.participant_sessions.delete(k);
      }
    }
    localStore.fullscreen_requests = localStore.fullscreen_requests.filter(
      r => r.register_number.toLowerCase() !== regNum.toLowerCase()
    );
    localStore.submissions = localStore.submissions.filter(
      s => s.register_number.toLowerCase() !== regNum.toLowerCase()
    );
  }

  return res.status(200).json({
    success: true,
    removed: regNum
  });
}
