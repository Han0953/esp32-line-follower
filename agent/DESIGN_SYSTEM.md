# Design System Specification: ESP32 Dual-Mode Line Follower Dashboard

**Project Name:** `esp32-line-follower`

**Companion Documents:** `PRD.md`, `ARCHITECTURE.md`, `TECH_STACK.md`

**Design Direction:** Tactile Industrial Hardware Pendant (Terinspirasi dari kontroler fisik CNC, peralatan laboratorium *Braun/Dieter Rams*, dan perangkat keras *Teenage Engineering* — bukan template web SaaS generik).

## 1. Core Design Principles (Anti-AI Slop Mandate)

Antarmuka web ini berfungsi sebagai instrumen kendali perangkat keras *real-time* di layar ponsel (*landscape*) maupun laptop. *Coding agent* wajib mematuhi prinsip berikut:

1. **Zero AI Slop:** Dilarang keras menggunakan gradasi ungu-biru neon, latar belakang gelap berkilau tanpa fungsi, *blob* dekoratif, *glassmorphism* berlebihan, maupun tata letak kartu generik ala AI. Setiap piksel harus memiliki fungsi operasional yang jelas.

2. **Tactile & Non-Flat Physics:** Desain **tidak boleh rata (*flat*)**. Setiap tombol, *slider*, *dropdown*, dan panel indikator harus memiliki kedalaman fisik menggunakan kombinasi langkah elevasi permukaan, batas tepi (*border*) tegas $1\text{ px}$, pantulan tepi atas (*specular inner highlight*), serta bayangan jatuh (*drop shadow*) yang merespons saat disentuh (`:active` menekan ke dalam).

3. **Strict Landscape Orientation (Start-to-Finish):** Mulai dari halaman pembuka (*Start / Pre-Flight Screen*) hingga layar utama (*Control Cockpit*), seluruh tata letak dirancang **100% mendatar (*landscape*)** dan terkunci dalam satu layar penuh (`100vw` $\times$ `100dvh`) tanpa *vertical scrolling*.

4. **Zero Overlapping Elements (Anti-Tumpuk):** Semua zona kontrol jempol, telemetri, dan tombol aksi wajib dipisahkan menggunakan CSS Grid eksplisit dengan `gap` minimal $8\text{ px} - 12\text{ px}$. Tidak ada elemen mengambang (*floating*) yang menutupi area sentuh.

5. **Zero Emojis — 100% Geometric Inline SVG:** Dilarang keras menggunakan karakter emoji apa pun di dalam kode HTML/TS. Seluruh ikon wajib menggunakan SVG *inline* bergaya geometris presisi.

## 2. Color System & Strict Usage Rules

Palet warna menggunakan basis **Off-White** dan **Off-Black** yang nyaman di mata serta kontras tinggi di bawah cahaya ruangan kelas/laboratorium. **Warna aksen tidak boleh di-spam** — minimal $85\%$ area layar tetap netral monokromatik.

### 2.1 Neutral Surface & Ink Tokens

| Token Name | Hex / Value | Peran & Penggunaan | 
| ----- | ----- | ----- | 
| `--bg-chassis` | `#F3F2EE` | Latar belakang utama konsol (*Warm Alabaster / Studio Off-White*). **Dilarang menggunakan `#FFFFFF`.** | 
| `--surface-elevated` | `#FAF9F5` | Permukaan tombol fisik (*keycap*), panel kartu, dan *dropdown menu* (*Porcelain Off-White*). | 
| `--surface-recessed` | `#E5E3DC` | Jalur *track* slider, wadah indikator sensor, dan area tekan terbenam (*Machined Stone*). | 
| `--surface-hover` | `#ECEAE2` | Warna permukaan saat kursor diarahkan (`:hover`) pada tombol atau item *dropdown*. | 
| `--ink-primary` | `#16171A` | Teks utama, angka telemetri, ikon aktif, dan kontras utama (*Anodized Obsidian*). **Dilarang menggunakan `#000000`.** | 
| `--ink-secondary` | `#555760` | Label sekunder, satuan ukur (`V`, `%`, `Hz`), dan keterangan teknis (*Graphite Slate*). | 
| `--border-hairline` | `#CECCC3` | Garis pemisah struktural dan tepi luar komponen ($1\text{ px}$ solid). | 
| `--bevel-highlight` | `rgba(255, 255, 255, 0.75)` | Hanya digunakan sebagai `inset 0 1px 0` pada tepi atas tombol untuk efek dimensi 3D taktil. | 

