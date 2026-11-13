# Project Execution Roadmap & Checklist (`TODO.md`)

**Project Name:** `esp32-line-follower`  
**Reference Specs:** `PRD.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DESIGN.md`, `HARDWARE_WIRING.md`  
**Execution Rule for Coding Agent:** Kerjakan secara berurutan dari **Phase 1** hingga **Phase 4**. Jangan melompat ke kompilasi `firmware/` sebelum aset `web/dist/index.html.gz` berhasil dibuat, karena Rust menggunakan `include_bytes!()` saat kompilasi.

---

## Phase 1: Frontend Dashboard & Standalone Web App (`web/`)

### 1.1 Project Scaffolding & Build Pipeline
- [x] Inisialisasi direktori `web/` dengan Vite + Vanilla TypeScript (`strict: true`) dan Tailwind CSS.
- [x] Instal `vite-plugin-singlefile` dan konfigurasikan `web/vite.config.ts` agar seluruh JS dan CSS digabung ke dalam satu berkas `dist/index.html` tanpa folder `dist/assets/`.
- [x] Buat skrip `web/scripts/compress.mjs` menggunakan `node:zlib` (`gzipSync` level 9) untuk mengompres `dist/index.html` menjadi `dist/index.html.gz`.
- [x] Konfigurasikan `"build": "tsc && vite build && node scripts/compress.mjs"` di `web/package.json`.

### 1.2 Standalone Web App & Design Tokens (`web/index.html` & `web/src/style.css`)
- [x] Tambahkan meta tags *mobile web app capable* dan *inline Data URI Web App Manifest* (`display: "fullscreen"`, `orientation: "landscape"`) beserta ikon SVG *inline* di dalam `<head>` pada `web/index.html`.
- [x] Terapkan variabel warna sesuai `DESIGN.md` di `web/src/style.css`:
  - Background utama `#F3F2EE`, permukaan tombol `#FAF9F5`, area terbenam `#E5E3DC`, teks utama `#16171A` (**dilarang menggunakan `#FFFFFF` dan `#000000` murni**).
  - Warna aksen terbatas: `#D9381E` (STOP/bahaya/garis), `#1E40AF` (mode aktif/PWM), `#15803D` (connected/LED ON), `#D97706` (error/peringatan).
- [x] Implementasikan fisika permukaan taktil (elevasi *bevel* 3D, *border* $1\text{ px}$, efek tekan `:active` / `.is-pressed` turun $2\text{ px}$, dan state `:hover`).
- [x] Kunci orientasi layar penuh mendatar (`100vw` $\times$ `100dvh`, `overflow: hidden`) dan buat layar peringatan *Portrait Guard* otomatis saat perangkat berada dalam posisi vertikal.

### 1.3 Icons, WebSocket Client & Multi-Touch Controls
- [x] Buat `web/src/icons.ts` berisi seluruh ikon geometris SVG *inline* (`icon-wifi`, `icon-battery`, `icon-stop`, `icon-auto`, `icon-manual`, `icon-arrow-up/down/left/right`, `icon-headlight`, `icon-taillight`, `icon-sliders`, `icon-chevron-down`, `icon-rotate-phone`). **Verifikasi nol karakter emoji di seluruh kode.**
- [x] Buat `web/src/types.ts` dengan kontrak tipe `RobotMode`, `ClientMessage`, dan `TelemetryMessage` yang identik dengan spesifikasi `PRD.md`.
- [x] Buat `web/src/ws.ts` (`RobotSocket`) yang terhubung ke `ws://${window.location.host}/ws` dengan:
  - *Auto-reconnect* otomatis tiap $1000\text{ ms}$ saat koneksi terputus.
  - *Heartbeat interval* setiap $100\text{ ms}$ selama nilai `throttle !== 0 || steering !== 0` agar tidak memicu *watchdog timeout* $400\text{ ms}$ di firmware.
- [x] Buat `web/src/controls.ts` (`DualThumbController`) menggunakan `PointerEvents` (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `lostpointercapture`) dengan `setPointerCapture` dan pelacakan `pointerId` independen untuk Zona Kiri (*Throttle*) dan Zona Kanan (*Steering*).

