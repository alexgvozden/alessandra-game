import * as THREE from 'three';
import type { Game } from './Game';

export interface Clickable {
  object: THREE.Object3D;
  onClick: () => void;
  /** Object scaled on hover (defaults to `object`). */
  hoverTarget?: THREE.Object3D;
  enabled?: () => boolean;
  sound?: boolean;
}

export abstract class Screen {
  root = new THREE.Group();
  clickables: Clickable[] = [];
  /** Background texture path (under assets/) or a texture. */
  background: string | THREE.Texture | null = null;

  constructor(protected game: Game) {}

  abstract enter(): void | Promise<void>;
  exit(): void {}
  update(_dt: number, _t: number): void {}
  /** Letter keys arrive upper-case ('A'..'Z'); other keys by name ('Enter', 'ArrowLeft', ...). */
  onKey(_key: string): void {}
  onPointerMove(_x: number, _y: number, _dx: number, _dy: number): void {}
  onPointerDown(_x: number, _y: number): void {}
  onPointerUp(): void {}

  clickable(object: THREE.Object3D, onClick: () => void, opts: Partial<Clickable> = {}) {
    this.clickables.push({ object, onClick, ...opts });
  }
}
