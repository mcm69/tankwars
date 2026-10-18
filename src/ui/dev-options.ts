import type { GameOptions, WallMode, WindLevel } from '../sim/options';
import { WIND_LEVELS } from '../sim/options';

/**
 * Temporary developer panel for game options (toggle with F2). The real main menu arrives in
 * Stage 6. Sim options apply from the next round; presentation options apply immediately.
 */
export class DevOptionsPanel {
  private readonly el: HTMLFormElement;

  constructor(
    container: HTMLElement,
    private options: GameOptions,
    private readonly onChange: (options: GameOptions) => void,
  ) {
    this.el = document.createElement('form');
    this.el.className = 'dev-options';
    this.el.hidden = true;
    this.el.innerHTML = `
      <h2>Options <small>F2</small></h2>
      <label>Wind <select name="wind">${[...WIND_LEVELS, 'random']
        .map((w) => `<option value="${w}">${w}</option>`)
        .join('')}</select></label>
      <label>Walls <select name="walls">
        <option value="off">off</option><option value="on">bounce</option>
        <option value="random">random</option></select></label>
      <label>Crumble <input name="crumble" type="range" min="0" max="100" step="5">
        <output name="crumbleOut"></output></label>
      <label><input name="tanksFall" type="checkbox"> Tanks fall</label>
      <label><input name="explosionsKill" type="checkbox"> Explosions kill</label>
      <label><input name="visibleShot" type="checkbox"> Visible shot</label>
      <label><input name="shotTrail" type="checkbox"> Shot trail</label>
      <p>Wind, walls, crumble, falling and kills apply from the next round.</p>`;
    container.appendChild(this.el);
    this.sync();

    this.el.addEventListener('input', () => this.read());
    this.el.addEventListener('submit', (e) => e.preventDefault());
    // Keep game keys (arrows, space) from changing form controls while the panel has focus.
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' && e.key !== 'F2') e.preventDefault();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        this.el.hidden = !this.el.hidden;
      }
    });
  }

  private field<T extends HTMLInputElement | HTMLSelectElement>(name: string): T {
    return this.el.elements.namedItem(name) as T;
  }

  private sync(): void {
    const o = this.options;
    this.field<HTMLSelectElement>('wind').value = o.wind;
    this.field<HTMLSelectElement>('walls').value = o.walls;
    this.field<HTMLInputElement>('crumble').value = String(o.crumble);
    (this.el.elements.namedItem('crumbleOut') as HTMLOutputElement).value = `${o.crumble}%`;
    this.field<HTMLInputElement>('tanksFall').checked = o.tanksFall;
    this.field<HTMLInputElement>('explosionsKill').checked = o.explosionsKill;
    this.field<HTMLInputElement>('visibleShot').checked = o.visibleShot;
    this.field<HTMLInputElement>('shotTrail').checked = o.shotTrail;
  }

  private read(): void {
    this.options = {
      wind: this.field<HTMLSelectElement>('wind').value as WindLevel | 'random',
      walls: this.field<HTMLSelectElement>('walls').value as WallMode,
      crumble: Number(this.field<HTMLInputElement>('crumble').value),
      tanksFall: this.field<HTMLInputElement>('tanksFall').checked,
      explosionsKill: this.field<HTMLInputElement>('explosionsKill').checked,
      visibleShot: this.field<HTMLInputElement>('visibleShot').checked,
      shotTrail: this.field<HTMLInputElement>('shotTrail').checked,
    };
    this.sync();
    this.onChange(this.options);
  }
}
