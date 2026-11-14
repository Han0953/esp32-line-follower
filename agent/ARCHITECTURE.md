# System Architecture Document: ESP32 Dual-Mode Line Follower Robot

**Project Name:** `esp32-line-follower`  
**Companion Document:** `PRD.md`  
**Target Hardware:** ESP32 DevKit V1 (30-Pin) + Expansion Board + L298N + TCRT5000 (5-Ch)  
**Firmware Architecture:** Rust (`std` on ESP-IDF, FreeRTOS multi-tasking, `esp-idf-svc`)  
**Frontend Architecture:** TypeScript + Vite (`vite-plugin-singlefile` + Gzip) + Installable Web App  

---

## 1. System Context & High-Level Topology

Sistem `esp32-line-follower` dirancang dengan arsitektur **Embedded Edge Server & Real-Time Control Loop**. ESP32 berperan ganda sebagai pengendali motor deterministik (*hard/soft real-time*) sekaligus titik akses jaringan lokal (*Wi-Fi SoftAP*) dan *WebSocket server* yang menyajikan antarmuka web mandiri ke browser ponsel atau laptop tanpa ketergantungan internet.

```text
+-----------------------------------------------------------------------------------+
|                        CLIENT DEVICE (Smartphone / Laptop)                        |
|  +-----------------------------------------------------------------------------+  |
|  |         Standalone Web App (Fullscreen Landscape via Add to Home Screen)    |  |
|  |  +------------------------+   +-------------------+   +------------------+  |  |
|  |  | Dual-Thumb Controller  |   | HUD & PID Tuner   |   | WebSocket Client |  |  |
|  |  | (PointerEvents 100ms)  |-->| (Mode/PWM/LED/PID)|-->| (Auto-Reconnect) |  |  |
|  |  +------------------------+   +-------------------+   +--------+---------+  |  |
|  +----------------------------------------------------------------|------------+  |
+-------------------------------------------------------------------|---------------+
                                                                    |
                                         Wi-Fi 802.11 b/g/n (SoftAP: 192.168.4.1)
                                         HTTP GET / (Gzip) & WS ws://192.168.4.1/ws
                                                                    |
+-------------------------------------------------------------------|---------------+
|                       ESP32 DEVKIT V1 (Dual-Core Xtensa LX6)                      |
|  +-----------------------------------------------------------------------------+  |
|  |                     FIRMWARE RUST (esp-idf-svc / FreeRTOS)                  |  |
|  |                                                                             |  |
|  |  +------------------------+     Arc<Mutex<RobotState>>    +--------------+  |  |
|  |  |   HTTP & WS Server     |<----------------------------->| Control Loop |  |  |
|  |  | - Serves index.html.gz |      (Non-blocking State)     |   (100 Hz)   |  |  |
|  |  | - Parses Client JSON   |                               | - Sensor Read|  |  |
|  |  +-----------+------------+                               | - Watchdog   |  |  |
|  |              |                                            | - PID / Mixer|  |  |
|  |              v                                            +------+-------+  |  |
|  |  +------------------------+                                      |          |  |
|  |  | Telemetry Broadcaster  |                                      |          |  |
|  |  |     Task (5 Hz)        |                                      |          |  |
|  |  +------------------------+                                      |          |  |
|  +------------------------------------------------------------------|----------+  |
|                                                                     |             |
|       +-------------------------+-----------------------+-----------|             |
|       | Digital In (3.3V)       | Digital Out (3.3V)    | LEDC PWM + Dir          |
+-------|-------------------------|-----------------------|-------------------------+
        v                         v                       v
+---------------+        +-----------------+     +----------------------------------+
| TCRT5000 5-Ch |        | 4x Indicator    |     | L298N Dual H-Bridge Driver       |
| Line Sensor   |        | LEDs (F/R)      |     | (ENA/ENB Jumpers Removed)        |
+---------------+        +-----------------+     +----------------+-----------------+
                                                                  |
                                                 +----------------+----------------+
                                                 v                                 v
                                        +-----------------+               +-----------------+
                                        | Left TT Motor   |               | Right TT Motor  |
                                        +-----------------+               +-----------------+
```