### 1.4 Views & Interactive Components (`web/src/main.ts`)
- [x] Bangun **View 1 (Halaman Mulai / Pre-Flight Gate)** dalam tata letak *landscape* 2 kolom yang menampilkan status kesiapan WebSocket, status boot `STOP`, tegangan baterai, serta tombol masuk ke dashboard.
- [x] Bangun **View 2 (Dashboard Kontrol Utama)** menggunakan CSS Grid anti-tumpuk:
  - *Top HUD Bar:* Indikator koneksi + tegangan baterai, pemilih mode (`STOP`, `AUTO`, `MANUAL`), dan tombol darurat **`STOP`**.
  - *Zona Kiri:* Tombol kontrol taktil Maju (`+100`) dan Mundur (`-100`).
  - *Zona Tengah:* Visualizer 5 sensor garis (`S1..S5`), pembacaan `line_error` & PWM motor kiri/kanan, *custom tactile slider* batas PWM ($0\% - 100\%$), sakelar Lampu Depan & Belakang, serta **Custom Dropdown / Popover PID Tuning** (dengan preset dan input manual $K_p, K_i, K_d$).
  - *Zona Kanan:* Tombol kontrol taktil Belok Kiri (`-100`) dan Belok Kanan (`+100`).
- [x] Jalankan `npm run build` di `web/` dan pastikan `web/dist/index.html.gz` terbentuk dengan ukuran $< 50\text{ KB}$.

---

## Phase 2: Firmware Core & Hardware Drivers (`firmware/`)

### 2.1 Cargo & ESP-IDF Configuration
- [ ] Buat `firmware/Cargo.toml` dengan dependensi `esp-idf-svc`, `esp-idf-hal`, `esp-idf-sys`, `serde`, `serde_json`, `anyhow`, dan `log`.
- [ ] Buat `firmware/sdkconfig.defaults` dan aktifkan `CONFIG_ESP_WIFI_SOFTAP_SUPPORT=y`, `CONFIG_HTTPD_WS_SUPPORT=y`, `CONFIG_HTTPD_MAX_REQ_HDR_LEN=1024`, `CONFIG_HTTPD_MAX_URI_LEN=512`.
- [ ] Pastikan `firmware/build.rs` memanggil `embuild::espidf::sysenv::output()`.

### 2.2 Hardware Abstraction Modules
- [ ] Buat `firmware/src/config.rs` berisi konstanta pinout GPIO sesuai `HARDWARE_WIRING.md`:
  - Motor Kiri: `ENA = GPIO 32`, `IN1 = GPIO 33`, `IN2 = GPIO 25`.
  - Motor Kanan: `IN3 = GPIO 26`, `IN4 = GPIO 27`, `ENB = GPIO 14`.
  - Sensor Garis: `S1..S5 = [GPIO 16, GPIO 17, GPIO 18, GPIO 19, GPIO 21]`.
  - Lampu LED: `FRONT = GPIO 22`, `REAR = GPIO 23`.
  - Battery ADC: `GPIO 34` (`ADC1_CH6`).
  - Parameter Wi-Fi AP (`SSID: "Robot-LF-UMRI"`, `PASS: "robot1234"`, IP `192.168.4.1`) dan `WATCHDOG_TIMEOUT_MS = 400`.
- [ ] Buat `firmware/src/motor.rs`:
  - Konfigurasi LEDC Timer ($2\text{ kHz}$, resolusi 10-bit) dan 2 kanal PWM (`GPIO 32` & `GPIO 14`).
  - Implementasi fungsi `set_motors(left_pct: f32, right_pct: f32)` dengan logika arah L298N (`Forward`, `Reverse`, `Stop/Brake`).
  - Implementasi fungsi *differential mixer* `mix_manual(throttle, steering, pwm_limit)`.
- [ ] Buat `firmware/src/sensor.rs`:
  - Inisialisasi 5 pin GPIO input sensor TCRT5000 (mendukung konfigurasi `LINE_ACTIVE_HIGH`).
  - Implementasi kalkulasi error berbobot $w = [-2.0, -1.0, 0.0, +1.0, +2.0]$ serta logika pencarian garis konservatif saat semua sensor membaca lantai putih (maks $800\text{ ms}$).
- [ ] Buat `firmware/src/pid.rs`:
  - Implementasi struct `PidController` diskrit ($\Delta t = 0.01\text{ s}$) lengkap dengan pembatas *integral anti-windup* dan metode `reset()`.

---

## Phase 3: State Machine, Safety & Network Server (`firmware/`)

