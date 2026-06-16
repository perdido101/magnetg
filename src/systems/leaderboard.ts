// Global leaderboard via Supabase REST — FULLY OPTIONAL and decoupled.
// If env vars are missing or the network fails, every method degrades to a
// no-op / empty result. A backend failure NEVER blocks gameplay or the build.
//
// Configure by setting (in a .env file, see .env.example):
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
// Table schema (single table):
//   create table scores (
//     id bigint generated always as identity primary key,
//     name text not null,
//     score int not null,
//     wave int not null,
//     ts timestamptz default now()
//   );

export interface ScoreRow {
  name: string;
  score: number;
  wave: number;
  ts?: string;
}

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TABLE = 'scores';
const TIMEOUT_MS = 4000;

export const leaderboardEnabled = Boolean(URL && KEY);

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

/** Submit a score. Resolves false on any failure — never throws. */
export async function submitScore(row: ScoreRow): Promise<boolean> {
  if (!leaderboardEnabled) return false;
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY!,
        Authorization: `Bearer ${KEY!}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ name: row.name.slice(0, 16), score: row.score, wave: row.wave }),
      signal: t.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    t.cancel();
  }
}

/** Fetch the global top N. Resolves [] on any failure — never throws. */
export async function fetchTop(limit = 100): Promise<ScoreRow[]> {
  if (!leaderboardEnabled) return [];
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(
      `${URL}/rest/v1/${TABLE}?select=name,score,wave,ts&order=score.desc&limit=${limit}`,
      {
        headers: { apikey: KEY!, Authorization: `Bearer ${KEY!}` },
        signal: t.signal,
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as ScoreRow[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    t.cancel();
  }
}
