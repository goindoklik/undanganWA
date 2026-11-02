# Undangan WA

Dashboard pengelolaan acara dan peserta. Proyek menggunakan GitHub, Cloudflare Pages, Supabase, dan Wablas.

## Arsitektur

- **Cloudflare Pages**: dashboard admin frontend.
- **Supabase**: database, Storage, Auth, dan Edge Functions.
- **Wablas**: gateway WhatsApp.
- **GitHub**: source code.

## Struktur

- `dashboard/`: dashboard admin.
- `supabase/functions/wablas-webhook/`: endpoint webhook Wablas.
- `supabase/migrations/`: skema database.

## Status bot saat ini

**Seluruh perintah dan alur bot WhatsApp lama telah dinonaktifkan di source code.** Webhook hanya memvalidasi secret dan menerima payload; webhook tidak memproses perintah, tidak mengirim balasan, dan tidak mengubah data acara maupun peserta.

Bot akan dibangun ulang dari nol setelah rancangan perintah baru disepakati.

Untuk mengaktifkan kondisi nonaktif ini di server, deploy ulang Edge Function `wablas-webhook` dari folder `supabase/functions/wablas-webhook` ke project Supabase yang digunakan.

## Data yang dipertahankan

Migration database, data acara, data registrasi/peserta, akun admin, dan file Storage tidak dihapus oleh perubahan ini.

## Dashboard Cloudflare Pages

- Root directory: `dashboard`
- Build command: `npm run build`
- Build output directory: `dist`

Environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Jangan pernah memasukkan service role key, token Wablas, atau webhook secret ke frontend atau repository.

## Keamanan

Webhook memerlukan secret query parameter yang disimpan sebagai Supabase Function Secret. Dashboard menggunakan publishable/anon key dan akses data dibatasi oleh RLS.
