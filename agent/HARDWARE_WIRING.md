# Hardware Wiring & Assembly Guide: ESP32 Dual-Mode Line Follower Robot

**Project Name:** `esp32-line-follower`

**Companion Documents:** `PRD.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DESIGN.md`

**Target Hardware:** ESP32 DevKit V1 (30-Pin) + Expansion Board + L298N + TCRT5000 (5-Ch) + 2x 18650 (2S)

**Audience:** Tim Perakitan Perangkat Keras & Referensi Konstanta Pin Firmware Rust

## 1. Daftar Material & Persiapan Modul (Bill of Materials)

Sebelum mulai menyolder atau memasang kabel *jumper*, pastikan seluruh komponen berikut tersedia dan telah diperiksa kondisinya:

| No. | Komponen | Jumlah | Spesifikasi & Catatan Persiapan |
| :--- | :--- | :---: | :--- |
| 1 | **ESP32 DevKit V1 (30-Pin)** | 1 | Terpasang kencang di atas soket ESP32 Expansion Board (perhatikan arah pin `VIN`/`GND` agar tidak terbalik). |
| 2 | **ESP32 30-Pin Expansion Board** | 1 | Menyediakan baris header daya `$5\text{ V}$` dan `$3.3\text{ V}$` di samping setiap pin GPIO. |
| 3 | **Modul Driver Motor L298N** | 1 | **Cabut jumper `ENA` dan `ENB`**. Pastikan **jumper `5V_EN` tetap terpasang**. |
| 4 | **Sensor Garis TCRT5000 5 Kanal** | 1 | Modul array 5 sensor IR dengan potensiometer pengatur sensitivitas dan keluaran digital (`OUT1..OUT5`). |
| 5 | **Motor DC Gearbox Kuning (TT)** | 2 | Tegangan kerja `$3\text{--}6\text{ V}$`, sudah disolder dengan kabel merah-hitam secukupnya. |
| 6 | **Chassis Akrilik 2WD + Roda + Ball Caster** | 1 set | Rangka utama tempat dudukan motor, *ball caster*, dan papan elektronik. |
| 7 | **Baterai Li-ion 18650 + Holder 2S** | 2 sel | Disusun seri (`2S`) menghasilkan tegangan nominal `$7.4\text{ V}$` dan penuh `$8.4\text{ V}$`. |
| 8 | **Sakelar Utama (Toggle/Rocker Switch)** | 1 | Memutus jalur positif utama dari baterai menuju driver motor. |
| 9 | **Kapasitor Elektrolit (Elko)** | 1 | Kapasitas `$470\text{ }\mu\text{F}$` atau `$1000\text{ }\mu\text{F}$` dengan rating tegangan minimal `$16\text{ V}$` (penahan *brownout*). |
| 10 | **LED Indikator + Resistor** | 4 set | 2 LED Putih (depan) + 2 LED Merah (belakang), masing-masing memakai resistor `$220\text{ }\Omega - 330\text{ }\Omega$`. |
| 11 | **Resistor Pembagi Tegangan (Opsional)** | 2 | `$R_1 = 20\text{ k}\Omega$` dan `$R_2 = 10\text{ k}\Omega$` untuk pembacaan tegangan baterai di `GPIO 34`. |
| 12 | **Kabel Jumper & Spacer Baut** | Secukupnya | Kabel *Female-to-Female* kualitas baik agar tidak mudah lepas saat robot bergetar. |

## 2. Topologi Kelistrikan & Distribusi Daya

### 2.1 Diagram Skematik Daya & Kapasitor Anti-Brownout

Driver L298N memiliki drop tegangan internal sekitar `$1.5\text{ V} - 2.0\text{ V}$`, sehingga tegangan `$7.4\text{ V} - 8.4\text{ V}$` dari baterai `2S` otomatis turun ke kisaran aman `$5.5\text{ V} - 6.5\text{ V}$` untuk motor DC TT. Sementara itu, regulator `$5\text{ V}$` onboard pada L298N dimanfaatkan untuk menyuplai ESP32 Expansion Board.

