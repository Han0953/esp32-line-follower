pub const PIN_MOTOR_ENA: u8 = 32;
pub const PIN_MOTOR_IN1: u8 = 33;
pub const PIN_MOTOR_IN2: u8 = 25;
pub const PIN_MOTOR_IN3: u8 = 26;
pub const PIN_MOTOR_IN4: u8 = 27;
pub const PIN_MOTOR_ENB: u8 = 14;

pub const PIN_SENSORS: [u8; 5] = [16, 17, 18, 19, 21];

pub const PIN_LED_FRONT: u8 = 22;
pub const PIN_LED_REAR: u8 = 23;

// ADC1_CH6 avoids ADC2 conflict with the Wi-Fi radio.
pub const PIN_BATTERY_ADC: u8 = 34;
pub const BATTERY_DIVIDER_RATIO: f32 = 3.0;

pub const PWM_FREQ_HZ: u32 = 2_000;
pub const LINE_ACTIVE_HIGH: bool = true;
pub const SENSOR_WEIGHTS: [f32; 5] = [-2.0, -1.0, 0.0, 1.0, 2.0];

pub const WIFI_SSID: &str = "ESP32-Robot-LF";
pub const WIFI_PASS: &str = "robot1234";
pub const WIFI_CHANNEL: u8 = 1;
pub const WIFI_MAX_CONNECTIONS: u16 = 4;
pub const AP_IP_OCTETS: [u8; 4] = [192, 168, 4, 1];
pub const AP_SUBNET_PREFIX: u8 = 24;

pub const CONTROL_LOOP_DT_MS: u32 = 10;
pub const CONTROL_LOOP_DT_SEC: f32 = 0.01;
pub const TELEMETRY_INTERVAL_MS: u64 = 200;
pub const BATTERY_SAMPLE_CYCLES: u32 = 20;

pub const WATCHDOG_TIMEOUT_MS: u64 = 400;
pub const LINE_LOST_TIMEOUT_MS: u64 = 800;

pub const DEFAULT_PWM_LIMIT: f32 = 50.0;
pub const DEFAULT_PID_KP: f32 = 35.0;
pub const DEFAULT_PID_KI: f32 = 0.5;
pub const DEFAULT_PID_KD: f32 = 14.0;
pub const PID_INTEGRAL_MAX: f32 = 50.0;
