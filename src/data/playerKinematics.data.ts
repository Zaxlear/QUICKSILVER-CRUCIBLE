/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》主角精确运动学参数、10 状态枚举、输入动作与默认键位纯数据表。
 * 纯静态数据与类型声明层（零运行时依赖），严格对齐 docs/02_COMBAT_AND_ROGUELITE_SPEC.md。
 */

export type PlayerStateId =
  | 'Idle'
  | 'Run'
  | 'Jump'
  | 'DoubleJump'
  | 'WallSlide'
  | 'DodgeRoll'
  | 'Parry'
  | 'AttackCombo'
  | 'Hurt'
  | 'Dead';

export type ActionId =
  | 'jump'
  | 'dodge'
  | 'attack_primary'
  | 'attack_secondary'
  | 'skill_1'
  | 'skill_2'
  | 'heal_flask'
  | 'interact'
  | 'pause';

export type InputDeviceKind = 'KEYBOARD_MOUSE' | 'GAMEPAD' | 'TOUCH';

export const ALL_ACTION_IDS: readonly ActionId[] = [
  'jump',
  'dodge',
  'attack_primary',
  'attack_secondary',
  'skill_1',
  'skill_2',
  'heal_flask',
  'interact',
  'pause',
] as const;

export interface TouchStickHudState {
  readonly active: boolean;
  readonly originX: number;
  readonly originY: number;
  readonly knobX: number;
  readonly knobY: number;
  readonly moveX: number;
  readonly moveY: number;
}

export interface TouchButtonHudItem {
  readonly action: ActionId;
  readonly label: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusPx: number;
  readonly spriteSlot: number;
  readonly pressed: boolean;
  readonly accentRole: 'primary' | 'secondary' | 'mobility' | 'utility';
}

export interface TouchHudSnapshot {
  readonly visible: boolean;
  readonly activeDevice: InputDeviceKind;
  readonly stick: TouchStickHudState;
  readonly buttons: readonly TouchButtonHudItem[];
}

export interface PlayerTelemetrySnapshot {
  readonly state: PlayerStateId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: -1 | 1;
  readonly isGrounded: boolean;
  readonly isOnOneWay: boolean;
  readonly isInvulnerable: boolean;
  readonly isParryWindowActive: boolean;
  readonly isAttackHitboxActive: boolean;
  readonly coyoteTicks: number;
  readonly airJumpsRemaining: number;
  readonly comboIndex: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly activeDevice: InputDeviceKind;
}

