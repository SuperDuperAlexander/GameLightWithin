import './ui/styles.css';
import { Chapter1 } from './chapter1';
import { parseFlags } from './core/debugFlags';
import { Game } from './game';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');

const flags = parseFlags(window.location.search);
const game = new Game(root, flags);

void game.start().then(() => {
  const chapter = new Chapter1(game);
  game.onFrame = (dt): void => chapter.update(dt);
  chapter.begin();
  // The browser tests read the state through this. It is only attached when a
  // debug flag is set, so a normal player never sees it.
  if (flags.debug || flags.autobreathe || flags.startScene !== null) {
    (window as Window & { __lw?: unknown }).__lw = chapter.testApi();
  }
  document.body.dataset.ready = '1';
});
