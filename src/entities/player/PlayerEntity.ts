import { computeAffixIncomingDamageMultiplier } from '../../combat/AffixMultiplierMath';
import { EventBus } from '../../core/EventBus';
import {
  type PlayerStateId,
  type PlayerTelemetrySnapshot,
  type WeaponComboStageTiming,
} from '../../data/playerKinematics.data';
import { COMBAT_CONSTANTS } from '../../data/weapons.data';
import type { IInputReader } from '../../input/InputTypes';
import { createPlayerContext } from './PlayerContextFactory';
import { PlayerInventory } from './PlayerInventory';
import { PlayerPhysics, type CollisionWorld } from './PlayerPhysics';
import { PlayerStats } from './PlayerStats';
import { AttackComboState } from './states/AttackComboState';
import { DeadState } from './states/DeadState';
import { DodgeRollState } from './states/DodgeRollState';
import { DoubleJumpState } from './states/DoubleJumpState';
import { HurtState } from './states/HurtState';
import type { PlayerContext, PlayerPresentationHooks } from './states/IPlayerState';
import { IdleState } from './states/IdleState';
import { JumpState } from './states/JumpState';
import { ParryState } from './states/ParryState';
import { PlayerStateMachine } from './states/PlayerStateMachine';
import { RunState } from './states/RunState';
import { WallSlideState } from './states/WallSlideState';

export interface PlayerEntityOptions {
  readonly spawnX: number;
  readonly spawnY: number;
  readonly world: CollisionWorld;
  readonly input: IInputReader;
  readonly hooks?: Partial<PlayerPresentationHooks>;
  readonly stats?: PlayerStats;
  readonly inventory?: PlayerInventory;
  readonly hasMagneticClawsRune?: boolean;
  readonly hasCalcinedRamRune?: boolean;
  readonly maxHp?: number;
  readonly comboStages?: readonly WeaponComboStageTiming[];
}

/**
 * 主角「九号蒸馏体·阿兰比克（Vessel-09）」容器实体（src/entities/player/PlayerEntity.ts）。
 */
export class PlayerEntity {
  public readonly physics: PlayerPhysics;
  public readonly stats: PlayerStats;
  public readonly inventory: PlayerInventory;
  public readonly fsm: PlayerStateMachine;
  public readonly ctx: PlayerContext;

  public renderX: number;
  public renderY: number;
  public currentFrameKey = 'hero_idle_0';
  public lastKilledByReason: string | null = null;

  public constructor(opts: PlayerEntityOptions) {
    this.physics = new PlayerPhysics(opts.spawnX, opts.spawnY);
    this.stats = opts.stats ?? new PlayerStats(opts.maxHp);
    this.inventory = opts.inventory ?? new PlayerInventory();
    this.renderX = opts.spawnX;
    this.renderY = opts.spawnY;

    this.ctx = createPlayerContext({
      physics: this.physics,
      world: opts.world,
      input: opts.input,
      stats: this.stats,
      inventory: this.inventory,
      hooks: opts.hooks,
      hasMagneticClawsRune: opts.hasMagneticClawsRune,
      hasCalcinedRamRune: opts.hasCalcinedRamRune,
      comboStages: opts.comboStages,
      onFrameKeyChanged: (frame) => {
        this.currentFrameKey = frame;
      },
    });

    this.fsm = new PlayerStateMachine([
      new IdleState(),
      new RunState(),
      new JumpState(),
      new DoubleJumpState(),
      new WallSlideState(),
      new DodgeRollState(),
      new ParryState(),
      new AttackComboState(),
      new HurtState(),
      new DeadState(),
    ]);
    this.fsm.initialize(this.ctx);
  }

  public get state(): PlayerStateId {
    return this.fsm.currentStateId;
  }

  public get isInvulnerable(): boolean {
    return this.ctx.isInvulnerable;
  }

  public fixedUpdate(dtSec: number): void {
    this.physics.snapshotPreviousTransform();
    this.stats.stepFixed(dtSec);
    this.inventory.loadout.stepCooldowns(dtSec);

    if (this.ctx.dodgeCooldownTicks > 0) this.ctx.dodgeCooldownTicks -= 1;
    if (this.ctx.parryCooldownTicks > 0) this.ctx.parryCooldownTicks -= 1;
    if (this.ctx.comboChainGraceTicks > 0) this.ctx.comboChainGraceTicks -= 1;
    if (this.ctx.mercyInvulnTicks > 0) {
      this.ctx.mercyInvulnTicks -= 1;
      if (this.ctx.mercyInvulnTicks === 0 && this.state !== 'DodgeRoll' && this.state !== 'Dead') {
        this.ctx.isInvulnerable = false;
      }
    }

    if (this.state !== 'Dead' && this.state !== 'Hurt') {
      if (this.ctx.input.consumeBuffered('skill_1')) this.ctx.hooks.notifySkillActivated('skill_1');
      if (this.ctx.input.consumeBuffered('skill_2')) this.ctx.hooks.notifySkillActivated('skill_2');
    }

    this.fsm.step(this.ctx, dtSec);
  }

  public computeInterpolatedTransform(alpha: number): { readonly x: number; readonly y: number } {
    this.renderX = this.physics.prevX + (this.physics.x - this.physics.prevX) * alpha;
    this.renderY = this.physics.prevY + (this.physics.y - this.physics.prevY) * alpha;
    return { x: this.renderX, y: this.renderY };
  }

