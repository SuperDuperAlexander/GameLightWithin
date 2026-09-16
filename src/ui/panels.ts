import { GAME_TITLE, t } from '../content/strings.en';
import type { Answers, SettingsData } from '../core/save';
import { button, el, focusFirst } from './dom';

/**
 * Every overlay panel: the start screen, the questions, settings, pause,
 * the seed choice, the learning cycle and the chapter end screen.
 */
export class Panels {
  readonly root: HTMLElement;
  private current: HTMLElement | null = null;
  /** Called whenever a panel opens or closes, so the game can pause. */
  onOpenChanged: ((open: boolean) => void) | null = null;
  onSelect: (() => void) | null = null;

  constructor() {
    this.root = el('div', { id: 'lw-panels' });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  close(): void {
    this.current?.remove();
    this.current = null;
    this.onOpenChanged?.(false);
  }

  private show(panel: HTMLElement): void {
    this.current?.remove();
    const overlay = el('div', { class: 'lw-overlay' }, panel);
    this.root.append(overlay);
    this.current = overlay;
    this.onOpenChanged?.(true);
    focusFirst(panel);
  }

  private tap(fn: () => void): () => void {
    return () => {
      this.onSelect?.();
      fn();
    };
  }

  /** Start screen: title, Begin and Settings. */
  startScreen(
    onBegin: () => void,
    onSettings: () => void,
    hasSave: boolean,
    onContinue: () => void,
  ): void {
    const s = t();
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog', 'aria-label': GAME_TITLE },
      el('h1', { class: 'lw-title' }, GAME_TITLE),
      el('p', { class: 'lw-sub' }, s.start.subtitle),
    );
    // The build stamp. If this does not match what was just shipped, the game
    // being looked at is an older build.
    panel.append(el('p', { class: 'lw-build' }, `${s.start.version} ${__BUILD_STAMP__}`));
    const row = el('div', { class: 'lw-row' });
    row.append(button(s.start.begin, 'lw-btn', this.tap(onBegin)));
    if (hasSave) row.append(button(s.pause.resume, 'lw-btn lw-btn--quiet', this.tap(onContinue)));
    row.append(button(s.start.settings, 'lw-btn lw-btn--quiet', this.tap(onSettings)));
    panel.append(row);
    this.show(panel);
  }

  /** The two questions, each on a 1 to 5 scale. */
  questions(initial: Answers, onDone: (a: Answers) => void): void {
    const s = t();
    const answers: Answers = { receive: initial.receive, calm: initial.calm };
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog', 'aria-label': s.questions.heading },
      el('h2', { class: 'lw-heading' }, s.questions.heading),
    );

    const done = button(
      s.questions.continue,
      'lw-btn',
      this.tap(() => onDone(answers)),
    );
    done.disabled = true;
    const refresh = (): void => {
      done.disabled = answers.receive === null || answers.calm === null;
    };

