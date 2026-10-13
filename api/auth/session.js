// api/auth/session.js
// Session Hydration & State Restoration Endpoint
import { supabase, localStore, getParticipantSession } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = requireUser(req);
  if (!authResult.ok) {
    return res.status(authResult.status).json({ valid: false, error: authResult.error });
  }

  const { user } = authResult;
  let isBlocked = false;
  let score = 0;
  let subs = {};
  let hints = {};
  let accusation = null;
  let eventState = { is_started: false, server_start_time: null, total_duration_ms: 4200000, scores_revealed: false };

  if (supabase) {
    try {
      // 1. Fetch Event State
      const { data: eState } = await supabase
        .from('event_state')
        .select('is_started, server_start_time, total_duration_ms, scores_revealed')
        .eq('id', 1)
        .maybeSingle();

      if (eState) {
        eventState = eState;
      }

      // 2. Fetch Participant Session & State (if participant)
      if (user.role === 'participant') {
        const { data: pSession } = await supabase
          .from('participant_sessions')
          .select('score, is_blocked, hints_used, penalty_seconds, accusation_suspect')
          .ilike('register_number', user.register_number)
          .maybeSingle();

        if (pSession) {
          isBlocked = Boolean(pSession.is_blocked);
          score = pSession.score || 0;
          if (pSession.accusation_suspect) {
            accusation = { suspect: pSession.accusation_suspect };
          }
        }

        // Fetch user's recorded submissions (receipts only, no answers)
        const { data: userSubs } = await supabase
          .from('submissions')
          .select('puzzle_id, recorded_at')
          .ilike('register_number', user.register_number);

        if (userSubs) {
          userSubs.forEach(s => {
            subs[s.puzzle_id] = { recorded_at: s.recorded_at };
          });
        }
      }
    } catch (err) {
      console.warn('[SESSION DB WARNING]', err.message);
    }
  }

  // Fallback to localStore
  if (!supabase) {
    eventState = { ...localStore.event_state };
  } else if (!eventState.server_start_time && localStore.event_state.is_started) {
    eventState = localStore.event_state;
  }
  if (user.role === 'participant') {
    const localSess = getParticipantSession(user.register_number);
    if (localSess) {
      if (localSess.score > score) score = localSess.score;
      if (localSess.is_blocked) isBlocked = true;
      if (!accusation && localSess.accusation_suspect) {
        accusation = { suspect: localSess.accusation_suspect };
      }
    }
    localStore.submissions
      .filter(s => s.register_number.toLowerCase() === user.register_number.toLowerCase())
      .forEach(s => {
        if (!subs[s.puzzle_id]) {
          subs[s.puzzle_id] = { recorded_at: s.recorded_at };
        }
      });
  }

  return res.status(200).json({
    valid: true,
    register_number: user.register_number,
    role: user.role,
    is_blocked: isBlocked,
    score,
    subs,
    hints,
    accusation,
    event_state: eventState
  });
}
