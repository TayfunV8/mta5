// Klavye + fare (pointer lock) girdisi.
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.locked = false; this.mouseLeft = false; this.mouseRight = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab' || (e.code.startsWith('F') && e.code.length <= 3)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => { if (!this.locked) canvas.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked) { this.keys.clear(); this.mouseLeft = this.mouseRight = false; } this.onLockChange?.(this.locked); });
    addEventListener('mousedown', (e) => { if (!this.locked) return; if (e.button === 0) this.mouseLeft = true; if (e.button === 2) this.mouseRight = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseLeft = false; if (e.button === 2) this.mouseRight = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
  }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }
}
