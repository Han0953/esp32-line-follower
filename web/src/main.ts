import { hydrateIcons, renderIcon } from "./icons";
import {
  PID_PRESETS,
  type PidParams,
  type RobotMode,
  type SensorTuple,
  type TelemetryMessage,
} from "./types";
import { RobotSocket, type ConnectionState } from "./ws";
import { DualThumbController } from "./controls";

interface UiState {
  currentView: "PREFLIGHT" | "COCKPIT";
  preflightTargetMode: RobotMode;
  mode: RobotMode;
  pwmLimit: number;
  sensors: SensorTuple;
  lineError: number;
  motorLeft: number;
  motorRight: number;
  ledFront: boolean;
  ledRear: boolean;
  batteryV: number | null;
  pid: PidParams;
  selectedPresetId: string;
  pidPopoverOpen: boolean;
  presetDropdownOpen: boolean;
  guideModalOpen: boolean;
}

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required DOM node: #${id}`);
  }
  return el as T;
}

const state: UiState = {
  currentView: "PREFLIGHT",
  preflightTargetMode: "STOP",
  mode: "STOP",
  pwmLimit: 50,
  sensors: [0, 0, 0, 0, 0],
  lineError: 0,
  motorLeft: 0,
  motorRight: 0,
  ledFront: false,
  ledRear: false,
  batteryV: null,
  pid: { kp: 35.0, ki: 0.5, kd: 14.0 },
  selectedPresetId: "balanced",
  pidPopoverOpen: false,
  presetDropdownOpen: false,
  guideModalOpen: false,
};

hydrateIcons(document);

const viewPreflight = getElement<HTMLElement>("view-preflight");
const viewCockpit = getElement<HTMLElement>("view-cockpit");

const pfWsDot = getElement<HTMLElement>("pf-ws-dot");
const pfWsStatus = getElement<HTMLElement>("pf-ws-status");
const pfBootMode = getElement<HTMLElement>("pf-boot-mode");
const pfBattDot = getElement<HTMLElement>("pf-batt-dot");
const pfBatteryVal = getElement<HTMLElement>("pf-battery-val");
const pfSelectedSummary = getElement<HTMLElement>("pf-selected-summary");
const btnLaunchCockpit = getElement<HTMLButtonElement>("btn-launch-cockpit");
const btnFullscreenPf = getElement<HTMLButtonElement>("btn-fullscreen-pf");
const btnOpenGuide = getElement<HTMLButtonElement>("btn-open-guide");
const btnCloseGuide = getElement<HTMLButtonElement>("btn-close-guide");
const guideModal = getElement<HTMLElement>("guide-modal");

const btnBackPreflight = getElement<HTMLButtonElement>("btn-back-preflight");
const btnFullscreenHud = getElement<HTMLButtonElement>("btn-fullscreen-hud");
const hudWsDot = getElement<HTMLElement>("hud-ws-dot");
const hudWsLabel = getElement<HTMLElement>("hud-ws-label");
const hudBatteryVal = getElement<HTMLElement>("hud-battery-val");
const btnEmergencyStop = getElement<HTMLButtonElement>("btn-emergency-stop");

const padThrottleContainer = getElement<HTMLElement>("pad-throttle-container");
const btnForward = getElement<HTMLButtonElement>("btn-throttle-forward");
const btnReverse = getElement<HTMLButtonElement>("btn-throttle-reverse");
const readoutThrottle = getElement<HTMLElement>("readout-throttle");

const padSteeringContainer = getElement<HTMLElement>("pad-steering-container");
const btnLeft = getElement<HTMLButtonElement>("btn-steering-left");
const btnRight = getElement<HTMLButtonElement>("btn-steering-right");
const readoutSteering = getElement<HTMLElement>("readout-steering");

const sensorLineStatus = getElement<HTMLElement>("sensor-line-status");
const telemetryError = getElement<HTMLElement>("telemetry-error");
const telemetryMotorL = getElement<HTMLElement>("telemetry-motor-l");
const telemetryMotorR = getElement<HTMLElement>("telemetry-motor-r");

const pwmSliderTrack = getElement<HTMLElement>("pwm-slider-track");
const pwmSliderFill = getElement<HTMLElement>("pwm-slider-fill");
const pwmSliderThumb = getElement<HTMLElement>("pwm-slider-thumb");
const pwmLimitReadout = getElement<HTMLElement>("pwm-limit-readout");

