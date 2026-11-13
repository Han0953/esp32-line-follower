# Technology Stack Specification: ESP32 Dual-Mode Line Follower Robot

**Project Name:** `esp32-line-follower`  
**Companion Documents:** `PRD.md`, `ARCHITECTURE.md`  
**Purpose:** Kontrak spesifikasi teknologi, pustaka (*dependencies*), *toolchain*, dan aturan pembatasan aset agar *coding agent* membangun sistem yang ringan, deterministik, dan kompatibel dengan memori Flash ESP32 ($4\text{ MB}$).

---

## 1. Technology Stack Overview

| Layer / Domain | Teknologi Utama | Peran dalam Sistem | Alasan Pemilihan & Batasan |
| :--- | :--- | :--- | :--- |
| **Mikrokontroler** | ESP32 DevKit V1 (30-Pin) | Pusat kendali motor, pembacaan sensor, Wi-Fi AP, & HTTP/WS Server | Dual-core Xtensa LX6 ($240\text{ MHz}$), $520\text{ KB}$ SRAM, $4\text{ MB}$ Flash, hardware LEDC PWM. |
| **Bahasa Firmware** | Rust (`edition = "2021"`) | Logika kendali *real-time* ($100\text{ Hz}$), PID, *state machine*, & jaringan | Keamanan memori tanpa *garbage collector*, konkurensi FreeRTOS aman via `Arc<Mutex<T>>`. |
| **SDK & HAL Firmware** | `esp-idf-svc` & `esp-idf-hal` | Abstraksi Wi-Fi SoftAP, HTTPd WebSocket, GPIO, LEDC PWM, & ADC1 | Menggunakan `std` Rust di atas ESP-IDF v5.x sehingga mendukung *multi-threading* & `serde_json`. |
| **Serialisasi Data** | `serde` & `serde_json` | Parsing perintah klien & serialisasi telemetri robot | Tipe data aman (*strongly-typed*) dan tahan terhadap paket JSON rusak tanpa `panic!`. |
| **Bahasa Frontend** | TypeScript ($\ge 5.0$) | Logika kontrol sentuh dua jempol, *heartbeat* WebSocket, & HUD | Mencegah *bug* tipe data pada skema pesan JSON antara browser dan firmware Rust. |
| **Bundler Frontend** | Vite ($\ge 5.0$) + `vite-plugin-singlefile` | Menggabungkan seluruh JS & CSS menjadi 1 berkas `index.html` tunggal | Menghindari *overhead* banyak permintaan HTTP pada server kecil ESP32. |
| **Styling Frontend** | Tailwind CSS | Tata letak *mobile-first landscape*, kontrol sentuh, & indikator HUD | *Utility-first* dengan ukuran CSS terkompilasi sangat kecil setelah proses *purging*. |
| **Kompresi Aset** | Node.js `node:zlib` (Gzip Level 9) | Mengompres `dist/index.html` menjadi `dist/index.html.gz` | Memangkas ukuran aset web hingga $70\text{--}80\%$ (target akhir $< 50\text{ KB}$). |
| **Protokol Komunikasi** | Wi-Fi SoftAP + HTTP/1.1 + WebSocket | Koneksi lokal tanpa internet (`192.168.4.1`) & kontrol dua arah latensi rendah | Tidak butuh kuota internet, server *cloud*, maupun aplikasi toko aplikasi (*Play Store*). |

---

## 2. Embedded Firmware Stack (`firmware/`)

### 2.1 Compiler & Embedded Toolchain
* **Target Triple:** `xtensa-esp32-espidf`
* **Rust Toolchain:** `esp` (diinstal melalui `espup install`) dengan dukungan pustaka standar (`std`).
* **ESP-IDF Version:** `v5.2` atau `v5.3` (dikelola otomatis oleh `esp-idf-sys` saat `cargo build`).
* **Linker & Flashing Tools:**
  * `ldproxy`: *Linker wrapper* wajib untuk menghubungkan pustaka C ESP-IDF dengan biner Rust.
  * `espflash` / `cargo-espflash`: Alat untuk melakukan kompilasi biner, konversi image boot, dan *flashing* ke ESP32 via USB UART.

