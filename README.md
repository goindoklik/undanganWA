# Undangan WA

Dashboard pengelolaan acara dan peserta. Proyek menggunakan GitHub, Cloudflare Pages, Supabase, dan Wablas.

## Arsitektur

- **Cloudflare Pages**: dashboard admin frontend.
- **Supabase**: database, Storage, dan Edge Functions.
- **Wablas**: gateway WhatsApp.
- **Google Drive**: penyimpanan otomatis gambar undangan di folder `PilotX/Undangan`.
- **GitHub**: source code.

## Perintah bot WhatsApp

Hanya nomor yang aktif di tabel `authorized_senders` yang dapat menggunakan perintah.

Kirim `Menu` untuk melihat:
1. Data Acara yang akan berlangsung
2. Buat Acara

### Buat acara

Kirim `2`, lalu kirim data dengan format:

`Nama Acara#Waktu Acara#Pukul#Tempat`

Contoh:

`Acara Offline PilotX#05 November 2026#15:00#RM Sederhana Majalengka`

Webhook akan:
- Membuat data di `invite_campaigns`.
- Mengambil template `Gambar/Undangan.png` dan mengisi tanggal, pukul, serta tempat acara di sisi server.
- Mengunggah gambar hasil ke Google Drive folder `PilotX/Undangan`.
- Menyimpan URL Drive ke `invite_campaigns.invitation_image_url`.
- Mengirim konfirmasi dan URL halaman acara melalui WhatsApp.

Gambar undangan tidak dikirim melalui WhatsApp dan pengguna tidak perlu membuka dashboard untuk menekan tombol simpan.

### Data acara mendatang

Kirim `1` untuk melihat acara aktif yang akan berlangsung. Bot menampilkan detail satu per satu dan meminta jawaban `Y` atau `N` untuk link halaman acara.

## Konfigurasi Supabase Edge Function

Function `wablas-webhook` menggunakan secrets:
- `WABLAS_WEBHOOK_SECRET`
- `WABLAS_TOKEN`
- `WABLAS_SECRET_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

URL webhook Wablas:

`https://rexjmedyqrdlyeepuiax.supabase.co/functions/v1/wablas-webhook?key=WEBHOOK_SECRET`

Ganti `WEBHOOK_SECRET` dengan nilai secret yang sama di Supabase. Jangan menaruh token, secret, atau service-role key di dashboard frontend atau repository.

## Dashboard Cloudflare Pages

- Root directory: `dashboard`
- Build command: `npm run build`
- Build output directory: `dist`

Environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Keamanan

Webhook memverifikasi secret sebelum memproses payload, mengabaikan pesan grup dan pesan dari nomor bot sendiri, memeriksa izin pengirim dari database, serta mencatat ID pesan Wablas untuk mencegah pemrosesan duplikat.
