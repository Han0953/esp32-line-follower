# Product Requirements Document (PRD): ESP32 Dual-Mode Line Follower Robot

**Project Name:** `esp32-line-follower`  
**Platform:** ESP32 DevKit V1 (30-Pin) + Expansion Board  
**Firmware Stack:** Rust (`esp-idf-svc`, `esp-idf-hal`, `std`)  
**Frontend Stack:** TypeScript, Vite, Tailwind CSS (`vite-plugin-singlefile` + Gzip)  
**Target Environment:** Offline Local Wi-Fi SoftAP (`192.168.4.1`) & WebSocket Real-Time Control  

---

## 1. Project Overview

`esp32-line-follower` adalah purwarupa robot bergerak beroda dua (*2WD differential drive*) berbasis mikrokontroler ESP32 yang beroperasi dalam **dua mode utama**:

1. **Mode Otomatis (`AUTO`):** Mengikuti lintasan garis hitam di atas permukaan putih secara mandiri menggunakan array sensor inframerah 5 kanal dan algoritma kendali **PID** diskrit.
2. **Mode Manual (`MANUAL`):** Dikendalikan secara *real-time* dari browser ponsel atau laptop melalui jaringan Wi-Fi lokal (*Access Point*) milik ESP32 menggunakan antarmuka kontrol sentuh dua jempol (*dual-thumb*) dan protokol **WebSocket** tanpa memerlukan koneksi internet maupun aplikasi toko aplikasi (*Play Store/App Store*). Dashboard mendukung instalasi ke layar utama ponsel (*Add to Home Screen*) sebagai aplikasi web mandiri layar penuh (*fullscreen landscape*).

Dokumen ini menjadi kontrak spesifikasi teknis antara perangkat keras (*hardware*), *firmware* Rust, dan antarmuka web TypeScript agar seluruh komponen terintegrasi tanpa konflik pin, *brownout* daya, maupun perbedaan skema data.

---

## 2. Repository Structure & Build Pipeline

Proyek disusun dalam satu *monorepo* dengan struktur direktori berikut:

```text
esp32-line-follower/
├── PRD.md                  # Dokumen spesifikasi utama (file ini)
├── firmware/               # Project Rust (ESP-IDF std target: xtensa-esp32-espidf)
│   ├── Cargo.toml
│   ├── build.rs            # Script build ESP-IDF & pengecekan aset web
│   ├── sdkconfig.defaults  # Konfigurasi Wi-Fi, HTTP Server, WebSocket, & Task Watchdog
│   └── src/
│       ├── main.rs         # Entry point, inisialisasi hardware, spawning tasks
│       ├── config.rs       # Konstanta pinout GPIO, parameter Wi-Fi, default PID & timeout
│       ├── motor.rs        # Abstraksi driver L298N (PWM LEDC + arah IN1..IN4 + mixer)
│       ├── sensor.rs       # Pembacaan array TCRT5000 5 kanal & kalkulasi posisi garis
│       ├── pid.rs          # Algoritma PID diskrit + integral anti-windup
│       ├── state.rs        # State machine mode (STOP/AUTO/MANUAL), watchdog & telemetri
│       └── server.rs       # Wi-Fi SoftAP, HTTP server (gzip), & WebSocket handler
└── web/                    # Project Frontend Dashboard
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts      # Menggunakan vite-plugin-singlefile
    ├── index.html          # Berisi inline Data URI manifest & meta tags standalone web app
    ├── scripts/
    │   └── compress.mjs    # Script Node.js untuk mengompres dist/index.html -> dist/index.html.gz
    └── src/
        ├── main.ts         # Entry point aplikasi & binding DOM/State
        ├── style.css       # Tailwind CSS + utility mobile-first landscape
        ├── types.ts        # Definisi tipe pesan WebSocket (Client <-> Robot)
        ├── ws.ts           # WebSocket client dengan auto-reconnect & heartbeat 100 ms
        └── controls.ts     # Handler Pointer Events dual-thumb (throttle & steering)
```

### Alur Kompilasi & Embedding Frontend ke Firmware

