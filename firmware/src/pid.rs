use serde::{Deserialize, Serialize};

use crate::config;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct PidParams {
    pub kp: f32,
    pub ki: f32,
    pub kd: f32,
}

impl Default for PidParams {
    fn default() -> Self {
        Self {
            kp: config::DEFAULT_PID_KP,
            ki: config::DEFAULT_PID_KI,
            kd: config::DEFAULT_PID_KD,
        }
    }
}

pub struct PidController {
    integral: f32,
    prev_error: f32,
    integral_max: f32,
}

impl PidController {
    pub fn new(integral_max: f32) -> Self {
        Self {
            integral: 0.0,
            prev_error: 0.0,
            integral_max: integral_max.abs(),
        }
    }

    pub fn reset(&mut self) {
        self.integral = 0.0;
        self.prev_error = 0.0;
    }

    pub fn compute(
        &mut self,
        error: f32,
        dt: f32,
        params: &PidParams,
        pwm_limit: f32,
    ) -> (f32, f32) {
        let dt_safe = dt.max(1e-4);
        let limit = pwm_limit.clamp(0.0, 100.0);

        // Clamp accumulated integral to prevent windup on sharp turns.
        self.integral =
            (self.integral + error * dt_safe).clamp(-self.integral_max, self.integral_max);

        let p_term = params.kp * error;
        let i_term = params.ki * self.integral;
        let d_term = params.kd * ((error - self.prev_error) / dt_safe);
        self.prev_error = error;

        let u = p_term + i_term + d_term;
        let left = (limit + u).clamp(-limit, limit);
        let right = (limit - u).clamp(-limit, limit);
        (left, right)
    }
}
