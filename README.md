# Diamond Cycle Count RMPM

> **Sistem Cycle Count & Rekonsiliasi Akurasi Stok RMPM (Raw Material & Packaging Material)**
> Paperless di lapangan &bull; Real-time Cloud Sync &bull; Siap Cetak Berita Acara Resmi (A4 Landscape) untuk Tanda Tangan Accounting & Warehouse.

---

## 🌟 Fitur Utama

1. **Paperless di Lapangan (Checker Mode):**
   - Tampilan khusus layar sentuh / mobile untuk petugas penghitung fisik di rak.
   - Filter per zona rak (`B.01A`, `B.01B`, `B.02A`, dll.) dan pemindaian cepat.
   - Tombol **1-Klik Cocok** jika jumlah fisik sesuai dengan target SAP.
   - **Kalkulator Kemasan Fisik:** Konversi otomatis dari jumlah Sak/Box/Drum + sisa ke satuan dasar `KG`.
   - **Pencatatan Pindah Lokasi:** Mendeteksi dan mencatat barang yang salah letak atau pindah rak (*misplaced item*).

2. **Dashboard & Rekonsiliasi Real-time (Admin / SPV Mode):**
   - Metrik KPI lengkap: Total Item, Progres Hitung, Akurasi Stok (**IRA %**), Jumlah Discrepancy, dan Net Selisih (KG).
   - Tabel rekonsiliasi interaktif dengan filter status (*Discrepancy, Cocok, Pindah Lokasi, Pending*).
   - Import data jadwal dari SAP (cukup *copy-paste* tabel dari Excel / SAP ALV Grid).
   - Export laporan rekonsiliasi ke Excel / CSV.

3. **Multi-Role & Akses Akun:**
   - **SPV / Administrator:** Pemantauan menyeluruh, import jadwal, approval selisih.
   - **Field Checker:** Eksekusi penghitungan fisik lapangan.
   - **Accounting & Audit:** Verifikasi kepatuhan, audit trail, dan otorisasi Berita Acara.

4. **Cetak Berita Acara Resmi (Sign-Off Audit):**
   - Format standar cetak **A4 Landscape** rapi dan ringkas.
   - Matriks 4 tanda tangan resmi: **Checker**, **SPV Warehouse RMPM**, **Inventory Control**, dan **Accounting / Finance**.

5. **Cloud Stack (GitHub + Vercel + Supabase):**
   - **Database & Realtime:** Supabase PostgreSQL dengan sinkronisasi instan antar-perangkat.
   - **Hosting:** Vercel Static Hosting (Deploy otomatis via push ke GitHub).

---

## 🚀 Panduan Setup & Deployment

### 1. Menjalankan di Komputer Lokal
```bash
# Jalankan server lokal (tanpa perlu install library tambahan)
npm start
# atau
node server.js
```
Buka browser di: `http://localhost:3000`

---

### 2. Setup Database Supabase
1. Buka [Supabase Dashboard](https://supabase.com/dashboard).
2. Masuk ke **SQL Editor**.
3. Buka file `supabase/schema.sql` di repository ini, salin seluruh isinya, dan klik **Run**.
4. Buka **Project Settings** &rarr; **API**:
   - Salin **Project URL** (contoh: `https://xxxxxxxx.supabase.co`).
5. Di aplikasi web:
   - Klik tombol **"⚡ Supabase: Setup URL"** di header pojok kanan atas.
   - Masukkan Project URL tersebut dan simpan. Aplikasi langsung terhubung dan tersinkronisasi secara real-time!

---

### 3. Deploy ke Vercel
Project ini telah terhubung dengan Vercel Project ID: `prj_5p3lAWhncw0K2Bf7KeZUbUWj9vL9`.
Setiap kali perubahan di-push ke branch `main` di GitHub:
```bash
git add .
git commit -m "Update cycle count features"
git push origin main
```
Vercel akan otomatis melakukan build dan deploy versi terbaru.
