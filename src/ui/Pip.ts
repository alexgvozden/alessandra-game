import * as THREE from 'three';
import gsap from 'gsap';
import { tex, pipMeta, type PipPose } from '../core/assets';
import { flat } from '../gfx/materials';
import { audio } from '../core/audio';
import type { Particles } from '../gfx/particles';

/**
 * Pip the owl: a 2D sprite with poses. The group origin is Pip's feet.
 * `size` is roughly the body width in world units.
 */
export class Pip extends THREE.Group {
  private rig = new THREE.Group(); // animated (bob, squash, tilt)
  private sprite: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  pose: PipPose = 'idle';
  private base: PipPose = 'idle';
  private revertTimer: gsap.core.Tween | null = null;
  private blinkAt = 2;
  private blinking = 0;
  private t = Math.random() * 10;
  private sleeping = false;
  private snoreAt = 0;
  private dancing = false;

  constructor(private size: number, private particles?: Particles) {
    super();
    this.mat = flat(tex('sprites/pip_idle.png'));
    this.sprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.rig.add(this.sprite);
    this.add(this.rig);
    this.apply('idle');
  }

  private apply(p: PipPose) {
    const m = pipMeta[p] ?? { size: 0.45, bottom: 0.75, cx: 0.5 };
    const plane = this.size / m.size;
    this.sprite.scale.set(plane, plane, 1);
    this.sprite.position.set((0.5 - m.cx) * plane, (m.bottom - 0.5) * plane, 0);
    this.mat.map = tex(`sprites/pip_${p}.png`);
    this.pose = p;
  }

  /** Default pose Pip returns to. */
  setBase(p: PipPose) {
    this.base = p;
    if (!this.revertTimer) this.apply(p);
  }

  /** Switch pose with a little squash-pop; returns to base after `hold` seconds (0 = stay). */
  show(p: PipPose, hold = 1.2) {
    if (this.sleeping && p !== 'sleep') this.wake();
    this.apply(p);
    gsap.fromTo(this.rig.scale, { x: 1.12, y: 0.88 }, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1.2,0.4)' });
    this.revertTimer?.kill();
    this.revertTimer = null;
    gsap.to(this.rig.rotation, { z: p === 'think' ? 0.14 : 0, duration: 0.3 });
    if (hold > 0) {
      this.revertTimer = gsap.delayedCall(hold, () => { this.revertTimer = null; this.apply(this.base); gsap.to(this.rig.rotation, { z: 0, duration: 0.3 }); });
    }
  }

  cheer() {
    this.show('cheer', 1.0);
    gsap.fromTo(this.rig.position, { y: 0 }, { y: this.size * 0.35, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.out' });
  }

  think() { this.show('think', 1.4); }

  dance(on = true) {
    this.dancing = on;
    if (on) { this.show('dance', 0); } else { this.show(this.base, 0); this.rig.rotation.z = 0; }
  }

  sleep() {
    if (this.sleeping) return;
    this.sleeping = true;
    this.show('sleep', 0);
    this.snoreAt = 1;
  }

  wake() {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.apply('wave');
    gsap.fromTo(this.rig.position, { y: 0 }, { y: this.size * 0.25, duration: 0.18, yoyo: true, repeat: 1 });
    this.revertTimer?.kill();
    this.revertTimer = gsap.delayedCall(1.2, () => { this.revertTimer = null; this.apply(this.base); });
  }

  get isSleeping() { return this.sleeping; }

  update(dt: number) {
    this.t += dt;
    if (this.dancing) {
      this.rig.rotation.z = Math.sin(this.t * 7) * 0.18;
      this.rig.position.y = Math.abs(Math.sin(this.t * 7)) * this.size * 0.18;
      if (Math.random() < dt * 2) this.particles && this.notes();
    } else if (this.sleeping) {
      const b = Math.sin(this.t * 1.6);
      this.rig.scale.set(1 + b * 0.025, 1 - b * 0.025, 1);
      this.snoreAt -= dt;
      if (this.snoreAt <= 0) {
        this.snoreAt = 3.2;
        const w = this.getWorldPosition(new THREE.Vector3());
        this.particles?.zzz(w.x + this.size * 0.4, w.y + this.size * 1.1);
        audio.play('snore', { volume: 0.5 });
      }
    } else {
      // breathing + tiny bob
      this.rig.scale.y += ((1 + Math.sin(this.t * 2.2) * 0.018) - this.rig.scale.y) * 0.2;
      this.sprite.position.y += 0;
      // blink (only the idle pose has a matching blink frame)
      if (this.pose === 'idle' || this.pose === 'blink') {
        this.blinkAt -= dt;
        if (this.blinking > 0) {
          this.blinking -= dt;
          if (this.blinking <= 0) this.apply('idle');
        } else if (this.blinkAt <= 0) {
          this.apply('blink');
          this.blinking = 0.13;
          this.blinkAt = 2.5 + Math.random() * 3;
        }
      }
    }
  }

  private notes() {
    const w = this.getWorldPosition(new THREE.Vector3());
    this.particles?.notes(w.x, w.y + this.size, 1);
  }
}
