// DEBT-097 / DEBT-135: measured page-view load on preview.oruwa.jp, signed in
// as the 4C Owners. Reads only (GET pages); never run against production.
//
// Setup (outside the repo, e.g. a scratch dir):
//   npm i @supabase/supabase-js@2.49.4 @supabase/ssr@0.6.1
// Usage:
//   node manager-page-views.mjs <minutes> <intervalMs> <qa-accounts.local.md> <out.json> <chunks>
// <chunks>: comma-separated client chunk paths of an authenticated page that
// contain the Supabase URL and publishable key (find them once in the browser:
// performance.getEntriesByType('resource') on /manager). Pass them WITHOUT a
// leading "/" -- Git Bash rewrites leading-slash arguments into Windows paths.
// Then read Vercel Observability (Preview, Functions) and Supabase
// Observability -> API Gateway for the same window and divide by the 200 count.
// Optional env: LOAD_PAGES (comma-separated paths, default the /manager set)
// and LOAD_ACCOUNTS (local-part regex of the accounts, default "owner[1-9]"),
// e.g. LOAD_PAGES=/staff LOAD_ACCOUNTS="staff[a-i]|o1staff1" for the Staff page.
import { readFileSync, writeFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';

const [minutes = '60', intervalMs = '2400', accountsPath, outPath = 'result.json', chunkArg = ''] = process.argv.slice(2);
const BASE = 'https://preview.oruwa.jp';
const PAGES = process.env.LOAD_PAGES ? process.env.LOAD_PAGES.split(',') : ['/manager', '/manager?weekOffset=1', '/manager?weekOffset=-1'];
const ACCOUNTS = process.env.LOAD_ACCOUNTS ?? 'owner[1-9]';

async function discoverSupabase() {
  const chunks = chunkArg.split(',').filter(Boolean);
  let url = null, key = null;
  for (const c of chunks) {
    const js = await (await fetch(`${BASE}/${c.replace(/^\//, '')}`)).text();
    url ??= js.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? null;
    key ??= js.match(/sb_publishable_[A-Za-z0-9_-]{10,}/)?.[0] ?? null;
    if (url && key) break;
  }
  if (!url || !key) throw new Error('supabase url/key not found in the given chunks');
  return { url, key };
}

function owners() {
  const md = readFileSync(accountsPath, 'utf8');
  const rows = [...md.matchAll(new RegExp(String.raw`\|\s*(oruwa\.jp\+(?:${ACCOUNTS})@gmail\.com)\s*\|\s*(\S+)\s*\|`, 'g'))];
  return rows.map((m) => ({ email: m[1], password: m[2] }));
}

async function signIn(sb, o) {
  const jar = new Map();
  const client = createServerClient(sb.url, sb.key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: o.email, password: o.password });
  if (error) throw new Error(`sign-in failed for an account (${error.message})`);
  return { jar, at: Date.now() };
}

const cookieHeader = (jar) => [...jar].map(([n, v]) => `${n}=${v}`).join('; ');

const sb = await discoverSupabase();
const sessions = [];
for (const o of owners()) sessions.push({ o, s: await signIn(sb, o) });
if (sessions.length === 0) throw new Error('no account rows found');

const stats = { started: new Date().toISOString(), requests: 0, byStatus: {}, byPage: {}, latencyMsSum: 0, bytes: 0, relogins: 0, errors: 0 };
const end = Date.now() + Number(minutes) * 60_000;
let i = 0;
while (Date.now() < end) {
  const sess = sessions[i % sessions.length];
  const page = PAGES[Math.floor(i / sessions.length) % PAGES.length];
  i += 1;
  try {
    if (Date.now() - sess.s.at > 40 * 60_000) { sess.s = await signIn(sb, sess.o); stats.relogins += 1; }
    const t0 = Date.now();
    const res = await fetch(BASE + page, { headers: { cookie: cookieHeader(sess.s.jar) }, redirect: 'manual' });
    const body = await res.arrayBuffer();
    stats.latencyMsSum += Date.now() - t0;
    stats.bytes += body.byteLength;
    stats.requests += 1;
    const k = res.status >= 300 && res.status < 400 ? `${res.status}->${res.headers.get('location')}` : String(res.status);
    stats.byStatus[k] = (stats.byStatus[k] ?? 0) + 1;
    stats.byPage[page] = (stats.byPage[page] ?? 0) + 1;
  } catch {
    stats.errors += 1;
  }
  if (stats.requests % 100 === 0) writeFileSync(outPath, JSON.stringify({ ...stats, now: new Date().toISOString() }, null, 2));
  await new Promise((r) => setTimeout(r, Number(intervalMs)));
}
stats.finished = new Date().toISOString();
stats.avgLatencyMs = Math.round(stats.latencyMsSum / Math.max(1, stats.requests));
writeFileSync(outPath, JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats));
