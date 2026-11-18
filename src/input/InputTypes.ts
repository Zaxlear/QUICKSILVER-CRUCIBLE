import {
  ALL_ACTION_IDS,
  type ActionId,
  type InputDeviceKind,
} from '../data/playerKinematics.data';

export type { ActionId, InputDeviceKind };
export { ALL_ACTION_IDS };

/**
 * 单个外设提供器向 ActionMap 输出的零分配可变采样帧结构。
 * 使用位掩码记录 9 个标准动作状态，彻底消除 120Hz 热路径对象/数组分配。
 */
export interface RawDeviceSample {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  /** 当前帧处于按住状态的动作位掩码 */
  heldMask: number;
  /** 自上次 120Hz 采样以来新触发按下的亚帧锁存位掩码（防极速点按丢键） */
  latchedPressMask: number;
  /** 本次采样周期是否检测到主动外设输入（用于多端无感热切换仲裁） */
  hadActivity: boolean;
}

export function actionBit(action: ActionId): number {
  switch (action) {
    case 'jump':
      return 1 << 0;
    case 'dodge':
      return 1 << 1;
    case 'attack_primary':
      return 1 << 2;
    case 'attack_secondary':
      return 1 << 3;
    case 'skill_1':
      return 1 << 4;
    case 'skill_2':
      return 1 << 5;
    case 'heal_flask':
      return 1 << 6;
    case 'interact':
      return 1 << 7;
    case 'pause':
      return 1 << 8;
  }
}

export function createEmptyDeviceSample(): RawDeviceSample {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    heldMask: 0,
    latchedPressMask: 0,
    hadActivity: false,
  };
}

export interface IInputProvider {
  readonly kind: InputDeviceKind;
  sampleInto(out: RawDeviceSample): void;
  resetState(): void;
  destroy(): void;
}

/**
 * 暴露给实体与 10 状态节点化 FSM 的只读输入抽象契约。
 * 实体层严禁直接访问 Keyboard / Gamepad / Touch 原始事件。
 */
export interface IInputReader {
  readonly activeDevice: InputDeviceKind;
  readonly moveX: number;
  readonly moveY: number;
  readonly aimX: number;
  readonly aimY: number;
  readonly isCrouchHeld: boolean;
  isHeld(action: ActionId): boolean;
  wasJustPressed(action: ActionId): boolean;
  wasJustReleased(action: ActionId): boolean;
  /** 查询指定动作是否处于预输入缓冲窗口内（不消费缓冲） */
  peekBuffered(action: ActionId, maxWindowTicks?: number): boolean;
  /** 查询并立即消费指定动作的预输入缓冲（防止同一次按键重复触发二段动作） */
  consumeBuffered(action: ActionId, maxWindowTicks?: number): boolean;
  clearActionBuffer(action: ActionId): void;
}