/** 120Hz 固定逻辑步长下的精确主角运动学常量表 */
export const PLAYER_KINEMATICS = {
  // 碰撞体几何（脚底中心对齐 pivot (0.5, 1.0)）
  STANDING_WIDTH_PX: 14,
  STANDING_HEIGHT_PX: 30,
  COMPRESSED_HEIGHT_PX: 16,
  MAX_SWEPT_SUBSTEP_PX: 6,

  // 水平跑动加减速与急停转向（px/s 与 px/s^2）
  MAX_RUN_SPEED: 216,
  GROUND_ACCEL: 2880,
  GROUND_DECEL: 3600,
  TURN_SNAP_ACCEL: 5400,
  AIR_ACCEL: 1920,
  AIR_DECEL: 960,

  // 垂直跳跃与三段式非对称重力
  JUMP_INITIAL_VY: -372,
  JUMP_CUT_MULTIPLIER: 0.45,
  APEX_VY_THRESHOLD: 45,
  GRAVITY_RISE: 1180,
  GRAVITY_APEX: 590,
  GRAVITY_FALL: 1740,
  MAX_FALL_VY: 540,
  DOUBLE_JUMP_VY: -336,

  // 磁铁攀爪贴墙与蹬墙反跳
  WALL_SLIDE_MAX_VY: 92,
  WALL_JUMP_VX: 250,
  WALL_JUMP_VY: -355,
  WALL_JUMP_LOCK_TICKS: 12, // 100.0 ms @ 120Hz
  WALL_DETACH_GRACE_TICKS: 6,

  // 煅烧震地下砸（docs/02 §1.1：空中悬停蓄力 83.3ms = 10 ticks -> +680 px/s 极速俯冲）
  SLAM_HOVER_TICKS: 10,
  SLAM_DIVE_VY: 680,
  SLAM_SHOCKWAVE_RADIUS_PX: 80,
  VINE_CLIMB_VY: -188,

  // 帧级宽容度与预输入缓冲窗口（@ 120Hz, 1 tick = 8.3333ms）
  COYOTE_TICKS: 12, // 100.0 ms
  JUMP_BUFFER_TICKS: 14, // 116.7 ms
  ACTION_BUFFER_TICKS: 16, // 133.3 ms
  ONE_WAY_DROP_IGNORE_TICKS: 18, // 150.0 ms

  // 翻滚 DodgeRollState 精确帧时间轴（总长 350ms = 42 ticks，总位移精确 96.0 px）
  DODGE_TOTAL_TICKS: 42,
  DODGE_IFRAME_END_TICK: 32, // 第 1..32 ticks 完全无敌
  DODGE_CANCEL_START_TICK: 34, // 第 34 tick (283.3ms) 起开放跳跃/攻击提前取消
  DODGE_COOLDOWN_TICKS: 54, // 450.0 ms
  DODGE_GHOST_INTERVAL_TICKS: 4,
  DODGE_INITIAL_SPEED: 380,
  DODGE_MEAN_SPEED: 96 / (42 / 120), // 274.285714 px/s -> 42 ticks 余弦积分精确 96.0 px

  // 盾牌招架 ParryState 精确帧时间轴（总长 450ms = 54 ticks）
  PARRY_STARTUP_TICKS: 2, // 1..2 ticks (16.7ms) 起盾前摇
  PARRY_WINDOW_END_TICK: 20, // 3..20 ticks (150.0ms = 18 ticks) 黄金招架判定窗
  PARRY_TOTAL_TICKS: 54,
  PARRY_WHIFF_COOLDOWN_TICKS: 36,

  // 受击硬直与无敌保护帧
  HURT_STUN_TICKS: 22,
  HURT_MERCY_IFRAME_TICKS: 36,
  HURT_KNOCKBACK_VX: 145,
  HURT_KNOCKBACK_VY: -130,

  // 镜头水平前瞻偏移
  CAMERA_LOOKAHEAD_X_PX: 28,
} as const;

export interface WeaponComboStageTiming {
  readonly startupTicks: number;
  readonly activeTicks: number;
  readonly recoveryTicks: number;
  readonly cancelStartTick: number;
  readonly lungePx: number;
  readonly animStartFrame: number;
  readonly animEndFrame: number;
}

/**
 * 默认近战骨架三段连招帧时间表（源自 docs/02 锈蚀解剖刃 / 主角 12 帧三段挥砍骨架 @120Hz）：
 * S1: 7f 前摇 + 4f 判定 + 14f 后摇 (总 25f, Tick 12 起可翻滚/盾反取消)
 * S2: 6f 前摇 + 4f 判定 + 14f 后摇 (总 24f, Tick 11 起可翻滚/盾反取消)
 * S3: 10f 前摇 + 6f 判定 + 22f 后摇 (总 38f, Tick 18 起可翻滚/盾反取消)
 */
export const DEFAULT_MELEE_COMBO_STAGES: readonly WeaponComboStageTiming[] = [
  {
    startupTicks: 7,
    activeTicks: 4,
    recoveryTicks: 14,
    cancelStartTick: 12,
    lungePx: 10,
    animStartFrame: 0,
    animEndFrame: 3,
  },
  {
    startupTicks: 6,
    activeTicks: 4,
    recoveryTicks: 14,
    cancelStartTick: 11,
    lungePx: 10,
    animStartFrame: 4,
    animEndFrame: 7,
  },
  {
    startupTicks: 10,
    activeTicks: 6,
    recoveryTicks: 22,
    cancelStartTick: 18,
    lungePx: 14,
    animStartFrame: 8,
    animEndFrame: 11,
  },
] as const;

