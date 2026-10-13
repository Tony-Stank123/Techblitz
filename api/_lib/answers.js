// api/_lib/answers.js
// Authoritative Answer Key Validation & Normalization (Server-Side Only)
import fs from 'node:fs';
import path from 'node:path';

// Authoritative inlined answer key for resilient serverless execution on Vercel
const DEFAULT_ANSWERS_DATA = {
  answers: [
    {
      puzzle_id: 'cho-a',
      accepted_answers: [
        '9:43', '09:43', '9.43', '09.43', '943', '0943',
        '9:43 PM', '09:43 PM', '9:43PM', '09:43PM',
        '21:43', '2143', '9:43PM', '09:43'
      ],
      hint: 'A slow clock shows less than the real time. A fast clock shows more. Both clocks should give the same real time.'
    },
    {
      puzzle_id: 'cho-b',
      accepted_answers: [
        'WORKSHOP', 'WORKSHOP KEY', 'THE WORKSHOP KEY', 'WORK SHOP', 'WORK SHOP KEY',
        'THE WORK SHOP KEY', 'WORKSHOP ENVELOPE', 'THE WORKSHOP'
      ],
      hint: "Work out the envelope labelled WORKSHOP first. It can't hold what its label says, and the spa key is already taken."
    },
    {
      puzzle_id: 'rigsby-a',
      accepted_answers: [
        'RADIO ROOM', 'THE RADIO ROOM', 'RADIOROOM', 'RADIO-ROOM', 'RADIO ROOM AT THE TOP'
      ],
      hint: '777 means key 7 tapped three times, so the third letter on key 7.'
    },
    {
      puzzle_id: 'rigsby-b',
      accepted_answers: [
        'TILL TEN', 'TILLTEN', 'TILL 10', 'UNTIL TEN', 'UNTIL 10', 'TIL TEN', 'TIL 10', 'TILL-TEN'
      ],
      hint: '45 means row 4, column 5.'
    },
    {
      puzzle_id: 'van-pelt-a',
      accepted_answers: [
        'NONSTOP', 'NON STOP', 'NON-STOP', 'NON - STOP'
      ],
      hint: 'Each group is line–word–letter. 2-1-1 means line 2, word 1, letter 1.'
    },
    {
      puzzle_id: 'van-pelt-b',
      accepted_answers: [
        'ICE RINK', 'THE ICE RINK', 'RINK', 'THE RINK', 'ICERINK', 'ICE-RINK'
      ],
      hint: 'Write each reading as a sum of powers of two (1, 2, 4, 8, 16, 32, 64, 128). Each power is one zone.'
    },
    {
      puzzle_id: 'lisbon-a',
      accepted_answers: [
        '5', 'MINE=5', 'MINE = 5', 'MINE 5', 'MINE:5', 'FIVE'
      ],
      hint: 'strcmp returns 0 when the two strings are the same.'
    },
    {
      puzzle_id: 'lisbon-b',
      accepted_answers: [
        '4', 'GONE=4', 'GONE = 4', 'GONE 4', 'GONE:4', 'FOUR'
      ],
      hint: '943 / 100 is 9 in integer division, and 943 % 100 is 43.'
    }
  ],
  accusation: {
    correct: 'Dr. Sam Whitley'
  }
};

let answersData = null;

function getAnswers() {
  if (!answersData) {
    try {
      const answersPath = path.join(process.cwd(), 'puzzles', 'server-only', 'puzzles.answers.json');
      if (fs.existsSync(answersPath)) {
        answersData = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
      }
    } catch {
      // Ignore filesystem access failure on serverless lambda
    }
    if (!answersData || !answersData.answers?.length) {
      answersData = DEFAULT_ANSWERS_DATA;
    }
  }
  return answersData;
}

export function normalizeAnswer(ans) {
  if (ans == null) return '';
  return String(ans)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function checkAnswer(puzzleId, rawAnswer) {
  const data = getAnswers();
  const puzzle = data.answers.find(a => a.puzzle_id === puzzleId);
  if (!puzzle) return false;

  const raw = String(rawAnswer || '').trim().toUpperCase();
  if (!raw) return false;

  // Build candidate variations
  const candidates = new Set([
    raw,
    raw.replace(/\s+/g, ' '),
    raw.replace(/[-_.:]/g, ' ').replace(/\s+/g, ' ').trim(),
    raw.replace(/[^A-Z0-9]/g, '')
  ]);

  // Strip leading "THE " or trailing punctuation
  candidates.add(raw.replace(/^THE\s+/, '').trim());

  // Time format normalization for cho-a (e.g. 09:43 <-> 9:43)
  const timeMatch = raw.match(/^0?(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?$/i);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2];
    candidates.add(`${h}:${m}`);
    candidates.add(`${String(h).padStart(2, '0')}:${m}`);
    candidates.add(`${h}${m}`);
    candidates.add(`${String(h).padStart(2, '0')}${m}`);
    candidates.add(`${h}.${m}`);
    candidates.add(`${String(h).padStart(2, '0')}.${m}`);
    if (timeMatch[3]) {
      candidates.add(`${h}:${m} ${timeMatch[3].toUpperCase()}`);
      candidates.add(`${h}:${m}${timeMatch[3].toUpperCase()}`);
      candidates.add(`${String(h).padStart(2, '0')}:${m} ${timeMatch[3].toUpperCase()}`);
    }
  }

  // Compare against accepted answers
  for (const accepted of puzzle.accepted_answers) {
    const accNorm = accepted.trim().toUpperCase();
    const accStrip = accNorm.replace(/^THE\s+/, '').trim();
    const accAlpha = accNorm.replace(/[^A-Z0-9]/g, '');

    for (const c of candidates) {
      if (c === accNorm || c === accStrip || (accAlpha && c.replace(/[^A-Z0-9]/g, '') === accAlpha)) {
        return true;
      }
    }
  }

  return false;
}

export function getHint(puzzleId) {
  const data = getAnswers();
  const puzzle = data.answers.find(a => a.puzzle_id === puzzleId);
  return puzzle ? puzzle.hint : null;
}

export function checkAccusation(suspectId) {
  if (!suspectId) return false;
  const normalized = String(suspectId).trim().toLowerCase();
  return normalized === 'sam' || normalized === 'dr. sam whitley' || normalized === 'whitley';
}
