import { t } from '../content/strings.en';
import type { InputState } from '../core/input';
import { isTouchDevice } from '../core/quality';
import { BreathCircle } from './breathCircle';
import { el } from './dom';

/**
 * The head-up display: the breath circle, the touch controls, the pause
 * button, the soft hint line and the thought that appears inside the fog.
 */
export class Hud {
  readonly root: HTMLElement;
  readonly breathCircle = new BreathCircle();
  private readonly hint: HTMLElement;
  private readonly fogText: HTMLElement;
  private readonly pushBtn: HTMLButtonElement;
  private readonly interactBtn: HTMLButtonElement;
  private readonly breathBtn: HTMLButtonElement;
  private readonly joyKnob: HTMLElement;

  constructor(
    private readonly input: InputState,
    onPause: () => void,
    onPush: () => void,
    onInteract: () => void,
  ) {
    // A laptop with a touchscreen reports touch points but is played with a
    // keyboard, so showing the joystick straight away just clutters the view.
    // The touch controls appear the first time a finger is actually used.
    if (isTouchDevice() && !matchMedia('(any-hover: hover)').matches) {
      document.body.classList.add('lw-touch');
    }
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') document.body.classList.add('lw-touch');
      },
      { capture: true },
    );

    this.hint = el('div', { class: 'lw-hint', role: 'status', 'aria-live': 'polite' });
    this.fogText = el('div', { class: 'lw-fog-text', 'aria-hidden': 'true' });

    const pauseBtn = el(
      'button',
      { class: 'lw-icon-btn', type: 'button', 'data-ui': '1', 'aria-label': t().hud.pause },
      '❙❙',
    );
    pauseBtn.addEventListener('click', onPause);

    this.pushBtn = el(
      'button',
      { class: 'lw-push-btn', type: 'button', 'data-ui': '1' },
      t().hud.push,
      el('span', { class: 'lw-key', 'aria-hidden': 'true' }, 'E'),
    );
    this.pushBtn.addEventListener('click', onPush);
    this.pushBtn.style.display = 'none';

    this.interactBtn = el(
      'button',
      { class: 'lw-push-btn', type: 'button', 'data-ui': '1' },
      t().hud.plant,
      el('span', { class: 'lw-key', 'aria-hidden': 'true' }, 'Enter'),
    );
    this.interactBtn.addEventListener('click', onInteract);
    this.interactBtn.style.display = 'none';

    this.breathBtn = el(
      'button',
      { class: 'lw-breath-btn', type: 'button', 'data-ui': '1', 'aria-label': t().hud.breatheIn },
      t().hud.breatheIn,
    );
    const hold = (on: boolean) => (): void => {
      this.input.touchBreath = on;
      this.breathBtn.dataset.held = String(on);
    };
    this.breathBtn.addEventListener('pointerdown', hold(true));
    this.breathBtn.addEventListener('pointerup', hold(false));
    this.breathBtn.addEventListener('pointercancel', hold(false));
    this.breathBtn.addEventListener('pointerleave', hold(false));
    // The breath button must work from the keyboard too.
    this.breathBtn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') hold(true)();
    });
    this.breathBtn.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') hold(false)();
    });

    this.joyKnob = el('div', { class: 'lw-joystick-knob' });
    const joystick = el(
      'div',
      { class: 'lw-joystick', 'data-ui': '1', 'aria-label': t().hud.joystick, role: 'application' },
      this.joyKnob,
    );
    this.input.onJoystick = (x, y): void => {
      this.joyKnob.style.transform = `translate(${x}px, ${y}px)`;
    };

    this.root = el(
      'div',
      { id: 'lw-hud' },
      this.fogText,
      this.breathCircle.root,
      this.hint,
      el('div', { class: 'lw-corner' }, pauseBtn),
      joystick,
      el('div', { class: 'lw-touch-right' }, this.pushBtn, this.interactBtn, this.breathBtn),
    );
    this.joystickZone = joystick;
  }

  readonly joystickZone: HTMLElement;

  setPushVisible(on: boolean): void {
    this.pushBtn.style.display = on ? '' : 'none';
  }

  setInteractVisible(on: boolean): void {
    this.interactBtn.style.display = on ? '' : 'none';
  }

  /** A short soft line. Used for controls, never to explain the meaning. */
  showHint(text: string | null): void {
    if (text === null) {
      this.hint.dataset.show = 'false';
      return;
    }
    this.hint.textContent = text;
    this.hint.dataset.show = 'true';
  }

  /** The thought inside the fog appears letter by letter. */
  setFogText(text: string, progress: number): void {
    if (progress <= 0) {
      this.fogText.style.opacity = '0';
      this.fogText.textContent = '';
      return;
    }
    const shown = Math.ceil(text.length * Math.min(1, progress));
    this.fogText.textContent = text.slice(0, shown);
    this.fogText.style.opacity = String(Math.min(1, progress * 2.2));
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? '' : 'none';
  }
}
