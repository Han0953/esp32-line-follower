# Agent Operational Rules & Guidelines (`AGENT.md`)

**Project Name:** `esp32-line-follower`

**Scope:** Seluruh direktori monorepo (`PRD.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DESIGN.md`, `HARDWARE_WIRING.md`, `TODO.md`, `web/`, dan `firmware/`)

**Role:** Autonomous Embedded Rust & Frontend TypeScript Engineer

## 1. Mandatory Pre-Code Audit Protocol (Baca & Audit Dulu)

Sebelum membuat, mengubah, atau menghapus satu baris kode pun, *coding agent* **WAJIB** melakukan langkah-langkah berikut:

1. **Baca Seluruh Dokumentasi Proyek:** Baca dan pahami secara menyeluruh keenam dokumen spesifikasi di root proyek:
   - `PRD.md` (Kebutuhan fungsional, skema JSON WebSocket, dan alur build)
   - `ARCHITECTURE.md` (Topologi daya, model konkurensi FreeRTOS $100\text{ Hz}$ vs $5\text{ Hz}$, dan *state machine*)
   - `TECH_STACK.md` (Daftar pustaka yang diizinkan dan daftar teknologi terlarang)
   - `DESIGN.md` (Sistem desain taktil *off-white/off-black*, tata letak *landscape*, dan larangan emoji/AI slop)
   - `HARDWARE_WIRING.md` (Kontrak pinout GPIO ESP32 Expansion Board $\leftrightarrow$ L298N & TCRT5000)
   - `TODO.md` (Urutan eksekusi fase pekerjaan)
2. **Audit Konsistensi Lintas Dokumen:** Periksa keselarasan antar-dokumen (terutama kesesuaian peta pin GPIO, nama *field* JSON WebSocket, token warna, serta dependensi *build* `web/dist/index.html.gz` sebelum kompilasi `firmware/`).
3. **Kirim Audit Report Sebelum Mulai Ngoding:** Setelah selesai membaca semua file `.md`, **berhenti sejenak dan laporkan hasil audit** kepada pengguna dalam format ringkas yang mencakup:
   - Ringkasan pemahaman arsitektur & kontrak utama sistem.
   - Hasil verifikasi konsistensi antar-dokumen (apakah ada konflik/ambiguitas atau sudah sinkron sepenuhnya).
   - Rencana langkah eksekusi pertama sesuai `TODO.md` sebelum menyentuh kode.

## 2. Post-Implementation Reporting Protocol

Setiap kali selesai mengimplementasikan satu fitur, modul, atau fase pekerjaan dari `TODO.md`, *coding agent* **WAJIB** memberikan laporan penyelesaian (*Implementation Report*) yang memuat:

1. **Ringkasan Perubahan:** Daftar file yang dibuat atau dimodifikasi beserta fungsi utamanya.
2. **Hasil Verifikasi Build & Ukuran Aset:**
   - Untuk perubahan di `web/`: hasil kompilasi `npm run build` dan ukuran pasti berkas `web/dist/index.html.gz` (wajib $< 50\text{ KB}$).
   - Untuk perubahan di `firmware/`: hasil pengecekan `cargo check` / `cargo build --release`.
3. **Kepatuhan Kontrak:** Konfirmasi bahwa tidak ada pelanggaran pinout GPIO, skema JSON, maupun aturan desain.

## 3. Codebase Quality Standards (Zero AI Slop & Minimal Comments)

### 3.1 Anti-AI Slop Engineering
- **Frontend (`web/`):**
  - Dilarang menghasilkan UI generik bergaya template AI (gradasi ungu/neon, *glassmorphism* berlebihan, bayangan berpendar tanpa fungsi, atau tata letak kartu bertumpuk).
  - Wajib mematuhi token warna `DESIGN.md`: basis *off-white* (`#F3F2EE`, `#FAF9F5`, `#E5E3DC`) dan *off-black* (`#16171A`). **Dilarang keras menggunakan `#FFFFFF` maupun `#000000` murni.**
  - Wajib menggunakan permukaan taktil berdimensi (*border* $1\text{ px}$, *bevel highlight*, dan respons tekan `:active` / `.is-pressed`) dengan tata letak *landscape* penuh tanpa *overlapping*.
  - **Nol Emoji:** Dilarang menggunakan karakter emoji di mana pun; seluruh ikon wajib menggunakan SVG geometris *inline*.
  - **Nol Aset Eksternal:** Dilarang memuat CDN, Google Fonts, atau berkas gambar/manifest terpisah di luar satu berkas `index.html.gz`.
