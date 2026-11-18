import type {
  ActionId,
  PlayerStateId,
  WeaponComboStageTiming,
} from '../../../data/playerKinematics.data';
import type { SkillSlotId } from '../../../data/skills.data';
import type { Milestone5WeaponId, WeaponSlotId } from '../../../data/weapons.data';
import type { IInputReader } from '../../../input/InputTypes';
import type { PlayerInventory } from '../PlayerInventory';
import type { CollisionWorld, PlayerPhysics } from '../PlayerPhysics';
import type { PlayerStats } from '../PlayerStats';

export type { PlayerStateId };

export type LocomotionVfxKind =
  | 'sprint_dust'
  | 'turn_brake_dust'
  | 'dodge_dust'
  | 'land_dust'
  | 'double_jump_ring'
  | 'wall_claw_spark'
  | 'parry_flash'
  | 'slam_shockwave';

/**
 * 传递给 10 个独立状态节点的统一上下文容器（无 Phaser 渲染强耦合，100% 支持纯逻辑单测）。
 */
export interface PlayerPresentationHooks {
  playAnim(animKey: string, startFrame?: number): void;
  setSpriteFrame(frameName: string): void;
  spawnGhostTrail(): void;
  emitLocomotionVfx(kind: LocomotionVfxKind, dirX: -1 | 1): void;
  setShieldRefractActive(active: boolean): void;
  triggerHitFlash(durationMs: number): void;
  notifyAttackStarted(comboIndex: number): void;
  notifyWeaponStageActive(
    weaponId: Milestone5WeaponId,
    stageIndex: number,
    slot: WeaponSlotId
  ): void;
  notifyParrySucceeded(): void;
  notifySlamLanded(worldX: number, worldY: number, hasCalcinedRam: boolean): void;
  notifyFlaskDrunk(healedAmount: number): void;
  notifySkillActivated(slot: SkillSlotId): void;
  absorbIncomingWithSkillShield(rawDamage: number): number;
  tryEmergencyCarapaceSave(hpBeforeHit: number, hpAfterHit: number): boolean;
}

export interface PlayerContext {
  readonly physics: PlayerPhysics;
  readonly world: CollisionWorld;
  readonly input: IInputReader;
  readonly hooks: PlayerPresentationHooks;
  readonly stats: PlayerStats;
  readonly inventory: PlayerInventory;
  readonly customComboStages: readonly WeaponComboStageTiming[] | null;
  readonly comboStages: readonly WeaponComboStageTiming[];

  physicsSteppedThisTick: boolean;
  hasMagneticClawsRune: boolean;
  hasCalcinedRamRune: boolean;
  inClimbableVineZone: boolean;
  pendingSlamDive: boolean;

  isInvulnerable: boolean;
  ignoreEnemyCollision: boolean;
  hasHyperArmor: boolean;
  startupDamageReduction: number;
  isParryWindowActive: boolean;
  isHoldingShieldBlock: boolean;
  isAttackHitboxActive: boolean;
  isCrouching: boolean;
  pendingJumpLaunch: boolean;

  activeWeaponSlot: WeaponSlotId;
  dodgeCooldownTicks: number;
  parryCooldownTicks: number;
  mercyInvulnTicks: number;

  comboIndex: number;
  comboChainGraceTicks: number;
  attackSpeedMultiplier: number;
  moveSpeedMultiplier: number;
  parrySucceededInCurrentState: boolean;
  lastAttackerDirX: -1 | 1;
  hp: number;
  maxHp: number;

  stepPhysics(dtSec: number, clampGroundLedge?: boolean): void;
}

export function slotActionFor(slot: WeaponSlotId): ActionId {
  return slot === 'primary' ? 'attack_primary' : 'attack_secondary';
}

/**
 * 统一路由双主副手武器槽输入：
 * - 若按下的槽位装备了盾牌（SHIELD），校验 parryCooldownTicks === 0 进入 ParryState；
 * - 若装备了近战/远程/法杖，校验弹药后进入 AttackComboState（切换槽位时重置连招段数）。
 */
export function pollCombatSlotStateTransition(ctx: PlayerContext): 'Parry' | 'AttackCombo' | null {
  const slots: readonly WeaponSlotId[] = ['secondary', 'primary'];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const act = slotActionFor(slot);
    if (!ctx.input.peekBuffered(act)) continue;

    const def = ctx.inventory.getSlotDefinition(slot);
    if (def.category === 'SHIELD') {
      if (ctx.parryCooldownTicks > 0) continue;
      ctx.input.consumeBuffered(act);
      ctx.activeWeaponSlot = slot;
      return 'Parry';
    }

    if (
      (def.category === 'RANGED_BOW' || def.category === 'RANGED_CROSSBOW') &&
      ctx.inventory.bowAmmoLeft <= 0
    ) {
      ctx.input.clearActionBuffer(act);
      continue;
    }

    ctx.input.consumeBuffered(act);
    if (ctx.activeWeaponSlot !== slot) {
      ctx.activeWeaponSlot = slot;
      ctx.comboIndex = 0;
      ctx.comboChainGraceTicks = 0;
    } else if (def.id === 'wpn_athanor_cleaver' && ctx.comboIndex === 1) {
      ctx.stats.evaluateCleaverSecondInput();
    }
    return 'AttackCombo';
  }
  return null;
}

export interface IPlayerState {
  readonly id: PlayerStateId;
  enter(ctx: PlayerContext, prevState: PlayerStateId): void;
  fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null;
  exit(ctx: PlayerContext, nextState: PlayerStateId): void;
  canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean;
}
