// api/accusation.js
// Final Accusation Submission Endpoint
import { supabase, localStore } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { checkAccusation } from './_lib/answers.js';
import { broadcastEvent } from './_lib/realtime.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { suspect_id } = req.body || {};
  const regNum = auth.user.register_number;

  if (!suspect_id) {
    return res.status(400).json({ error: 'suspect_id is required' });
  }

  const isKiller = checkAccusation(suspect_id);
  const nowIso = new Date().toISOString();

  // Accusations allowed at any time in untimed mode

  if (supabase) {
    const { data: session } = await supabase
      .from('participant_sessions')
      .select('score, hints_used, penalty_seconds')
      .eq('register_number', regNum)
      .single();

    if (session) {
      // Award +2 bonus points if the accused suspect is the actual killer
      const bonusScore = isKiller ? (session.score || 0) + 2 : (session.score || 0);

      await supabase
        .from('participant_sessions')
        .update({
          accusation_suspect: suspect_id,
          score: bonusScore,
          last_active_at: nowIso
        })
        .eq('register_number', regNum);

      // Broadcast accusation event to Admin view
      await broadcastEvent('admin:live', 'ACCUSATION_FILED', {
        register_number: regNum,
        suspect_id,
        is_killer: isKiller,
        score: bonusScore,
        recorded_at: nowIso
      });
    }
  } else {
    const session = localStore.participant_sessions.get(regNum);
    if (session) {
      const bonusScore = isKiller ? (session.score || 0) + 2 : (session.score || 0);
      session.accusation_suspect = suspect_id;
      session.score = bonusScore;
      session.last_active_at = nowIso;
    }
  }

  return res.status(200).json({
    status: 'recorded',
    recorded_at: nowIso
  });
}
