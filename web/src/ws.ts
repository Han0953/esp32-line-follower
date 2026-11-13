import { isTelemetryMessage, type ClientMessage, type TelemetryMessage } from "./types";

export type ConnectionState = "CONNECTING" | "CONNECTED" | "DISCONNECTED";

export interface RobotSocketCallbacks {
  onConnectionChange: (state: ConnectionState) => void;
  onTelemetry: (telemetry: TelemetryMessage) => void;
}

const RECONNECT_DELAY_MS = 1000;
// 100 ms heartbeat keeps the ESP32 400 ms manual-mode watchdog alive while a thumb pad is held.
const HEARTBEAT_INTERVAL_MS = 100;

export class RobotSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private throttle = 0;
  private steering = 0;
  private readonly callbacks: RobotSocketCallbacks;

  constructor(callbacks: RobotSocketCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(): void {
    this.clearReconnectTimer();

    const host = window.location.host || "192.168.4.1";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${host}/ws`;

    this.callbacks.onConnectionChange("CONNECTING");

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.addEventListener("open", () => {
        this.callbacks.onConnectionChange("CONNECTED");
      });

      socket.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (typeof event.data !== "string") {
          return;
        }
        try {
          const parsed: unknown = JSON.parse(event.data);
          if (isTelemetryMessage(parsed)) {
            this.callbacks.onTelemetry(parsed);
          }
        } catch {
          // Ignore malformed telemetry packets without interrupting control loop.
        }
      });

      socket.addEventListener("close", () => {
        this.handleDisconnect();
      });

      socket.addEventListener("error", () => {
        socket.close();
      });
    } catch {
      this.handleDisconnect();
    }
  }

  public send(message: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  public setManualDrive(nextThrottle: number, nextSteering: number): void {
    const clampedThrottle = Math.max(-100, Math.min(100, Math.round(nextThrottle)));
    const clampedSteering = Math.max(-100, Math.min(100, Math.round(nextSteering)));
    const changed =
      clampedThrottle !== this.throttle || clampedSteering !== this.steering;

    this.throttle = clampedThrottle;
    this.steering = clampedSteering;

    if (changed) {
      this.send({
        type: "move",
        throttle: this.throttle,
        steering: this.steering,
      });
    }

    if (this.throttle !== 0 || this.steering !== 0) {
      this.ensureHeartbeat();
    } else {
      this.stopHeartbeat();
    }
  }

  public sendEmergencyStop(): void {
    this.throttle = 0;
    this.steering = 0;
    this.stopHeartbeat();
    this.send({ type: "stop" });
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      return;
    }
    this.heartbeatTimer = window.setInterval(() => {
      if (this.throttle === 0 && this.steering === 0) {
        this.stopHeartbeat();
        return;
      }
      this.send({
        type: "move",
        throttle: this.throttle,
        steering: this.steering,
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleDisconnect(): void {
    this.ws = null;
    this.stopHeartbeat();
    this.callbacks.onConnectionChange("DISCONNECTED");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
