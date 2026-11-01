# Bot WhatsApp Undangan

Aplikasi undangan dan registrasi tamu menggunakan Wablas, Supabase Edge Functions, Supabase Database/Storage, GitHub, dan Cloudflare Pages.

## Arsitektur

- **Wablas**: WhatsApp gateway untuk menerima pesan dan mengirim undangan/balasan.
- **Supabase Edge Functions**: webhook inbound dan proses bot.
- **Supabase Postgres**: kampanye, undangan, percakapan, registrasi, dan event webhook.
- **Supabase Storage**: file JPG undangan dan tiket.
- **Cloudflare Pages**: dashboard admin frontend saja. Tidak ada Cloudflare Workers.
- **GitHub**: source code dan version control.

## Struktur

- `supabase/migrations/`: skema database dan RLS.
- `supabase/functions/wablas-webhook/`: webhook pesan masuk Wablas.
- `dashboard/`: dashboard admin Vite.

## Database

Jalankan migration `supabase/migrations/20261101000000_initial_schema.sql` pada project Supabase baru.

Setelah membuat akun admin melalui Supabase Auth, daftarkan UUID admin melalui SQL Editor:

```sql
insert into public.admin_users (user_id, display_name)
values ('UUID_USER_AUTH', 'Administrator');
```

Jangan memberikan hak admin melalui user_metadata. Daftar admin disimpan di tabel private-by-policy `admin_users`.

Bucket Storage `undangan-assets` dibuat oleh migration dan disetel public agar Wablas dapat mengambil file undangan/tiket dari URL.

## Edge Function webhook

Deploy function `wablas-webhook` ke project Supabase. Function menerima POST dari Wablas dan menggunakan format payload inbound yang didokumentasikan Wablas.

Set secrets di Supabase Edge Functions:

- `WABLAS_TOKEN`: token device Wablas.
- `WABLAS_SECRET_KEY`: secret key device Wablas.
- `WABLAS_WEBHOOK_SECRET`: nilai acak panjang untuk mengamankan URL webhook.

Webhook URL untuk Wablas:

```
https://rexjmedyqrdlyeepuiax.supabase.co/functions/v1/wablas-webhook?key=ISI_DENGAN_WABLAS_WEBHOOK_SECRET
```

Pada pengaturan device Wablas:
1. Aktifkan **Get Incoming Message**.
2. Aktifkan **Get Auto Reply From Webhook** jika menggunakan mode auto-reply Wablas.
3. Isi **Webhook URL for Inbound Message** dengan URL di atas.

Saat tamu mengirim `DAFTAR`, bot meminta Nama, No WA, Alamat, dan Pengundang. Data yang lengkap disimpan ke `registrations`, dengan kuota tiket tetap 2 orang.

## Dashboard Cloudflare Pages

Buat Pages project dari repository ini:
- Root directory: `dashboard`
- Build command: `npm run build`
- Build output directory: `dist`

Environment variables Cloudflare Pages:
- `VITE_SUPABASE_URL`: URL project Supabase.
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable key (atau anon key legacy).

Jangan pernah memasukkan service role key atau Wablas credentials ke Cloudflare Pages.

## Status implementasi awal

- Skema database dan RLS awal: tersedia.
- Webhook inbound: tersedia untuk alur teks DAFTAR dan formulir.
- Dashboard: login admin, statistik dasar, daftar registrasi, pencarian, export CSV.
- Pengiriman undangan massal, pengelolaan kampanye dari dashboard, dan generator JPG tiket final masih perlu dilengkapi sebelum operasional.
- Webhook dan dashboard belum dapat diuji end-to-end sampai akses project Supabase dan kredensial Wablas dikonfigurasi.

## Batas keamanan

- Jangan commit token Wablas, service role key, password, atau webhook secret ke GitHub.
- Webhook memerlukan secret query parameter yang disimpan sebagai Supabase Function Secret.
- Admin frontend hanya menggunakan publishable/anon key dan akses dibatasi RLS.
