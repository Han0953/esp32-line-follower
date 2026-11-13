# ESP32 Dual-Mode Line Follower (`esp32-line-follower`)

Purwarupa robot beroda dua (*2WD differential drive*) berbasis **ESP32** dengan dua mode operasi:
- **AUTO:** Mengikuti lintasan garis hitam menggunakan array sensor IR TCRT5000 5-kanal dan kendali PID diskrit ($100\text{ Hz}$).
- **MANUAL:** Kendali *real-time* dari browser ponsel/laptop melalui Wi-Fi SoftAP lokal (`192.168.4.1`) dan WebSocket (*dual-thumb touch controller*).

## Struktur Proyek

```text
esp32-line-follower/
├── agent/       # Spesifikasi teknis, arsitektur, desain, wiring, & roadmap
├── firmware/    # Firmware Rust (esp-idf-svc, FreeRTOS, Wi-Fi SoftAP, HTTP/WS)
└── web/         # Dashboard kontrol TypeScript + Vite (singlefile + gzip < 50 KB)
```

## Tech Stack

- **Mikrokontroler:** ESP32 DevKit V1 / ESP32U + 30-Pin Expansion Board
- **Driver & Sensor:** L298N Dual H-Bridge + TCRT5000 5-Channel IR Array
- **Firmware:** Rust (`xtensa-esp32-espidf`, `esp-idf-svc`, `serde_json`)
- **Frontend:** Vanilla TypeScript, Vite (`vite-plugin-singlefile`), Tailwind CSS, Gzip

## Urutan Build

1. **Build Frontend (`web/`):**
   ```bash
   cd web
   npm install
   npm run build
   ```
   Menghasilkan `web/dist/index.html.gz` yang akan ditanam ke flash ESP32.

2. **Build & Flash Firmware (`firmware/`):**
   > Pastikan kabel jalur `5V` dari L298N ke Expansion Board dilepas sebelum mencolok kabel USB.
   ```bash
   cd firmware
   cargo build --release
   cargo espflash flash --release --monitor
   ```

## Dokumentasi Lengkap

Seluruh kontrak spesifikasi tersedia di folder [`agent/`](agent/):
- [`PRD.md`](agent/PRD.md) — Kebutuhan fungsional & skema JSON WebSocket
- [`ARCHITECTURE.md`](agent/ARCHITECTURE.md) — Topologi daya, FreeRTOS tasks, & *state machine*
- [`HARDWARE_WIRING.md`](agent/HARDWARE_WIRING.md) — Pinout GPIO & panduan perakitan
- [`DESIGN_SYSTEM.md`](agent/DESIGN_SYSTEM.md) — Sistem desain taktil dashboard
- [`TECH_STACK.md`](agent/TECH_STACK.md) — Pustaka & aturan dependensi
- [`TODO.md`](agent/TODO.md) — Roadmap eksekusi bertahap