const btnLedFront = getElement<HTMLButtonElement>("btn-led-front");
const dotLedFront = getElement<HTMLElement>("dot-led-front");
const btnLedRear = getElement<HTMLButtonElement>("btn-led-rear");
const dotLedRear = getElement<HTMLElement>("dot-led-rear");

const btnPidToggle = getElement<HTMLButtonElement>("btn-pid-toggle");
const pidSummaryBadge = getElement<HTMLElement>("pid-summary-badge");
const pidChevron = getElement<HTMLElement>("pid-chevron");
const pidPopover = getElement<HTMLElement>("pid-popover");
const pidFeedbackMsg = getElement<HTMLElement>("pid-feedback-msg");

const btnPresetSelect = getElement<HTMLButtonElement>("btn-preset-select");
const presetCurrentLabel = getElement<HTMLElement>("preset-current-label");
const presetChevron = getElement<HTMLElement>("preset-chevron");
const presetMenuList = getElement<HTMLElement>("preset-menu-list");

const inputPidKp = getElement<HTMLInputElement>("input-pid-kp");
const inputPidKi = getElement<HTMLInputElement>("input-pid-ki");
const inputPidKd = getElement<HTMLInputElement>("input-pid-kd");
const btnPidClose = getElement<HTMLButtonElement>("btn-pid-close");
const btnPidApply = getElement<HTMLButtonElement>("btn-pid-apply");

const pfModeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-pf-mode]")
);
const hudModeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]")
);
const sensorCells = Array.from(
  document.querySelectorAll<HTMLElement>("[data-sensor-idx]")
);

let standbyHintTimer: number | null = null;

const socket = new RobotSocket({
  onConnectionChange: (connState) => renderConnectionState(connState),
  onTelemetry: (telemetry) => applyTelemetry(telemetry),
});

const thumbController = new DualThumbController(
  {
    throttleZone: padThrottleContainer,
    btnForward,
    btnReverse,
    steeringZone: padSteeringContainer,
    btnLeft,
    btnRight,
  },
  {
    isManualAllowed: () => state.mode === "MANUAL",
    onDriveChange: (throttle, steering) => {
      readoutThrottle.textContent = `${throttle > 0 ? "+" : ""}${throttle}%`;
      readoutSteering.textContent = `${steering > 0 ? "+" : ""}${steering}%`;
      readoutThrottle.style.color =
        throttle !== 0 ? "var(--accent-active)" : "var(--ink-primary)";
      readoutSteering.style.color =
        steering !== 0 ? "var(--accent-active)" : "var(--ink-primary)";
      socket.setManualDrive(throttle, steering);
    },
    onEmergencyStop: () => triggerEmergencyStop(),
    onInactiveModeAttempt: () => flashStandbyHint(),
  }
);

function renderConnectionState(conn: ConnectionState): void {
  if (conn === "CONNECTED") {
    pfWsDot.style.backgroundColor = "var(--accent-online)";
    pfWsStatus.textContent = "Terhubung";
    pfWsStatus.style.color = "var(--accent-online)";

    hudWsDot.style.backgroundColor = "var(--accent-online)";
    hudWsLabel.textContent = "Terhubung";
    hudWsLabel.style.color = "var(--accent-online)";
  } else if (conn === "CONNECTING") {
    pfWsDot.style.backgroundColor = "var(--accent-amber)";
    pfWsStatus.textContent = "Menghubungkan...";
    pfWsStatus.style.color = "var(--accent-amber)";

    hudWsDot.style.backgroundColor = "var(--accent-amber)";
    hudWsLabel.textContent = "Menghubungkan";
    hudWsLabel.style.color = "var(--accent-amber)";
  } else {
    pfWsDot.style.backgroundColor = "var(--accent-danger)";
    pfWsStatus.textContent = "Terputus";
    pfWsStatus.style.color = "var(--accent-danger)";

    hudWsDot.style.backgroundColor = "var(--accent-danger)";
    hudWsLabel.textContent = "Terputus";
    hudWsLabel.style.color = "var(--accent-danger)";
  }
}