1. Di dalam `web/`, perintah `npm run build` menjalankan Vite dengan `vite-plugin-singlefile` untuk membundel seluruh JS dan CSS menjadi satu file tunggal `web/dist/index.html`, lalu menjalankan script kompresi Gzip untuk menghasilkan `web/dist/index.html.gz` (target ukuran $< 50\text{ KB}$).
2. Di dalam `firmware/src/server.rs`, file terkompresi tersebut ditanam langsung ke memori flash ESP32 saat kompilasi Rust menggunakan makro:
   ```rust
   static INDEX_HTML_GZ: &[u8] = include_bytes!("../../web/dist/index.html.gz");
   ```
3. Saat klien mengakses `http://192.168.4.1/`, HTTP server merespons dengan `INDEX_HTML_GZ` disertai header `Content-Type: text/html; charset=utf-8` dan `Content-Encoding: gzip`. Tidak ada rute aset tambahan yang dilayani HTTP server.

---

## 3. Hardware Specifications & Pinout Contract

### 3.1 Daftar Komponen Aktual (Paket Hemat Terintegrasi)

* **Mikrokontroler:** ESP32 DevKit V1 (30-Pin) terpasang pada ESP32 30-Pin Expansion Board.
* **Driver Motor:** L298N Dual H-Bridge Module.
  * Jumper `ENA` dan `ENB` **wajib dilepas** untuk kontrol kecepatan PWM.
  * Jumper `5V_EN` **tetap terpasang** agar regulator $5\text{ V}$ onboard L298N aktif menyuplai pin `5V` Expansion Board.
* **Aktuator & Mekanik:** 2 unit Motor DC Gearbox Kuning (TT Motor $3\text{--}6\text{ V}$), 2 roda, 1 *ball caster*, dan chassis akrilik 2WD.
* **Sensor Garis:** Modul IR Reflectance TCRT5000 Array 5 Kanal (disuplai dari pin **`3V3`** Expansion Board agar level logika keluaran aman di $3.3\text{ V}$).
* **Catu Daya & Stabilitas:** 2 sel Baterai Li-ion 18650 seri (2S: nominal $7.4\text{ V}$, penuh $8.4\text{ V}$) melalui sakelar utama ke terminal `12V` (VMS) L298N. Kapasitor elektrolit $470\text{ }\mu\text{F}$ atau $1000\text{ }\mu\text{F}$ ($16\text{ V}$) dipasang paralel pada jalur `5V` dan `GND` Expansion Board untuk mencegah *brownout* saat motor mulai bergerak.
* **Indikator:** 4 unit LED (2 LED Putih di depan, 2 LED Merah di belakang) dengan resistor pembatas arus ($220\text{ }\Omega - 330\text{ }\Omega$).

### 3.2 Peta Alokasi Pin GPIO (Wajib Dipatuhi Firmware)

Pemilihan pin menghindari pin *strapping* sensitif saat *boot* (seperti GPIO 0, 2, 12, 15) dan menghindari `ADC2` yang bentrok dengan peripheral Wi-Fi.

| Subsistem | Pin Modul | Pin ESP32 | Mode GPIO | Keterangan Teknis |
| :--- | :--- | :--- | :--- | :--- |
| **Motor Kiri (PWM)** | L298N `ENA` | `GPIO 32` | Output (LEDC PWM) | Frekuensi PWM $1\text{--}5\text{ kHz}$, resolusi 8-bit ($0\text{--}255$) atau 10-bit ($0\text{--}1023$) |
| **Motor Kiri (Arah 1)** | L298N `IN1` | `GPIO 33` | Digital Output | Logika arah motor kiri |
| **Motor Kiri (Arah 2)** | L298N `IN2` | `GPIO 25` | Digital Output | Logika arah motor kiri |
| **Motor Kanan (Arah 1)** | L298N `IN3` | `GPIO 26` | Digital Output | Logika arah motor kanan |
| **Motor Kanan (Arah 2)** | L298N `IN4` | `GPIO 27` | Digital Output | Logika arah motor kanan |
| **Motor Kanan (PWM)** | L298N `ENB` | `GPIO 14` | Output (LEDC PWM) | Frekuensi & resolusi identik dengan `ENA` |
| **Sensor Garis 1 (Paling Kiri)** | TCRT `OUT1` | `GPIO 16` | Digital Input | Disuplai $3.3\text{ V}$; bobot posisi $w_0 = -2$ |
| **Sensor Garis 2 (Kiri Tengah)** | TCRT `OUT2` | `GPIO 17` | Digital Input | Bobot posisi $w_1 = -1$ |
| **Sensor Garis 3 (Tengah)** | TCRT `OUT3` | `GPIO 18` | Digital Input | Bobot posisi $w_2 = 0$ (target *setpoint*) |
| **Sensor Garis 4 (Kanan Tengah)** | TCRT `OUT4` | `GPIO 19` | Digital Input | Bobot posisi $w_3 = +1$ |
| **Sensor Garis 5 (Paling Kanan)** | TCRT `OUT5` | `GPIO 21` | Digital Input | Bobot posisi $w_4 = +2$ |
| **Lampu Depan (2 LED Putih)** | Anoda LED | `GPIO 22` | Digital Output | Aktif HIGH melalui resistor |
| **Lampu Belakang (2 LED Merah)** | Anoda LED | `GPIO 23` | Digital Output | Aktif HIGH (bisa menyala manual atau otomatis saat STOP/mundur) |
| **Sensor Baterai (Opsional)** | Pembagi Tegangan | `GPIO 34` | Analog Input (`ADC1_CH6`) | Input-only pin; rasio pembagi $R_1=20\text{ k}\Omega, R_2=10\text{ k}\Omega$ (maks $2.8\text{ V}$ saat $8.4\text{ V}$) |