---

## 2. Hardware & Electrical Architecture

### 2.1 Power Distribution & Brownout Mitigation

Untuk menekan biaya tanpa mengorbankan kestabilan mikrokontroler, arsitektur daya memanfaatkan regulator linear $5\text{ V}$ bawaan modul L298N yang dikombinasikan dengan kapasitor penyangga (*bulk decoupling capacitor*) pada ESP32 Expansion Board.

```text
[2x Li-ion 18650 (2S: 7.4V - 8.4V)]
        |
   [Main Switch]
        |
        +-------------------------------+
        | (Raw 7.4V - 8.4V)             | (Optional Voltage Divider: R1=20k, R2=10k)
        v                               v
[L298N Terminal 12V (VMS)]      [ESP32 GPIO 34 (ADC1_CH6, Max 2.8V)]
        |
        +---> [Internal H-Bridge] ---> Motor Out A/B (~5.5V - 6.5V after BJT drop)
        |
        +---> [Jumper 5V_EN ON] ---> [L298N 5V Regulator]
                                            |
                                            v (Regulated 5V)
                              [Expansion Board 5V & GND]
                                            |
                    +-----------------------+-----------------------+
                    |                                               |
                    v                                               v
      [Bulk Capacitor 470uF-1000uF 16V]              [ESP32 AMS1117 3.3V LDO]
         (Prevents Motor Inrush Drop)                               |
                                                                    v (Clean 3.3V)
                                                     [TCRT5000 VCC & ESP32 Core]
```

* **Isolasi Domain Logika $3.3\text{ V}$:** Modul sensor TCRT5000 wajib disuplai dari pin `3V3` Expansion Board sehingga keluaran komparator (`OUT1..OUT5`) dibatasi pada level $3.3\text{ V}$ dan aman bagi pin GPIO ESP32.
* **Prosedur Flashing Aman:** Saat kabel USB dihubungkan ke ESP32 untuk *flashing* maupun pemantauan *serial log*, jalur `5V` dari L298N wajib diputus (atau sakelar baterai dimatikan) guna mencegah arus balik ke port USB komputer.

### 2.2 Peripheral & LEDC Timer Allocation

Driver motor L298N dikendalikan menggunakan peripheral **LEDC (LED Control PWM)** pada ESP32 dengan konfigurasi timer bersama agar frekuensi kedua motor identik:

* **LEDC Timer:** `Timer 0`, Frekuensi $= 2\text{ kHz}$ (optimal untuk motor DC gearbox TT agar minim dengung namun torsi awal tetap kuat), Resolusi $= 10\text{-bit}$ (rentang *duty cycle* $0 \dots 1023$).
* **LEDC Channels:**
  * `Channel 0` $\rightarrow$ `GPIO 32` (`ENA` - Motor Kiri).
  * `Channel 1` $\rightarrow$ `GPIO 14` (`ENB` - Motor Kanan).
* **GPIO Mapping Summary:**
  * **Motor Kiri:** `ENA=GPIO 32`, `IN1=GPIO 33`, `IN2=GPIO 25`
  * **Motor Kanan:** `IN3=GPIO 26`, `IN4=GPIO 27`, `ENB=GPIO 14`
  * **Sensor Garis (`S1..S5`):** `GPIO 16, 17, 18, 19, 21` (Digital Input)
  * **Lampu Indikator:** `Front=GPIO 22`, `Rear=GPIO 23` (Digital Output)
  * **Battery Sense:** `GPIO 34` (`ADC1_CH6`)

---

## 3. Firmware Architecture (`firmware/` - Rust ESP-IDF)

### 3.1 Concurrency & Threading Model

Sistem operasi waktu nyata (FreeRTOS) di bawah `esp-idf-svc` menjalankan tiga konteks eksekusi utama yang berkomunikasi melalui *shared state* ringan (`Arc<Mutex<RobotState>>`):

