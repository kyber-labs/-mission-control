# Mission Control — versi Vercel + Supabase

Dashboard web real-time untuk memantau AI agent (Anca, Mu, Cipu, Jaka, Tono, Dani):
Virtual Office 3D, Agent Overview, Task Queue, System Metrics, VPS Status,
Tugas Terjadwal, Token Status, Agent Fleet, Real-Time Log.

Ini hasil **porting** dari versi lokal (`mission-control/`). NOL dependensi npm
di mana pun — serverless functions dan `catat.js` hanya memakai `fetch`
bawaan Node 18+.

## Arsitektur

```
Browser ──poll /api/state (3 detik)──▶ Vercel Functions (api/*.js, tanpa deps)
                                            │  Supabase REST (PostgREST)
                                            ▼
                                   Supabase Postgres
                                   (mc_tasks, mc_queue, mc_state)
```

## Deploy — langkah eksak

### 1. Siapkan Supabase (sekali saja)

1. Buka [supabase.com](https://supabase.com) → buat project baru (gratis).
2. Di dashboard project: **SQL Editor** → **New query** → tempel seluruh isi
   `supabase_schema.sql` → **Run**. Harus sukses (membuat 3 tabel + seed).
3. Catat dua nilai ini (**jangan commit ke Git!**):
   - **Project URL**: Project Settings → Data API → `https://xyzcompany.supabase.co`
   - **service_role key**: Project Settings → API Keys → `service_role` (klik
     Reveal untuk menyalin). Ini kunci penuh — simpan sebagai env var saja.

### 2. Push ke GitHub

```bash
cd mission-control-vercel
git init
git add -A
git commit -m "Mission Control (Vercel + Supabase)"
# buat repo kosong di github.com, lalu:
git remote add origin https://github.com/<user>/<repo>.git
git branch -M main
git push -u origin main
```

### 3. Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New Project** → **Import**
   repo dari langkah 2.
2. Saat import, buka **Environment Variables**, tambahkan:
   - `SUPABASE_URL` = Project URL dari langkah 1
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key dari langkah 1
3. **Deploy**. Selesai → dapat **link publik** `https://<project>.vercel.app`.
   (Tidak perlu `vercel.json` — zero-config: `index.html` jadi homepage,
   `api/*.js` jadi serverless functions.)

### 4. Catat kerja agent (agar dashboard hidup)

Opsi A — via CLI (argumen sama seperti versi lokal):

```bash
export SUPABASE_URL="https://xyzcompany.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
node catat.js started Dani "slug-tugas" "Judul singkat"
node catat.js done    Dani "slug-tugas" "Judul singkat"
```

Opsi B — via dashboard: menu **Task Queue** (tambah antrean cepat).

Aturan main (sama seperti versi lokal): satu `task_id` stabil per tugas;
event `started`/`progress` terakhir tanpa `done`/`failed` = agent tampil
**working** (duduk di meja 3D). Dashboard polling tiap 3 detik.

## Perbedaan vs versi lokal

| Aspek | Versi lokal | Versi Vercel ini |
|---|---|---|
| Ledger | `data/*.jsonl` | Supabase (`mc_tasks`, `mc_queue`, `mc_state`) |
| API | `server.js` persistent | `api/*.js` serverless |
| System Metrics | CPU/memory/uptime dari `/proc` | Tidak tersedia di serverless → tampil "—" (jujur, bukan 0 palsu); latensi DB dicatat di JSON |
| VPS Status | 7 kartu mesin lokal | Kartu Tunnel = URL publik deployment (nyata & online); kartu lain "—"/empty-state |
| Tugas Terjadwal | baca `~/workspace/cron.d` | `[]` — cron ada di VM lokal, tidak ada di Vercel → empty-state jujur |
| Token Status | belum tersambung | sama — empty-state jujur |
| Watchdog/tunnel bore | ada | tidak perlu — Vercel sudah publik |
| `catat.js` | tulis ke file | tulis ke Supabase via REST |

## Satu sumber kebenaran (disarankan)

Versi Vercel ini adalah **satu-satunya dashboard** — Supabase adalah satu-satunya
ledger. Versi lokal (`mission-control/`, `node server.js`) tidak perlu dijalankan
lagi; simpan sebagai arsip/cadangan.

### Migrasi satu kali dari versi lokal

Punya data di `mission-control/data/` (tasks.jsonl, queue.jsonl, dispatch.json)?
Pindahkan ke Supabase sekali saja dengan `import-jsonl.js`:

```bash
export SUPABASE_URL="https://xyzcompany.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Lihat dulu apa yang akan dimigrasi (tidak menulis apa pun):
node import-jsonl.js ../mission-control/data --dry-run

# Jalankan migrasinya:
node import-jsonl.js ../mission-control/data
```

- `DATA_DIR` bisa juga diisi path lain: `node import-jsonl.js /path/ke/data`.
- Skrip **menolak** berjalan bila tabel Supabase sudah berisi data (aman dari
  duplikasi) — pakai `--force` hanya bila Bos yakin mau menambah (risiko ganda).
- Baris JSON rusak / agent di luar roster → migrasi dibatalkan dengan pesan
  jelas berbahasa Indonesia (tidak ada setengah jalan).
- Setelah migrasi sukses, catat kerja selanjutnya **hanya** via `catat.js`
  (versi Supabase) atau dashboard Vercel — jangan catat ke file lokal lagi.

## Keamanan

- `SUPABASE_SERVICE_ROLE_KEY` hanya sebagai env var di Vercel / shell lokal.
  Jangan pernah commit ke Git, jangan tampilkan di screenshot/log.
- RLS di-enable di semua tabel tanpa policy publik; frontend tidak pernah
  memanggil Supabase langsung — semua lewat serverless functions.

## Struktur file

```
index.html            dashboard (disalin verbatim dari versi lokal)
vendor/three.min.js   Three.js r128 lokal (nol CDN)
api/state.js          GET /api/state
api/queue.js          POST /api/queue
api/dispatch.js       POST /api/dispatch
api/agent_pause.js    POST /api/agent_pause
lib/shared.js         roster, helper WIB, derivasi status agent
lib/db.js             klien Supabase REST (tanpa deps)
supabase_schema.sql   skema + seed (jalankan sekali di SQL Editor)
catat.js              CLI pencatatan via Supabase REST
import-jsonl.js       migrasi satu kali: JSONL lokal → Supabase
.gitignore            node_modules, .env, .vercel
```
