import type { App } from '../app';
import { buildDebugState } from './debug-state';

let shown = false;

/**
 * The error boundary's face: a plain DOM panel (the canvas may be what broke) with the error,
 * a "Copy debug info" button and a reload. Your settings and the set (as of the last game
 * boundary) are saved, so reloading offers Resume.
 */
export function showErrorPanel(error: unknown, app: App | undefined): void {
  if (shown) return;
  shown = true;
  console.error(error);
  let state = '';
  try {
    state = JSON.stringify(buildDebugState(app, error));
  } catch (e) {
    state = JSON.stringify({ error: String(error), stateError: String(e) });
  }
  const panel = document.createElement('div');
  panel.className = 'error-panel';
  panel.setAttribute('role', 'alertdialog');
  const message = error instanceof Error ? error.message : String(error);
  panel.innerHTML = `
    <h1>Kaboom! Tank Wars crashed.</h1>
    <p>Sorry about that. Your settings and your set (as of the start of this game) are saved,
      so reloading lets you resume.</p>
    <pre class="error-message"></pre>
    <p>If you report this, please include the debug info: it lets the game be replayed.</p>
    <div class="error-buttons">
      <button type="button" data-act="copy">Copy debug info</button>
      <button type="button" data-act="reload">Reload</button>
    </div>
    <textarea readonly hidden aria-label="Debug info"></textarea>`;
  panel.querySelector('.error-message')!.textContent = message;
  const area = panel.querySelector('textarea')!;
  area.value = state;
  const copy = panel.querySelector<HTMLButtonElement>('[data-act="copy"]')!;
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(state).then(
      () => (copy.textContent = 'Copied!'),
      () => {
        // No clipboard access: show the text, selected, for a manual copy.
        area.hidden = false;
        area.select();
        copy.textContent = 'Select all and copy';
      },
    );
  });
  panel
    .querySelector('[data-act="reload"]')!
    .addEventListener('click', () => window.location.reload());
  document.body.appendChild(panel);
}

export function errorPanelShown(): boolean {
  return shown;
}
