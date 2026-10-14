// api/submissions.js
// Authoritative Answer Evaluation & Live Score Submission Endpoint
import { supabase, localStore, getParticipantSession, upsertParticipantSession, persistStore } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { checkAnswer } from './_lib/answers.js';
import { broadcastEvent } from './_lib/realtime.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { puzzle_id, submitted_answer } = req.body || {};
  const regNum = auth.user.register_number;

  if (!puzzle_id || submitted_answer == null) {
    return res.status(400).json({ error: 'puzzle_id and submitted_answer are required' });
  }

  const nowIso = new Date().toISOString();

  // Submissions allowed at any time in untimed mode

  // 1. Authoritative correctness evaluation server-side
  const isCorrect = checkAnswer(puzzle_id, submitted_answer);

  let updatedScore = 0;

  if (supabase) {
    try {
      // Check if participant is currently blocked (case-insensitive)
      const { data: session } = await supabase
        .from('participant_sessions')
        .select('is_blocked, score, hints_used, penalty_seconds')
        .ilike('register_number', regNum)
        .maybeSingle();

      if (session?.is_blocked) {
        return res.status(403).json({ error: 'fullscreen mode exited. Inform an admin to get unblocked.' });
      }

      // Record submission (unique per user + puzzle)
      const { error: subError } = await supabase
        .from('submissions')
        .insert({
          register_number: regNum,
          puzzle_id,
          raw_answer: String(submitted_answer),
          is_correct: isCorrect,
          recorded_at: nowIso
        });

      // If duplicate submission (already recorded), calculate and return
      if (subError && subError.code === '23505') {
        return res.status(200).json({ status: 'recorded', recorded_at: nowIso });
      }

      // Calculate authoritative live score directly from verified submissions
      const { count: correctCount } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .ilike('register_number', regNum)
        .eq('is_correct', true);

      const baseScore = session?.score || 0;
      let calculatedScore = isCorrect ? baseScore + 1 : baseScore;
      if (!subError && typeof correctCount === 'number' && correctCount > 0) {
        calculatedScore = Math.max(calculatedScore, correctCount);
      }
      updatedScore = calculatedScore;

      // Update participant session score
      await supabase
        .from('participant_sessions')
        .upsert({
          register_number: regNum,
          score: updatedScore,
          last_active_at: nowIso
        }, { onConflict: 'register_number' });

      // Keep localStore in sync
      upsertParticipantSession(regNum, {
        score: updatedScore,
        last_active_at: nowIso
      });

      // Broadcast updated score to Admin leaderboard
      await broadcastEvent('admin:live', 'SCORE_UPDATED', {
        register_number: regNum,
        score: updatedScore,
        hints_used: session?.hints_used || 0,
        penalty_seconds: session?.penalty_seconds || 0,
        last_solved_puzzle: puzzle_id,
        recorded_at: nowIso
      });
    } catch (dbErr) {
      console.warn('[SUBMISSION DB FALLBACK]', dbErr.message);
      // Fallback to localStore below if database encounters schema cache issues
    }
  }

  // Local store execution (or fallback if Supabase errored)
  const localSess = getParticipantSession(regNum);
  if (localSess?.is_blocked) {
    return res.status(403).json({ error: 'fullscreen mode exited. Inform an admin to get unblocked.' });
  }

  const existingSub = localStore.submissions.find(
    s => s.register_number.toLowerCase() === regNum.toLowerCase() && s.puzzle_id === puzzle_id
  );

  if (!existingSub) {
    localStore.submissions.push({
      register_number: regNum,
      puzzle_id,
      raw_answer: String(submitted_answer),
      is_correct: isCorrect,
      recorded_at: nowIso
    });
  }

  const localCorrect = localStore.submissions.filter(
    s => s.register_number.toLowerCase() === regNum.toLowerCase() && s.is_correct
  ).length;

  upsertParticipantSession(regNum, {
    score: localCorrect,
    last_active_at: nowIso
  });
  persistStore();

  // Strict Rule: UI never reveals correctness during the event
  return res.status(200).json({
    status: 'recorded',
    recorded_at: nowIso
  });
}