1. **Control Loop Task (`main` thread, $100\text{ Hz}$ / periode $\Delta t = 10\text{ ms}$):**
   * Memiliki prioritas eksekusi tertinggi dan bersifat deterministik.
   * Siklus setiap $10\text{ ms}$:
     1. Kunci `RobotState` secara singkat (*critical section* $< 50\text{ }\mu\text{s}$), salin parameter aktif (`mode`, `pwm_limit`, `pid_params`, `manual_cmd`, `last_cmd_ts`), lalu segera lepas kunci.
     2. Baca sensor TCRT5000 (atau baca tegangan baterai tiap 20 siklus / $200\text{ ms}$).
     3. Evaluasi kondisi keamanan (*watchdog timeout* $400\text{ ms}$ pada mode `MANUAL`).
     4. Hitung output PWM motor (algoritma PID untuk `AUTO`, *differential mixer* untuk `MANUAL`, atau $0$ untuk `STOP`).
     5. Terapkan sinyal PWM dan arah ke driver L298N serta status LED ke GPIO.
     6. Perbarui nilai telemetri terkini (`sensors`, `line_error`, `motor_left`, `motor_right`, `battery_v`) ke dalam `RobotState`.
     7. Tidur presisi menggunakan `FreeRtos::delay_ms(10)` (atau penjadwalan berbasis `Instant::now()`).
2. **HTTP & WebSocket Server Task (Managed by `EspHttpServer`):**
   * Berjalan secara asinkron menangani permintaan `GET /` (mengirimkan slice statis `INDEX_HTML_GZ`) dan koneksi masuk pada `/ws`.
   * Setiap kali pesan JSON valid diterima di `/ws`, *handler* mengunci `RobotState`, memperbarui state (serta memperbarui `last_cmd_timestamp` jika menerima pesan `move`), lalu melepas kunci.
3. **Telemetry Broadcaster Task (Spawned `std::thread`, $5\text{ Hz}$ / periode $200\text{ ms}$):**
   * Membaca *snapshot* `RobotState`, melakukan serialisasi ke string JSON `TelemetryMessage`, dan mengirimkannya ke seluruh sesi WebSocket aktif yang terdaftar di `WsSessionRegistry`.

### 3.2 Module Dependency Graph

```text
                    +-------------------+
                    |     config.rs     |  <-- Konstanta Pin, SSID, Default PID, Timeout
                    +---------+---------+
                              |
       +----------------------+----------------------+
       |                      |                      |
       v                      v                      v
+--------------+      +---------------+      +---------------+
|  sensor.rs   |      |   motor.rs    |      |    pid.rs     |
| - 5x GPIO In |      | - LEDC PWM    |      | - Discrete PID|
| - Line Error |      | - L298N Logic |      | - Anti-windup |
+------+-------+      | - Diff Mixer  |      +-------+-------+
       |              +-------+-------+              |
       |                      |                      |
       +----------------------+----------------------+
                              |
                              v
                    +-------------------+
                    |     state.rs      |  <-- State Machine, Watchdog, Thread-safe State
                    +---------+---------+
                              |
              +---------------+---------------+
              |                               |
              v                               v
    +-------------------+           +-------------------+
    |     server.rs     |           |      main.rs      |
    | - Wi-Fi SoftAP    |           | - HW Init         |
    | - HTTP Gzip Route |           | - 100Hz Ctrl Loop |
    | - WS Handler/Reg  |           | - 5Hz Telemetry   |
    +-------------------+           +-------------------+
```

### 3.3 State Machine & Safety Transitions (`state.rs`)

Transisi antar-mode dikontrol ketat oleh `RobotState::set_mode(new_mode)` agar tidak pernah terjadi lonjakan kecepatan mendadak saat perpindahan mode:

```text
                       +-------------------+
          [BOOT] ----> |       STOP        | <----+
                       | (PWM=0, PID Reset)|      |
                       +---+-----------+---+      |
                           |           |          |
         cmd: mode(AUTO)   |           |   cmd: mode(MANUAL)
                           v           v          |
               +---------------+   +---------------+
               |     AUTO      |   |    MANUAL     |
               | (PID Control) |   | (WS Joystick) |
               +-------+-------+   +-------+-------+
                       |                   |
                       |   Any Mode Change |
                       |   or cmd: stop    |
                       |   or WS Timeout   |
                       +-------------------+
```

