mod config;
mod motor;
mod pid;
mod sensor;
mod server;
mod state;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use esp_idf_svc::eventloop::EspSystemEventLoop;
use esp_idf_svc::hal::adc::attenuation;
use esp_idf_svc::hal::adc::oneshot::config::{AdcChannelConfig, Calibration};
use esp_idf_svc::hal::adc::oneshot::{AdcChannelDriver, AdcDriver};
use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::gpio::PinDriver;
use esp_idf_svc::hal::peripherals::Peripherals;
use esp_idf_svc::nvs::EspDefaultNvsPartition;
use log::{info, warn};

use crate::config::{
    BATTERY_DIVIDER_RATIO, BATTERY_SAMPLE_CYCLES, CONTROL_LOOP_DT_MS, CONTROL_LOOP_DT_SEC,
    PID_INTEGRAL_MAX, PIN_BATTERY_ADC, PIN_LED_FRONT, PIN_LED_REAR, PIN_MOTOR_ENA, PIN_MOTOR_ENB,
    PIN_MOTOR_IN1, PIN_MOTOR_IN2, PIN_MOTOR_IN3, PIN_MOTOR_IN4, PIN_SENSORS,
    TELEMETRY_INTERVAL_MS,
};
use crate::motor::{classify_motion, mix_manual, MotorDriver};
use crate::pid::PidController;
use crate::sensor::LineSensorReader;
use crate::server::{start_network, WsSessionRegistry};
use crate::state::{lock_state, RobotMode, RobotState};