/** 节点化状态机标准取消优先级（数值越高优先级越强） */
export const PLAYER_STATE_PRIORITY: Readonly<Record<PlayerStateId, number>> = {
  Idle: 10,
  Run: 20,
  Jump: 30,
  DoubleJump: 35,
  WallSlide: 40,
  AttackCombo: 50,
  DodgeRoll: 70,
  Parry: 70,
  Hurt: 90,
  Dead: 100,
} as const;

/** 桌面键盘默认动作映射表（支持运行时覆盖改键） */
export const DEFAULT_KEYBOARD_BINDINGS: Readonly<Record<ActionId, readonly string[]>> = {
  jump: ['Space'],
  dodge: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  attack_primary: ['KeyJ'],
  attack_secondary: ['KeyK'],
  skill_1: ['KeyQ', 'KeyU'],
  skill_2: ['KeyC', 'KeyI'],
  heal_flask: ['KeyF', 'KeyH'],
  interact: ['KeyE'],
  pause: ['Escape'],
} as const;

/** 触控虚拟摇杆与人体工学按键几何常量 */
export const TOUCH_PAD_METRICS = {
  LEFT_ZONE_WIDTH_RATIO: 0.46,
  STICK_DEADZONE_PX: 8,
  STICK_MAX_RADIUS_PX: 44,
  STICK_ORIGIN_DRIFT_LIMIT_PX: 48,
  CROUCH_AXIS_THRESHOLD: 0.56,
  GAMEPAD_RADIAL_DEADZONE: 0.18,
  GAMEPAD_TRIGGER_THRESHOLD: 0.35,
} as const;

export interface TouchArcButtonSpec {
  readonly action: ActionId;
  readonly label: string;
  readonly offsetRightPx: number;
  readonly offsetBottomPx: number;
  readonly radiusPx: number;
  readonly spriteSlot: number;
  readonly accentRole: TouchButtonHudItem['accentRole'];
}

/** 右侧人体工学扇形弧键静态布局配表（相对右下安全区内缩锚点偏移） */
export const ERGONOMIC_TOUCH_ARC_SPECS: readonly TouchArcButtonSpec[] = [
  { action: 'attack_primary', label: 'ATK', offsetRightPx: 56, offsetBottomPx: 64, radiusPx: 30, spriteSlot: 0, accentRole: 'primary' },
  { action: 'jump', label: 'JMP', offsetRightPx: 126, offsetBottomPx: 32, radiusPx: 24, spriteSlot: 3, accentRole: 'mobility' },
  { action: 'dodge', label: 'ROLL', offsetRightPx: 118, offsetBottomPx: 96, radiusPx: 24, spriteSlot: 2, accentRole: 'mobility' },
  { action: 'attack_secondary', label: 'PRY', offsetRightPx: 46, offsetBottomPx: 132, radiusPx: 23, spriteSlot: 1, accentRole: 'secondary' },
  { action: 'skill_1', label: 'S1', offsetRightPx: 168, offsetBottomPx: 136, radiusPx: 19, spriteSlot: 4, accentRole: 'utility' },
  { action: 'skill_2', label: 'S2', offsetRightPx: 108, offsetBottomPx: 162, radiusPx: 19, spriteSlot: 5, accentRole: 'utility' },
  { action: 'heal_flask', label: 'HEAL', offsetRightPx: 44, offsetBottomPx: 194, radiusPx: 18, spriteSlot: 6, accentRole: 'utility' },
  { action: 'interact', label: 'ACT', offsetRightPx: 176, offsetBottomPx: 78, radiusPx: 18, spriteSlot: 7, accentRole: 'utility' },
] as const;
