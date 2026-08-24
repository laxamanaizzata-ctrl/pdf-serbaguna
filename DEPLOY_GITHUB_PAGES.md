# Cara Memasang PDF Serbaguna di GitHub Pages — Gratis

Versi ini sudah disiapkan agar **GitHub yang melakukan build secara otomatis**. Pengguna web tidak perlu memasang Node.js atau aplikasi apa pun.

## Yang dibutuhkan

- Akun GitHub gratis.
- Repository **public** agar GitHub Pages dapat digunakan pada GitHub Free.
- Seluruh isi folder proyek ini.

## Langkah 1 — Buat repository

1. Masuk ke GitHub.
2. Pilih **New repository**.
3. Nama yang disarankan: `pdf-serbaguna`.
4. Pilih **Public**.
5. Klik **Create repository**.

## Langkah 2 — Upload seluruh source

Upload seluruh isi folder ini ke root repository, termasuk folder tersembunyi:

- `.github/workflows/deploy.yml`
- `src/`
- `index.html`
- `package.json`
- `vite.config.js`
- file lainnya.

Jangan hanya mengunggah `index.html`, karena aplikasi memakai proses build Vite.

## Langkah 3 — Aktifkan GitHub Pages

1. Buka repository.
2. Masuk ke **Settings**.
3. Pilih **Pages**.
4. Pada bagian **Build and deployment**, ubah **Source** menjadi **GitHub Actions**.

## Langkah 4 — Jalankan deployment

Setelah file masuk ke branch `main`, workflow `Deploy PDF Serbaguna to GitHub Pages` akan berjalan otomatis.

Lihat statusnya melalui tab **Actions**. Setelah deployment sukses, alamat web biasanya berbentuk:

`https://USERNAME.github.io/pdf-serbaguna/`

Contoh jika username GitHub adalah `contohuser`:

`https://contohuser.github.io/pdf-serbaguna/`

## Setelah web aktif

Pengguna cukup membuka URL tersebut melalui browser di HP atau komputer. Tidak perlu:

- menginstal Node.js,
- menjalankan `npm install`,
- membuat akun aplikasi,
- memasang program PDF tambahan.

File dokumen diproses di browser pengguna sesuai fitur yang tersedia.

## Jika ada perubahan aplikasi

Upload/commit perubahan ke branch `main`. GitHub Actions akan membangun dan memasang ulang web secara otomatis.

## Catatan privasi

Source aplikasi tidak memiliki endpoint upload dokumen sendiri. Namun library JavaScript aplikasi tetap diunduh browser ketika halaman dimuat. Jangan menambahkan analytics, penyimpanan cloud, atau endpoint upload bila ingin mempertahankan desain privacy-first.

## Troubleshooting

### Halaman belum muncul

Buka **Actions** dan pastikan workflow deployment berwarna hijau.

### Pages belum aktif

Pastikan `Settings → Pages → Source` sudah diset ke **GitHub Actions**.

### URL repository berbeda

Konfigurasi Vite menggunakan `base: './'`, sehingga build menggunakan URL relatif dan dapat dipasang di path repository GitHub Pages yang berbeda.

### Build gagal saat npm install

Jalankan ulang workflow dari tab **Actions**. Jika paket upstream berubah, periksa `package.json` dan error pada langkah `Install dependencies`.
