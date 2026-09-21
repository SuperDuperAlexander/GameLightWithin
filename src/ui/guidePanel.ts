import { el } from './dom';

/**
 * What the guide says, on screen.
 *
 * It is text first and always. A recorded teaching plays above the words,
 * never instead of them, so a muted device, a slow connection or a screen
 * reader loses nothing but the picture. It never covers the middle of the
 * screen and it never stops the world: the player can walk away from it.
 */
export class GuidePanel {
  readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private readonly film: HTMLVideoElement;
  private readonly close: HTMLButtonElement;
  private showing = false;
  /** Called when the player closes the message. */
  onDismiss: (() => void) | null = null;

  constructor(closeLabel: string) {
    this.text = el('p', { class: 'lw-guide-text' });
    this.film = document.createElement('video');
    this.film.className = 'lw-guide-film';
    this.film.playsInline = true;
    this.film.controls = true;
    this.film.preload = 'none';
    this.film.hidden = true;

    this.close = el('button', {
      class: 'lw-guide-close',
      type: 'button',
    }) as HTMLButtonElement;
    this.close.textContent = closeLabel;
    this.close.addEventListener('click', () => this.onDismiss?.());

    this.root = el(
      'div',
      { class: 'lw-guide', role: 'status', 'aria-live': 'polite' },
      this.film,
      this.text,
      this.close,
    );
    this.root.dataset.show = 'false';
  }

  get isShowing(): boolean {
    return this.showing;
  }

  /**
   * Shows a message. `video` is a path under the game's own files and is
   * only fetched now, the first time this teaching is reached.
   */
  show(text: string, video?: string, holds = false): void {
    this.text.textContent = text;
    this.root.dataset.hold = holds ? 'true' : 'false';
    this.close.hidden = !holds;
    if (video) {
      this.film.src = video;
      this.film.hidden = false;
      // A teaching is offered, not forced. Nothing plays on its own.
      this.film.load();
    } else {
      this.film.hidden = true;
      this.film.removeAttribute('src');
    }
    this.root.dataset.show = 'true';
    this.showing = true;
  }

  hide(): void {
    if (!this.showing) return;
    this.showing = false;
    this.root.dataset.show = 'false';
    this.film.pause();
    this.film.hidden = true;
    this.film.removeAttribute('src');
  }
}
