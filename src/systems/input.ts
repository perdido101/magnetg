import { config } from '../config';

// All input funnels through two commands so mobile + desktop share one path:
//   flip()           — short tap / click / Space tap
//   pulse(holdMs)    — release after a hold; holdMs drives pulse strength
// The game also reads `isCharging` + `chargeMs` to draw the charging ring.
export interface InputHandlers {
  flip: () => void;
  pulse: (holdMs: number) => void;
  // fired once when a press crosses the hold threshold (for sfx/visual cue)
  pulseChargeStart?: () => void;
  // gameplay actions only valid while playing
  isActionable: () => boolean;
}

export class Input {
  private pressing = false;
  private pressStart = 0;
  private crossed = false; // crossed the hold threshold this press

  constructor(
    private el: HTMLElement,
    private handlers: InputHandlers
  ) {
    this.attach();
  }

  /** True while a hold is being charged into a pulse. */
  get isCharging(): boolean {
    return this.pressing && this.crossed;
  }

  /** Milliseconds the current charge has been held (0 if not charging). */
  get chargeMs(): number {
    if (!this.isCharging) return 0;
    return performance.now() - this.pressStart;
  }

  private begin(): void {
    if (!this.handlers.isActionable()) return;
    if (this.pressing) return;
    this.pressing = true;
    this.crossed = false;
    this.pressStart = performance.now();
  }

  private end(): void {
    if (!this.pressing) return;
    this.pressing = false;
    const held = performance.now() - this.pressStart;
    if (held >= config.input.holdThresholdMs) {
      this.handlers.pulse(held);
    } else {
      this.handlers.flip();
    }
    this.crossed = false;
  }

  /** Call each frame so the charging cue can fire even before release. */
  tick(): void {
    if (this.pressing && !this.crossed) {
      if (performance.now() - this.pressStart >= config.input.holdThresholdMs) {
        this.crossed = true;
        this.handlers.pulseChargeStart?.();
      }
    }
  }

  private attach(): void {
    const el = this.el;

    // Pointer events cover touch + mouse + pen uniformly.
    el.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        this.begin();
      },
      { passive: false }
    );
    const up = (e: Event) => {
      e.preventDefault();
      this.end();
    };
    el.addEventListener('pointerup', up, { passive: false });
    el.addEventListener('pointercancel', up, { passive: false });
    el.addEventListener('pointerleave', () => {
      // releasing off the element still resolves the press
      if (this.pressing) this.end();
    });

    // Keyboard fallback: Space / Enter behave exactly like tap/hold.
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.begin();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.end();
      }
    });

    // Block context menu / scroll gestures on the play surface.
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
