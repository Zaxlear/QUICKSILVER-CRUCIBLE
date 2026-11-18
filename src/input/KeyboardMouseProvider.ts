import {
  ALL_ACTION_IDS,
  DEFAULT_KEYBOARD_BINDINGS,
  type ActionId,
} from '../data/playerKinematics.data';
import { actionBit, type IInputProvider, type RawDeviceSample } from './InputTypes';

function isUiInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') {
    return false;
  }
  return Boolean((target as Element).closest('[data-ui-interactive="true"], button'));
}

/**
 * 桌面端键鼠输入采样器：
 * - 支持 WASD + 方向键双轨移动、鼠标左右键挥砍/招架与瞄准向量计算；
 * - 内置亚帧边沿锁存（Sub-Frame Latch），根除两次 rAF 之间极速轻点跳跃丢指令问题；
 * - 支持运行时按键重绑定 rebindKey()。
 */
export class KeyboardMouseProvider implements IInputProvider {
  public readonly kind = 'KEYBOARD_MOUSE' as const;

  private readonly bindings = new Map<ActionId, string[]>();
  private readonly codeToActionMask = new Map<string, number>();
  private readonly heldKeys = new Set<string>();

  private mouseButtonsMask = 0;
  private latchedPressMask = 0;
  private hadRecentEvent = false;
  private pointerClientX = 0;
  private pointerClientY = 0;
  private refScreenX = 320;
  private refScreenY = 180;
  private readonly win: Window | null;
  /** 在移动端超宽视口下忽略模拟鼠标点击，交由 TouchVirtualPadProvider 处理虚拟按键 */
  private suppressMouseButtons = false;

  public constructor(win: Window | null = typeof window !== 'undefined' ? window : null) {
    this.win = win;
    for (const action of ALL_ACTION_IDS) {
      this.bindings.set(action, [...DEFAULT_KEYBOARD_BINDINGS[action]]);
    }
    this.rebuildLookup();

    if (this.win) {
      this.refScreenX = (this.win.innerWidth || 640) * 0.5;
      this.refScreenY = (this.win.innerHeight || 360) * 0.5;
      this.win.addEventListener('keydown', this.onKeyDown);
      this.win.addEventListener('keyup', this.onKeyUp);
      this.win.addEventListener('pointerdown', this.onPointerDown);
      this.win.addEventListener('pointerup', this.onPointerUp);
      this.win.addEventListener('pointermove', this.onPointerMove, { passive: true });
      this.win.addEventListener('contextmenu', this.onContextMenu);
      this.win.addEventListener('blur', this.resetState);
    }
  }

  public setSuppressMouseButtons(suppress: boolean): void {
    this.suppressMouseButtons = suppress;
    if (suppress) {
      this.mouseButtonsMask = 0;
    }
  }

  public setHeroScreenReference(screenX: number, screenY: number): void {
    this.refScreenX = screenX;
    this.refScreenY = screenY;
  }

  public rebindKey(action: ActionId, keyCodes: readonly string[]): void {
    this.bindings.set(action, [...keyCodes]);
    this.rebuildLookup();
  }

  public getBoundKeys(action: ActionId): readonly string[] {
    return this.bindings.get(action) ?? [];
  }

  public injectKey(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.heldKeys.has(code)) {
        this.heldKeys.add(code);
        this.latchedPressMask |= this.codeToActionMask.get(code) ?? 0;
      }
      this.hadRecentEvent = true;
    } else {
      this.heldKeys.delete(code);
    }
  }

  public injectMouseButton(button: number, isDown: boolean): void {
    const mask =
      button === 0
        ? actionBit('attack_primary')
        : button === 2
          ? actionBit('attack_secondary')
          : 0;
    if (mask === 0) return;

    if (isDown) {
      this.mouseButtonsMask |= mask;
      this.latchedPressMask |= mask;
      this.hadRecentEvent = true;
    } else {
      this.mouseButtonsMask &= ~mask;
    }
  }

  public sampleInto(out: RawDeviceSample): void {
    const left = this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft');
    const right = this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight');
    const up = this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp');
    const down = this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown');

    out.moveX = (right ? 1 : 0) - (left ? 1 : 0);
    out.moveY = (down ? 1 : 0) - (up ? 1 : 0);

    const dx = this.pointerClientX - this.refScreenX;
    const dy = this.pointerClientY - this.refScreenY;
    const len = Math.hypot(dx, dy);
    if (len > 1e-3) {
      out.aimX = dx / len;
      out.aimY = dy / len;
    } else {
      out.aimX = out.moveX !== 0 ? Math.sign(out.moveX) : 1;
      out.aimY = 0;
    }

    let mask = this.mouseButtonsMask;
    for (const code of this.heldKeys) {
      mask |= this.codeToActionMask.get(code) ?? 0;
    }

    out.heldMask = mask;
    out.latchedPressMask = this.latchedPressMask;
    out.hadActivity =
      this.hadRecentEvent || mask !== 0 || out.moveX !== 0 || out.moveY !== 0;

    this.latchedPressMask = 0;
    this.hadRecentEvent = false;
  }

  public readonly resetState = (): void => {
    this.heldKeys.clear();
    this.mouseButtonsMask = 0;
    this.latchedPressMask = 0;
    this.hadRecentEvent = false;
  };

  public destroy(): void {
    if (!this.win) return;
    this.win.removeEventListener('keydown', this.onKeyDown);
    this.win.removeEventListener('keyup', this.onKeyUp);
    this.win.removeEventListener('pointerdown', this.onPointerDown);
    this.win.removeEventListener('pointerup', this.onPointerUp);
    this.win.removeEventListener('pointermove', this.onPointerMove);
    this.win.removeEventListener('contextmenu', this.onContextMenu);
    this.win.removeEventListener('blur', this.resetState);
  }

  private rebuildLookup(): void {
    this.codeToActionMask.clear();
    for (const [action, codes] of this.bindings.entries()) {
      const bit = actionBit(action);
      for (const code of codes) {
        const prev = this.codeToActionMask.get(code) ?? 0;
        this.codeToActionMask.set(code, prev | bit);
      }
    }
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.repeat) return;
    const isMovementKey =
      ev.code === 'Space' ||
      ev.code === 'ArrowUp' ||
      ev.code === 'ArrowDown' ||
      ev.code === 'ArrowLeft' ||
      ev.code === 'ArrowRight';
    if (isMovementKey) {
      ev.preventDefault();
    }
    this.injectKey(ev.code, true);
  };

  private readonly onKeyUp = (ev: KeyboardEvent): void => {
    this.injectKey(ev.code, false);
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse' || this.suppressMouseButtons) return;
    if (isUiInteractiveTarget(ev.target)) return;
    this.pointerClientX = ev.clientX;
    this.pointerClientY = ev.clientY;
    this.injectMouseButton(ev.button, true);
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    this.injectMouseButton(ev.button, false);
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse' || this.suppressMouseButtons) return;
    this.pointerClientX = ev.clientX;
    this.pointerClientY = ev.clientY;
  };

  private readonly onContextMenu = (ev: MouseEvent): void => {
    if (!isUiInteractiveTarget(ev.target)) {
      ev.preventDefault();
    }
  };
}
