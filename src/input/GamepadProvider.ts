import { TOUCH_PAD_METRICS } from '../data/playerKinematics.data';
import { actionBit, type IInputProvider, type RawDeviceSample } from './InputTypes';

export interface GamepadLike {
  readonly connected: boolean;
  readonly index: number;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export type GamepadListSupplier = () => readonly (GamepadLike | null)[];

function applyRadialDeadzone(
  rawX: number,
  rawY: number,
  deadzone: number,
  outVec: { x: number; y: number }
): number {
  const mag = Math.hypot(rawX, rawY);
  if (mag <= deadzone) {
    outVec.x = 0;
    outVec.y = 0;
    return 0;
  }
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
  const inv = scaled / mag;
  outVec.x = rawX * inv;
  outVec.y = rawY * inv;
  return scaled;
}

/**
 * 标准 HTML5 Gamepad 采样器（兼容 Xbox / DualSense / 手机拉伸手柄 W3C Standard Mapping）：
 * - 左摇杆 0.18 径向死区平滑重映射 + 十字键数字覆盖；
 * - 标准键位：A(0)=跳跃, B(1)=翻滚, X(2)=主攻, Y(3)=副手招架, LB(4)=灵液瓶, RB(5)=交互, LT(6)=技能1, RT(7)=技能2, Start(9)=暂停。
 */
export class GamepadProvider implements IInputProvider {
  public readonly kind = 'GAMEPAD' as const;

  private readonly getPads: GamepadListSupplier;
  private readonly stickScratch = { x: 0, y: 0 };
  private readonly aimScratch = { x: 0, y: 0 };
  private lastActiveIndex = 0;
  private prevHeldMask = 0;

  public constructor(supplier?: GamepadListSupplier) {
    this.getPads =
      supplier ??
      (() => {
        if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
          return navigator.getGamepads();
        }
        return [];
      });
  }

  public get activeGamepadIndex(): number {
    return this.lastActiveIndex;
  }

  public sampleInto(out: RawDeviceSample): void {
    const pads = this.getPads();
    let activePad: GamepadLike | null = null;

    const preferred = pads[this.lastActiveIndex];
    if (preferred && preferred.connected) {
      activePad = preferred;
    } else {
      for (let i = 0; i < pads.length; i++) {
        const cand = pads[i];
        if (cand && cand.connected) {
          activePad = cand;
          this.lastActiveIndex = i;
          break;
        }
      }
    }

    if (!activePad) {
      out.moveX = 0;
      out.moveY = 0;
      out.heldMask = 0;
      out.latchedPressMask = 0;
      out.hadActivity = false;
      this.prevHeldMask = 0;
      return;
    }

    const dz = TOUCH_PAD_METRICS.GAMEPAD_RADIAL_DEADZONE;
    const trig = TOUCH_PAD_METRICS.GAMEPAD_TRIGGER_THRESHOLD;

    const leftMag = applyRadialDeadzone(
      activePad.axes[0] ?? 0,
      activePad.axes[1] ?? 0,
      dz,
      this.stickScratch
    );

    const dpadUp = this.isPressed(activePad, 12, 0.5);
    const dpadDown = this.isPressed(activePad, 13, 0.5);
    const dpadLeft = this.isPressed(activePad, 14, 0.5);
    const dpadRight = this.isPressed(activePad, 15, 0.5);

    const dpadX = (dpadRight ? 1 : 0) - (dpadLeft ? 1 : 0);
    const dpadY = (dpadDown ? 1 : 0) - (dpadUp ? 1 : 0);

    out.moveX = dpadX !== 0 ? dpadX : this.stickScratch.x;
    out.moveY = dpadY !== 0 ? dpadY : this.stickScratch.y;

    const rightMag = applyRadialDeadzone(
      activePad.axes[2] ?? 0,
      activePad.axes[3] ?? 0,
      dz,
      this.aimScratch
    );
    if (rightMag > 0.05) {
      out.aimX = this.aimScratch.x;
      out.aimY = this.aimScratch.y;
    } else if (Math.hypot(out.moveX, out.moveY) > 0.1) {
      const m = Math.hypot(out.moveX, out.moveY);
      out.aimX = out.moveX / m;
      out.aimY = out.moveY / m;
    }

    let mask = 0;
    if (this.isPressed(activePad, 0, 0.5)) mask |= actionBit('jump');
    if (this.isPressed(activePad, 1, 0.5)) mask |= actionBit('dodge');
    if (this.isPressed(activePad, 2, 0.5)) mask |= actionBit('attack_primary');
    if (this.isPressed(activePad, 3, 0.5)) mask |= actionBit('attack_secondary');
    if (this.isPressed(activePad, 4, 0.5)) mask |= actionBit('heal_flask');
    if (this.isPressed(activePad, 5, 0.5)) mask |= actionBit('interact');
    if (this.isPressed(activePad, 6, trig)) mask |= actionBit('skill_1');
    if (this.isPressed(activePad, 7, trig)) mask |= actionBit('skill_2');
    if (this.isPressed(activePad, 9, 0.5)) mask |= actionBit('pause');

    out.heldMask = mask;
    out.latchedPressMask = mask & ~this.prevHeldMask;
    out.hadActivity =
      mask !== 0 || leftMag > 0 || rightMag > 0 || dpadX !== 0 || dpadY !== 0;

    this.prevHeldMask = mask;
  }

  public resetState(): void {
    this.prevHeldMask = 0;
  }

  public destroy(): void {
    this.prevHeldMask = 0;
  }

  private isPressed(pad: GamepadLike, btnIdx: number, threshold: number): boolean {
    const b = pad.buttons[btnIdx];
    if (!b) return false;
    return b.pressed || b.value >= threshold;
  }
}
