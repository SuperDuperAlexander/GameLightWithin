import { Game } from './game';
import { parseFlags } from './core/debugFlags';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');

const game = new Game(root, parseFlags(window.location.search));
void game.start();
