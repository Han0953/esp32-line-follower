export interface DualThumbElements {
  throttleZone: HTMLElement;
  btnForward: HTMLButtonElement;
  btnReverse: HTMLButtonElement;
  steeringZone: HTMLElement;
  btnLeft: HTMLButtonElement;
  btnRight: HTMLButtonElement;
}

export interface DualThumbCallbacks {
  onDriveChange: (throttle: number, steering: number) => void;
  onEmergencyStop: () => void;
  onInactiveModeAttempt: () => void;
  isManualAllowed: () => boolean;
}

export class DualThumbController {
  private readonly el: DualThumbElements;
  private readonly cb: DualThumbCallbacks;

  // Separate pointer IDs prevent left-thumb and right-thumb events from interfering.
  private throttlePointerId: number | null = null;
  private steeringPointerId: number | null = null;
  private activeKeys = new Set<string>();

  private throttle = 0;
  private steering = 0;

  constructor(elements: DualThumbElements, callbacks: DualThumbCallbacks) {
    this.el = elements;
    this.cb = callbacks;
    this.bindZoneEvents();
    this.bindKeyboardEvents();
    this.bindSafetyResetEvents();
  }

  public resetAll(): void {
    this.throttlePointerId = null;
    this.steeringPointerId = null;
    this.activeKeys.clear();
    this.updateState(0, 0);
  }

  private bindZoneEvents(): void {
    const { throttleZone, steeringZone } = this.el;

    throttleZone.addEventListener("pointerdown", (e: PointerEvent) => {
      if (this.throttlePointerId !== null) {
        return;
      }
      const val = this.resolveThrottlePointer(e.clientX, e.clientY);
      if (val === 0) {
        return;
      }
      e.preventDefault();
      if (!this.cb.isManualAllowed()) {
        this.cb.onInactiveModeAttempt();
        return;
      }
      this.throttlePointerId = e.pointerId;
      try {
        throttleZone.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if synthetic pointer cannot be captured.
      }
      this.updateState(val, this.steering);
    });

    throttleZone.addEventListener("pointermove", (e: PointerEvent) => {
      if (e.pointerId !== this.throttlePointerId) {
        return;
      }
      const val = this.resolveThrottlePointer(e.clientX, e.clientY);
      this.updateState(val, this.steering);
    });

    const releaseThrottle = (e: PointerEvent): void => {
      if (e.pointerId !== this.throttlePointerId) {
        return;
      }
      this.throttlePointerId = null;
      this.updateState(0, this.steering);
    };

    throttleZone.addEventListener("pointerup", releaseThrottle);
    throttleZone.addEventListener("pointercancel", releaseThrottle);
    throttleZone.addEventListener("lostpointercapture", releaseThrottle);

    steeringZone.addEventListener("pointerdown", (e: PointerEvent) => {
      if (this.steeringPointerId !== null) {
        return;
      }
      const val = this.resolveSteeringPointer(e.clientX, e.clientY);
      if (val === 0) {
        return;
      }
      e.preventDefault();
      if (!this.cb.isManualAllowed()) {
        this.cb.onInactiveModeAttempt();
        return;
      }
      this.steeringPointerId = e.pointerId;
      try {
        steeringZone.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if synthetic pointer cannot be captured.
      }
      this.updateState(this.throttle, val);
    });

    steeringZone.addEventListener("pointermove", (e: PointerEvent) => {
      if (e.pointerId !== this.steeringPointerId) {
        return;
      }
      const val = this.resolveSteeringPointer(e.clientX, e.clientY);
      this.updateState(this.throttle, val);
    });

    const releaseSteering = (e: PointerEvent): void => {
      if (e.pointerId !== this.steeringPointerId) {
        return;
      }
      this.steeringPointerId = null;
      this.updateState(this.throttle, 0);
    };

    steeringZone.addEventListener("pointerup", releaseSteering);
    steeringZone.addEventListener("pointercancel", releaseSteering);
    steeringZone.addEventListener("lostpointercapture", releaseSteering);
  }