function setRobotMode(targetMode: RobotMode, sendToRobot = true): void {
  if (state.mode !== targetMode) {
    thumbController.resetAll();
  }
  state.mode = targetMode;

  hudModeButtons.forEach((btn) => {
    const modeAttr = btn.dataset.modeBtn as RobotMode | undefined;
    const isCurrent = modeAttr === targetMode;
    btn.classList.toggle("is-active", isCurrent);
    btn.setAttribute("aria-pressed", String(isCurrent));
  });

  const isStop = targetMode === "STOP";
  btnEmergencyStop.classList.toggle("is-stop-active", isStop);
  btnEmergencyStop.setAttribute("aria-pressed", String(isStop));

  const isManual = targetMode === "MANUAL";
  padThrottleContainer.classList.toggle("pad-zone-standby", !isManual);
  padSteeringContainer.classList.toggle("pad-zone-standby", !isManual);

  const modeLabelMap: Record<RobotMode, string> = {
    STOP: "Berhenti (STOP)",
    MANUAL: "Manual",
    AUTO: "Otomatis",
  };
  pfBootMode.textContent = modeLabelMap[targetMode];

  renderSensorArray(state.sensors, state.lineError);

  if (sendToRobot) {
    socket.send({ type: "mode", mode: targetMode });
  }
}

function triggerEmergencyStop(): void {
  thumbController.resetAll();
  setRobotMode("STOP", false);
  socket.sendEmergencyStop();
  state.motorLeft = 0;
  state.motorRight = 0;
  renderMotorReadouts(0, 0);
}

function flashStandbyHint(): void {
  sensorLineStatus.textContent = "Pilih mode Manual dulu";
  sensorLineStatus.style.color = "var(--accent-amber)";
  if (standbyHintTimer !== null) {
    window.clearTimeout(standbyHintTimer);
  }
  standbyHintTimer = window.setTimeout(() => {
    standbyHintTimer = null;
    renderSensorArray(state.sensors, state.lineError);
  }, 1400);
}

function renderSensorArray(sensors: SensorTuple, lineError: number): void {
  let activeCount = 0;
  sensorCells.forEach((cell, idx) => {
    const val = sensors[idx] ?? 0;
    const detected = val === 1;
    if (detected) {
      activeCount += 1;
    }
    cell.classList.toggle("is-detected", detected);
  });

  const formattedErr = `${lineError > 0 ? "+" : ""}${lineError.toFixed(2)}`;
  telemetryError.textContent = formattedErr;

  if (standbyHintTimer !== null) {
    return;
  }

  if (activeCount === 0) {
    if (state.mode === "AUTO") {
      sensorLineStatus.textContent = "Mencari Garis...";
      sensorLineStatus.style.color = "var(--accent-amber)";
      telemetryError.style.color = "var(--accent-amber)";
    } else if (state.mode === "MANUAL") {
      sensorLineStatus.textContent = "Mode Manual";
      sensorLineStatus.style.color = "var(--ink-secondary)";
      telemetryError.style.color = "var(--ink-primary)";
    } else {
      sensorLineStatus.textContent = "Berhenti";
      sensorLineStatus.style.color = "var(--ink-secondary)";
      telemetryError.style.color = "var(--ink-primary)";
    }
  } else {
    sensorLineStatus.textContent = `Garis Terbaca (${activeCount}/5)`;
    sensorLineStatus.style.color = "var(--accent-danger)";
    telemetryError.style.color =
      Math.abs(lineError) >= 1.5 ? "var(--accent-amber)" : "var(--ink-primary)";
  }
}

function renderMotorReadouts(left: number, right: number): void {
  const l = Math.round(left);
  const r = Math.round(right);
  telemetryMotorL.textContent = `${l > 0 ? "+" : ""}${l}%`;
  telemetryMotorR.textContent = `${r > 0 ? "+" : ""}${r}%`;
  telemetryMotorL.style.color =
    l !== 0 ? "var(--accent-active)" : "var(--ink-primary)";
  telemetryMotorR.style.color =
    r !== 0 ? "var(--accent-active)" : "var(--ink-primary)";
}