### 3.1 State Machine & Watchdog (`firmware/src/state.rs`)
- [ ] Buat struct `RobotState` yang dibungkus `Arc<Mutex<RobotState>>` dengan kondisi awal saat *boot* terkunci di `RobotMode::Stop` dan `pwm_limit = 50`.
- [ ] Terapkan aturan transisi aman pada `set_mode()`: setiap perpindahan mode (`AUTO` $\leftrightarrow$ `MANUAL`) wajib melewati `STOP`, mereset integral PID, dan mengosongkan nilai `throttle` & `steering`.
- [ ] Implementasikan pengecekan *watchdog timeout*: pada mode `MANUAL`, jika selisih waktu sejak paket `move` terakhir melebihi $400\text{ ms}$, paksa output motor menjadi $0$.

### 3.2 Wi-Fi SoftAP, HTTP & WebSocket Server (`firmware/src/server.rs`)
- [ ] Konfigurasikan `EspWifi` dalam mode Access Point (`192.168.4.1`, Channel 1).
- [ ] Tanamkan aset frontend menggunakan `static INDEX_HTML_GZ: &[u8] = include_bytes!("../../web/dist/index.html.gz");` dan layani pada rute `GET /` dengan header `Content-Encoding: gzip`.
- [ ] Implementasikan endpoint WebSocket `/ws`:
  - Parsing pesan masuk `ClientMessage` menggunakan `serde_json::from_str` secara aman (abaikan dan log peringatan jika JSON tidak valid tanpa memicu `panic!`).
  - Simpan koneksi aktif menggunakan `EspHttpWsDetachedSender` di dalam registry thread-safe untuk siaran telemetri.

---

## Phase 4: Main Loop Integration & Build Verification (`firmware/src/main.rs`)

- [ ] Satukan inisialisasi seluruh periferal GPIO, LEDC PWM, ADC1, Wi-Fi SoftAP, dan `EspHttpServer` di `firmware/src/main.rs`.
- [ ] Jalankan *background thread* untuk *broadcast* `TelemetryMessage` setiap $200\text{ ms}$ ($5\text{ Hz}$) ke seluruh klien WebSocket yang terhubung.
- [ ] Jalankan loop kendali utama pada frekuensi $100\text{ Hz}$ ($\Delta t = 10\text{ ms}$) yang mengeksekusi pembacaan sensor, pengecekan *watchdog*, perhitungan PID/Mixer, pembaruan output motor & LED, serta pembaruan snapshot telemetri.
- [ ] Jalankan `cargo build --release` di dalam `firmware/` dan pastikan kompilasi berhasil bersih tanpa error.

---

## Phase 5: Hardware Assembly, Flashing & Track Calibration

- [ ] **Verifikasi Wiring Fisik (`HARDWARE_WIRING.md`):**
  - Pastikan jumper `ENA` dan `ENB` pada L298N **dilepas**, dan jumper `5V_EN` **terpasang**.
  - Pastikan modul sensor TCRT5000 mendapat suplai dari pin **`3V3`** Expansion Board.
  - Pastikan kapasitor elektrolit $470\text{--}1000\text{ }\mu\text{F}$ terpasang paralel pada `5V` dan `GND` Expansion Board dengan polaritas benar.
  - Ukur tegangan keluaran terminal `5V` L298N dengan multimeter ($4.9\text{ V} - 5.1\text{ V}$) sebelum menyambungkannya ke Expansion Board.
- [ ] **Flashing Firmware Aman:**
  - Matikan sakelar baterai dan **cabut kabel jumper `5V` dari L298N ke Expansion Board** sebelum mencolokkan kabel USB ke laptop.
  - Jalankan `cargo espflash flash --release --monitor` dan pastikan log Wi-Fi AP `Robot-LF-UMRI` aktif.
- [ ] **Pengujian Fungsional & Kalibrasi:**
  - Hubungkan HP ke Wi-Fi `Robot-LF-UMRI`, buka `http://192.168.4.1` di browser *landscape*, dan tambahkan ke *Home Screen*.
  - Uji kontrol dua jempol di mode `MANUAL` serta uji *fail-safe* dengan mematikan Wi-Fi HP saat motor berputar (motor harus berhenti dalam $\le 400\text{ ms}$).
  - Kalibrasi potensiometer sensor TCRT5000 pada lintasan hitam-putih, lalu lakukan *tuning* nilai $K_p, K_i, K_d$ langsung dari menu dropdown dashboard hingga robot stabil melewati lintasan lurus maupun tikungan.