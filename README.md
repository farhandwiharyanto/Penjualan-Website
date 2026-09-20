# SourceMarket — Marketplace Jual-Beli Source Code + Demo

Aplikasi web untuk berjualan source code, di mana setiap produk punya demo yang
bisa langsung dicoba (embed iframe) sebelum pembeli checkout dan bayar via Midtrans.

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** SQLite (file lokal, tidak perlu install server DB terpisah)
- **Template:** EJS
- **Auth:** session + bcrypt (register/login sendiri, role `buyer` / `admin`)
- **Pembayaran:** Midtrans Snap

## Fitur
- UI modern (Inter, komponen konsisten, responsif mobile), flash message untuk setiap aksi, stepper Keranjang → Pembayaran → Selesai
- Katalog produk (kategori, pencarian, urutkan harga/terbaru/nama), hero "cara kerja 3 langkah"
- Tombol **Beli Sekarang** (langsung ke pembayaran) dan Tambah ke Keranjang
- Halaman detail produk dengan **iframe demo** langsung
- Keranjang belanja (session-based)
- Checkout & pembayaran online via Midtrans Snap (kartu, QRIS, VA, dll — tergantung yang kamu aktifkan di dashboard Midtrans)
- Webhook notifikasi Midtrans untuk update status pesanan otomatis (pending/paid/expired/canceled)
- Riwayat pesanan pembeli
- **Delivery file otomatis**: admin upload zip source code per produk (disimpan privat di `storage/files/`), pembeli bisa download di "Pesanan Saya" setelah status `paid`. Produk yang sudah dibeli tidak bisa dimasukkan keranjang lagi.
- **Freemium (Gratis vs Premium)**: setiap produk bisa punya versi gratis (fitur terbatas, wajib login untuk download → kamu dapat email calon pembeli) dan versi premium (sekali bayar, update N bulan, lisensi komersial). Halaman produk menampilkan tabel perbandingan otomatis; dashboard menghitung konversi gratis → premium per produk.
- Panel admin: dashboard analitik (pendapatan harian, status pesanan, produk terlaris, daftar hal yang perlu perhatian), CRUD produk (+ upload thumbnail & file produk), daftar semua pesanan, tandai lunas manual (untuk transfer manual / testing tanpa webhook), jumlah download per order

## Cara Menjalankan (Development)

1. **Install dependency**
   ```bash
   npm install
   ```