function renderBattery(voltage: number | null): void {
  if (voltage === null || !Number.isFinite(voltage) || voltage <= 0) {
    pfBatteryVal.textContent = "--.- V";
    hudBatteryVal.textContent = "--.- V";
    pfBattDot.style.backgroundColor = "var(--ink-secondary)";
    hudBatteryVal.style.color = "var(--ink-primary)";
    return;
  }

  const text = `${voltage.toFixed(2)} V`;
  pfBatteryVal.textContent = text;
  hudBatteryVal.textContent = text;

  const isLow = voltage < 6.6;
  pfBattDot.style.backgroundColor = isLow
    ? "var(--accent-danger)"
    : "var(--accent-online)";
  pfBatteryVal.style.color = isLow
    ? "var(--accent-danger)"
    : "var(--ink-primary)";
  hudBatteryVal.style.color = isLow
    ? "var(--accent-danger)"
    : "var(--ink-primary)";
}

function setPwmLimit(value: number, sendToRobot: boolean): void {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  state.pwmLimit = clamped;
  pwmSliderFill.style.width = `${clamped}%`;
  pwmSliderThumb.style.left = `${clamped}%`;
  pwmLimitReadout.textContent = `${clamped}%`;
  pwmSliderTrack.setAttribute("aria-valuenow", String(clamped));

  if (sendToRobot) {
    socket.send({ type: "pwm_limit", value: clamped });
  }
}

function renderLedState(front: boolean, rear: boolean): void {
  state.ledFront = front;
  state.ledRear = rear;

  btnLedFront.classList.toggle("is-led-on", front);
  btnLedFront.setAttribute("aria-pressed", String(front));
  dotLedFront.style.backgroundColor = front ? "#FAF9F5" : "#B8B5AA";

  btnLedRear.classList.toggle("is-led-on", rear);
  btnLedRear.setAttribute("aria-pressed", String(rear));
  dotLedRear.style.backgroundColor = rear ? "#FAF9F5" : "#B8B5AA";
}

function updatePidSummaryBadge(pid: PidParams): void {
  pidSummaryBadge.textContent = `${pid.kp} / ${pid.ki} / ${pid.kd}`;
}

function applyTelemetry(msg: TelemetryMessage): void {
  if (msg.mode !== state.mode) {
    setRobotMode(msg.mode, false);
  }
  setPwmLimit(msg.pwm_limit, false);
  state.sensors = msg.sensors;
  state.lineError = msg.line_error;
  state.motorLeft = msg.motor_left;
  state.motorRight = msg.motor_right;
  state.batteryV = msg.battery_v;

  renderSensorArray(msg.sensors, msg.line_error);
  renderMotorReadouts(msg.motor_left, msg.motor_right);
  renderLedState(msg.led_front, msg.led_rear);
  renderBattery(msg.battery_v);

  if (!state.pidPopoverOpen) {
    state.pid = msg.pid;
    inputPidKp.value = String(msg.pid.kp);
    inputPidKi.value = String(msg.pid.ki);
    inputPidKd.value = String(msg.pid.kd);
    updatePidSummaryBadge(msg.pid);
  }
}

function setGuideModal(open: boolean): void {
  state.guideModalOpen = open;
  guideModal.hidden = !open;
}

function bindPreflightEvents(): void {
  pfModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.pfMode as RobotMode | undefined;
      if (!mode) {
        return;
      }
      state.preflightTargetMode = mode;
      pfModeButtons.forEach((b) => {
        const bMode = b.dataset.pfMode;
        const active = bMode === mode;
        b.classList.toggle("is-stop-mode", active && mode === "STOP");
        b.classList.toggle("is-active", active && mode !== "STOP");
      });

      const summaryMap: Record<RobotMode, string> = {
        STOP: "STOP (Berhenti)",
        MANUAL: "Manual (Kontrol HP)",
        AUTO: "Otomatis (Ikuti Garis)",
      };
      pfSelectedSummary.textContent = summaryMap[mode];
    });
  });

  btnOpenGuide.addEventListener("click", () => {
    setGuideModal(true);
  });

  btnCloseGuide.addEventListener("click", () => {
    setGuideModal(false);
  });

  guideModal.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.target === guideModal) {
      setGuideModal(false);
    }
  });

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && state.guideModalOpen) {
      setGuideModal(false);
    }
  });

  btnLaunchCockpit.addEventListener("click", () => {
    setGuideModal(false);
    viewPreflight.classList.add("is-hidden");
    viewCockpit.classList.remove("is-hidden");
    state.currentView = "COCKPIT";
    setRobotMode(state.preflightTargetMode, true);
  });

  btnBackPreflight.addEventListener("click", () => {
    triggerEmergencyStop();
    closePidPopover();
    viewCockpit.classList.add("is-hidden");
    viewPreflight.classList.remove("is-hidden");
    state.currentView = "PREFLIGHT";
  });
}