#### Tabel Logika Driver L298N (Per Kanal)

* **Maju (`Forward`):** `IN1 = HIGH`, `IN2 = LOW`, `PWM = duty_cycle`
* **Mundur (`Reverse`):** `IN1 = LOW`, `IN2 = HIGH`, `PWM = duty_cycle`
* **Berhenti / Rem (`Stop/Brake`):** `IN1 = LOW`, `IN2 = LOW`, `PWM = 0`

---

## 4. Functional Requirements

### 4.1 State Machine & Keamanan Sistem (`firmware/src/state.rs`)

1. **Kondisi Awal (`BOOT`):** Saat ESP32 pertama kali menyala, mode wajib diinisialisasi ke `STOP` dengan PWM motor bernilai $0$.
2. **Transisi Mode Aman:** Perpindahan dari `AUTO` ke `MANUAL` atau dari `MANUAL` ke `AUTO` **wajib melewati kondisi `STOP`**, mereset nilai integral PID ($\sum e = 0$), dan mengosongkan perintah *throttle/steering* sebelumnya.
3. **Independensi Mode `AUTO`:** Mode `AUTO` harus tetap dapat dijalankan dan berfungsi penuh meskipun tidak ada perangkat klien yang terhubung ke Wi-Fi robot.
4. **Watchdog Timeout Mode `MANUAL`:**
   * Selama pengguna menahan kontrol di layar pada mode `MANUAL`, browser mengirimkan paket perintah secara periodik setiap $100\text{ ms}$.
   * Firmware mencatat stempel waktu (`last_cmd_timestamp`) setiap kali pesan gerak valid diterima.
   * Jika selisih waktu sekarang dengan `last_cmd_timestamp` melebihi **`400 ms`** (rentang konfigurasi $300\text{--}500\text{ ms}$), firmware wajib segera memaksa motor ke kondisi `STOP` ($PWM = 0$) untuk mencegah robot melaju tak terkendali saat koneksi Wi-Fi putus atau browser tertutup.
5. **Prioritas Tombol `STOP`:** Perintah `stop` dari dashboard langsung mengubah mode sistem ke `STOP` dan mematikan kedua motor seketika.

### 4.2 Algoritma Mode Otomatis (`AUTO`)

1. **Pembacaan Sensor 5 Kanal:**
   * Firmware membaca status 5 pin GPIO sensor (`s[0..4]`).
   * Sediakan konstanta konfigurasi `LINE_ACTIVE_HIGH: bool = true` (karena komparator modul TCRT5000 umumnya mengeluarkan logika `HIGH` saat pantulan rendah di atas garis hitam, namun dapat dibalik jika modul yang terpasang berlogika terbalik).
2. **Perhitungan Posisi & Error Garis:**
   * Dengan bobot simetris $w = [-2.0, -1.0, 0.0, +1.0, +2.0]$ dan nilai biner terdeteksi $s_i \in \{0, 1\}$:
   $$\text{error}(k) = \frac{\sum_{i=0}^{4} (w_i \cdot s_i)}{\sum_{i=0}^{4} s_i}$$
   * **Penanganan Kehilangan Garis ($\sum_{i=0}^{4} s_i = 0$):** Jika seluruh sensor membaca lantai putih (garis hilang), robot menggunakan nilai `last_valid_error` untuk melakukan pencarian konservatif (berputar pelan ke arah terakhir garis terlihat) selama batas waktu tertentu (misal $800\text{ ms}$), lalu berhenti aman jika garis tetap tidak ditemukan.