2. **Siapkan file environment**
   ```bash
   cp .env.example .env
   ```
   Lalu isi `.env`:
   - `SESSION_SECRET` — bebas, string acak panjang
   - `MIDTRANS_SERVER_KEY` & `MIDTRANS_CLIENT_KEY` — ambil dari [dashboard.midtrans.com](https://dashboard.midtrans.com) (mode **Sandbox** dulu untuk testing, gratis, tanpa perlu akun bisnis aktif)
   - `APP_URL` — biarkan `http://localhost:3000` saat development

3. **Isi data contoh** (opsional tapi disarankan untuk melihat aplikasi berjalan)
   ```bash
   npm run seed
   ```
   Ini akan membuat:
   - Akun admin: `admin@example.com` / `admin123` (**wajib ganti password** setelah login pertama)
   - 3 produk contoh dengan `demo_url` dummy (ganti dengan URL demo produkmu sendiri)

4. **(Opsional) Data demo untuk melihat dashboard**
   ```bash
   npm run seed:demo            # buat 8 pembeli + ±50 pesanan acak 45 hari terakhir
   npm run seed:demo -- --clear # hapus lagi semua data demo
   ```
   Akun demo memakai email `*@demo.test` / password `demo123`.

5. **Jalankan server**
   ```bash
   npm start
   ```
   Buka `http://localhost:3000`

## Cara Menambah Source Code (Produk) untuk Dijual

Ada dua cara: lewat panel admin (disarankan) atau lewat seed script.

### A. Lewat panel admin

1. **Siapkan demo online.** Deploy aplikasi yang akan dijual ke hosting mana pun
   (Vercel, Netlify, Railway, VPS, dll). URL ini akan di-embed sebagai iframe di halaman produk.
   > Situs demo **tidak boleh** mengirim header `X-Frame-Options: DENY` / `SAMEORIGIN` atau
   > CSP `frame-ancestors` yang memblokir, kalau tidak iframe akan kosong.
   > Untuk demo berbasis Express, cukup jangan pakai `helmet()` default, atau set
   > `helmet({ frameguard: false })`.
2. **Zip source code-nya**, sertakan README cara instalasi. Format: zip / rar / 7z / tar.gz, maks 500 MB.
3. **Siapkan thumbnail** (screenshot aplikasi, rasio 16:10, mis. 800×500 px).
4. Login admin → **Admin → Produk → + Tambah Produk**, isi form, upload thumbnail & file zip, simpan.
5. Produk langsung tampil di katalog. Setelah pesanan berstatus **Lunas**, pembeli bisa
   download file dari halaman *Pesanan Saya*.

Kalau kategori yang dibutuhkan belum ada, gunakan kotak **Kategori baru** di bawah form produk.

Untuk **mengganti file** produk yang sudah ada: Produk → Edit → upload file baru (file lama otomatis dihapus).

### Versi Gratis vs Premium

Di form produk ada dua seksi:

| | Versi Premium | Versi Gratis |
|---|---|---|
| Wajib? | Ya, jika `Harga premium` > 0 | Opsional |
| Isi | Harga, hak update (bulan), fitur, file zip | Fitur, file zip |
| Siapa yang bisa download | Pembeli dengan pesanan **Lunas** | Siapa saja yang **login** |
| Tercatat di | `downloads.tier = 'premium'` | `downloads.tier = 'free'` |

Tips pembagian fitur: gratis = cukup untuk *dicoba & dipelajari*, premium = untuk *dipakai cari uang*
(fitur lengkap, dokumentasi, update, support, lisensi komersial). Tulis fitur satu per baris; fitur
yang ada di kedua kolom akan tampil ✓/✓ di tabel perbandingan, yang hanya di premium tampil ✗/✓.

Produk hanya-gratis: isi harga `0` dan hanya upload file gratis. Produk hanya-premium: kosongkan seksi gratis.

### Paket contoh siap pakai (untuk testing)

Tiga produk seed punya aplikasi contoh yang benar-benar jalan (HTML + JS, data localStorage) di folder
[`samples/`](samples/). Perintah berikut membuat zip **gratis** & **premium** untuk masing-masing, menaruhnya di
`storage/files/`, memasang demo premium di `/public/demos/<slug>/`, dan mengisi kolom file/demo produk:

```bash
npm run build:samples
```

Sumbernya satu file per produk (`samples/<slug>/index.html`). Bagian yang hanya untuk premium dibungkus
`<!--PREMIUM--> … <!--/PREMIUM-->`; placeholder `__LOCK_NAMA__` menjadi kotak "fitur Premium" di versi gratis.
Ini bisa jadi pola untuk produk kamu sendiri: satu sumber → dua paket.

### C. Menjual website yang sudah jalan (dengan data asli)

Yang dijual adalah **kodenya, bukan datanya**. Alat berikut mengemas folder project menjadi zip bersih:

```bash
npm run package -- ~/projects/toko-online --dry                      # lihat dulu apa yang dibuang & diperingatkan
npm run package -- ~/projects/toko-online --slug toko-online --tier premium
```

Yang dilakukan otomatis:
- **Dibuang**: `.env`, database (`*.sqlite`, `*.db`), `uploads/`, `storage/logs`, `node_modules/`, `vendor/`, `.git/`,
  `dist/`, log, file kunci (`*.pem`, `*.key`), `credentials.json`, dsb.
- **`.env.example`** dibuat dari `.env` dengan nilai rahasia dikosongkan (nilai non-rahasia seperti `DB_HOST` dipertahankan).
- **Memindai rahasia** di kode: key Midtrans/Stripe/AWS/Google, token, password hardcoded, URI DB berisi password,
  nomor telepon. Jika ketemu, zip **tidak dibuat** sampai dibersihkan (atau `--force` bila yakin hanya contoh).
- **Peringatan** untuk file `.sql`/`.csv`/`.xlsx` (pastikan isinya data contoh) dan file > 25 MB.
- `--slug` langsung memasang zip ke produk (`--tier free` untuk versi gratis); tanpa `--slug`, upload manual lewat admin.

Yang tetap harus kamu lakukan sendiri:
1. **Ganti data asli dengan data contoh** — buat seed/migration berisi data dummy, jangan sertakan dump produksi.
2. **Ganti identitas** yang hardcoded (nama toko, domain, logo, nomor WA) menjadi default generik.
3. **Deploy demo terpisah** (mis. `demo.domainmu.com`) memakai data contoh, lalu isi URL-nya sebagai demo produk.
   Jangan pakai website produksi sebagai demo.

### Thumbnail otomatis dari demo

```bash
npm run thumbs                                   # potret semua produk yang punya demo_url (1280×800)
npm run thumbs -- --only <slug> --url <slug>=<url>  # URL khusus, mis. file HTML halaman yang butuh login
```
Butuh Google Chrome/Chromium terpasang (atau set `CHROME_BIN`).

### B. Lewat seed script (banyak produk sekaligus)

Edit [`db/seed.js`](db/seed.js), tambahkan blok `upsertProduct({...})`, lalu jalankan `npm run seed`.
Seed aman dijalankan berulang (produk dengan slug yang sama dilewati). Untuk file produk lewat cara ini,
salin zip ke `storage/files/` dan isi kolom `file_path` (nama file di folder itu) serta `file_name`
(nama yang dilihat pembeli saat download).

### Di mana file disimpan?

| Jenis | Lokasi | Bisa diakses publik? |
|---|---|---|
| Thumbnail | `public/uploads/` | Ya (`/public/uploads/...`) |
| File source code | `storage/files/` | **Tidak** — hanya lewat `/download/:orderId/:productId` setelah lunas |
| Database | `db/market.sqlite` | Tidak |

## Menghubungkan Webhook Midtrans (untuk status pembayaran otomatis)

Saat development di `localhost`, Midtrans tidak bisa mengirim notifikasi ke komputermu.
Gunakan tool tunnel seperti `ngrok`:
```bash
ngrok http 3000
```
Lalu di dashboard Midtrans → **Settings → Configuration**, isi:
- **Payment Notification URL:** `https://<url-ngrok-kamu>/checkout/notification`

Setelah deploy ke server produksi (domain asli), ganti URL ini ke domain aslimu dan
set `MIDTRANS_IS_PRODUCTION=true` + gunakan Server/Client Key **Production** (bukan sandbox).

## Struktur Folder
```
sourcecode-market/
├── server.js              # entry point
├── db/
│   ├── schema.sql          # struktur tabel
│   ├── db.js                # koneksi SQLite
│   └── seed.js               # data contoh
├── routes/
│   ├── auth.js              # register/login/logout
│   ├── products.js          # katalog & detail produk (publik)
│   ├── cart.js               # keranjang (session)
│   ├── checkout.js           # buat transaksi Midtrans + webhook
│   └── admin.js              # CRUD produk & lihat pesanan (khusus admin)
├── views/                  # EJS templates
└── public/                 # CSS & file upload thumbnail
```

## Hal yang Perlu Kamu Sesuaikan Sebelum Produksi

1. **Pengiriman file source code setelah bayar** — saat ini kolom `file_path` di
   tabel `products` baru disiapkan strukturnya. Tambahkan logika di
   `routes/checkout.js` (setelah status jadi `paid`) untuk mengirim link
   download aman/terbatas waktu, misalnya via email atau halaman "Pesanan Saya"
   yang menampilkan tombol download hanya jika `status === 'paid'`.
2. **Demo yang tidak bisa di-iframe** — beberapa layanan hosting demo (mis. yang
   set header `X-Frame-Options: DENY`) tidak akan tampil di iframe. Pastikan
   server demo kamu mengizinkannya, atau sediakan link "Buka demo di tab baru"
   sebagai cadangan.
3. **Keamanan upload** — batasi tipe & ukuran file thumbnail di `routes/admin.js`
   (saat ini `multer` menerima semua jenis file).
4. **Validasi tambahan** — validasi input lebih ketat (harga tidak boleh 0, dsb),
   rate limiting untuk login, dan reCAPTCHA di form register bila perlu.
5. **Deploy** — cocok dijalankan di VPS (PM2 + Nginx reverse proxy) atau platform
   seperti Railway/Render. Jangan lupa gunakan HTTPS karena wajib untuk Midtrans
   production dan Snap.js.
