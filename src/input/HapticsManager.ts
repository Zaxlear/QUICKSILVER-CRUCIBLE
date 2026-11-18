import { EventBus } from '../core/EventBus';

interface DualRumbleActuator {
  playEffect?: (
    type: string,
    params: {
      readonly startDelay?: number;
      readonly duration: number;
      readonly weakMagnitude: number;
      readonly strongMagnitude: number;
    }
  ) => Promise<unknown>;
}

export type HapticPresetId =
  | 'STEP_OR_CLAW'
  | 'DOUBLE_JUMP_VAPOR'
  | 'DODGE_SWOOSH'
  | 'LIGHT_HIT'
  | 'CRIT_HEAVY'
  | 'PARRY_CLANG'
  | 'PLAYER_HURT';

const HAPTIC_PRESETS: Readonly<
  Record<
    HapticPresetId,
    { readonly durationMs: number; readonly strong: number; readonly weak: number }
  >
> = {
  STEP_OR_CLAW: { durationMs: 18, strong: 0.0, weak: 0.16 },
  DOUBLE_JUMP_VAPOR: { durationMs: 36, strong: 0.14, weak: 0.35 },
  DODGE_SWOOSH: { durationMs: 42, strong: 0.18, weak: 0.28 },
  LIGHT_HIT: { durationMs: 40, strong: 0.28, weak: 0.45 },
  CRIT_HEAVY: { durationMs: 95, strong: 0.82, weak: 0.9 },
  PARRY_CLANG: { durationMs: 110, strong: 0.95, weak: 1.0 },
  PLAYER_HURT: { durationMs: 135, strong: 1.0, weak: 0.65 },
} as const;

/**
 * 手柄双马达力反馈与移动端优雅降级震动管理器（src/input/HapticsManager.ts）。
 * 兼容 W3C GamepadHapticActuator (Xbox/DualSense) 及 Android WebKit vibrate；iOS Safari 安全静默。
 */
export class HapticsManager {
  private enabled = true;
  private readonly unsubscribers: Array<() => void> = [];

  public mount(): void {
    this.unsubscribers.push(
      EventBus.on('combat:parry_succeeded', () => this.pulse('PARRY_CLANG')),
      EventBus.on('combat:crit_triggered', () => this.pulse('CRIT_HEAVY')),
      EventBus.on('combat:hit_landed', ({ isCrit }) => {
        if (!isCrit) this.pulse('LIGHT_HIT');
      }),
      EventBus.on('combat:dodge_evaded', () => this.pulse('DODGE_SWOOSH')),
      EventBus.on('player:state_changed', ({ next }) => {
        if (next === 'DoubleJump') this.pulse('DOUBLE_JUMP_VAPOR');
        else if (next === 'DodgeRoll') this.pulse('DODGE_SWOOSH');
        else if (next === 'Hurt') this.pulse('PLAYER_HURT');
      })
    );
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public pulse(presetId: HapticPresetId): void {
    if (!this.enabled || typeof navigator === 'undefined') return;
    const preset = HAPTIC_PRESETS[presetId];

    // 1. 优先尝试已连接手柄双马达震动
    if (typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i] as (Gamepad & { vibrationActuator?: DualRumbleActuator }) | null;
        const actuator = pad?.vibrationActuator;
        if (pad?.connected && actuator && typeof actuator.playEffect === 'function') {
          void actuator
            .playEffect('dual-rumble', {
              startDelay: 0,
              duration: preset.durationMs,
              strongMagnitude: preset.strong,
              weakMagnitude: preset.weak,
            })
            .catch(() => {
              // 忽略无焦点或浏览器权限拦截异常
            });
          return;
        }
      }
    }

    // 2. 移动端轻触马达优雅降级（仅在用户已激活交互后触发重事件，避免浏览器未激活拦截提示）
    const navWithActivation = navigator as Navigator & {
      userActivation?: { readonly hasBeenActive?: boolean };
    };
    const canVibrate = navWithActivation.userActivation?.hasBeenActive === true;
    if (
      canVibrate &&
      typeof navigator.vibrate === 'function' &&
      (presetId === 'PARRY_CLANG' || presetId === 'CRIT_HEAVY' || presetId === 'PLAYER_HURT')
    ) {
      try {
        navigator.vibrate(Math.min(60, Math.round(preset.durationMs * 0.45)));
      } catch {
        // iOS Safari / WebView 不支持时静默跳过
      }
    }
  }

  public destroy(): void {
    while (this.unsubscribers.length > 0) {
      this.unsubscribers.pop()?.();
    }
  }
}
