/**
 * 主角状态机共享上下文（PlayerContext）与默认钩子工厂（src/entities/player/PlayerContextFactory.ts）。
 */

import { EventBus } from '../../core/EventBus';
import type { WeaponComboStageTiming } from '../../data/playerKinematics.data';
import { WEAPON_CATALOG } from '../../data/weapons.data';
import type { IInputReader } from '../../input/InputTypes';
import type { PlayerInventory } from './PlayerInventory';
import type { CollisionWorld, PlayerPhysics } from './PlayerPhysics';
import type { PlayerStats } from './PlayerStats';
import type { PlayerContext, PlayerPresentationHooks } from './states/IPlayerState';

export const NOOP_PLAYER_HOOKS: PlayerPresentationHooks = {
  playAnim: () => {},
  setSpriteFrame: () => {},
  spawnGhostTrail: () => {},
  emitLocomotionVfx: () => {},
  setShieldRefractActive: () => {},
  triggerHitFlash: () => {},
  notifyAttackStarted: () => {},
  notifyWeaponStageActive: () => {},
  notifyParrySucceeded: () => {},
  notifySlamLanded: () => {},
  notifyFlaskDrunk: () => {},
  notifySkillActivated: () => {},
  absorbIncomingWithSkillShield: (d) => d,
  tryEmergencyCarapaceSave: () => false,
};

export function createPlayerContext(params: {
  readonly physics: PlayerPhysics;
  readonly world: CollisionWorld;
  readonly input: IInputReader;
  readonly stats: PlayerStats;
  readonly inventory: PlayerInventory;
  readonly hooks?: Partial<PlayerPresentationHooks>;
  readonly hasMagneticClawsRune?: boolean;
  readonly hasCalcinedRamRune?: boolean;
  readonly comboStages?: readonly WeaponComboStageTiming[];
  readonly onFrameKeyChanged: (frame: string) => void;
}): PlayerContext {
  const { physics, world, input, stats, inventory, hooks } = params;
  const customStages = params.comboStages ?? null;

  let ctxRef!: PlayerContext;
  const mergedHooks: PlayerPresentationHooks = {
    ...NOOP_PLAYER_HOOKS,
    ...hooks,
    setSpriteFrame: (frame) => {
      params.onFrameKeyChanged(frame);
      hooks?.setSpriteFrame?.(frame);
    },
    emitLocomotionVfx: (kind, dirX) => {
      if (kind === 'double_jump_ring') {
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_djump_mercury', worldX: physics.x });
      } else if (kind === 'dodge_dust') {
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_dodge_whoosh', worldX: physics.x });
      } else if (kind === 'slam_shockwave') {
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_swing_heavy', worldX: physics.x });
      }
      hooks?.emitLocomotionVfx?.(kind, dirX);
    },
    notifyWeaponStageActive: (weaponId, stageIndex, slot) => {
      const cat = WEAPON_CATALOG[weaponId].category;
      const sfxId =
        cat === 'RANGED_BOW' || cat === 'RANGED_CROSSBOW'
          ? 'sfx_bow_release'
          : cat === 'MAGIC_STAFF'
            ? 'sfx_voltaic_zap'
            : cat === 'MELEE_HEAVY' || cat === 'MELEE_HALBERD'
              ? 'sfx_swing_heavy'
              : 'sfx_swing_light';
      EventBus.emit('audio:sfx_requested', { sfxId, worldX: physics.x });
      hooks?.notifyWeaponStageActive?.(weaponId, stageIndex, slot);
    },
    notifyFlaskDrunk: (healedAmount) => {
      EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_flask_drink', worldX: physics.x });
      hooks?.notifyFlaskDrunk?.(healedAmount);
    },
    notifyAttackStarted: (comboIndex) => {
      const wpnId = inventory.getSlotWeapon(ctxRef.activeWeaponSlot).weaponId;
      EventBus.emit('combat:attack_started', {
        attackerId: 'player_vessel_09',
        weaponId: wpnId,
        comboIndex,
      });
      hooks?.notifyAttackStarted?.(comboIndex);
    },
    notifyParrySucceeded: () => {
      const shield = inventory.getEquippedShieldId();
      const shieldAffixIds =
        shield === inventory.secondaryWeapon.weaponId
          ? inventory.secondaryWeapon.affixIds
          : shield === inventory.primaryWeapon.weaponId
            ? inventory.primaryWeapon.affixIds
            : [];
      EventBus.emit('combat:parry_succeeded', {
        defenderId: 'player_vessel_09',
        sourceId: 'incoming_threat',
        worldX: physics.x,
        worldY: physics.y - 16,
        shieldAffixIds,
      });
      hooks?.notifyParrySucceeded?.();
    },
  };

  ctxRef = {
    physics,
    world,
    input,
    hooks: mergedHooks,
    stats,
    inventory,
    customComboStages: customStages,
    get comboStages() {
      return customStages ?? inventory.getSlotDefinition(this.activeWeaponSlot).stages;
    },
    physicsSteppedThisTick: false,
    hasMagneticClawsRune: params.hasMagneticClawsRune ?? false,
    hasCalcinedRamRune: params.hasCalcinedRamRune ?? false,
    inClimbableVineZone: false,
    pendingSlamDive: false,
    isInvulnerable: false,
    ignoreEnemyCollision: false,
    hasHyperArmor: false,
    startupDamageReduction: 0,
    isParryWindowActive: false,
    isHoldingShieldBlock: false,
    isAttackHitboxActive: false,
    isCrouching: false,
    pendingJumpLaunch: false,
    activeWeaponSlot: 'primary',
    dodgeCooldownTicks: 0,
    parryCooldownTicks: 0,
    mercyInvulnTicks: 0,
    comboIndex: 0,
    comboChainGraceTicks: 0,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    parrySucceededInCurrentState: false,
    lastAttackerDirX: 1,
    get hp() {
      return stats.hp;
    },
    set hp(v: number) {
      stats.hp = v;
    },
    get maxHp() {
      return stats.maxHp;
    },
    set maxHp(v: number) {
      stats.maxHp = v;
    },
    stepPhysics(dtSec: number, clampGroundLedge = false): void {
      this.physicsSteppedThisTick = true;
      physics.integrateAndCollide(world, dtSec, clampGroundLedge);
    },
  };

  return ctxRef;
}
