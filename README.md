# PDF Serbaguna v4 — Siap GitHub Pages

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


## Visual PDF Editor v4

Menu **Edit PDF Visual** membuka dokumen dalam editor besar langsung di browser.

Fitur:
- Sidebar thumbnail halaman.
- Klik blok teks digital langsung pada halaman untuk mengubahnya.
- Kotak edit muncul tepat pada posisi teks.
- Hapus teks langsung dari kotak edit.
- Tambah teks dengan klik area halaman.
- Undo / Redo.
- Navigasi halaman.
- Zoom 60%–250%.
- Preview perubahan sebelum menyimpan.
- Simpan sebagai PDF baru.

Cara kerja:
PDF asli tetap menjadi latar. Ketika teks diubah, aplikasi menutup area teks lama dan menulis teks pengganti pada koordinat yang sama saat PDF disimpan.

Batasan versi 4:
- PDF scan/foto belum dapat diedit sebagai teks tanpa OCR.
- Font pengganti saat ini memakai Helvetica/Arial sehingga mungkin tidak persis sama dengan font sumber.
- Teks yang sangat terfragmentasi atau berotasi dapat memiliki area klik yang kurang presisi.
- Ini adalah visual overlay editor, bukan pengubahan struktur objek font PDF tingkat Acrobat Pro.
