# TASK LIST & ENGINEERING ROADMAP
## Diamond RMPM Cycle Count System (Paperless WMS Edition)

---

### RINGKASAN PROGRESS PROYEK
* **Status Keseluruhan:** v2.4 Enterprise Production Ready
* **Fokus Utama:** Transisi Paperless, Ergonomi Lapangan, Skema Supabase Aman, Arsitektur OOP Tanpa Hardcode, dan UI Enterprise Modern (Font Awesome + SweetAlert2 + DataTables + ApexCharts).
* **Repository Git:** [KANAN-lab/Diamond_Cycle_Count_RMPM](https://github.com/KANAN-lab/Diamond_Cycle_Count_RMPM.git)

---

### FASE 1: INSEPSI & ANALISIS KEBUTUHAN PAPERLESS (COMPLETED)
- [x] **Analisis Data Lembar Kertas Asli (20 Baris):**
  - Mengidentifikasi 20 item SKU/Batch di Rak BIN Zona B (B.01A, B.01B, B.02A, B.02B).
  - Memetakan 4 kasus kritis dari dokumen fisik:
    - Normal Match (Item 1-9, 11-16, 19).
    - Temuan Selisih Kurang/Minus (Item 10 Gellan Gum: hanya 12 box / 210 KG; Item 20 Malic Acid: hanya 150 KG).
    - Temuan Salah Lokasi/Rak BIN (Item 17 DF Palm Oil ditemukan di BIN B.01A.5.01).
    - Temuan Selisih Lebih/Kelebihan Fisik (Item 18 Gellan Gum: fisik 600 KG vs target net 150 KG karena transfer posting belum dieksekusi).
- [x] **Rumus Bisnis Target Bersih SAP vs Picking:**
  - Implementasi formula: $\text{Target Bersih} = \text{Qty SAP} - \text{Qty Reservasi Picking}$.
  - Menghilangkan persepsi selisih palsu akibat barang yang sedang diambil tim produksi.
- [x] **Dokumentasi Berita Acara Rekonsiliasi Format Cetak A4:**
  - Standarisasi dokumen legal fisik untuk audit akuntansi biaya (*Cost & Inventory Accounting*).

---

### FASE 2: CLOUD STACK & SAFE DATABASE MIGRATION (COMPLETED)
- [x] **Setup Supabase PostgreSQL & Schema Migration v2.5 Enterprise:**
  - File: `supabase/schema.sql`
  - Tabel `cc_items`, `cc_schedules`, `cc_settings`, `cc_audit_logs`, dan SQL View `v_cc_reconciliation`.
  - **Prinsip Keamanan Idempoten:** Menjamin tidak ada perintah destruktif (`DROP`/`TRUNCATE`) yang menghapus atau menimpa data hitung aktif di database live.
  - Penambahan kolom aman menggunakan blok `DO $$ BEGIN ... EXCEPTION ... END $$;`.
  - Aktivasi Realtime Publication (`supabase_realtime`) untuk sinkronisasi dua arah.
  - Indeks performa tinggi pada kolom `bin`, `material_number`, dan `batch_sap`.
- [x] **Koneksi Live Database Supabase Cloud:**
  - Terkoneksi langsung ke project user: `zaxrouzuwryymdolhlix.supabase.co`
  - Inisialisasi otomatis via token anon JWT publik + fallback publishable key.
  - Indikator status navbar real-time: `[ • Supabase Cloud ]` warna hijau (#10b981) dengan dialog modal detail koneksi SweetAlert2.
  - Sinkronisasi pengaturan admin (`cc_settings`) dan audit log (`cc_audit_logs`).
  - Verifikasi REST API: HTTP 200 OK dengan 3 record aktif tersambung.
- [x] **Penyelesaian Console Error & Web Health:**
  - Mengatasi `ReferenceError: STORAGE_KEYS is not defined` di `js/app.js`.
  - Mengatasi `404 /favicon.ico` dengan inline SVG favicon dan server route handler 204.
- [x] **Integrasi Cloud Deployment:**
  - Konfigurasi Vercel auto-deploy (`vercel.json`) terhubung ke GitHub remote.
  - Setup konfigurasi di `js/config.js`.

---

### FASE 3: MOBILE-FIRST CHECKER ERGONOMICS (COMPLETED)
- [x] **Navigasi Lorong Rak Sekuensial (BIN Steppers):**
  - Tombol sentuh jempol satu tangan (`◀ Rak Sblm` / `Rak Lanjut ▶`).
- [x] **Mode Fokus (Guided Walkthrough Zebra Style):**
  - Menampilkan 1 SKU per kartu dengan angka kontras tinggi.
  - Tombol 1-tap konfirmasi cocok instan (`Sesuai Target`).
- [x] **Kalkulator Satuan Kemasan Industri:**
  - Konversi cepat: Sak 25 KG, Sak 20 KG, Box 17.5 KG, Box 12 KG, Drum 200 KG.
  - Stepper (+ / -) dan input pecahan kilogram sisa.
- [x] **Pelaporan Khusus Barang Pindah BIN (Salah Lokasi):**
  - Checkbox temuan barang salah rak beserta input alamat BIN temuan aktual.

---

### FASE 4: UI/UX SUPABASE STUDIO CLONE & DUAL THEMES (COMPLETED)
- [x] **Perbaikan Tata Letak (Anti Saling Tempel):**
  - Restrukturisasi grid & padding tabel (`0.85rem 1rem`) dengan lebar sel presisi agar nomor batch panjang (misal `070728/11ATJP-S`) tidak terpotong.
- [x] **Sistem Tema Terpadu (Default Light, Jaminan Kontras Dark):**
  - **Light Theme (DEFAULT):** Canvas `#ffffff` & `#f8fafc`, teks pekat `#0f172a` (slate-900).
  - **Dark Theme (HIGH CONTRAST):** Canvas obsidian `#121212` & `#181818`, seluruh teks dikonversi ke `#f8fafc` (putih terang). Jaminan nol teks gelap di atas latar gelap.
  - Script pre-render di `<head>` untuk mencegah efek *flicker* saat refresh.
  - Persistensi tema ke `localStorage`.
- [x] **Navbar Terpadu di Atas (Single Sleek Top Bar):**
  - Menggabungkan Logo, Title, Tab Navigasi, Toggle Tema, dan Status User/Cloud.

---

### FASE 5: UPGRADE MODERN LIBRARIES (ANTI-EMOTICON) (COMPLETED)
- [x] **Penghapusan Total Emoticon:**
  - Mengganti seluruh emoji unicode dengan **Font Awesome 6 Professional Icons** (`fa-solid fa-bolt-lightning`, `fa-table-cells`, `fa-barcode`, `fa-print`, `fa-file-excel`, dll).
- [x] **Integrasi SweetAlert2 (`swal alert js`):**
  - Menggantikan semua `alert()` dan `confirm()` bawaan browser.
  - Dialog konfirmasi reset demo data, notifikasi simpan hitung fisik, validasi form, dan toast informasi.
  - Penyesuaian tema SweetAlert2 agar otomatis mengikuti Light / Dark Mode (`.swal-custom-popup`).
- [x] **Integrasi DataTables.js (`datatable.js`):**
  - Pengurutan kolom (sorting), paginasi halaman (5, 10, 20, 50 baris), dan pencarian instan pada Table Editor.
  - Styling datar modern yang menyatu dengan token CSS Supabase Studio.
- [x] **Integrasi ApexCharts.js (`chart.js apex.js`):**
  - Kartu Analitik 1: **IRA Stock Accuracy Donut Gauge** (Rasio Cocok vs Selisih vs Pending).
  - Kartu Analitik 2: **Discrepancy per BIN Bar Chart** (Deviasi kuantitas selisih KG per zona rak).
  - Adaptasi palet warna chart secara dinamis saat tema Light / Dark ditoggle.

---

### FASE 6: OOP ARCHITECTURE & LOGIN SESSION RBAC (COMPLETED)
- [x] **Arsitektur OOP Domain Models (`js/models.js`):**
  - `CycleCountItem`: Enkapsulasi data material, target bersih, varians, dan status.
  - `SignatureOfficer` & `SignatureMatrix`: Model 4 pejabat penandatangan Berita Acara tanpa hardcode.
  - `CompanyProfile`: Model profil nama PT, divisi, nomor dokumen, dan target akurasi IRA.
  - `CycleCountRepository`: Model manajemen persistensi lokal dan cloud replication.
  - `AuthManager`: Model sesi autentikasi dan pengecekan wewenang peran (RBAC).
- [x] **Sistem Login Session & Pembatasan Otoritas (RBAC):**
  - Layar Login Modal (`#modal-auth-login`) saat belum ada sesi aktif atau saat beralih akun.
  - Aksesibilitas sesi cepat: Klik chip akun di navbar atau menu Pengaturan langsung membuka dialog ganti sesi 1 sentuhan.
  - **ADMIN / SPV:** Akses penuh (Dashboard, Scanner, Cetak BA, Import SAP, **Pengaturan Admin & Dataset**).
  - **CHECKER:** Khusus akses **Mobile Scanner** (penghitungan fisik rak BIN).
  - **AUDITOR / ACCOUNTING:** Khusus akses **Table Editor (View-only)** dan **Cetak Berita Acara**.
  - Tombol Logout di navbar dan di panel Pengaturan dengan konfirmasi SweetAlert2.
- [x] **Panel Pengaturan Terbuka & Manajemen Dataset Dummy (`view-settings`):**
  - **Navigasi Permanen:** Tab Pengaturan selalu dapat diakses baik dari desktop top navbar maupun mobile bottom bar (`bnav-settings`).
  - **Card 1 (Sesi Pengguna & Otoritas):** Menampilkan profil pengguna aktif, status wewenang operasional, tombol Ganti Profil Sesi, dan tombol Logout.
  - **Card 2 (Manajemen Data Item & Dataset Dummy):**
    - Tombol Merah `Hapus Data Dummy (Kosongkan)` untuk membersihkan seluruh data (0 SKU) siap input opname aktual.
    - Tombol Hijau `Set / Muat 20 Data Dummy SAP` untuk memuat ulang 20 item simulasi lengkap 4 skenario industri.
    - Tombol Biru `Tambah SKU Baru Manual` (`modal-add-item`) untuk input data material baru tanpa import file.
    - Penanganan Empty State ramah pengguna pada layar mobile checker dan desktop table.
  - **Card 3 (Kustomisasi Tanda Tangan):** Form 4 penandatangan Berita Acara tanpa hardcode.
  - **Card 4 (Profil Lembaga & Standar Audit):** Nama PT kop dokumen dan target akurasi stok IRA (%).
- [x] **Pembersihan Modal Supabase di Frontend:**
  - Menghapus modal konfigurasi Supabase dari UI agar tidak membingungkan operator.
  - Koneksi database berjalan otomatis di latar belakang (*silent backend connection*).

---

### FASE 7: RENCANA PENGEMBANGAN LANJUTAN (NEXT ROADMAP)
- [ ] **Task 7.1: Integrasi Hardware Camera Barcode Scanner (`html5-qrcode`):**
  - Menambahkan tombol kamera pada input barcode di mobile checker untuk memindai barcode Code-128 / QR Code langsung melalui kamera ponsel/tablet tanpa scanner fisik eksternal.
- [ ] **Task 7.2: Digital Wet Signature Canvas (`signature_pad`):**
  - Menyediakan kanvas sentuh di modal penandatanganan agar SPV Warehouse dan Auditor Accounting dapat membubuhkan tanda tangan basah digital langsung di layar sebelum dokumen Berita Acara dicetak/disimpan.
- [ ] **Task 7.3: Direct Excel File Upload (`exceljs` / `xlsx`):**
  - Mengizinkan upload langsung file spreadsheet `.xlsx` dari SAP ALV Grid selain metode copy-paste teks.
- [ ] **Task 7.4: Robust Offline-First Database (`dexie.js` IndexedDB):**
  - Mengimplementasikan background service worker dan IndexedDB untuk menjamin ratusan SKU tersimpan aman saat checker berada di lorong gudang tanpa sinyal Wi-Fi, dan auto-sync saat kembali online.
- [ ] **Task 7.5: SAP Movement 311 Export Generator:**
  - Menyediakan tombol export khusus format teks atau BAPI untuk transaksi SAP otomatis bagi seluruh item yang berstatus *MISPLACED* (pindah lokasi BIN).