3. **Pengendali PID Diskrit (`firmware/src/pid.rs`):**
   * Loop kontrol berjalan pada interval tetap $\Delta t$ (target $10\text{ ms}$ atau $100\text{ Hz}$).
   * Persamaan kontrol:
   $$u(k) = K_p \cdot e(k) + K_i \cdot I(k) + K_d \cdot \frac{e(k) - e(k-1)}{\Delta t}$$
   * Komponen integral $I(k) = \text{clamp}(I(k-1) + e(k)\Delta t, -I_{\max}, +I_{\max})$ wajib dilengkapi *anti-windup*.
   * Kecepatan dasar `base_pwm` diambil dari pengaturan slider dashboard (`pwm_limit`, skala $0\text{--}100\%$).
   * Output ke motor kiri dan kanan:
   $$\text{PWM}_{\text{left}} = \text{clamp}(\text{base\_pwm} + u(k), -\text{max\_pwm}, +\text{max\_pwm})$$
   $$\text{PWM}_{\text{right}} = \text{clamp}(\text{base\_pwm} - u(k), -\text{max\_pwm}, +\text{max\_pwm})$$

### 4.3 Kendali Mode Manual (`MANUAL`) & Differential Mixer

1. **Input Dua Jempol:** Menerima nilai `throttle` $\in [-100, 100]$ (maju/mundur) dan `steering` $\in [-100, 100]$ (belok kiri/kanan) secara independen maupun bersamaan.
2. **Rumus Differential Drive Mixer:**
   $$\text{raw\_left} = \text{clamp}(\text{throttle} + \text{steering}, -100, 100)$$
   $$\text{raw\_right} = \text{clamp}(\text{throttle} - \text{steering}, -100, 100)$$
3. **Skalasi Batas PWM:** Nilai $\text{raw\_left}$ dan $\text{raw\_right}$ dikalikan dengan persentase batas kecepatan dari slider UI (`pwm_limit` $\in [0, 100]$) sebelum dikonversi ke *duty cycle* LEDC PWM ESP32. Tanda negatif mengaktifkan logika arah mundur (`Reverse`) pada L298N.

### 4.4 Antarmuka Dashboard Web & Installable Standalone Web App (`web/`)

1. **Tata Letak Mobile-First (Landscape):**
   * Dioptimalkan untuk layar ponsel dalam orientasi mendatar (*landscape*) serta tetap responsif di layar laptop.
   * Mengunci perilaku *default* sentuhan browser (`touch-action: none; user-select: none; -webkit-user-select: none;`) pada area kontrol agar halaman tidak ikut tergulir (*scroll*) atau ter-zoom saat dimainkan dengan dua jempol.
2. **Kontrol Dua Jempol Simultan (`web/src/controls.ts`):**
   * **Zona Kiri (Throttle):** Kontrol vertikal atau tombol tahan atas/bawah untuk Maju (`+100`) dan Mundur (`-100`).
   * **Zona Kanan (Steering):** Kontrol horizontal atau tombol tahan kiri/kanan untuk Belok Kiri (`-100`) dan Belok Kanan (`+100`).
   * **Pointer Events Wajib:** Menggunakan `pointerdown`, `pointermove`, `pointerup`, dan `pointercancel` dengan pelacakan `pointerId` terpisah antara sisi kiri dan kanan. Saat `pointerup` atau `pointercancel` terpicu (jari diangkat atau tergeser keluar zona), hanya komponen sumbu tersebut yang langsung di-reset ke `0` dan dikirim ke robot.
3. **Panel Kontrol & Telemetri HUD:**
   * Pemilih mode: `STOP`, `AUTO`, `MANUAL` + tombol darurat **`STOP`** berukuran besar dan kontras tinggi.
   * *Slider* **Max PWM Speed (`0% - 100%`)** dengan tampilan angka persentase *real-time*.
   * Tombol sakelar **Lampu Depan (White LED)** dan **Lampu Belakang (Red LED)**.
   * Visualisasi 5 indikator sensor garis secara *live* (menunjukkan sensor mana yang mendeteksi garis hitam).
   * Indikator status koneksi WebSocket (`Connected` / `Disconnected`), arah gerak aktif, dan pembacaan tegangan baterai (Volt).
   * **Panel Tuning PID (Collapsible Drawer):** Input angka untuk mengubah nilai $K_p$, $K_i$, dan $K_d$ secara langsung lewat WebSocket agar memudahkan kalibrasi di lintasan tanpa perlu *flashing* ulang kode Rust.