  /** 处理受击、无敌闪避、持续举盾格挡、护瓮力场吸收、黄金招架与应急凝壳锁血 */
  public receiveIncomingHit(
    damage: number,
    attackerDirX: -1 | 1,
    parriable = true
  ): 'parried' | 'blocked' | 'evaded' | 'hurt' | 'dead' | 'ignored' {
    if (this.state === 'Dead') return 'ignored';
    if (parriable && this.ctx.isParryWindowActive) {
      this.ctx.parryCooldownTicks = 0;
      this.ctx.parrySucceededInCurrentState = true;
      this.stats.armRapierCritWindow();
      this.stats.recoverRallyOnParry();
      this.inventory.refillBowArrows();
      this.ctx.hooks.notifyParrySucceeded();
      return 'parried';
    }
    if (this.ctx.isInvulnerable) {
      EventBus.emit('combat:dodge_evaded', {
        entityId: 'player_vessel_09', worldX: this.physics.x, worldY: this.physics.y - 16,
        activeAffixIds: this.inventory.collectAllEquippedAffixIds(),
      });
      return 'evaded';
    }
    if (this.stats.cursedKillsRemaining > 0 && damage > 0) {
      this.stats.hp = 0;
      this.stats.rallyOrangeHp = 0;
      this.lastKilledByReason = 'cursed_shatter';
      this.fsm.requestInterrupt('Dead', this.ctx);
      return 'dead';
    }

    const hpBefore = this.stats.hp;
    if (this.ctx.isHoldingShieldBlock && attackerDirX !== this.physics.facing) {
      const shieldId = this.inventory.getEquippedShieldId();
      const blockRed =
        shieldId === 'wpn_mirror_aegis'
          ? COMBAT_CONSTANTS.AEGIS_BLOCK_REDUCTION
          : COMBAT_CONSTANTS.BUCKLER_BLOCK_REDUCTION;
      this.stats.applyIncomingDamage(damage, blockRed);
      if (this.stats.hp <= 0) {
        if (this.activateEmergencyCarapaceIfEligible(hpBefore)) return 'hurt';
        this.fsm.requestInterrupt('Dead', this.ctx);
        return 'dead';
      }
      return 'blocked';
    }

    const affixPenalty = computeAffixIncomingDamageMultiplier(this.inventory.collectAllEquippedAffixIds());
    const postShieldDmg = this.ctx.hooks.absorbIncomingWithSkillShield(damage * affixPenalty);
    if (postShieldDmg <= 0) {
      this.ctx.hooks.triggerHitFlash(50);
      return 'blocked';
    }

    this.stats.applyIncomingDamage(postShieldDmg, this.ctx.startupDamageReduction);
    this.ctx.lastAttackerDirX = attackerDirX;
    if (this.stats.hp <= 0) {
      if (this.activateEmergencyCarapaceIfEligible(hpBefore)) return 'hurt';
      this.fsm.requestInterrupt('Dead', this.ctx);
      return 'dead';
    }
    if (this.ctx.hasHyperArmor) {
      this.ctx.hooks.triggerHitFlash(80);
      return 'hurt';
    }
    this.fsm.requestInterrupt('Hurt', this.ctx);
    return 'hurt';
  }

  public respawnAt(x: number, y: number): void {
    this.physics.x = x;
    this.physics.y = y;
    this.physics.prevX = x;
    this.physics.prevY = y;
    this.physics.vx = 0;
    this.physics.vy = 0;
    this.physics.setCompressedCollider(false);
    this.stats.resetFullHealth();
    this.inventory.refillBowArrows();
    this.inventory.loadout.resetCooldowns();
    this.ctx.isInvulnerable = false;
    this.ctx.ignoreEnemyCollision = false;
    this.ctx.mercyInvulnTicks = 0;
    this.ctx.dodgeCooldownTicks = 0;
    this.ctx.parryCooldownTicks = 0;
    this.fsm.forceResetToIdle(this.ctx);
  }

  public snapshotTelemetry(): PlayerTelemetrySnapshot {
    return {
      state: this.state,
      x: Number(this.physics.x.toFixed(2)),
      y: Number(this.physics.y.toFixed(2)),
      vx: Number(this.physics.vx.toFixed(2)),
      vy: Number(this.physics.vy.toFixed(2)),
      facing: this.physics.facing,
      isGrounded: this.physics.isGrounded,
      isOnOneWay: this.physics.isOnOneWay,
      isInvulnerable: this.ctx.isInvulnerable,
      isParryWindowActive: this.ctx.isParryWindowActive,
      isAttackHitboxActive: this.ctx.isAttackHitboxActive,
      coyoteTicks: this.physics.coyoteTicks,
      airJumpsRemaining: this.physics.airJumpsRemaining,
      comboIndex: this.ctx.comboIndex,
      hp: this.stats.hp,
      maxHp: this.stats.maxHp,
      activeDevice: this.ctx.input.activeDevice,
    };
  }

  private activateEmergencyCarapaceIfEligible(hpBefore: number): boolean {
    if (!this.ctx.hooks.tryEmergencyCarapaceSave(hpBefore, this.stats.hp)) return false;
    this.stats.hp = 1;
    this.ctx.isInvulnerable = true;
    this.ctx.mercyInvulnTicks = 240; // 2.0s @ 120Hz 绝对无敌保护
    this.ctx.hooks.triggerHitFlash(140);
    return true;
  }
}