```text
[Baterai 2x 18650 Seri (7.4V - 8.4V)]
       |
       +--- (Kabel Hitam / -) -----------------------+-----------------------+
       |                                             |                       |
   [Sakelar Utama]                                   v                       v
       |                                      [L298N Terminal GND]    [Common GND Rail]
       +--- (Kabel Merah / +) ----------------> [L298N Terminal 12V]         |
                                                     |                       |
                                              (Jumper 5V_EN ON)              |
                                                     |                       |
                                              [L298N Terminal 5V]            |
                                                     |                       |
                                                     v                       v
                                           [Expansion Board 5V]    [Expansion Board GND]
                                                     |                       |
                                                     +--- [Elko 470-1000uF] -+
                                                           (+) Kaki Panjang -> 5V
                                                           (-) Garis Putih  -> GND
```

### 2.2 Aturan Pemasangan Kapasitor Elektrolit

* **Lokasi:** Tancapkan langsung pada salah satu pasangan pin header **`5V`** dan **`GND`** cadangan yang bersebelahan di ESP32 Expansion Board (gunakan soket *female* atau solder rapi).
* **Polaritas (Wajib Benar):**
  * **Kaki Panjang (`+`):** Masuk ke pin **`5V`**.
  * **Kaki Pendek dengan Garis Putih/Abu-abu (`-`):** Masuk ke pin **`GND`**.
* **Fungsi:** Meredam penurunan tegangan sesaat (*voltage dip*) ketika kedua motor DC menarik arus awal (*inrush current*) secara bersamaan sehingga ESP32 tidak mengalami *brownout reset* dan koneksi Wi-Fi tetap stabil.

## 3. Tabel Pengkabelan Lengkap (Pinout Mapping)

### 3.1 Driver Motor L298N $\rightarrow$ ESP32 Expansion Board

**Langkah Wajib Sebelum Memasang Kabel:**
1. **Cabut kedua jumper plastik hitam** yang menutup pin **`ENA`** dan **`ENB`** di board L298N.
2. Pastikan **jumper `5V_EN`** (di belakang terminal biru) tetap terpasang.

| Pin di Modul L298N | Pin di ESP32 Expansion | Tipe Sinyal | Fungsi Sistem |
| :--- | :--- | :--- | :--- |
| **`12V` (VMS)** | *Tidak ke ESP32* | Daya Input | Terhubung ke keluaran Sakelar Utama Baterai (`+7.4V - 8.4V`). |
| **`GND`** | **`GND`** | Ground | Terhubung ke kutub negatif baterai (`-`) **DAN** pin `GND` Expansion Board. |
| **`5V`** | **`5V` (atau `VIN`)** | Daya Output | Menyuplai daya `$5\text{ V}$` ke ESP32 Expansion Board *(lepas saat USB dicolok!)*. |
| **`ENA`** | **`GPIO 32` (`D32`)** | PWM Output | Mengatur kecepatan putar Motor Kiri (`LEDC Channel 0`). |
| **`IN1`** | **`GPIO 33` (`D33`)** | Digital Output | Kontrol arah 1 Motor Kiri. |
| **`IN2`** | **`GPIO 25` (`D25`)** | Digital Output | Kontrol arah 2 Motor Kiri. |
| **`IN3`** | **`GPIO 26` (`D26`)** | Digital Output | Kontrol arah 1 Motor Kanan. |
| **`IN4`** | **`GPIO 27` (`D27`)** | Digital Output | Kontrol arah 2 Motor Kanan. |
| **`ENB`** | **`GPIO 14` (`D14`)** | PWM Output | Mengatur kecepatan putar Motor Kanan (`LEDC Channel 1`). |

### 3.2 Terminal Output L298N $\rightarrow$ Motor DC Kiri & Kanan