fn main() -> anyhow::Result<()> {
    esp_idf_svc::sys::link_patches();
    esp_idf_svc::log::EspLogger::initialize_default();

    info!(
        "[BOOT] ESP32 Line Follower Firmware dimulai (115200 bps) | Motor=[ENA:{},IN1:{},IN2:{},IN3:{},IN4:{},ENB:{}] | IR={:?} | LED=[F:{},R:{}] | BAT=GPIO{}",
        PIN_MOTOR_ENA,
        PIN_MOTOR_IN1,
        PIN_MOTOR_IN2,
        PIN_MOTOR_IN3,
        PIN_MOTOR_IN4,
        PIN_MOTOR_ENB,
        PIN_SENSORS,
        PIN_LED_FRONT,
        PIN_LED_REAR,
        PIN_BATTERY_ADC
    );

    let peripherals = Peripherals::take()?;
    let sys_loop = EspSystemEventLoop::take()?;
    let nvs = EspDefaultNvsPartition::take()?;

    let shared_state = Arc::new(Mutex::new(RobotState::default()));
    let ws_registry = Arc::new(WsSessionRegistry::new());

    let _net_runtime = start_network(
        peripherals.modem,
        sys_loop,
        nvs,
        Arc::clone(&shared_state),
        Arc::clone(&ws_registry),
    )?;

    let mut motor = MotorDriver::new(
        peripherals.ledc.timer0,
        peripherals.ledc.channel0,
        peripherals.ledc.channel1,
        peripherals.pins.gpio32,
        peripherals.pins.gpio33.into(),
        peripherals.pins.gpio25.into(),
        peripherals.pins.gpio26.into(),
        peripherals.pins.gpio27.into(),
        peripherals.pins.gpio14,
    )?;

    let mut sensor_reader = LineSensorReader::new([
        peripherals.pins.gpio16.into(),
        peripherals.pins.gpio17.into(),
        peripherals.pins.gpio18.into(),
        peripherals.pins.gpio19.into(),
        peripherals.pins.gpio21.into(),
    ])?;

    let mut led_front_pin = PinDriver::output(peripherals.pins.gpio22)?;
    let mut led_rear_pin = PinDriver::output(peripherals.pins.gpio23)?;
    led_front_pin.set_low()?;
    led_rear_pin.set_low()?;

    let adc1 = AdcDriver::new(peripherals.adc1)?;
    let adc_cfg = AdcChannelConfig {
        attenuation: attenuation::DB_12,
        calibration: Calibration::Line,
        ..Default::default()
    };
    let mut bat_adc = AdcChannelDriver::new(&adc1, peripherals.pins.gpio34, &adc_cfg)?;

    let state_telemetry = Arc::clone(&shared_state);
    let registry_telemetry = Arc::clone(&ws_registry);
    std::thread::Builder::new()
        .name("telemetry".into())
        .stack_size(6144)
        .spawn(move || loop {
            if registry_telemetry.active_count() > 0 {
                let telemetry = {
                    let state = lock_state(&state_telemetry);
                    state.to_telemetry()
                };
                match serde_json::to_string(&telemetry) {
                    Ok(json) => registry_telemetry.broadcast_text(&json),
                    Err(err) => warn!("[TELEMETRY] Gagal serialisasi JSON: {}", err),
                }
            }
            FreeRtos::delay_ms(TELEMETRY_INTERVAL_MS as u32);
        })?;

    info!("[BOOT] Task control loop 100Hz & telemetry 5Hz aktif. Robot dalam mode STOP.");

    let mut pid = PidController::new(PID_INTEGRAL_MAX);
    let mut prev_mode = RobotMode::Stop;
    let mut prev_motion: &'static str = "BERHENTI";
    let mut prev_led_front = false;
    let mut prev_led_rear = false;
    let mut last_tick = Instant::now() - Duration::from_millis(u64::from(CONTROL_LOOP_DT_MS));
    let mut cycle_count: u32 = 0;
    let mut filtered_bat_v: f32 = 0.0;

    loop {
        let now = Instant::now();
        let dt = now
            .duration_since(last_tick)
            .as_secs_f32()
            .clamp(0.002, CONTROL_LOOP_DT_SEC * 5.0);
        last_tick = now;

        let track_loss = {
            let mut state = lock_state(&shared_state);
            state.evaluate_manual_watchdog(now);
            state.mode == RobotMode::Auto
        };

        let sensor_sample = sensor_reader.read(now, track_loss);

        if cycle_count % BATTERY_SAMPLE_CYCLES == 0 {
            if let Ok(mv) = bat_adc.read() {
                let instant_v = (mv as f32 / 1000.0) * BATTERY_DIVIDER_RATIO;
                filtered_bat_v = if filtered_bat_v <= 0.1 {
                    instant_v
                } else {
                    filtered_bat_v * 0.8 + instant_v * 0.2
                };
            }
        }
        cycle_count = cycle_count.wrapping_add(1);

        let (mode, linear, angular, pwm_limit, pid_params, led_front, led_rear) = {
            let mut state = lock_state(&shared_state);
            state.sensors = sensor_sample.raw;
            state.error = sensor_sample.line_error;
            state.battery_v = (filtered_bat_v * 100.0).round() / 100.0;
            (
                state.mode,
                state.manual_linear,
                state.manual_angular,
                state.pwm_limit,
                state.pid_params,
                state.led_front,
                state.led_rear,
            )
        };

        if led_front != prev_led_front {
            if led_front {
                led_front_pin.set_high()?;
            } else {
                led_front_pin.set_low()?;
            }
            prev_led_front = led_front;
        }
        if led_rear != prev_led_rear {
            if led_rear {
                led_rear_pin.set_high()?;
            } else {
                led_rear_pin.set_low()?;
            }
            prev_led_rear = led_rear;
        }

        if mode != prev_mode {
            pid.reset();
            sensor_reader.reset_line_loss();
            prev_mode = mode;
        }

        let (left_pct, right_pct) = match mode {
            RobotMode::Stop => (0.0_f32, 0.0_f32),
            RobotMode::Manual => mix_manual(linear * 100.0, angular * 100.0, f32::from(pwm_limit)),
            RobotMode::Auto => {
                if sensor_sample.line_lost_timed_out {
                    let mut state = lock_state(&shared_state);
                    if state.mode == RobotMode::Auto {
                        state.force_stop("Garis hilang >800ms pada mode AUTO");
                    }
                    pid.reset();
                    (0.0_f32, 0.0_f32)
                } else {
                    pid.compute(sensor_sample.line_error, dt, &pid_params, f32::from(pwm_limit))
                }
            }
        };

        if left_pct == 0.0 && right_pct == 0.0 {
            motor.stop()?;
        } else {
            motor.set_motors(left_pct, right_pct)?;
        }
        let pwm_left = left_pct.round() as i16;
        let pwm_right = right_pct.round() as i16;

        {
            let mut state = lock_state(&shared_state);
            state.pwm_left = pwm_left;
            state.pwm_right = pwm_right;
        }

        let motion = classify_motion(left_pct, right_pct);
        if motion != prev_motion {
            info!(
                "[GERAK] {} (mode={} | L={:+}%, R={:+}%)",
                motion,
                mode.label(),
                pwm_left,
                pwm_right
            );
            prev_motion = motion;
        }

        FreeRtos::delay_ms(CONTROL_LOOP_DT_MS);
    }
}
