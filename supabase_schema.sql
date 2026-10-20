-- ============================================================================
-- Mission Control (versi Vercel) — skema Supabase
-- ============================================================================
-- Cara pakai: buka Supabase Dashboard → SQL Editor → tempel seluruh file
-- ini → Run. Sekali saja.
--
-- KEAMANAN: akses dari Vercel memakai service_role key yang melewati RLS.
-- Simpan service_role key sebagai Environment Variable rahasia
-- (SUPABASE_SERVICE_ROLE_KEY) di Vercel — JANGAN pernah commit ke Git.
-- RLS tetap di-enable sebagai pertahanan berlapis; tidak ada policy
-- publik karena frontend tidak pernah memanggil Supabase langsung
-- (semua lewat serverless functions dengan service_role key).
-- ============================================================================

-- 1. Ledger kerja agent (ganti data/tasks.jsonl)
create table if not exists mc_tasks (
  id         uuid        primary key default gen_random_uuid(),
  ts         timestamptz not null,
  task_id    text        not null,
  agent      text        not null check (agent in ('Anca','Mu','Cipu','Jaka','Tono','Dani')),
  subagent   text        not null default '',
  title      text        not null,
  status     text        not null check (status in ('started','progress','done','failed')),
  detail     text        not null default '',
  created_at timestamptz not null default now()
);
create index if not exists mc_tasks_task_ts_idx on mc_tasks (task_id, created_at asc);
create index if not exists mc_tasks_created_idx on mc_tasks (created_at desc);

-- 2. Antrean quick task (ganti data/queue.jsonl)
create table if not exists mc_queue (
  id         uuid        primary key default gen_random_uuid(),
  ts         timestamptz not null,
  prompt     text        not null,
  agent      text        not null check (agent in ('Anca','Mu','Cipu','Jaka','Tono','Dani')),
  status     text        not null default 'queued',
  created_at timestamptz not null default now()
);
create index if not exists mc_queue_ts_idx on mc_queue (ts desc);

-- 3. State kecil: dispatch global + pause per-agent
--    (ganti data/dispatch.json dan data/paused_agents.json)
create table if not exists mc_state (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

-- 4. Seed awal (idempoten — aman dijalankan ulang)
insert into mc_state (key, value) values
  ('dispatch',     '{"paused": false}'),
  ('paused_agents', '{}')
on conflict (key) do nothing;

-- 5. Row Level Security: enable tanpa policy publik.
--    Hanya service_role (env var di Vercel) yang bisa baca/tulis.
alter table mc_tasks  enable row level security;
alter table mc_queue  enable row level security;
alter table mc_state  enable row level security;
