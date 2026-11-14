use esp_idf_hal::gpio::{AnyOutputPin, Output, OutputPin, PinDriver};
use esp_idf_hal::ledc::config::{Resolution, TimerConfig};
use esp_idf_hal::ledc::{LedcChannel, LedcDriver, LedcTimer, LedcTimerDriver, LowSpeed};
use esp_idf_hal::units::Hertz;

use crate::config;

const MOTOR_DEADBAND_PCT: f32 = 0.5;

pub fn mix_manual(throttle: f32, steering: f32, pwm_limit: f32) -> (f32, f32) {
    let limit = pwm_limit.clamp(0.0, 100.0);
    let raw_left = (throttle + steering).clamp(-100.0, 100.0);
    let raw_right = (throttle - steering).clamp(-100.0, 100.0);
    let scale = limit / 100.0;
    (raw_left * scale, raw_right * scale)
}

pub fn classify_motion(left_pct: f32, right_pct: f32) -> &'static str {
    let l_active = left_pct.abs() >= MOTOR_DEADBAND_PCT;
    let r_active = right_pct.abs() >= MOTOR_DEADBAND_PCT;

    if !l_active && !r_active {
        return "BERHENTI";
    }

    let avg = (left_pct + right_pct) * 0.5;
    let diff = left_pct - right_pct;

    if avg.abs() < 2.0 {
        if diff > 1.0 {
            "BELOK KANAN"
        } else {
            "BELOK KIRI"
        }
    } else if avg > 0.0 {
        if diff.abs() < 4.0 {
            "MAJU"
        } else if diff > 0.0 {
            "MAJU + BELOK KANAN"
        } else {
            "MAJU + BELOK KIRI"
        }
    } else if diff.abs() < 4.0 {
        "MUNDUR"
    } else if diff > 0.0 {
        "MUNDUR + BELOK KIRI"
    } else {
        "MUNDUR + BELOK KANAN"
    }
}

struct MotorChannel<'d> {
    pwm: LedcDriver<'d>,
    in_a: PinDriver<'d, Output>,
    in_b: PinDriver<'d, Output>,
}

impl<'d> MotorChannel<'d> {
    fn new<C>(
        channel: C,
        timer: &LedcTimerDriver<'d, LowSpeed>,
        ena_pin: impl OutputPin + 'd,
        in_a_pin: AnyOutputPin<'d>,
        in_b_pin: AnyOutputPin<'d>,
    ) -> anyhow::Result<Self>
    where
        C: LedcChannel<SpeedMode = LowSpeed> + 'd,
    {
        let pwm = LedcDriver::new(channel, timer, ena_pin)?;
        let in_a = PinDriver::output(in_a_pin)?;
        let in_b = PinDriver::output(in_b_pin)?;
        let mut ch = Self { pwm, in_a, in_b };
        ch.apply(0.0)?;
        Ok(ch)
    }

    fn apply(&mut self, speed_pct: f32) -> anyhow::Result<()> {
        let clamped = speed_pct.clamp(-100.0, 100.0);
        if clamped.abs() < MOTOR_DEADBAND_PCT {
            // L298N active brake: both direction inputs LOW and PWM duty 0.
            self.in_a.set_low()?;
            self.in_b.set_low()?;
            self.pwm.set_duty(0)?;
            return Ok(());
        }

        if clamped > 0.0 {
            self.in_a.set_high()?;
            self.in_b.set_low()?;
        } else {
            self.in_a.set_low()?;
            self.in_b.set_high()?;
        }

        let max_duty = self.pwm.get_max_duty() as f32;
        let duty = ((clamped.abs() / 100.0) * max_duty).round() as u32;
        self.pwm.set_duty(duty.min(self.pwm.get_max_duty()))?;
        Ok(())
    }
}

pub struct MotorDriver<'d> {
    _timer: LedcTimerDriver<'d, LowSpeed>,
    left: MotorChannel<'d>,
    right: MotorChannel<'d>,
}

impl<'d> MotorDriver<'d> {
    #[allow(clippy::too_many_arguments)]
    pub fn new<T, CL, CR>(
        timer: T,
        ch_left: CL,
        ch_right: CR,
        ena_pin: impl OutputPin + 'd,
        in1_pin: AnyOutputPin<'d>,
        in2_pin: AnyOutputPin<'d>,
        in3_pin: AnyOutputPin<'d>,
        in4_pin: AnyOutputPin<'d>,
        enb_pin: impl OutputPin + 'd,
    ) -> anyhow::Result<Self>
    where
        T: LedcTimer<SpeedMode = LowSpeed> + 'd,
        CL: LedcChannel<SpeedMode = LowSpeed> + 'd,
        CR: LedcChannel<SpeedMode = LowSpeed> + 'd,
    {
        let timer_cfg = TimerConfig::new()
            .frequency(Hertz(config::PWM_FREQ_HZ))
            .resolution(Resolution::Bits10);
        let timer_driver = LedcTimerDriver::new(timer, &timer_cfg)?;

        let left = MotorChannel::new(ch_left, &timer_driver, ena_pin, in1_pin, in2_pin)?;
        let right = MotorChannel::new(ch_right, &timer_driver, enb_pin, in3_pin, in4_pin)?;

        Ok(Self {
            _timer: timer_driver,
            left,
            right,
        })
    }

    pub fn set_motors(&mut self, left_pct: f32, right_pct: f32) -> anyhow::Result<()> {
        self.left.apply(left_pct)?;
        self.right.apply(right_pct)?;
        Ok(())
    }

    pub fn stop(&mut self) -> anyhow::Result<()> {
        self.set_motors(0.0, 0.0)
    }
}