* **Aturan Wajib Transisi:** Jika sistem sedang berada di `AUTO` dan pengguna menekan `MANUAL` di dashboard (atau sebaliknya), metode `set_mode` wajib memaksa status melalui `STOP` terlebih dahulu (mengatur `motor_left = 0`, `motor_right = 0`, `throttle = 0`, `steering = 0`, dan `pid.reset()`) sebelum mengaktifkan mode baru.

### 3.4 Control Pipeline Mathematics (`sensor.rs`, `pid.rs`, `motor.rs`)

1. **Sensor Weighting (`sensor.rs`):**
   * Pembacaan biner $s_i \in \{0, 1\}$ untuk $i \in \{0, 1, 2, 3, 4\}$ dengan bobot $w = [-2.0, -1.0, 0.0, +1.0, +2.0]$.
   * Jika $\sum_{i=0}^4 s_i > 0$:
     $$e(k) = \frac{\sum_{i=0}^{4} w_i \cdot s_i}{\sum_{i=0}^{4} s_i}$$
     dan simpan `last_valid_error = e(k)`.
   * Jika $\sum_{i=0}^4 s_i = 0$ (garis tidak terdeteksi): gunakan `last_valid_error` untuk pencarian konservatif hingga batas durasi $800\text{ ms}$, setelah itu paksa output motor menjadi $0$.

2. **Discrete PID Controller (`pid.rs`):**
   * Dengan $\Delta t = 0.01\text{ s}$:
     $$P(k) = K_p \cdot e(k)$$
     $$I(k) = \text{clamp}\left(I(k-1) + e(k) \cdot \Delta t,\ -I_{\max},\ +I_{\max}\right)$$
     $$D(k) = K_d \cdot \frac{e(k) - e(k-1)}{\Delta t}$$
     $$u(k) = P(k) + K_i \cdot I(k) + D(k)$$
   * Nilai PWM motor ternormalisasi ($[-100.0, +100.0]$):
     $$\text{left} = \text{clamp}(\text{pwm\_limit} + u(k),\ -\text{pwm\_limit},\ +\text{pwm\_limit})$$
     $$\text{right} = \text{clamp}(\text{pwm\_limit} - u(k),\ -\text{pwm\_limit},\ +\text{pwm\_limit})$$

3. **Manual Differential Mixer (`motor.rs`):**
   * Input `throttle` $\in [-100, 100]$ dan `steering` $\in [-100, 100]$:
     $$\text{raw\_left} = \text{clamp}(\text{throttle} + \text{steering},\ -100,\ 100)$$
     $$\text{raw\_right} = \text{clamp}(\text{throttle} - \text{steering},\ -100,\ 100)$$
     $$\text{left} = \text{raw\_left} \times \frac{\text{pwm\_limit}}{100.0}, \quad \text{right} = \text{raw\_right} \times \frac{\text{pwm\_limit}}{100.0}$$

---

## 4. Frontend Architecture (`web/` - TypeScript & Vite)

### 4.1 Single-File & Standalone Web App Build Pipeline

Untuk menghindari kegagalan *socket* pada server HTTP kecil ESP32 dan memungkinkan instalasi ke *Home Screen* ponsel tanpa HTTPS, seluruh aset web dikompilasi menjadi satu berkas terkompresi:

```text
[web/index.html] (Inline Data URI Manifest + Meta Tags + SVG Icon)
       +
[web/src/*.ts & style.css]
       |
       v  (npm run build -> vite + vite-plugin-singlefile)
[web/dist/index.html] (All JS & CSS inlined inside <script> and <style>)
       |
       v  (node scripts/compress.mjs -> zlib.gzipSync level 9)
[web/dist/index.html.gz] (< 50 KB single binary payload)
       |
       v  (cargo build -> include_bytes!("../../web/dist/index.html.gz"))
[ESP32 Flash .rodata section]
```

### 4.2 Frontend Module Responsibilities