    for (const key of ['receive', 'calm'] as const) {
      panel.append(
        el(
          'p',
          { class: 'lw-question' },
          key === 'receive' ? s.questions.receive : s.questions.calm,
        ),
      );
      const scale = el('div', { class: 'lw-scale', role: 'radiogroup', 'aria-label': key });
      const buttons: HTMLButtonElement[] = [];
      for (let i = 1; i <= 5; i++) {
        const b = el(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': 'false',
            'data-ui': '1',
            'data-value': String(i),
          },
          String(i),
        );
        b.addEventListener('click', () => {
          answers[key] = i;
          for (const other of buttons) other.setAttribute('aria-checked', String(other === b));
          this.onSelect?.();
          refresh();
        });
        buttons.push(b);
        scale.append(b);
      }
      panel.append(
        scale,
        el(
          'div',
          { class: 'lw-scale-ends' },
          el('span', {}, key === 'receive' ? s.questions.receiveLow : s.questions.calmLow),
          el('span', {}, key === 'receive' ? s.questions.receiveHigh : s.questions.calmHigh),
        ),
      );
      const stored = answers[key];
      if (stored !== null) buttons[stored - 1]?.setAttribute('aria-checked', 'true');
    }

    panel.append(
      el('p', { class: 'lw-note' }, s.questions.privacy),
      el('div', { class: 'lw-row' }, done),
    );
    refresh();
    this.show(panel);
  }

  settings(data: SettingsData, onChange: (d: SettingsData) => void, onBack: () => void): void {
    const s = t();
    const next = { ...data };
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog', 'aria-label': s.settings.heading },
      el('h2', { class: 'lw-heading' }, s.settings.heading),
    );

    const segment = <T extends string>(
      label: string,
      options: { id: T; label: string }[],
      value: T,
      set: (v: T) => void,
    ): HTMLElement => {
      const group = el('div', { class: 'lw-seg', role: 'group', 'aria-label': label });
      const buttons: HTMLButtonElement[] = [];
      for (const option of options) {
        const b = el(
          'button',
          { type: 'button', 'data-ui': '1', 'aria-pressed': String(option.id === value) },
          option.label,
        );
        b.addEventListener('click', () => {
          set(option.id);
          for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
          this.onSelect?.();
          onChange(next);
        });
        buttons.push(b);
        group.append(b);
      }
      return el('div', { class: 'lw-field' }, el('span', {}, label), group);
    };

    panel.append(
      segment(
        s.settings.rhythm,
        [
          { id: 'normal' as const, label: s.settings.rhythmNormal },
          { id: 'slow' as const, label: s.settings.rhythmSlow },
          { id: 'easy' as const, label: s.settings.rhythmEasy },
        ],
        next.rhythm,
        (v) => (next.rhythm = v),
      ),
      segment(
        s.settings.quality,
        [
          { id: 'auto' as const, label: s.settings.qualityAuto },
          { id: 'low' as const, label: s.settings.qualityLow },
          { id: 'medium' as const, label: s.settings.qualityMedium },
          { id: 'high' as const, label: s.settings.qualityHigh },
        ],
        next.quality,
        (v) => (next.quality = v),
      ),
    );

    const slider = el('input', {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(next.volume * 100)),
      'data-ui': '1',
      'aria-label': s.settings.volume,
    }) as HTMLInputElement;
    slider.addEventListener('input', () => {
      next.volume = Number(slider.value) / 100;
      onChange(next);
    });
    panel.append(el('div', { class: 'lw-field' }, el('span', {}, s.settings.volume), slider));

    panel.append(
      segment(
        s.settings.mute,
        [
          { id: 'off' as const, label: s.settings.off },
          { id: 'on' as const, label: s.settings.on },
        ],
        next.muted ? 'on' : 'off',
        (v) => (next.muted = v === 'on'),
      ),
      segment(
        s.settings.reducedMotion,
        [
          { id: 'off' as const, label: s.settings.off },
          { id: 'on' as const, label: s.settings.on },
        ],
        next.reducedMotion ? 'on' : 'off',
        (v) => (next.reducedMotion = v === 'on'),
      ),
      el('div', { class: 'lw-row' }, button(s.start.back, 'lw-btn', this.tap(onBack))),
    );
    this.show(panel);
  }

  pause(onResume: () => void, onSettings: () => void, onStart: () => void): void {
    const s = t();
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog', 'aria-label': s.pause.heading },
      el('h2', { class: 'lw-title' }, s.pause.heading),
      el(
        'div',
        { class: 'lw-row' },
        button(s.pause.resume, 'lw-btn', this.tap(onResume)),
        button(s.pause.settings, 'lw-btn lw-btn--quiet', this.tap(onSettings)),
        button(s.pause.toStart, 'lw-btn lw-btn--quiet', this.tap(onStart)),
      ),
    );
    this.show(panel);
  }

  /** The seed choice. Only "Bridge" is enabled in chapter 1. */
  seedChoice(canAfford: boolean, onPlant: () => void, onCancel: () => void): void {
    const s = t();
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog', 'aria-label': s.seed.heading },
      el('h2', { class: 'lw-heading' }, s.seed.heading),
    );
    const row = el('div', { class: 'lw-row' });

    const bridge = el('button', { class: 'lw-btn lw-btn--stack', type: 'button', 'data-ui': '1' });
    bridge.append(s.seed.bridge, el('small', {}, canAfford ? s.seed.cost : s.seed.notEnough));
    bridge.disabled = !canAfford;
    bridge.addEventListener('click', this.tap(onPlant));
    row.append(bridge);

    for (const label of [s.seed.tree, s.seed.house, s.seed.well]) {
      const b = el('button', {
        class: 'lw-btn lw-btn--quiet lw-btn--stack',
        type: 'button',
        disabled: 'true',
      });
      b.append(label, el('small', {}, s.seed.comingSoon));
      row.append(b);
    }

    panel.append(
      row,
      el(
        'div',
        { class: 'lw-row' },
        button(s.seed.cancel, 'lw-btn lw-btn--quiet', this.tap(onCancel)),
      ),
    );
    this.show(panel);
  }

  /** Learning cycle step 1. Every answer gets the same reply. */
  reflect(onNext: () => void): void {
    const s = t();
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog', 'aria-label': s.reflect.question },
      el('h2', { class: 'lw-heading' }, s.reflect.question),
    );
    const row = el('div', { class: 'lw-row' });
    const reply = el('p', { class: 'lw-text' }, '');
    reply.style.visibility = 'hidden';
    const next = button(s.end.next, 'lw-btn', this.tap(onNext));
    next.style.display = 'none';

    for (const answer of [
      s.reflect.answerCalm,
      s.reflect.answerImpatient,
      s.reflect.answerNothing,
    ]) {
      row.append(
        button(
          answer,
          'lw-btn lw-btn--quiet',
          this.tap(() => {
            reply.textContent = s.reflect.reply;
            reply.style.visibility = 'visible';
            row.style.display = 'none';
            next.style.display = '';
            next.focus();
          }),
        ),
      );
    }
    panel.append(row, reply, el('div', { class: 'lw-row' }, next));
    this.show(panel);
  }

  /** One text card with a Next button. Used by Understand and Apply. */
  card(text: string, onNext: () => void): void {
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog' },
      el('p', { class: 'lw-text' }, text),
      el('div', { class: 'lw-row' }, button(t().end.next, 'lw-btn', this.tap(onNext))),
    );
    this.show(panel);
  }

  chapterEnd(onAgain: () => void, onStart: () => void): void {
    const s = t();
    const soon = el('button', {
      class: 'lw-btn lw-btn--quiet lw-btn--stack',
      type: 'button',
      disabled: 'true',
    });
    soon.append(s.end.nextChapter, el('small', {}, s.end.comingSoon));
    const panel = el(
      'div',
      { class: 'lw-panel', role: 'dialog', 'aria-label': s.end.heading },
      el('h2', { class: 'lw-title' }, s.end.heading),
      el(
        'div',
        { class: 'lw-row' },
        button(s.end.playAgain, 'lw-btn', this.tap(onAgain)),
        button(s.end.toStart, 'lw-btn lw-btn--quiet', this.tap(onStart)),
        soon,
      ),
    );
    this.show(panel);
  }
}