### 2.2 Disciplined Semantic Accents (Dilarang Spam)

Warna pendukung hanya muncul ketika status aktif atau fungsi keselamatan membutuhkannya:

| Token Name | Hex Value | Aturan Penggunaan Ketat | 
| ----- | ----- | ----- | 
| `--accent-danger` | `#D9381E` | **Signal Vermilion:** Hanya untuk tombol darurat **`STOP`**, status `DISCONNECTED`, peringatan baterai rendah ($< 6.6\text{ V}$), dan garis hitam yang terdeteksi sensor. | 
| `--accent-active` | `#1E40AF` | **Technical Cobalt:** Hanya untuk indikator mode aktif (`AUTO` / `MANUAL`), isian bar kecepatan PWM, dan titik fokus kontrol arah yang sedang ditekan. | 
| `--accent-online` | `#15803D` | **Instrument Emerald:** Hanya untuk titik status `CONNECTED` dan indikator lampu LED robot saat menyala (`ON`). | 
| `--accent-amber` | `#D97706` | **Calibration Amber:** Hanya untuk penanda nilai *error* PID atau status pencarian garis (*Line Lost*). | 

## 3. Typography & Numeric Discipline

Karena aset web berjalan *offline* di ESP32 tanpa koneksi internet (tanpa Google Fonts CDN), tipografi mengandalkan *system grotesque* modern dan *monospace* dengan pengaturan lebar angka tetap agar tata letak tidak bergeser saat data telemetri berubah cepat ($5\text{ Hz}$).

* **Primary UI Font Stack:**
  `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;`

* **Telemetry & Numeric Font Stack:**
  `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;`
  Wajib menerapkan CSS **`font-variant-numeric: tabular-nums;`** pada seluruh pembacaan tegangan baterai, persentase PWM, nilai `line_error`, dan parameter $K_p, K_i, K_d$.

### 3.1 Type Scale (Dioptimalkan untuk Layar Landscape)

| Elemen UI | Ukuran Font | Weight | Letter Spacing | Gaya Teks | 
| ----- | ----- | ----- | ----- | ----- | 
| **Judul Layar Awal (*Start Title*)** | `1.25rem` ($20\text{ px}$) | `700` (Bold) | `-0.02em` | Uppercase / Title Case | 
| **Header Konsol / Nama Robot** | `0.875rem` ($14\text{ px}$) | `700` (Bold) | `0.04em` | Uppercase (`ROBOT-LF // 2WD`) | 
| **Angka Telemetri Utama** | `1.125rem` ($18\text{ px}$) | `700` (Bold) | `0em` | Monospace `tabular-nums` | 
| **Label Tombol Kontrol** | `0.8125rem` ($13\text{ px}$) | `600` (SemiBold) | `0.03em` | Uppercase | 
| **Label Mikro / Parameter** | `0.6875rem` ($11\text{ px}$) | `600` (SemiBold) | `0.06em` | Uppercase (`THROTTLE`, `STEERING`, `PWM`) | 

## 4. Landscape-First Spatial Architecture (Anti-Overlap Layout)

Seluruh pengalaman pengguna dimulai dan beroperasi dalam orientasi **Landscape (`100vw`** $\times$ **`100dvh`, `overflow: hidden`)**.

### 4.1 Portrait Orientation Guard (Jika Ponsel Dipegang Vertikal)

Jika perangkat terdeteksi dalam mode *portrait* (`@media (orientation: portrait)`), tampilkan layar overlay penuh berlatar `#F3F2EE` dengan ikon vektor rotasi ponsel dan instruksi tegas: **"Putar Perangkat ke Mode Landscape untuk Membuka Konsol Kendali"**. Ini mencegah tata letak berantakan atau bertumpukan di layar sempit vertikal.

### 4.2 View 1: Halaman Mulai / Pre-Flight Gate (Landscape)

Halaman awal yang muncul saat pengguna pertama kali membuka `http://192.168.4.1` (atau membuka aplikasi dari *Home Screen*):

* **Struktur Grid:** 2 kolom asimetris (`grid-template-columns: 1.15fr 0.85fr`, `padding: 20px`, `gap: 20px`) di dalam bingkai konsol `#F3F2EE`.