* **`web/src/types.ts`:** Kontrak tipe statis TypeScript untuk `RobotMode`, `ClientMessage`, dan `TelemetryMessage` yang identik dengan struktur `serde` di Rust.
* **`web/src/ws.ts` (`RobotSocket`):**
  * Mengelola siklus hidup koneksi `ws://${window.location.host}/ws` dengan *exponential/fixed backoff auto-reconnect* ($1000\text{ ms}$) apabila koneksi terputus.
  * Mengirimkan paket `{ type: "move", throttle, steering }` segera setiap kali nilai kontrol berubah **serta** menjaga *heartbeat interval* setiap $100\text{ ms}$ selama nilai `throttle !== 0 || steering !== 0` agar tidak memicu *watchdog timeout* $400\text{ ms}$ di ESP32.
* **`web/src/controls.ts` (`DualThumbController`):**
  * Mengikat `PointerEvents` (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `lostpointercapture`) secara independen untuk **Zona Kiri (Throttle)** dan **Zona Kanan (Steering)**.
  * Menggunakan `element.setPointerCapture(e.pointerId)` saat `pointerdown` agar pergerakan jari tetap terlacak mulus meskipun sedikit keluar dari batas visual tombol, dan otomatis mereset sumbu terkait ke `0` saat `pointerup` atau `pointercancel` terjadi.
* **`web/src/main.ts`:**
  * Menginisialisasi antarmuka *mobile-first landscape*, mengikat event tombol mode (`STOP`, `AUTO`, `MANUAL`), tombol darurat `STOP`, *slider* `pwm_limit`, sakelar LED depan/belakang, panel *collapsible* tuning PID ($K_p, K_i, K_d$), dan memperbarui elemen DOM telemetri (5 indikator sensor, tegangan baterai, status koneksi) secara efisien tanpa *re-render* seluruh halaman.

---

## 5. Network & WebSocket Session Architecture

### 5.1 Wi-Fi SoftAP Configuration

* **Mode:** `WifiConfiguration::AccessPoint`
* **SSID:** `ESP32-Robot-LF`
* **Password:** `robot1234` (`AuthMethod::WPA2Personal`)
* **Channel:** `1` (menghindari interferensi kanal tinggi)
* **Max Connections:** `4` klien simultan
* **IP Gateway / Subnet:** `192.168.4.1 / 24` (DHCP server aktif otomatis untuk klien)

### 5.2 Active WebSocket Session Registry (`server.rs`)

Karena `EspHttpServer` menangani koneksi WebSocket berbasis *event callback* (`ws_handler`), pengiriman telemetri periodik dari *thread* terpisah membutuhkan mekanisme penyimpanan sesi yang aman:

1. Saat klien berhasil melakukan *handshake* WebSocket (`ws.is_new()`), *handler* membuat detached sender (`ws.create_detached_sender()`) dan menyimpannya ke dalam `Arc<Mutex<Vec<EspHttpWsDetachedSender>>>`.
2. Saat klien terputus (`ws.is_closed()`) atau pengiriman telemetri mengembalikan `Err(_)`, sesi tersebut segera dihapus dari daftar (*pruning*) agar tidak terjadi kebocoran memori (*memory leak*).

### 5.3 Serial Monitor Diagnostics (`115200 bps`)

Untuk mempermudah *debugging* tanpa membebani loop kontrol $100\text{ Hz}$, firmware menggunakan `EspLogger` dengan log berbasis *edge-triggered* (hanya dicetak saat terjadi perubahan status/event):

- **`[BOOT]`**: Status inisialisasi firmware serta pemetaan aktif pin GPIO Motor, Sensor IR, LED, dan Battery ADC.
- **`[NET]` & `[WIFI]`**: IP gateway SoftAP (`192.168.4.1`), subnet, kanal Wi-Fi, MAC ESP32, serta event koneksi/diskoneksi perangkat station (`MAC`, `AID`, `IP DHCP`, dan total perangkat terhubung). Bila semua perangkat Wi-Fi terputus, sistem memicu `force_stop`.
- **`[WS]`**: Penambahan dan pembersihan ID sesi WebSocket aktif serta peringatan JSON tidak valid.
- **`[GERAK]`**: Status arah robot (`BERHENTI`, `MAJU`, `MUNDUR`, `BELOK KIRI/KANAN`, `MAJU/MUNDUR + BELOK`) beserta persentase PWM motor kiri/kanan.
- **`[MODE]`, `[LED]`, `[CFG]`, `[PID]`, `[SAFE]`, `[SENSOR]`**: Perubahan mode (`STOP`/`MANUAL`/`AUTO`/`LINE_LOST`), status Lampu Depan & Belakang (`HIDUP`/`MATI`), perubahan batas PWM, pembaruan $K_p/K_i/K_d$, *watchdog timeout* $400\text{ ms}$, dan garis hilang $> 800\text{ ms}$.

