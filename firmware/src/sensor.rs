use std::time::{Duration, Instant};

use esp_idf_hal::gpio::{AnyInputPin, Input, PinDriver, Pull};

use crate::config;

#[derive(Clone, Copy, Debug)]
pub struct SensorReading {
    pub raw: [u8; 5],
    pub line_error: f32,
    pub line_lost_timed_out: bool,
}

pub fn compute_line_error(raw: &[u8; 5]) -> Option<f32> {
    let mut weighted_sum = 0.0_f32;
    let mut active_count = 0.0_f32;

    for (i, &val) in raw.iter().enumerate() {
        if val != 0 {
            weighted_sum += config::SENSOR_WEIGHTS[i];
            active_count += 1.0;
        }
    }

    if active_count > 0.0 {
        Some(weighted_sum / active_count)
    } else {
        None
    }
}

pub struct LineSensorReader<'d> {
    pins: [PinDriver<'d, Input>; 5],
    last_valid_error: f32,
    line_lost_since: Option<Instant>,
    line_lost_logged: bool,
}

impl<'d> LineSensorReader<'d> {
    pub fn new(sensor_pins: [AnyInputPin<'d>; 5]) -> anyhow::Result<Self> {
        let [p0, p1, p2, p3, p4] = sensor_pins;
        let pins = [
            PinDriver::input(p0, Pull::Floating)?,
            PinDriver::input(p1, Pull::Floating)?,
            PinDriver::input(p2, Pull::Floating)?,
            PinDriver::input(p3, Pull::Floating)?,
            PinDriver::input(p4, Pull::Floating)?,
        ];

        Ok(Self {
            pins,
            last_valid_error: 0.0,
            line_lost_since: None,
            line_lost_logged: false,
        })
    }

    pub fn read(&mut self, now: Instant, track_line_loss: bool) -> SensorReading {
        let mut raw = [0_u8; 5];
        for (i, pin) in self.pins.iter().enumerate() {
            let is_high = pin.is_high();
            let detected = if config::LINE_ACTIVE_HIGH {
                is_high
            } else {
                !is_high
            };
            raw[i] = u8::from(detected);
        }

        if let Some(err) = compute_line_error(&raw) {
            self.last_valid_error = err;
            self.line_lost_since = None;
            self.line_lost_logged = false;
            return SensorReading {
                raw,
                line_error: err,
                line_lost_timed_out: false,
            };
        }

        if !track_line_loss {
            self.line_lost_since = None;
            self.line_lost_logged = false;
            return SensorReading {
                raw,
                line_error: self.last_valid_error,
                line_lost_timed_out: false,
            };
        }

        let lost_start = *self.line_lost_since.get_or_insert(now);
        let timed_out =
            now.duration_since(lost_start) > Duration::from_millis(config::LINE_LOST_TIMEOUT_MS);

        if timed_out && !self.line_lost_logged {
            self.line_lost_logged = true;
            log::warn!(
                "[SENSOR] Garis hilang > {}ms (last_error={:+.2}): motor AUTO dihentikan",
                config::LINE_LOST_TIMEOUT_MS,
                self.last_valid_error
            );
        }

        SensorReading {
            raw,
            line_error: self.last_valid_error,
            line_lost_timed_out: timed_out,
        }
    }

    pub fn reset_line_loss(&mut self) {
        self.line_lost_since = None;
        self.line_lost_logged = false;
    }
}