* **Kolom Kiri (System Identity & Readiness):**

  * Badge identifikasi perangkat: `ESP32-2WD // DUAL-MODE CONTROLLER`.

  * Judul utama dan deskripsi singkat sistem.

  * Kotak status kesiapan perangkat keras (*recessed panel* `#E5E3DC`) berisi 3 baris status dengan ikon SVG:

    1. **WebSocket Link:** Status koneksi ke `192.168.4.1/ws` (`CONNECTED` / `CONNECTING...`).

    2. **Safety Boot State:** Terkunci di mode `STOP` ($0\%\text{ PWM}$).

    3. **Power Telemetry:** Pembacaan tegangan baterai saat ini (`--.- V`).

* **Kolom Kanan (Action Launch Deck):**

  * Pilihan mode awal (*segmented switch* taktil): `MANUAL` atau `AUTO` (default tetap masuk ke dashboard dalam keadaan `STOP` aman, atau langsung menyorot mode pilihan).

  * Tombol utama berukuran besar berbentuk *hardware switch*: **"MASUK KE DASHBOARD KONTROL"** dengan ikon panah kanan SVG, efek *bevel* 3D, dan transisi halus menuju View 2.

### 4.3 View 2: Dashboard Kontrol Utama (Landscape Cockpit)

Tata letak dashboard menggunakan **2 Baris** $\times$ **3 Kolom CSS Grid** dengan jarak antar-zona (`gap: 10px`, `padding: 10px`) sehingga mustahil terjadi tumpang tindih (*overlapping*):

```
+---------------------------------------------------------------------------------------------------+
| [TOP HUD BAR - Height: 48px, Grid 3 Bagian dengan Gap]                                            |
| (Kiri) Status WS + Tegangan Baterai | (Tengah) Mode Switch [STOP | AUTO | MANUAL] | (Kanan) STOP! |
+---------------------------------------------------------------------------------------------------+
| [ZONA KIRI: 27%]               | [ZONA TENGAH: 46%]                        | [ZONA KANAN: 27%]    |
|                                |                                           |                      |
|  KONTROL THROTTLE              |  1. VISUALIZER SENSOR 5-KANAL (S1..S5)    |  KONTROL STEERING    |
|  +--------------------------+  |     +-----+ +-----+ +-----+ +-----+ +---+ |  +----------------+  |
|  |       MAJU (+100)        |  |     | S1  | | S2  | | S3  | | S4  | |S5 | |  |  KIRI  | KANAN  |  |
|  |         [ICON]           |  |     +-----+ +-----+ +-----+ +-----+ +---+ |  | (-100) | (+100) |  |
|  +--------------------------+  |     Error: 0.00 | Motor L/R: 0% / 0%      |  | [ICON] | [ICON] |  |
|  |      MUNDUR (-100)       |  |                                           |  +----------------+  |
|  |         [ICON]           |  |  2. SLIDER BATAS SPEED PWM (0% - 100%)    |                      |
|  +--------------------------+  |     [=========|------------------] 60%    |                      |
|                                |                                           |                      |
|                                |  3. SAKELAR LED & DROPDOWN TUNING PID     |                      |
|                                |     [LED Depan] [LED Belakang] [PID v]    |                      |
+--------------------------------+-------------------------------------------+----------------------+


```

* **Zona Kiri (27% lebar):** Khusus untuk kontrol jempol kiri (**Maju** di bagian atas, **Mundur** di bagian bawah) dengan celah pemisah `gap: 8px`.

* **Zona Tengah (46% lebar):** Menyusun 3 modul secara vertikal (`flex-direction: column; justify-content: space-between; gap: 8px`):

  1. Array 5 indikator sensor garis + telemetri angka.

  2. Slider pengatur batas PWM ($0\% - 100\%$).

  3. Baris kontrol utilitas: Tombol *toggle* Lampu Depan, Tombol *toggle* Lampu Belakang, dan *Dropdown / Popover* Tuning PID.

* **Zona Kanan (27% lebar):** Khusus untuk kontrol jempol kanan (**Belok Kiri** di sisi kiri, **Belok Kanan** di sisi kanan) dengan celah pemisah `gap: 8px`.

## 5. Tactile Depth & Non-Flat Surface Physics