> **Catatan Build Windows (`firmware/.cargo/config.toml`):** Karena keterbatasan panjang path `OUT_DIR` ($\le 88$ karakter) pada `esp-idf-sys` Windows serta keterbatasan ruang partisi `D:`, `.cargo/config.toml` mengarahkan `target-dir = "C:\\ef-t"` dan `ESP_IDF_TOOLS_INSTALL_DIR = "custom:C:\\espidf"`.

---

## 6. Memory, Flash & Latency Budget

| Resource / Metric | Budget / Target | Architectural Enforcement |
| :--- | :--- | :--- |
| **ESP32 Flash Partition** | $4\text{ MB}$ total ($\approx 1.5\text{ MB}$ App) | Tabel partisi standar ESP-IDF; aset web terkompresi di `.rodata` |
| **Web Asset Size (`index.html.gz`)** | $< 50\text{ KB}$ (Target $15\text{--}30\text{ KB}$) | Tanpa framework berat; murni Vanilla TS + Tailwind CSS + Gzip level 9 |
| **Control Loop Period ($\Delta t$)** | $10\text{ ms}$ ($100\text{ Hz}$) | Loop kontrol terpisah dari I/O jaringan; *mutex lock* sangat singkat |
| **Manual Command Heartbeat** | $100\text{ ms}$ ($10\text{ Hz}$) | Timer periodik di `ws.ts` selama kontrol sentuh aktif |
| **Fail-Safe Watchdog Timeout** | $400\text{ ms}$ | Pengecekan selisih `Instant` di setiap siklus kontrol $100\text{ Hz}$ |
| **Telemetry Broadcast Rate** | $200\text{ ms}$ ($5\text{ Hz}$) | *Background thread* terpisah agar tidak membebani *bandwidth* Wi-Fi |

---

## 7. Error Handling & Edge-Case Matrix

| Skenario / Edge Case | Perilaku Sistem yang Diharapkan | Modul Penanggung Jawab |
| :--- | :--- | :--- |
| **Wi-Fi putus atau browser ditutup saat mode `MANUAL`** | Tidak ada paket `move` masuk selama $> 400\text{ ms}$; firmware otomatis menghentikan motor (`PWM = 0`). | `firmware/src/state.rs` |
| **Jari pengguna tergeser keluar layar HP saat menekan kontrol** | Event `pointercancel` atau `lostpointercapture` terpicu; sumbu kontrol langsung di-reset ke `0` dan dikirim ke robot. | `web/src/controls.ts` |
| **Baterai ngedrop sesaat ketika motor mulai berputar** | Kapasitor $470\text{--}1000\text{ }\mu\text{F}$ menahan tegangan $5\text{ V}$ Expansion Board sehingga ESP32 tidak mengalami *brownout reset*. | Hardware Power Rail |
| **Semua sensor membaca lantai putih (garis hilang)** | Robot berputar pelan mencari garis berdasarkan tanda `last_valid_error` selama maks $800\text{ ms}$, lalu berhenti aman. | `firmware/src/sensor.rs` |
| **Klien mengirim JSON rusak atau field tidak lengkap** | `serde_json::from_str` mengembalikan `Err`, dicatat via `log::warn!`, dan diabaikan tanpa `panic!`. | `firmware/src/server.rs` |
| **Perpindahan langsung dari `AUTO` ke `MANUAL`** | Sistem wajib memaksa state melalui `STOP`, mereset integral PID, dan menunggu perintah baru. | `firmware/src/state.rs` |