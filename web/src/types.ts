export const ROBOT_MODES = ["STOP", "AUTO", "MANUAL"] as const;
export type RobotMode = (typeof ROBOT_MODES)[number];

export interface PidParams {
  kp: number;
  ki: number;
  kd: number;
}

export type ClientMessage =
  | { type: "mode"; mode: RobotMode }
  | { type: "stop" }
  | { type: "move"; throttle: number; steering: number }
  | { type: "pwm_limit"; value: number }
  | { type: "led"; front: boolean; rear: boolean }
  | { type: "pid"; kp: number; ki: number; kd: number };

export type SensorTuple = [number, number, number, number, number];

export interface TelemetryMessage {
  type: "telemetry";
  mode: RobotMode;
  pwm_limit: number;
  sensors: SensorTuple;
  line_error: number;
  motor_left: number;
  motor_right: number;
  led_front: boolean;
  led_rear: boolean;
  battery_v: number;
  pid: PidParams;
}

export interface PidPreset {
  id: string;
  label: string;
  detail: string;
  params: PidParams;
}

export const PID_PRESETS: readonly PidPreset[] = [
  {
    id: "balanced",
    label: "Standar",
    detail: "Kp 35 / Ki 0.5 / Kd 14",
    params: { kp: 35.0, ki: 0.5, kd: 14.0 },
  },
  {
    id: "precision",
    label: "Tikungan Tajam",
    detail: "Kp 48 / Ki 0.8 / Kd 22",
    params: { kp: 48.0, ki: 0.8, kd: 22.0 },
  },
  {
    id: "highspeed",
    label: "Lintasan Lurus",
    detail: "Kp 26 / Ki 0.2 / Kd 18",
    params: { kp: 26.0, ki: 0.2, kd: 18.0 },
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRobotMode(value: unknown): value is RobotMode {
  return value === "STOP" || value === "AUTO" || value === "MANUAL";
}

function isSensorTuple(value: unknown): value is SensorTuple {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((item) => item === 0 || item === 1)
  );
}

export function isTelemetryMessage(value: unknown): value is TelemetryMessage {
  if (!isRecord(value) || value.type !== "telemetry") {
    return false;
  }

  const pid = value.pid;
  if (!isRecord(pid)) {
    return false;
  }

  return (
    isRobotMode(value.mode) &&
    typeof value.pwm_limit === "number" &&
    isSensorTuple(value.sensors) &&
    typeof value.line_error === "number" &&
    typeof value.motor_left === "number" &&
    typeof value.motor_right === "number" &&
    typeof value.led_front === "boolean" &&
    typeof value.led_rear === "boolean" &&
    typeof value.battery_v === "number" &&
    typeof pid.kp === "number" &&
    typeof pid.ki === "number" &&
    typeof pid.kd === "number"
  );
}
