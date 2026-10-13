// api/_lib/db.js
// Authoritative Supabase Database Client & Resilient Store
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[DB WARNING] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Check .env configuration.');
}

export const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

// File-backed persistence file for local dev & serverless containers
const storePath = path.join(os.tmpdir(), 'techblitz_store_v3.json');

function readPersistentStore() {
  try {
    if (fs.existsSync(storePath)) {
      const content = fs.readFileSync(storePath, 'utf8');
      const data = JSON.parse(content);
      return data;
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

const savedData = readPersistentStore();

export const localStore = {
  users: new Map(savedData?.users || [
    ['gowtham123', { register_number: 'Gowtham123', role: 'admin', created_at: new Date().toISOString() }],
    ['21bce1001', { register_number: '21BCE1001', role: 'participant', created_at: new Date().toISOString() }]
  ]),
  event_state: savedData?.event_state || {
    id: 1,
    is_started: false,
    server_start_time: null,
    total_duration_ms: 4200000
  },
  participant_sessions: new Map(savedData?.participant_sessions || [
    ['21bce1001', {
      register_number: '21BCE1001',
      score: 0,
      hints_used: 0,
      penalty_seconds: 0,
      accusation_suspect: null,
      is_blocked: false,
      last_active_at: new Date().toISOString()
    }]
  ]),
  submissions: savedData?.submissions || [],
  fullscreen_requests: savedData?.fullscreen_requests || []
};

export function persistStore() {
  try {
    const data = {
      users: [...localStore.users.entries()],
      event_state: localStore.event_state,
      participant_sessions: [...localStore.participant_sessions.entries()],
      submissions: localStore.submissions,
      fullscreen_requests: localStore.fullscreen_requests
    };
    fs.writeFileSync(storePath, JSON.stringify(data), 'utf8');
  } catch {
    // Ignore write errors in restricted environments
  }
}

export function getParticipantSession(regNum) {
  const norm = String(regNum || '').trim().toLowerCase();
  for (const [k, s] of localStore.participant_sessions.entries()) {
    if (k.toLowerCase() === norm || s.register_number.toLowerCase() === norm) {
      return s;
    }
  }
  return null;
}

export function upsertParticipantSession(regNum, partial = {}) {
  const norm = String(regNum || '').trim().toLowerCase();
  let session = getParticipantSession(norm);
  if (!session) {
    session = {
      register_number: regNum,
      score: 0,
      hints_used: 0,
      penalty_seconds: 0,
      accusation_suspect: null,
      is_blocked: false,
      last_active_at: new Date().toISOString()
    };
    localStore.participant_sessions.set(norm, session);
  }
  Object.assign(session, partial);
  persistStore();
  return session;
}