| Terminal Hijau/Biru L298N | Koneksi ke Motor | Catatan Arah Putar |
| :--- | :--- | :--- |
| **`OUT1` & `OUT2`** | Motor DC **Kiri** | Jika saat perintah maju roda kiri justru berputar mundur, cukup tukar posisi kabel `OUT1` dan `OUT2`. |
| **`OUT3` & `OUT4`** | Motor DC **Kanan** | Jika saat perintah maju roda kanan justru berputar mundur, cukup tukar posisi kabel `OUT3` dan `OUT4`. |

### 3.3 Sensor Garis TCRT5000 5 Kanal $\rightarrow$ ESP32 Expansion Board

**Peringatan Tegangan:** Modul sensor TCRT5000 **wajib disuplai dari baris pin `3V3`** pada Expansion Board, **bukan `5V`**. Suplai `$3.3\text{ V}$` menjamin sinyal logika `HIGH` pada pin `OUT1..OUT5` berada di level `$3.3\text{ V}$` sehingga aman bagi pin GPIO ESP32.

| Pin di Modul TCRT5000 | Pin di ESP32 Expansion | Bobot Posisi PID | Posisi Fisik di Robot (Tampak Atas) |
| :--- | :--- | :---: | :--- |
| **`VCC`** | **`3V3`** | - | Suplai daya logika `$3.3\text{ V}$`. |
| **`GND`** | **`GND`** | - | Ground bersama. |
| **`OUT1` (atau `S1`)** | **`GPIO 16` (`RX2` / `D16`)** | `$w_0 = -2.0$` | Sensor paling **Kiri**. |
| **`OUT2` (atau `S2`)** | **`GPIO 17` (`TX2` / `D17`)** | `$w_1 = -1.0$` | Sensor Kiri Tengah. |
| **`OUT3` (atau `S3`)** | **`GPIO 18` (`D18`)** | `$w_2 = 0.0$` | Sensor **Tengah** (*Setpoint* garis lurus). |
| **`OUT4` (atau `S4`)** | **`GPIO 19` (`D19`)** | `$w_3 = +1.0$` | Sensor Kanan Tengah. |
| **`OUT5` (atau `S5`)** | **`GPIO 21` (`D21`)** | `$w_4 = +2.0$` | Sensor paling **Kanan**. |

### 3.4 Rangkaian Lampu Indikator (4 LED) $\rightarrow$ ESP32 Expansion Board

Setiap LED wajib dipasang seri dengan resistor pembatas arus (`$220\text{ }\Omega$` atau `$330\text{ }\Omega$`) agar arus total per pin GPIO tetap rendah (`$< 6\text{ mA}$` per kanal) dan LED tidak putus.

```text
[GPIO 22] ---> [Resistor 220-330 Ohm] ---> (+) LED Putih Kiri (-)  ---> [GND]
          \--> [Resistor 220-330 Ohm] ---> (+) LED Putih Kanan (-) ---> [GND]

[GPIO 23] ---> [Resistor 220-330 Ohm] ---> (+) LED Merah Kiri (-)  ---> [GND]
          \--> [Resistor 220-330 Ohm] ---> (+) LED Merah Kanan (-) ---> [GND]
```

| Grup Lampu | Pin ESP32 | Komponen | Penempatan Mekanik |
| :--- | :--- | :--- | :--- |
| **Lampu Depan** | **`GPIO 22` (`D22`)** | 2x LED Putih + 2x Resistor `$220\text{--}330\text{ }\Omega$` | Sisi depan kiri dan kanan chassis. |
| **Lampu Belakang** | **`GPIO 23` (`D23`)** | 2x LED Merah + 2x Resistor `$220\text{--}330\text{ }\Omega$` | Sisi belakang kiri dan kanan chassis. |

### 3.5 Rangkaian Pembagi Tegangan Baterai (Opsional — Monitoring Voltase)

Jika ingin menampilkan tegangan baterai aktual secara *real-time* di dashboard web, pasang dua resistor secara seri antara jalur positif baterai (setelah sakelar utama) dan `GND`:

```text
[Baterai + (7.4V - 8.4V)] ---> [R1 = 20 kOhm] ---+---> [ESP32 GPIO 34 (ADC1_CH6)]
                                                  |
                                           [R2 = 10 kOhm]
                                                  |
                                                [GND]
```