- **Firmware (`firmware/`):**
  - Tulis kode Rust yang idiomatik, modular, ringan, dan deterministik.
  - **Anti-Panic Runtime:** Dilarang menggunakan `.unwrap()` atau `.expect()` pada parsing pesan WebSocket (`serde_json`), pembacaan jaringan, atau operasi *mutex* yang berpotensi membuat ESP32 *panic/reboot* saat robot berjalan. Tangani error secara eksplisit dengan `match` / `if let Ok(...)` dan `log::warn!`.

### 3.2 Aturan Penulisan Komentar (Minimal & Esensial)
- **Kurangi komentar seminimal mungkin.** Kode harus bersih dan mudah dibaca melalui penamaan variabel, fungsi, dan tipe data yang jelas (*self-documenting code*).
- **Dilarang** menulis komentar naratif yang menjelaskan hal yang sudah jelas (contoh terlarang: `// Set motor speed to zero` atau `// Loop through sensors`).
- **Hanya tulis komentar** jika benar-benar dibutuhkan untuk menjelaskan:
  - Batasan perangkat keras / kelistrikan (contoh: alasan pemilihan pin `ADC1` agar tidak bentrok dengan Wi-Fi, atau logika aktif `IN1/IN2` L298N).
  - Invarian keselamatan (*safety-critical logic*, seperti *watchdog timeout* $400\text{ ms}$ atau transisi wajib lewat `STOP`).
  - Rumus matematika kontrol (misalnya konstanta *anti-windup* PID atau bobot posisi sensor).

## 4. Living Documentation Sync (Pembaruan `.md` Otomatis)

Dokumentasi proyek harus selalu mencerminkan kondisi kode yang sebenarnya:

1. **Update `TODO.md`:** Setiap kali satu sub-tugas atau fase selesai diimplementasikan dan terverifikasi *build*-nya, ubah status `[ ]` menjadi `[x]` di `TODO.md`.
2. **Sinkronisasi Perubahan Kontrak:** Apabila selama pengembangan terdapat penyesuaian teknis (misalnya perubahan konstanta *default* PID, penambahan *field* telemetri JSON, atau penyesuaian pin GPIO), *coding agent* **wajib** memperbarui dokumen terkait (`PRD.md`, `ARCHITECTURE.md`, `HARDWARE_WIRING.md`, atau `DESIGN.md`) pada sesi yang sama sebelum memberikan laporan akhir.

## 5. Git Workflow & Commit Message Convention

1. **Dilarang Commit atau Push Tanpa Perintah:** *Coding agent* **TIDAK BOLEH** menjalankan `git commit` atau `git push` secara otomatis setelah selesai mengoding. Tunggu hingga pengguna secara eksplisit memerintahkan untuk melakukan *commit* atau *push*.
2. **Format Pesan Commit:**
   - Gunakan awalan tipe perubahan dalam **bahasa Inggris** (`feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `build:`, `chore:`).
   - Gunakan deskripsi isi commit dalam **bahasa Indonesia yang singkat, jelas, dan simpel** (huruf kecil setelah titik dua, tanpa titik di akhir).
   - **Contoh yang Benar:**
     - `docs: tambah dokumentasi spesifikasi dan aturan proyek`
     - `feat: buat dashboard kontrol dua jempol dan koneksi websocket`
     - `feat: implementasi kendali pid dan driver motor l298n di rust`
     - `fix: perbaiki reset throttle saat jari keluar area kontrol`
     - `build: tambah skrip kompresi gzip untuk aset web`
   - **Contoh yang Salah (Dilarang):**
     - `feat: implement dual thumb controller and websocket client with auto reconnect` (isi tidak berbahasa Indonesia)
     - `fitur: menambahkan halaman dashboard yang sangat bagus dan responsif.` (awalan bukan bahasa Inggris dan terlalu bertele-tele)

## 6. Technical Guardrails Summary

- **Urutan Build Wajib:** Selalu jalankan `npm run build` di `web/` terlebih dahulu hingga `web/dist/index.html.gz` tersedia sebelum menjalankan `cargo build` di `firmware/`.
- **Keamanan Pinout:** Jangan mengubah pemetaan pin di `firmware/src/config.rs` tanpa persetujuan pengguna, karena harus sesuai dengan *wiring* fisik pada ESP32 30-Pin Expansion Board.
- **Kepatuhan Stack:** Patuhi larangan pustaka di `TECH_STACK.md` (tanpa React/Next.js, tanpa `socket.io`, tanpa Tailwind CDN eksternal).