function bindHudAndUtilityEvents(): void {
  hudModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.modeBtn as RobotMode | undefined;
      if (!target) {
        return;
      }
      setRobotMode(target, true);
    });
  });

  btnEmergencyStop.addEventListener("click", () => {
    triggerEmergencyStop();
  });

  btnLedFront.addEventListener("click", () => {
    const nextFront = !state.ledFront;
    renderLedState(nextFront, state.ledRear);
    socket.send({ type: "led", front: nextFront, rear: state.ledRear });
  });

  btnLedRear.addEventListener("click", () => {
    const nextRear = !state.ledRear;
    renderLedState(state.ledFront, nextRear);
    socket.send({ type: "led", front: state.ledFront, rear: nextRear });
  });
}

function bindPwmSliderEvents(): void {
  let sliderPointerId: number | null = null;

  const updateFromClientX = (clientX: number): void => {
    const rect = pwmSliderTrack.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const ratio = (clientX - rect.left) / rect.width;
    setPwmLimit(ratio * 100, true);
  };

  pwmSliderTrack.addEventListener("pointerdown", (e: PointerEvent) => {
    e.preventDefault();
    sliderPointerId = e.pointerId;
    try {
      pwmSliderTrack.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer capture error.
    }
    updateFromClientX(e.clientX);
  });

  pwmSliderTrack.addEventListener("pointermove", (e: PointerEvent) => {
    if (e.pointerId !== sliderPointerId) {
      return;
    }
    updateFromClientX(e.clientX);
  });

  const endSlide = (e: PointerEvent): void => {
    if (e.pointerId !== sliderPointerId) {
      return;
    }
    sliderPointerId = null;
  };

  pwmSliderTrack.addEventListener("pointerup", endSlide);
  pwmSliderTrack.addEventListener("pointercancel", endSlide);
  pwmSliderTrack.addEventListener("lostpointercapture", endSlide);

  pwmSliderTrack.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setPwmLimit(state.pwmLimit + 5, true);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setPwmLimit(state.pwmLimit - 5, true);
    }
  });
}

function renderPresetOptions(): void {
  presetMenuList.innerHTML = PID_PRESETS.map((preset) => {
    const selected = preset.id === state.selectedPresetId;
    return `
      <button
        type="button"
        role="option"
        aria-selected="${selected}"
        data-preset-id="${preset.id}"
        class="dropdown-option ${selected ? "is-selected" : ""} w-full px-3 py-2 flex items-center justify-between text-left"
      >
        <div class="flex flex-col">
          <span class="text-xs font-semibold text-[#16171A]">${preset.label}</span>
          <span class="tabular-nums text-[10px] text-[#555760]">${preset.detail}</span>
        </div>
        <span class="${selected ? "text-[#1E40AF]" : "opacity-0"}">
          ${renderIcon("icon-check", 14)}
        </span>
      </button>
    `;
  }).join("");

  const optionBtns = presetMenuList.querySelectorAll<HTMLButtonElement>(
    "[data-preset-id]"
  );
  optionBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.presetId;
      const found = PID_PRESETS.find((item) => item.id === id);
      if (!found) {
        return;
      }
      state.selectedPresetId = found.id;
      presetCurrentLabel.textContent = found.label;
      inputPidKp.value = String(found.params.kp);
      inputPidKi.value = String(found.params.ki);
      inputPidKd.value = String(found.params.kd);
      togglePresetDropdown(false);
      renderPresetOptions();
    });
  });
}

function togglePresetDropdown(forceOpen?: boolean): void {
  const next = forceOpen ?? !state.presetDropdownOpen;
  state.presetDropdownOpen = next;
  presetMenuList.hidden = !next;
  btnPresetSelect.setAttribute("aria-expanded", String(next));
  presetChevron.classList.toggle("is-open", next);
}

function openPidPopover(): void {
  state.pidPopoverOpen = true;
  pidPopover.hidden = false;
  btnPidToggle.setAttribute("aria-expanded", "true");
  btnPidToggle.classList.add("is-active");
  pidChevron.classList.add("is-open");
}

