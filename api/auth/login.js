// api/auth/login.js
// Single Login Endpoint: Admin & Participant Verification
import { supabase, localStore, upsertParticipantSession } from '../_lib/db.js';
import { signToken } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { register_number } = req.body || {};
  const regNum = String(register_number || '').trim();

  if (!regNum) {
    return res.status(400).json({ error: 'Register number is required' });
  }

  // 1. Check for Default Admin: "Gowtham123"
  const isDefaultAdmin = regNum.toLowerCase() === 'gowtham123';
  let canonicalRegNum = isDefaultAdmin ? 'Gowtham123' : regNum;
  let role = isDefaultAdmin ? 'admin' : 'participant';

  if (supabase) {
    try {
      // Query database users roster case-insensitively
      const { data: user, error } = await supabase
        .from('users')
        .select('register_number, role')
        .ilike('register_number', canonicalRegNum)
        .maybeSingle();

      if (error || !user) {
        if (isDefaultAdmin) {
          await supabase
            .from('users')
            .upsert({ register_number: 'Gowtham123', role: 'admin' }, { onConflict: 'register_number' });
          role = 'admin';
        } else {
          // Check localStore as fallback
          const localLookup = [...localStore.users.values()].find(
            u => u.register_number.toLowerCase() === canonicalRegNum.toLowerCase()
          );
          if (localLookup) {
            canonicalRegNum = localLookup.register_number;
            role = localLookup.role;
          } else {
            return res.status(403).json({
              error: 'Register number not found in event roster. Contact administrator.'
            });
          }
        }
      } else {
        // Use exact casing from the database
        canonicalRegNum = user.register_number;
        role = user.role;
      }

      if (role === 'participant') {
        const { data: existingSession } = await supabase
          .from('participant_sessions')
          .select('is_blocked')
          .ilike('register_number', canonicalRegNum)
          .maybeSingle();

        if (!existingSession) {
          await supabase
            .from('participant_sessions')
            .upsert({
              register_number: canonicalRegNum,
              score: 0,
              hints_used: 0,
              penalty_seconds: 0,
              is_blocked: false,
              last_active_at: new Date().toISOString()
            }, { onConflict: 'register_number' });
        } else {
          await supabase
            .from('participant_sessions')
            .update({ last_active_at: new Date().toISOString() })
            .ilike('register_number', canonicalRegNum);
        }
      }
    } catch (dbErr) {
      console.warn('[LOGIN DB WARNING]', dbErr.message);
      const localLookup = [...localStore.users.values()].find(
        u => u.register_number.toLowerCase() === canonicalRegNum.toLowerCase()
      );
      if (!localLookup && !isDefaultAdmin) {
        return res.status(403).json({
          error: 'Register number not found in event roster. Contact administrator.'
        });
      }
      if (localLookup) {
        canonicalRegNum = localLookup.register_number;
        role = localLookup.role;
      }
    }
  } else {
    // Local fallback for local dev & testing
    const lookup = [...localStore.users.values()].find(
      u => u.register_number.toLowerCase() === canonicalRegNum.toLowerCase()
    );
    if (!lookup && !isDefaultAdmin) {
      return res.status(403).json({
        error: 'Register number not found in event roster. Contact administrator.'
      });
    }
    if (lookup) {
      canonicalRegNum = lookup.register_number;
      role = lookup.role;
    } else if (isDefaultAdmin) {
      localStore.users.set('gowtham123', { register_number: 'Gowtham123', role: 'admin' });
      role = 'admin';
    }
  }

  // Ensure session exists in local store
  if (role === 'participant') {
    upsertParticipantSession(canonicalRegNum, {
      last_active_at: new Date().toISOString()
    });
  }

  // Generate signed JWT session token
  const token = signToken({
    register_number: canonicalRegNum,
    role
  });

  return res.status(200).json({
    token,
    role,
    register_number: canonicalRegNum
  });
}