Untuk menghindari tampilan datar (*flat*) maupun *glow* norak, setiap komponen interaktif menggunakan sistem ketinggian fisik 3 tingkat:

1. **Level 0 — Recessed Track (`#E5E3DC`):**

   * Digunakan untuk jalur *slider*, rumah indikator sensor, dan latar *segmented control*.

   * CSS: `background: #E5E3DC; border: 1px solid #C8C6BC; box-shadow: inset 0 2px 4px rgba(22, 23, 26, 0.08);`

2. **Level 1 — Tactile Keycap / Button (`#FAF9F5`):**

   * Digunakan untuk tombol Maju/Mundur/Belok, sakelar LED, tombol mode, dan pemicu *dropdown*.

   * CSS Default:
     `background: #FAF9F5; border: 1px solid #C8C6BC; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 2px 0 #C8C6BC, 0 3px 6px rgba(22, 23, 26, 0.07);`

   * CSS Hover (`:hover`):
     `background: #ECEAE2; border-color: #B5B3A8;`

   * CSS Active / Pressed (`.is-pressed` atau `:active`):
     `transform: translateY(2px); background: #E5E3DC; box-shadow: inset 0 2px 3px rgba(22, 23, 26, 0.14), 0 0 0 #C8C6BC;`

3. **Level 2 — Floating Popover / PID Drawer (`#FAF9F5`):**

   * Digunakan untuk panel *dropdown* PID Tuning.

   * CSS: `background: #FAF9F5; border: 1px solid #B5B3A8; box-shadow: 0 10px 25px -5px rgba(22, 23, 26, 0.18), 0 4px 10px -2px rgba(22, 23, 26, 0.08);`

## 6. Component Specifications & Interactive States

### 6.1 Custom Dropdown & PID Tuning Popover

* **Pemicu Dropdown (`PID Tuning` / `Preset`):**

  * Menampilkan label `PID TUNING`, nilai singkat saat ini, dan ikon *chevron* SVG yang berputar $180^\circ$ (`transition: transform 150ms ease`) saat terbuka.

  * Memiliki efek `:hover` (`background: #ECEAE2`) dan ring fokus aksesibel (`focus-visible:outline-2 focus-visible:outline-[#1E40AF]`).

* **Menu Dropdown / Popover Panel:**

  * Muncul rapi di atas/bawah tombol tanpa menutupi zona kontrol jempol kiri dan kanan (tetap di dalam batas kolom tengah).

  * Menyediakan **Dropdown Preset PID** kustom (bukan `<select>` bawaan OS yang kaku):

    * `Standar (Seimbang)`

    * `Presisi (Tikungan Tajam)`

    * `Kecepatan Tinggi (Lintasan Lurus)`

  * Setiap item opsi di dalam *dropdown* memiliki state `:hover` (`background: #ECEAE2`), ikon centang SVG untuk opsi aktif, serta 3 kolom input numerik untuk tuning manual $K_p$, $K_i$, dan $K_d$ disertai tombol **`TERAPKAN PID`**.

### 6.2 Dual-Thumb Control Pads (Left & Right Zones)

* Ukuran tiap tombol arah minimal `height: 44%` dari area kontrol sehingga sangat mudah ditekan ibu jari tanpa meleset.

* Saat jari menyentuh tombol (`pointerdown`), kelas `.is-pressed` langsung aktif: tombol turun $2\text{ px}$, tepi menyala dengan aksen `#1E40AF`, dan ikon arah berubah menjadi kontras tinggi.

* Ketika robot berada dalam mode `STOP` atau `AUTO`, tombol manual menampilkan status visual *standby* (opasitas sedikit redup `opacity: 0.65`, namun jika ditekan dapat menampilkan petunjuk halus untuk beralih ke mode `MANUAL`).

### 6.3 Emergency `STOP` Button

* Ditempatkan di pojok kanan atas *Top HUD Bar* dengan ukuran lebar minimal `96px` dan tinggi `36px`.