4. **Installable Standalone Web App (Add to Home Screen tanpa HTTPS):**
   * Karena dashboard diakses via HTTP lokal (`http://192.168.4.1`) dan wajib dikemas menjadi **1 file tunggal (`index.html.gz`)**, aplikasi **tidak boleh** menggunakan file eksternal `/manifest.json`, `/icon.png`, maupun Service Worker (yang memerlukan HTTPS).
   * Sebagai gantinya, `web/index.html` wajib menanamkan Web App Manifest dan ikon SVG secara *inline* menggunakan **Data URI** di dalam `<head>` agar pengguna dapat menekan *"Add to Home Screen"* di Chrome Android maupun Safari iOS dan menjalankannya dalam mode *fullscreen landscape* layaknya aplikasi native:
   ```html
   <meta name="mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
   <meta name="apple-mobile-web-app-title" content="LF Controller" />
   <meta name="theme-color" content="#0f172a" />
   <link
     rel="icon"
     type="image/svg+xml"
     href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f172a'/%3E%3Ccircle cx='32' cy='32' r='16' fill='none' stroke='%2338bdf8' stroke-width='6'/%3E%3Ccircle cx='32' cy='32' r='5' fill='%23f43f5e'/%3E%3C/svg%3E"
   />
   <link
     rel="manifest"
     href='data:application/manifest+json,{"name":"ESP32 Line Follower","short_name":"LF Robot","start_url":"/","display":"fullscreen","orientation":"landscape","background_color":"#0f172a","theme_color":"#0f172a","icons":[{"src":"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2714%27 fill=%27%230f172a%27/%3E%3Ccircle cx=%2732%27 cy=%2732%27 r=%2716%27 fill=%27none%27 stroke=%27%2338bdf8%27 stroke-width=%276%27/%3E%3Ccircle cx=%2732%27 cy=%2732%27 r=%275%27 fill=%27%23f43f5e%27/%3E%3C/svg%3E","sizes":"any","type":"image/svg+xml"}]}'
   />
   ```

---

## 5. WebSocket Communication Protocol (JSON Schema)

Endpoint WebSocket tersedia di `ws://192.168.4.1/ws`. Seluruh pertukaran pesan menggunakan format JSON ringkas.

### 5.1 Pesan dari Klien (Browser -> ESP32)

```typescript
export type RobotMode = "STOP" | "AUTO" | "MANUAL";

export type ClientMessage =
  | { type: "mode"; mode: RobotMode }
  | { type: "stop" }
  | { type: "move"; throttle: number; steering: number } // range: -100..100, dikirim tiap ~100ms saat aktif
  | { type: "pwm_limit"; value: number }                // range: 0..100 (%)
  | { type: "led"; front: boolean; rear: boolean }
  | { type: "pid"; kp: number; ki: number; kd: number };
```

### 5.2 Pesan Telemetri dari Robot (ESP32 -> Browser)

Dikirim oleh firmware secara periodik setiap $150\text{--}200\text{ ms}$ ($5\text{--}6\text{ Hz}$) atau segera setelah terjadi perubahan state/mode.

```typescript
export interface TelemetryMessage {
  type: "telemetry";
  mode: RobotMode;
  pwm_limit: number;          // 0..100
  sensors: [number, number, number, number, number]; // 0 atau 1 untuk S1..S5
  line_error: number;         // -2.0 .. +2.0
  motor_left: number;         // PWM aktual (-100..100)
  motor_right: number;        // PWM aktual (-100..100)
  led_front: boolean;
  led_rear: boolean;
  battery_v: number;          // Tegangan baterai dalam Volt (misal: 7.85)
  pid: { kp: number; ki: number; kd: number };
}
```

---

## 6. Build & Configuration Contracts

### 6.1 Frontend Single-File & Gzip Contract (`web/`)

* **`web/vite.config.ts`:** Wajib mengaktifkan `viteSingleFile()` dari `vite-plugin-singlefile` agar tidak menghasilkan folder `dist/assets/`.
* **`web/scripts/compress.mjs`:** Menggunakan modul bawaan Node.js `node:zlib` (`gzipSync` dengan `level: 9`) untuk membaca `dist/index.html` dan menulis `dist/index.html.gz`.
* **`web/package.json`:** Script `"build": "tsc && vite build && node scripts/compress.mjs"`.

