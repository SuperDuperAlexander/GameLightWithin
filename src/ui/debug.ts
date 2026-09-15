import { t } from '../content/strings.en';
import type { LearningChecks } from '../core/save';
import { el } from './dom';

export interface DebugInfo {
  calm: number;
  light: number;
  scene: number;
  fps: number;
  tier: string;
  fogStep: number;
  seed: string;
  checks: LearningChecks;
}

/**
 * The debug panel behind `?debug=1`. "Export results" downloads a JSON file.
 * Nothing is ever sent anywhere.
 */
export class DebugPanel {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;

  constructor(exportJson: () => string) {
    this.list = el('dl', {});
    const btn = el('button', { type: 'button', 'data-ui': '1' }, t().debug.exportResults);
    btn.addEventListener('click', () => {
      const blob = new Blob([exportJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'light-within-chapter1.json' });
      a.click();
      URL.revokeObjectURL(url);
    });
    this.root = el('div', { class: 'lw-debug', id: 'lw-debug' }, this.list, btn);
  }

  update(info: DebugInfo): void {
    const rows: [string, string][] = [
      ['fps', String(info.fps)],
      ['tier', info.tier],
      ['scene', String(info.scene)],
      ['calm', info.calm.toFixed(3)],
      ['light', `${info.light}/12`],
      ['fog step', String(info.fogStep)],
      ['seed', info.seed],
      ['noHintFind', String(info.checks.stoppedWithoutHint)],
      ['pushCount', String(info.checks.pushCount)],
      ['leftFog', String(info.checks.leftFogCount)],
      ['awayFromSeed', String(info.checks.walkedAwayFromSeed)],
      ['sceneTimes', JSON.stringify(info.checks.timePerScene)],
    ];
    this.list.replaceChildren(
      ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', { id: `dbg-${k.replace(/\s/g, '')}` }, v)]),
    );
  }
}
