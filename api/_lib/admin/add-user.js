// api/_lib/admin/add-user.js
// Admin Handler: Add Participant or Admin to Roster
import { supabase, localStore, upsertParticipantSession, persistStore } from '../db.js';
import { requireAdmin } from '../auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { register_number, role = 'participant' } = req.body || {};
  const regNum = String(register_number || '').trim();

  if (!regNum) {
    return res.status(400).json({ error: 'Register number is required' });
  }
  if (!['admin', 'participant'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or participant' });
  }

  // 1. Dual write: Always store in localStore so user is immediately authorized
  const normKey = regNum.toLowerCase();
  localStore.users.set(normKey, {
    register_number: regNum,
    role,
    created_at: new Date().toISOString()
  });

  if (role === 'participant') {
    upsertParticipantSession(regNum, {
      score: 0,
      hints_used: 0,
      penalty_seconds: 0,
      is_blocked: false,
      last_active_at: new Date().toISOString()
    });
  }
  persistStore();

  // 2. Authoritative PostgreSQL persistence
  if (supabase) {
    try {
      const { error: insertError } = await supabase
        .from('users')
        .upsert({
          register_number: regNum,
          role,
          created_by: auth.user.register_number
        });

      if (insertError) {
        console.warn('[ADD USER DB WARNING]', insertError.message);
      }

      if (role === 'participant') {
        await supabase
          .from('participant_sessions')
          .upsert({
            register_number: regNum,
            score: 0,
            is_blocked: false
          });
      }
    } catch (err) {
      console.warn('[ADD USER DB ERROR]', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    user: { register_number: regNum, role }
  });
}
