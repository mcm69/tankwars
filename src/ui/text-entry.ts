/**
 * Text entry for canvas UIs, backed by an off-screen <input> so typing, IME and mobile soft
 * keyboards all work. The scene draws `value` itself.
 */
export class TextEntry {
  private readonly input: HTMLInputElement;
  private done: ((value: string | null) => void) | null = null;

  constructor() {
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.className = 'text-entry';
    this.input.setAttribute('aria-label', 'Player name');
    document.body.appendChild(this.input);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.finish(true);
      else if (e.key === 'Escape') this.finish(false);
      e.stopPropagation();
    });
    this.input.addEventListener('blur', () => this.finish(true));
  }

  get active(): boolean {
    return this.done !== null;
  }

  get value(): string {
    return this.input.value;
  }

  start(initial: string, maxLength: number, done: (value: string | null) => void): void {
    this.done = done;
    this.input.maxLength = maxLength;
    this.input.value = initial;
    this.input.focus();
    this.input.select();
  }

  /**
   * Applies a key that reached the page before the field had focus (keys typed within the
   * same tick as the press that opened it). Returns true if the key was used.
   */
  feed(key: string): boolean {
    if (!this.active) return false;
    if (key === 'Enter') this.finish(true);
    else if (key === 'Escape') this.finish(false);
    else if (key === 'Backspace') this.input.value = this.input.value.slice(0, -1);
    else if (key.length === 1) {
      // Typing replaces the initially selected text, like the real field would.
      const selectedAll =
        this.input.selectionStart === 0 && this.input.selectionEnd === this.input.value.length;
      const base = selectedAll ? '' : this.input.value;
      this.input.value = (base + key).slice(0, this.input.maxLength);
    } else return false;
    return true;
  }

  private finish(commit: boolean): void {
    const cb = this.done;
    if (!cb) return;
    this.done = null;
    this.input.blur();
    cb(commit ? this.input.value : null);
  }

  dispose(): void {
    this.done = null;
    this.input.remove();
  }
}