* Warna latar `#D9381E`, teks `#FAF9F5` tebal, tepi bawah gelap `#991B1B` (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 0 #991B1B`). Saat ditekan langsung amblas $2\text{ px}$ dan mengirim `{ "type": "stop" }`.

### 6.4 Custom Tactile PWM Slider (`0% - 100%`)

* Menggunakan track terbenam (`#E5E3DC`, tinggi `12px`, `border-radius: 6px`) dengan batang pengisi berwarna `#1E40AF` sesuai persentase PWM.

* *Thumb* (kenop geser) berbentuk kotak membulat taktil (`22px` $\times$ `26px`) berwarna `#FAF9F5` dengan 2 garis grip vertikal di tengahnya layaknya *fader* mixer audio fisik.

## 7. Iconography Contract (100% Inline Geometric SVG)

**DILARANG KERAS MENGGUNAKAN EMOJI.** Semua ikon dibuat sebagai fungsi helper TypeScript yang mengembalikan elemen `<svg>` dengan atribut standar:
`width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`

| Nama Ikon | Kegunaan Komponen | Bentuk Geometris SVG | 
| ----- | ----- | ----- | 
| `icon-wifi` | Status koneksi WebSocket | Busur gelombang sinyal 3 tingkat + titik pusat | 
| `icon-battery` | Indikator tegangan baterai | Persegi panjang baterai + terminal positif kanan | 
| `icon-stop` | Tombol darurat STOP & Mode STOP | Oktagon / kotak solid di tengah lingkaran | 
| `icon-auto` | Mode Otomatis (Line Tracking) | Jalur kurva S dengan titik sensor di tengah | 
| `icon-manual` | Mode Manual (Dual-Thumb) | Siluet kontroler D-pad + dua tombol aksi | 
| `icon-arrow-up` | Tombol Maju (*Throttle +*) | Panah tegas menghadap ke atas | 
| `icon-arrow-down` | Tombol Mundur (*Throttle -*) | Panah tegas menghadap ke bawah | 
| `icon-arrow-left` | Tombol Belok Kiri (*Steering -*) | Panah tegas menghadap ke kiri | 
| `icon-arrow-right` | Tombol Belok Kanan (*Steering +*) | Panah tegas menghadap ke kanan | 
| `icon-headlight` | Sakelar Lampu Depan (Putih) | Lensa lampu sorot + 3 garis pancaran cahaya ke depan | 
| `icon-taillight` | Sakelar Lampu Belakang (Merah) | Persegi lampu belakang + garis pendaran | 
| `icon-sliders` | Tombol Panel PID Tuning | 3 garis vertikal dengan kenop pengatur di posisi berbeda | 
| `icon-chevron-down` | Indikator Dropdown | Sudut V menghadap ke bawah (berotasi $180^\circ$ saat aktif) | 
| `icon-rotate-phone` | Layar peringatan Portrait Guard | Persegi ponsel dengan panah melengkung rotasi $90^\circ$ | 

## 8. Micro-Interactions & Animation Timing

* **Tactile Press Response:** `transition: transform 60ms cubic-bezier(0.2, 0, 0, 1), background-color 80ms ease, box-shadow 60ms ease;` (instan di bawah $80\text{ ms}$ agar terasa seperti sakelar mekanik sungguhan).

* **Sensor Array Indicator (`S1..S5`):** Transisi warna latar dari `#E5E3DC` (lantai putih) ke `#D9381E` (garis hitam terdeteksi) dalam `60ms`.

* **View Transition (Start Screen** $\rightarrow$ **Dashboard):** Transisi *fade + subtle scale* (`opacity` dan `transform: scale(0.98 -> 1)`) berdurasi `180ms ease-out`.

## 9. Strict Design Anti-Patterns (Checklist Larangan Agent)

Sebelum menyelesaikan pekerjaan *frontend*, *coding agent* wajib memverifikasi bahwa kode bebas dari hal-hal berikut:

* \[ \] Tidak ada warna hex `#FFFFFF` maupun `#000000` murni pada latar belakang atau teks.

* \[ \] Tidak ada karakter emoji (`Unicode Emoji`) di seluruh file `.html`, `.ts`, maupun `.css`.

* \[ \] Tidak ada tampilan *flat* tanpa *border* dan tanpa kedalaman *shadow/bevel*.

* \[ \] Tidak ada elemen yang bertumpuk (*overlapping*) atau terpotong (*clipped*) pada resolusi ponsel *landscape* umum (misal `667x375`, `800x360`, `844x390`, `915x412`) maupun layar laptop (`1280x720`).

* \[ \] Seluruh ikon menggunakan SVG *inline* yang tajam, dan setiap komponen *dropdown* atau tombol memiliki gaya `:hover` dan `:active` yang terdefinisi jelas.