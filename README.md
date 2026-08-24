# PDF Serbaguna v3 — Siap GitHub Pages

Web gratis untuk konversi, pengaturan, penyuntingan dasar, dan keamanan PDF langsung di browser.

## Untuk pengguna akhir

Setelah web dipasang di GitHub Pages, pengguna hanya membuka alamat web melalui Chrome, Edge, Safari, atau Firefox. Tidak perlu memasang Node.js atau aplikasi tambahan.

## Fitur

### Konversi
- Word DOC/DOCX → PDF
- Excel XLS/XLSX → PDF
- PowerPoint PPT/PPTX → PDF
- JPG/PNG → PDF
- PDF → Word DOCX
- PDF → JPG
- PDF → Excel XLSX (best-effort)

### Kelola PDF
- Gabung PDF
- Drag-and-drop urutan file
- Split per halaman
- Split berdasarkan rentang
- Split sejumlah halaman per file
- Atur ulang halaman dengan thumbnail
- Buang halaman tertentu
- Kompres PDF lossless

### Edit & Tambahkan
- Preview thumbnail halaman
- Ganti teks digital yang sudah ada (find & replace visual)
- Tambah teks
- Rotasi halaman
- Hapus halaman
- Watermark teks
- Nomor halaman
- Tanda tangan PNG/JPG

### Keamanan
- Beri password PDF AES-256
- Hapus password menggunakan password yang benar

## Deployment gratis

Baca **DEPLOY_GITHUB_PAGES.md**. Workflow GitHub Actions sudah tersedia di:

`.github/workflows/deploy.yml`

Workflow akan menginstal dependensi, menjalankan build Vite, lalu mempublikasikan folder `dist` ke GitHub Pages.

## Pengembangan lokal — opsional

Hanya diperlukan untuk developer:

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
```

## Privasi

Aplikasi dirancang memproses dokumen di browser dan tidak memiliki backend upload dokumen sendiri.

## Batasan

- PDF → Word/Excel adalah rekonstruksi; layout kompleks dapat berubah.
- PDF scan belum memiliki OCR pada versi ini.
- Kompresi bersifat lossless.
- Buka/Hapus Password tidak melakukan cracking atau brute force.
- Editor belum mengganti teks asli PDF seperti editor PDF desktop penuh.

## Ganti teks PDF

Menu **Edit & Ganti Teks PDF** dapat mencari teks digital di PDF lalu menggantinya secara visual pada posisi yang sama.

Batasan:
- Tidak berlaku untuk PDF scan/foto tanpa OCR.
- PDF dapat memecah satu kalimat menjadi beberapa objek teks; bila frasa panjang tidak ditemukan, coba cari bagian kata yang lebih pendek.
- Metode ini menutup tampilan teks lama dan menulis teks baru. Untuk penyuntingan struktur konten PDF tingkat lanjut seperti aplikasi desktop penuh, diperlukan engine PDF yang lebih kompleks.