* **Perhitungan Keamanan Tegangan:** Pada kondisi baterai penuh `$8.4\text{ V}$`, tegangan yang masuk ke `GPIO 34` adalah:
  $$V_{\text{ADC}} = 8.4\text{ V} \times \frac{10\text{ k}\Omega}{20\text{ k}\Omega + 10\text{ k}\Omega} = 2.8\text{ V} < 3.3\text{ V}$$
* `GPIO 34` adalah pin *input-only* pada `ADC1` sehingga tidak bentrok dengan modul Wi-Fi ESP32.

## 4. Tata Letak Mekanik & Kalibrasi Fisik

1. **Posisi Sensor Garis (TCRT5000):**
   * Pasang menggunakan *spacer* mur-baut pada bagian paling depan chassis menghadap ke bawah.
   * Atur ketinggian sensor dari permukaan lantai di kisaran **`$1.0\text{ cm} - 1.5\text{ cm}$`** (tidak boleh menyentuh lantai agar tidak tersangkut saat melaju, namun tidak boleh terlalu tinggi agar pantulan inframerah tetap tajam).
   * **Kalibrasi Potensiometer:** Nyalakan daya logika `$3.3\text{ V}$`, letakkan sensor di atas lantai putih lalu putar trimpot biru pada modul TCRT5000 hingga LED indikator sensor tepat padam; geser ke atas isolasi hitam dan pastikan LED indikator sensor menyala terang.
2. **Pusat Massa (*Center of Gravity*):**
   * Letakkan *holder* baterai 2x 18650 sedekat mungkin di atas sumbu garis tengah antara kedua roda penggerak kiri dan kanan. Penempatan baterai yang terlalu jauh di ujung depan atau belakang dapat membuat *ball caster* terangkat atau selip saat berbelok tajam.
3. **Orientasi ESP32 pada Expansion Board:**
   * Pastikan port Micro-USB/USB-C pada ESP32 DevKit V1 mengarah keluar chassis agar mudah dicolok ke laptop saat proses *flashing* dan kalibrasi PID tanpa harus membongkar baut.

## 5. Checklist Keselamatan Wajib (Pre-Power & Flashing Protocol)

Tim perangkat keras maupun pemrogram **wajib** mematuhi aturan keselamatan berikut untuk mencegah kerusakan permanen pada ESP32 atau baterai Li-ion:

1. **Pantangan Utama Saat Flashing USB (Wajib Cabut Jalur `5V` L298N):**
   * Sebelum mencolokkan kabel USB dari laptop ke ESP32 untuk mengunggah *firmware*, **matikan sakelar baterai DAN cabut kabel jumper yang menghubungkan terminal `5V` L298N ke pin `5V` Expansion Board**. Hal ini mencegah bentrokan arus antara regulator L298N dan port USB laptop.
2. **Inspeksi Multimeter Sebelum Menyalakan Sakelar Pertama Kali:**
   * Lepaskan dulu board ESP32 dari Expansion Board (atau cabut kabel `5V` ke Expansion Board).
   * Nyalakan sakelar baterai, lalu ukur tegangan antara terminal `5V` dan `GND` pada L298N menggunakan multimeter. Pastikan terbaca **`$4.9\text{ V} - 5.1\text{ V}$`** sebelum dihubungkan ke ESP32.
3. **Periksa Polaritas Kapasitor Elektrolit:**
   * Pastikan kaki dengan tanda garis putih (`-`) berada di pin `GND` dan kaki panjang (`+`) berada di pin `5V`. Pemasangan terbalik dapat menyebabkan kapasitor panas dan pecah.
4. **Pengisian Daya Baterai 18650:**
   * Karena menggunakan *holder* baterai standar tanpa modul pengisi daya terintegrasi, **lepas kedua sel baterai 18650 dari holder** dan isi ulang menggunakan *charger* eksternal khusus baterai Li-ion 18650. Jangan pernah mencoba mengisi baterai melalui port USB ESP32.