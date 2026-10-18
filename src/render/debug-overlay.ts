/** DOM-based debug readout (crisp text regardless of canvas scaling). Toggle with F3. */
export class DebugOverlay {
  private readonly el: HTMLElement;
  private frames = 0;
  private windowStart = performance.now();
  private fps = 0;
  private lines: Record<string, string | number> = {};

  constructor(container: HTMLElement, visible = import.meta.env.DEV) {
    this.el = document.createElement('pre');
    this.el.className = 'debug-overlay';
    this.el.hidden = !visible;
    container.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.el.hidden = !this.el.hidden;
      }
    });
  }

  set(key: string, value: string | number): void {
    this.lines[key] = value;
  }

  /** Call once per rendered frame. */
  frame(): void {
    this.frames++;
    const now = performance.now();
    if (now - this.windowStart >= 500) {
      this.fps = (this.frames * 1000) / (now - this.windowStart);
      this.frames = 0;
      this.windowStart = now;
    }
    if (this.el.hidden) return;
    const body = Object.entries(this.lines)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    this.el.textContent = `fps: ${this.fps.toFixed(0)}\n${body}`;
  }
}