function closePidPopover(): void {
  state.pidPopoverOpen = false;
  togglePresetDropdown(false);
  pidPopover.hidden = true;
  btnPidToggle.setAttribute("aria-expanded", "false");
  btnPidToggle.classList.remove("is-active");
  pidChevron.classList.remove("is-open");
}

function bindPidPopoverEvents(): void {
  renderPresetOptions();

  btnPidToggle.addEventListener("click", () => {
    if (state.pidPopoverOpen) {
      closePidPopover();
    } else {
      openPidPopover();
    }
  });

  btnPresetSelect.addEventListener("click", () => {
    togglePresetDropdown();
  });

  btnPidClose.addEventListener("click", () => {
    closePidPopover();
  });

  btnPidApply.addEventListener("click", () => {
    const kp = Number.parseFloat(inputPidKp.value);
    const ki = Number.parseFloat(inputPidKi.value);
    const kd = Number.parseFloat(inputPidKd.value);

    if (!Number.isFinite(kp) || !Number.isFinite(ki) || !Number.isFinite(kd)) {
      pidFeedbackMsg.textContent = "Angka tidak valid";
      pidFeedbackMsg.style.color = "var(--accent-danger)";
      return;
    }

    const nextPid: PidParams = {
      kp: Math.max(0, Number(kp.toFixed(2))),
      ki: Math.max(0, Number(ki.toFixed(3))),
      kd: Math.max(0, Number(kd.toFixed(2))),
    };

    state.pid = nextPid;
    updatePidSummaryBadge(nextPid);
    socket.send({ type: "pid", ...nextPid });

    pidFeedbackMsg.textContent = "Tersimpan";
    pidFeedbackMsg.style.color = "var(--accent-online)";
    window.setTimeout(() => {
      pidFeedbackMsg.textContent = "";
    }, 1500);
  });

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && state.pidPopoverOpen) {
      closePidPopover();
    }
  });

  document.addEventListener("pointerdown", (e: PointerEvent) => {
    if (!state.pidPopoverOpen) {
      return;
    }
    const target = e.target as Node | null;
    if (
      target &&
      !pidPopover.contains(target) &&
      !btnPidToggle.contains(target)
    ) {
      closePidPopover();
    }
  });
}

function bindFullscreenEvents(): void {
  const buttons = [btnFullscreenPf, btnFullscreenHud];
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenEnabled?: boolean;
  };

  const supported = Boolean(
    document.fullscreenEnabled ||
      doc.webkitFullscreenEnabled ||
      root.requestFullscreen ||
      root.webkitRequestFullscreen
  );

  if (!supported) {
    buttons.forEach((btn) => {
      btn.hidden = true;
    });
    return;
  }

  const syncFullscreenUi = (): void => {
    const isFs = Boolean(
      document.fullscreenElement || doc.webkitFullscreenElement
    );
    const iconName = isFs ? "icon-minimize" : "icon-maximize";
    buttons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(isFs));
      btn.classList.toggle("is-active", isFs);
      const slot = btn.querySelector<HTMLElement>("[data-icon]");
      if (slot) {
        const size = Number(slot.dataset.iconSize ?? "14");
        slot.innerHTML = renderIcon(iconName, size);
      }
    });
  };

  const toggleFullscreen = async (): Promise<void> => {
    const isFs = Boolean(
      document.fullscreenElement || doc.webkitFullscreenElement
    );
    try {
      if (!isFs) {
        if (root.requestFullscreen) {
          await root.requestFullscreen();
        } else if (root.webkitRequestFullscreen) {
          await root.webkitRequestFullscreen();
        }
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (mode: string) => Promise<void>;
        };
        if (orientation?.lock) {
          await orientation.lock("landscape").catch(() => undefined);
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
    } catch {
      // Ignore if fullscreen request is rejected by browser.
    }
    syncFullscreenUi();
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      void toggleFullscreen();
    });
  });

  document.addEventListener("fullscreenchange", syncFullscreenUi);
  document.addEventListener("webkitfullscreenchange", syncFullscreenUi);
}

bindPreflightEvents();
bindHudAndUtilityEvents();
bindPwmSliderEvents();
bindPidPopoverEvents();
bindFullscreenEvents();
setRobotMode("STOP", false);
setPwmLimit(50, false);
renderLedState(false, false);
renderBattery(null);
socket.connect();
