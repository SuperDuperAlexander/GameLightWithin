import { THANKS } from '../content/chapter1';
import type { EventBus } from '../core/events';
import { dist2d } from '../core/math';

/**
 * The thanks mechanic. Standing on the finished bridge and taking three calm
 * breaths turns the bridge golden and lets colour flow across the valley.
 */
export class ThanksSystem {
  breaths = 0;
  complete = false;
  /** 0 to 1, how golden the bridge has turned. */
  golden = 0;
  private bridgeReady = false;

  constructor(
    private readonly bus: EventBus,
    private readonly bridge: { x: number; z: number },
  ) {
    bus.on('bridgeComplete', () => (this.bridgeReady = true));
  }

  get ready(): boolean {
    return this.bridgeReady;
  }

  onBridge(px: number, pz: number): boolean {
    return this.bridgeReady && dist2d(px, pz, this.bridge.x, this.bridge.z) <= THANKS.radius;
  }

  onBreath(calm: boolean, px: number, pz: number): void {
    if (!calm || this.complete || !this.onBridge(px, pz)) return;
    this.breaths++;
    this.bus.emit('thanksProgress', { breaths: this.breaths });
    if (this.breaths >= THANKS.breaths) {
      this.complete = true;
      this.bus.emit('thanksComplete');
      this.bus.emit('cue', { id: 'thanks' });
    }
  }

  update(dt: number): void {
    if (!this.complete) return;
    this.golden = Math.min(1, this.golden + dt / THANKS.colorSeconds);
  }
}