### 2.2 Rust Crates (`firmware/Cargo.toml`)
Hanya gunakan *crate* berikut di dalam `firmware/Cargo.toml`:
* **`esp-idf-svc`:** Menyediakan `EspWifi` (mode Access Point), `EspHttpServer` (rute HTTP & WebSocket), `EspSystemEventLoop`, `EspDefaultNvsPartition`, dan `FreeRtos`.
* **`esp-idf-hal`:** Menyediakan driver periferal tingkat rendah:
  * `gpio::PinDriver` untuk 5 kanal sensor garis (`Input`), 4 arah driver motor L298N (`Output`), dan 2 kanal lampu LED (`Output`).
  * `ledc::{LedcDriver, LedcTimerDriver}` untuk sinyal PWM kecepatan motor kiri (`ENA`) dan kanan (`ENB`).
  * `adc::oneshot` pada `ADC1` (`GPIO 34`) untuk pembacaan pembagi tegangan baterai.
* **`esp-idf-sys`:** Binding FFI mentah ke ESP-IDF (diperlukan untuk sinkronisasi `sdkconfig.defaults`).
* **`serde` (fitur `derive`) & `serde_json`:** Untuk *deserialization* `ClientMessage` dan *serialization* `TelemetryMessage`.
* **`anyhow`:** Penanganan error yang ringkas di seluruh fungsi inisialisasi.
* **`log`:** Pencatatan diagnostik ke *serial monitor* (`115200 bps`).

### 2.3 Konfigurasi ESP-IDF (`firmware/sdkconfig.defaults`)
Wajib diaktifkan agar server HTTP ESP-IDF mendukung protokol WebSocket (*RFC 6455*) dan SoftAP secara stabil:
```ini
CONFIG_ESP_WIFI_SOFTAP_SUPPORT=y
CONFIG_HTTPD_MAX_REQ_HDR_LEN=1024
CONFIG_HTTPD_MAX_URI_LEN=512
CONFIG_HTTPD_WS_SUPPORT=y
CONFIG_ESP_TASK_WDT_TIMEOUT_S=5
```

*(Catatan Kontingensi Proposal: Apabila terdapat kendala lingkungan kompilasi Xtensa Rust di mesin lokal pengembang, spesifikasi protokol JSON dan pinout GPIO tetap berlaku penuh jika dialihkan ke C++ ESP-IDF/Arduino atau MicroPython).*

---

## 3. Frontend & Web App Stack (`web/`)

### 3.1 Core Build & Bundling Tools
* **Runtime:** Node.js LTS ($\ge 20.x$) & npm.
* **Language:** TypeScript ($\ge 5.3$) dengan `"strict": true` di `tsconfig.json`.
* **Build Tool:** Vite ($\ge 5.0$).
* **Single-File Bundler:** `vite-plugin-singlefile` — menyuntikkan seluruh bundel `<script type="module">` dan `<style>` langsung ke dalam `web/dist/index.html` sehingga tidak ada folder `assets/` eksternal.
* **Gzip Compressor (`web/scripts/compress.mjs`):** Skrip Node.js murni menggunakan `zlib.gzipSync(htmlBuffer, { level: 9 })` untuk menghasilkan `web/dist/index.html.gz`.

### 3.2 UI & Styling Stack
* **Tailwind CSS:** Digunakan untuk membangun tata letak *grid/flex* layar penuh mendatar (*landscape*), tombol kontrol besar yang ramah jempol, serta indikator status telemetri.
* **Vanilla TypeScript DOM Manipulation:** Pembaruan nilai telemetri ($5\text{ Hz}$) dilakukan secara langsung pada elemen DOM spesifik (`textContent`, `classList`, `style.transform`) tanpa *Virtual DOM* agar latensi sentuhan nol dan ukuran file tetap di bawah $50\text{ KB}$.
* **CSS Transitions:** Animasi ringan berbasis GPU (`transform`, `opacity`) untuk umpan balik visual tombol dan indikator sensor garis.