  private bindKeyboardEvents(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (this.isTypingInInput(e.target)) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        this.resetAll();
        this.cb.onEmergencyStop();
        return;
      }

      const key = e.code;
      const isDriveKey =
        key === "KeyW" ||
        key === "KeyS" ||
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "KeyA" ||
        key === "KeyD" ||
        key === "ArrowLeft" ||
        key === "ArrowRight";

      if (!isDriveKey) {
        return;
      }

      e.preventDefault();
      if (!this.cb.isManualAllowed()) {
        this.cb.onInactiveModeAttempt();
        return;
      }

      this.activeKeys.add(key);
      this.recomputeFromKeys();
    });

    window.addEventListener("keyup", (e: KeyboardEvent) => {
      if (!this.activeKeys.has(e.code)) {
        return;
      }
      this.activeKeys.delete(e.code);
      this.recomputeFromKeys();
    });
  }

  private bindSafetyResetEvents(): void {
    window.addEventListener("blur", () => this.resetAll());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.resetAll();
      }
    });
    window.addEventListener("contextmenu", (e: MouseEvent) => {
      if (
        this.el.throttleZone.contains(e.target as Node) ||
        this.el.steeringZone.contains(e.target as Node)
      ) {
        e.preventDefault();
      }
    });
  }

  private recomputeFromKeys(): void {
    let nextThrottle = this.throttlePointerId !== null ? this.throttle : 0;
    let nextSteering = this.steeringPointerId !== null ? this.steering : 0;

    if (this.throttlePointerId === null) {
      const up = this.activeKeys.has("KeyW") || this.activeKeys.has("ArrowUp");
      const down = this.activeKeys.has("KeyS") || this.activeKeys.has("ArrowDown");
      nextThrottle = up && !down ? 100 : down && !up ? -100 : 0;
    }

    if (this.steeringPointerId === null) {
      const left = this.activeKeys.has("KeyA") || this.activeKeys.has("ArrowLeft");
      const right = this.activeKeys.has("KeyD") || this.activeKeys.has("ArrowRight");
      nextSteering = left && !right ? -100 : right && !left ? 100 : 0;
    }

    this.updateState(nextThrottle, nextSteering);
  }

  private resolveThrottlePointer(clientX: number, clientY: number): number {
    if (this.isPointInside(this.el.btnForward, clientX, clientY)) {
      return 100;
    }
    if (this.isPointInside(this.el.btnReverse, clientX, clientY)) {
      return -100;
    }
    return 0;
  }

  private resolveSteeringPointer(clientX: number, clientY: number): number {
    if (this.isPointInside(this.el.btnLeft, clientX, clientY)) {
      return -100;
    }
    if (this.isPointInside(this.el.btnRight, clientX, clientY)) {
      return 100;
    }
    return 0;
  }

  private isPointInside(element: HTMLElement, x: number, y: number): boolean {
    const rect = element.getBoundingClientRect();
    const slop = 14;
    return (
      x >= rect.left - slop &&
      x <= rect.right + slop &&
      y >= rect.top - slop &&
      y <= rect.bottom + slop
    );
  }

  private isTypingInInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  private updateState(nextThrottle: number, nextSteering: number): void {
    const changed =
      nextThrottle !== this.throttle || nextSteering !== this.steering;
    this.throttle = nextThrottle;
    this.steering = nextSteering;

    this.el.btnForward.classList.toggle("is-pressed", this.throttle > 0);
    this.el.btnReverse.classList.toggle("is-pressed", this.throttle < 0);
    this.el.btnLeft.classList.toggle("is-pressed", this.steering < 0);
    this.el.btnRight.classList.toggle("is-pressed", this.steering > 0);

    this.el.btnForward.setAttribute("aria-pressed", String(this.throttle > 0));
    this.el.btnReverse.setAttribute("aria-pressed", String(this.throttle < 0));
    this.el.btnLeft.setAttribute("aria-pressed", String(this.steering < 0));
    this.el.btnRight.setAttribute("aria-pressed", String(this.steering > 0));

    if (changed) {
      this.cb.onDriveChange(this.throttle, this.steering);
    }
  }
}