### 6.2 Firmware ESP-IDF Configuration (`firmware/`)

* **`firmware/sdkconfig.defaults`:** Wajib menyertakan flag berikut agar server HTTPd mendukung WebSocket dan SoftAP berjalan stabil:
  ```ini
  CONFIG_ESP_WIFI_SOFTAP_SUPPORT=y
  CONFIG_HTTPD_MAX_REQ_HDR_LEN=1024
  CONFIG_HTTPD_MAX_URI_LEN=512
  CONFIG_HTTPD_WS_SUPPORT=y
  ```
* **`firmware/Cargo.toml`:** Menggunakan `esp-idf-svc` (dengan fitur `binstart` atau `std` sesuai versi crate terbaru) dan `serde` + `serde_json` untuk serialisasi pesan JSON.

---

## 7. Non-Functional Requirements

1. **Konkurensi Non-Blocking:** Loop pembacaan sensor dan perhitungan PID harus berjalan pada *thread*/task terpisah dengan prioritas tinggi dan tidak boleh terblokir oleh koneksi HTTP maupun pengiriman paket WebSocket.
2. **Keamanan Wi-Fi Lokal:** ESP32 beroperasi sebagai Wi-Fi SoftAP (`SSID: Robot-LF-UMRI`, `Password: robot1234`, Channel 1, IP statis `192.168.4.1`).
3. **Ukuran Aset Minimalis:** Bundle hasil akhir `web/dist/index.html.gz` harus di bawah $50\text{ KB}$ agar hemat partisi flash dan termuat dalam waktu $< 200\text{ ms}$ di browser ponsel.
4. **Ketahanan Error JSON:** Parser JSON di sisi Rust (`serde_json`) harus menangani paket rusak atau tidak lengkap dengan aman tanpa memicu `panic!` pada firmware.

---

## 8. Implementation Milestones for Coding Agent

Saat mengimplementasikan proyek ini, eksekusi secara bertahap dengan urutan berikut:

1. **Tahap 1 — Scaffold & Frontend (`web/`):**
   * Inisialisasi proyek Vite + TypeScript + Tailwind CSS + `vite-plugin-singlefile`.
   * Tanamkan inline Data URI Web App Manifest dan meta tags *fullscreen landscape* di `web/index.html`.
   * Implementasi `types.ts`, `ws.ts` (dengan mekanisme *heartbeat* 100 ms dan *auto-reconnect*), `controls.ts` (multi-touch `PointerEvents` dengan `pointercancel`), serta antarmuka mobile-first di `main.ts`.
   * Tambahkan script kompresi Gzip (`npm run build`) dan pastikan file `web/dist/index.html.gz` berhasil terbentuk di bawah $50\text{ KB}$.
2. **Tahap 2 — Struktur Firmware & Modul Hardware (`firmware/`):**
   * Konfigurasi `Cargo.toml` (`esp-idf-svc`, `esp-idf-hal`, `serde`, `serde_json`, `anyhow`, `log`) dan `sdkconfig.defaults` (aktifkan `CONFIG_HTTPD_WS_SUPPORT=y`).
   * Implementasi `config.rs`, `motor.rs` (LEDC PWM + L298N direction logic + differential mixer), `sensor.rs` (5 GPIO digital + kalkulasi error), dan `pid.rs`.
3. **Tahap 3 — State Machine, Wi-Fi SoftAP & WebSocket Server (`firmware/`):**
   * Implementasi `state.rs` (thread-safe `Arc<Mutex<RobotState>>`, transisi mode lewat `STOP`, dan pengecekan *watchdog timeout* 400 ms).
   * Implementasi `server.rs` untuk menyalakan Wi-Fi AP `192.168.4.1`, menyajikan `INDEX_HTML_GZ` pada `GET /`, serta menangani koneksi dua arah pada `/ws`.
4. **Tahap 4 — Integrasi Loop Utama & Verifikasi Build (`firmware/src/main.rs`):**
   * Satukan loop kontrol $100\text{ Hz}$ dan task telemetri $5\text{ Hz}$ di `main.rs`, lalu verifikasi kompilasi bersih hingga siap di-flash ke ESP32.