### 3.3 Web Platform APIs
* **Pointer Events API (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`):** Menangani sentuhan multi-jari (*multitouch*) secara terpisah pada zona kontrol kiri (*throttle*) dan kanan (*steering*) dengan `setPointerCapture` agar perintah tidak macet saat jari bergeser.
* **Native WebSocket API:** Koneksi persisten ke `ws://${window.location.host}/ws` dilengkapi *heartbeat timer* $100\text{ ms}$ dan logika *auto-reconnect* otomatis.
* **Standalone Web App (Inline Data URI Manifest):** Menggunakan `<link rel="manifest" href="data:application/manifest+json,...">` dan ikon SVG *inline* di `web/index.html` agar pengguna dapat memilih **"Add to Home Screen"** pada Chrome Android atau Safari iOS dan menjalankannya dalam mode *fullscreen landscape* tanpa perlu sertifikat HTTPS maupun file eksternal.

---

## 4. Hardware & Electrical Stack

| Subsistem | Komponen Spesifik | Spesifikasi Teknis |
| :--- | :--- | :--- |
| **Board Utama** | ESP32 DevKit V1 (30-Pin) + Expansion Board | Tegangan logika $3.3\text{ V}$, ekspansi header daya $5\text{ V}$ & $3.3\text{ V}$ memudahkan *wiring* tanpa *breadboard*. |
| **Driver Motor** | L298N Dual H-Bridge Module | Jumper `ENA` & `ENB` dilepas (kontrol PWM); jumper `5V_EN` terpasang (regulator $5\text{ V}$ aktif ke Expansion Board). |
| **Aktuator** | 2x Motor DC Gearbox Kuning (TT) | Tegangan kerja $3\text{--}6\text{ V}$, terpasang pada chassis akrilik 2WD dengan 2 roda dan 1 *ball caster*. |
| **Sensor Garis** | TCRT5000 IR Array 5 Kanal | Disuplai dari pin $3.3\text{ V}$ Expansion Board; 5 keluaran digital (`OUT1..OUT5`) mendeteksi kontras garis hitam-putih. |
| **Catu Daya** | 2x Baterai Li-ion 18650 (2S) + Holder | Tegangan nominal $7.4\text{ V}$ (penuh $8.4\text{ V}$) melalui sakelar utama ke terminal `12V` L298N. |
| **Proteksi Daya** | Kapasitor Elektrolit $470\text{--}1000\text{ }\mu\text{F}$ ($16\text{ V}$) | Dipasang paralel pada jalur $5\text{ V}$ dan `GND` Expansion Board untuk meredam lonjakan arus awal (*inrush current*) motor. |
| **Indikator** | 4x LED (2 Putih Depan, 2 Merah Belakang) | Masing-masing dilengkapi resistor pembatas arus $220\text{ }\Omega - 330\text{ }\Omega$. |

---

## 5. Strict Guardrails & Banned Technologies (Untuk Coding Agent)

Karena seluruh aplikasi web ditanam di memori Flash ESP32 menggunakan `include_bytes!("../../web/dist/index.html.gz")` dan diakses secara *offline* tanpa internet, *coding agent* **DILARANG KERAS** menggunakan teknologi berikut:

1. **Dilarang menggunakan Framework Web Berat:** Jangan menginstal Next.js, React, Vue, Angular, Svelte, atau jQuery. Gunakan murni Vanilla TypeScript.
2. **Dilarang menggunakan Pustaka Grafik/Animasi Berat:** Jangan menginstal Three.js, GSAP, Framer Motion, atau Chart.js.
3. **Dilarang menggunakan Pustaka Wrapper WebSocket:** Jangan menginstal `socket.io-client` (ESP-IDF HTTPd menggunakan WebSocket standar RFC 6455, bukan protokol Socket.IO).
4. **Dilarang menggunakan Aset Eksternal / CDN:** Jangan memuat Google Fonts, FontAwesome CDN, ikon eksternal, atau file gambar `.png`/`.jpg` terpisah. Seluruh ikon wajib berupa SVG *inline* atau karakter UTF-8.
5. **Dilarang mengaktifkan HTTPS/TLS di ESP32:** Tetap gunakan HTTP (`http://192.168.4.1`) dan WS (`ws://192.168.4.1/ws`) agar ringan di RAM dan tidak diblokir peringatan sertifikat *self-signed* di browser ponsel.

---

## 6. Build & Verification Commands

### Build Frontend (`web/`)
```bash
cd web
npm install
npm run build
# Output wajib: web/dist/index.html.gz dengan ukuran < 50 KB
```

### Build & Flash Firmware (`firmware/`)
```bash
cd firmware
# Pastikan jalur 5V dari L298N ke Expansion Board dilepas sebelum mencolok kabel USB
cargo build --release
cargo espflash flash --release --monitor
```