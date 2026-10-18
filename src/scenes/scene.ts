/** A full-screen mode of the app (title, menu, battle, …). */
export interface Scene {
  /** Short id, exposed to tests via window.__tankwars.scene. */
  readonly name: string;
  /** One fixed sim tick. */
  update(): void;
  render(alpha: number): void;
  /** Called when leaving the scene: remove listeners, DOM nodes, etc. */
  dispose(): void;
}
