use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use log::{info, warn};
use serde::{Deserialize, Serialize};

use crate::config::{DEFAULT_PWM_LIMIT, WATCHDOG_TIMEOUT_MS};
use crate::pid::PidParams;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RobotMode {
    #[serde(rename = "STOP", alias = "stop")]
    Stop,
    #[serde(rename = "MANUAL", alias = "manual")]
    Manual,
    #[serde(rename = "AUTO", alias = "auto")]
    Auto,
}

impl RobotMode {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Stop => "STOP",
            Self::Manual => "MANUAL",
            Self::Auto => "AUTO",
        }
    }

    fn from_str_flexible(raw: &str) -> Option<Self> {
        if raw.eq_ignore_ascii_case("stop") {
            Some(Self::Stop)
        } else if raw.eq_ignore_ascii_case("manual") {
            Some(Self::Manual)
        } else if raw.eq_ignore_ascii_case("auto") {
            Some(Self::Auto)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LedTarget {
    Front,
    Rear,
}

#[derive(Debug)]
pub enum ClientMessage {
    Mode { value: RobotMode },
    Stop,
    Move { linear: f32, angular: f32 },
    PwmLimit { value: u8 },
    LedSingle { target: LedTarget, state: bool },
    LedBoth { front: bool, rear: bool },
    Pid { kp: f32, ki: f32, kd: f32 },
}

impl ClientMessage {
    pub fn from_json(json: &str) -> Result<Self, &'static str> {
        let val: serde_json::Value =
            serde_json::from_str(json).map_err(|_| "format JSON invalid")?;
        let obj = val.as_object().ok_or("payload bukan JSON object")?;
        let msg_type = obj
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or("field type hilang")?;

        match msg_type {
            "stop" => Ok(Self::Stop),
            "mode" => {
                let raw_mode = obj
                    .get("mode")
                    .or_else(|| obj.get("value"))
                    .and_then(|v| v.as_str())
                    .ok_or("field mode hilang")?;
                let mode =
                    RobotMode::from_str_flexible(raw_mode).ok_or("nilai mode tidak valid")?;
                Ok(Self::Mode { value: mode })
            }
            "move" => {
                // Mendukung format frontend {throttle, steering} (-100..100) maupun {linear, angular} (-1..1).
                if let (Some(t), Some(s)) = (
                    obj.get("throttle").and_then(|v| v.as_f64()),
                    obj.get("steering").and_then(|v| v.as_f64()),
                ) {
                    Ok(Self::Move {
                        linear: (t as f32 / 100.0).clamp(-1.0, 1.0),
                        angular: (s as f32 / 100.0).clamp(-1.0, 1.0),
                    })
                } else {
                    let linear = obj
                        .get("linear")
                        .and_then(|v| v.as_f64())
                        .ok_or("field move.throttle/linear hilang")? as f32;
                    let angular = obj
                        .get("angular")
                        .and_then(|v| v.as_f64())
                        .ok_or("field move.steering/angular hilang")? as f32;
                    Ok(Self::Move { linear, angular })
                }
            }
            "pwm_limit" => {
                let limit = obj
                    .get("value")
                    .and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| f.round() as u64)))
                    .ok_or("field pwm_limit.value invalid")?;
                Ok(Self::PwmLimit {
                    value: limit.min(100) as u8,
                })
            }
            "led" => {
                if let (Some(front), Some(rear)) = (
                    obj.get("front").and_then(|v| v.as_bool()),
                    obj.get("rear").and_then(|v| v.as_bool()),
                ) {
                    return Ok(Self::LedBoth { front, rear });
                }
                let target = match obj.get("target").and_then(|v| v.as_str()) {
                    Some("front") => LedTarget::Front,
                    Some("rear") => LedTarget::Rear,
                    _ => return Err("field led.target/front/rear invalid"),
                };
                let state = obj
                    .get("state")
                    .and_then(|v| v.as_bool())
                    .ok_or("field led.state hilang")?;
                Ok(Self::LedSingle { target, state })
            }
            "pid" => {
                let kp = obj
                    .get("kp")
                    .and_then(|v| v.as_f64())
                    .ok_or("field pid.kp hilang")? as f32;
                let ki = obj
                    .get("ki")
                    .and_then(|v| v.as_f64())
                    .ok_or("field pid.ki hilang")? as f32;
                let kd = obj
                    .get("kd")
                    .and_then(|v| v.as_f64())
                    .ok_or("field pid.kd hilang")? as f32;
                Ok(Self::Pid { kp, ki, kd })
            }
            _ => Err("tipe pesan tidak dikenal"),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TelemetryMessage {
    #[serde(rename = "type")]
    pub msg_type: &'static str,
    pub mode: RobotMode,
    pub pwm_limit: u8,
    pub sensors: [u8; 5],
    pub line_error: f32,
    pub motor_left: i16,
    pub motor_right: i16,
    pub led_front: bool,
    pub led_rear: bool,
    pub battery_v: f32,
    pub pid: PidParams,
}

pub struct RobotState {
    pub mode: RobotMode,
    pub manual_linear: f32,
    pub manual_angular: f32,
    pub last_manual_cmd: Option<Instant>,
    pub watchdog_tripped: bool,
    pub pwm_limit: u8,
    pub led_front: bool,
    pub led_rear: bool,
    pub pid_params: PidParams,
    pub sensors: [u8; 5],
    pub error: f32,
    pub pwm_left: i16,
    pub pwm_right: i16,
    pub battery_v: f32,
}

impl Default for RobotState {
    fn default() -> Self {
        Self {
            mode: RobotMode::Stop,
            manual_linear: 0.0,
            manual_angular: 0.0,
            last_manual_cmd: None,
            watchdog_tripped: false,
            pwm_limit: DEFAULT_PWM_LIMIT as u8,
            led_front: false,
            led_rear: false,
            pid_params: PidParams::default(),
            sensors: [0; 5],
            error: 0.0,
            pwm_left: 0,
            pwm_right: 0,
            battery_v: 0.0,
        }
    }
}

impl RobotState {
    pub fn force_stop(&mut self, reason: &str) {
        let prev = self.mode;
        self.mode = RobotMode::Stop;
        self.manual_linear = 0.0;
        self.manual_angular = 0.0;
        self.last_manual_cmd = None;
        self.watchdog_tripped = false;
        self.pwm_left = 0;
        self.pwm_right = 0;
        if prev != RobotMode::Stop {
            info!("[MODE] {} -> STOP ({})", prev.label(), reason);
        } else {
            info!("[SAFE] E-STOP aktif ({})", reason);
        }
    }

    pub fn apply_client_message(&mut self, msg: ClientMessage, now: Instant) -> bool {
        match msg {
            ClientMessage::Stop => {
                self.force_stop("Emergency Stop");
                true
            }
            ClientMessage::Mode { value } => {
                if value == RobotMode::Stop {
                    self.force_stop("Perintah client");
                    return true;
                }
                if value == self.mode {
                    return false;
                }
                let prev = self.mode;
                // Perpindahan antar mode aktif otomatis di-reset melalui kondisi STOP terlebih dahulu.
                self.manual_linear = 0.0;
                self.manual_angular = 0.0;
                self.last_manual_cmd = None;
                self.watchdog_tripped = false;
                self.pwm_left = 0;
                self.pwm_right = 0;
                self.mode = value;
                if prev != RobotMode::Stop {
                    info!(
                        "[MODE] {} -> STOP -> {} (reset aman otomatis)",
                        prev.label(),
                        value.label()
                    );
                } else {
                    info!("[MODE] STOP -> {}", value.label());
                }
                true
            }
            ClientMessage::Move { linear, angular } => {
                let lin = if linear.is_finite() {
                    linear.clamp(-1.0, 1.0)
                } else {
                    0.0
                };
                let ang = if angular.is_finite() {
                    angular.clamp(-1.0, 1.0)
                } else {
                    0.0
                };
                self.manual_linear = lin;
                self.manual_angular = ang;
                self.last_manual_cmd = Some(now);
                self.watchdog_tripped = false;
                false
            }
            ClientMessage::PwmLimit { value } => {
                let clamped = value.min(100);
                if clamped != self.pwm_limit {
                    self.pwm_limit = clamped;
                    info!("[CFG] PWM Limit -> {}%", self.pwm_limit);
                }
                false
            }
            ClientMessage::LedSingle { target, state } => {
                match target {
                    LedTarget::Front => {
                        if self.led_front != state {
                            self.led_front = state;
                            info!(
                                "[LED] Lampu Depan -> {}",
                                if state { "HIDUP" } else { "MATI" }
                            );
                        }
                    }
                    LedTarget::Rear => {
                        if self.led_rear != state {
                            self.led_rear = state;
                            info!(
                                "[LED] Lampu Belakang -> {}",
                                if state { "HIDUP" } else { "MATI" }
                            );
                        }
                    }
                }
                false
            }
            ClientMessage::LedBoth { front, rear } => {
                if self.led_front != front {
                    self.led_front = front;
                    info!(
                        "[LED] Lampu Depan -> {}",
                        if front { "HIDUP" } else { "MATI" }
                    );
                }
                if self.led_rear != rear {
                    self.led_rear = rear;
                    info!(
                        "[LED] Lampu Belakang -> {}",
                        if rear { "HIDUP" } else { "MATI" }
                    );
                }
                false
            }
            ClientMessage::Pid { kp, ki, kd } => {
                self.pid_params = PidParams {
                    kp: if kp.is_finite() {
                        kp.max(0.0)
                    } else {
                        self.pid_params.kp
                    },
                    ki: if ki.is_finite() {
                        ki.max(0.0)
                    } else {
                        self.pid_params.ki
                    },
                    kd: if kd.is_finite() {
                        kd.max(0.0)
                    } else {
                        self.pid_params.kd
                    },
                };
                info!(
                    "[PID] Parameter diperbarui -> Kp={:.2}, Ki={:.2}, Kd={:.2}",
                    self.pid_params.kp, self.pid_params.ki, self.pid_params.kd
                );
                false
            }
        }
    }

    pub fn evaluate_manual_watchdog(&mut self, now: Instant) -> bool {
        if self.mode != RobotMode::Manual {
            return false;
        }
        let is_moving = self.manual_linear != 0.0 || self.manual_angular != 0.0;
        if let Some(last) = self.last_manual_cmd {
            if now.duration_since(last) >= Duration::from_millis(WATCHDOG_TIMEOUT_MS) {
                self.manual_linear = 0.0;
                self.manual_angular = 0.0;
                self.last_manual_cmd = None;
                if is_moving && !self.watchdog_tripped {
                    self.watchdog_tripped = true;
                    warn!("[SAFE] Watchdog manual 400ms timeout -> Motor berhenti");
                }
                return true;
            }
        }
        false
    }

    pub fn to_telemetry(&self) -> TelemetryMessage {
        TelemetryMessage {
            msg_type: "telemetry",
            mode: self.mode,
            pwm_limit: self.pwm_limit,
            sensors: self.sensors,
            line_error: self.error,
            motor_left: self.pwm_left,
            motor_right: self.pwm_right,
            led_front: self.led_front,
            led_rear: self.led_rear,
            battery_v: self.battery_v,
            pid: self.pid_params,
        }
    }
}

pub fn lock_state(shared: &Arc<Mutex<RobotState>>) -> MutexGuard<'_, RobotState> {
    shared.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
