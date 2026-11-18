import {
  DEFAULT_MELEE_COMBO_STAGES,
  PLAYER_KINEMATICS,
  type PlayerStateId,
  type WeaponComboStageTiming,
} from '../../../data/playerKinematics.data';
import {
  COMBAT_CONSTANTS,
  type WeaponDefinition,
  type WeaponSlotId,
} from '../../../data/weapons.data';
import {
  slotActionFor,
  type IPlayerState,
  type PlayerContext,
} from './IPlayerState';

/**
 * 双槽 12 武器帧驱动攻击状态（src/entities/player/states/AttackComboState.ts）：
 * 统一驱动近战快刀/刺剑/双刃/重刃/重锤/战戟、猎弓、连发重弩（3×58ms）、投掷瓶与脉冲法杖。
 */
export class AttackComboState implements IPlayerState {
  public readonly id = 'AttackCombo' as const;

  private stageSpec: WeaponComboStageTiming = DEFAULT_MELEE_COMBO_STAGES[0]!;
  private stageTick = 0;
  private speedAccum = 0;
  private queuedNextSlash = false;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    if (ctx.comboChainGraceTicks <= 0) {
      ctx.comboIndex = 0;
      ctx.stats.clearCleaverRhythm();
    }
    this.beginComboStage(ctx);
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    const hasteMult =
      ctx.attackSpeedMultiplier *
      (ctx.stats.hasTwinbladesBleedHaste ? 1 + COMBAT_CONSTANTS.TWINBLADES_BLEED_ATK_SPEED_BONUS : 1.0);
    this.speedAccum += Math.max(1.0, hasteMult);
    const prevTick = this.stageTick;
    while (this.speedAccum >= 1.0) {
      this.stageTick += 1;
      this.speedAccum -= 1.0;
    }

    const def = ctx.inventory.getSlotDefinition(ctx.activeWeaponSlot);
    const curAction = slotActionFor(ctx.activeWeaponSlot);
    const otherSlot: WeaponSlotId = ctx.activeWeaponSlot === 'primary' ? 'secondary' : 'primary';
    const otherAction = slotActionFor(otherSlot);

    const activeStart = this.stageSpec.startupTicks + 1;
    const activeEnd = this.stageSpec.startupTicks + this.stageSpec.activeTicks;

    if (
      ctx.input.wasJustPressed(curAction) ||
      (this.stageTick >= activeStart && ctx.input.peekBuffered(curAction))
    ) {
      if (!ctx.customComboStages && def.id === 'wpn_athanor_cleaver' && ctx.comboIndex === 0) {
        ctx.stats.evaluateCleaverSecondInput();
      }
      if (
        (def.category !== 'RANGED_BOW' && def.category !== 'RANGED_CROSSBOW') ||
        ctx.inventory.bowAmmoLeft > 0
      ) {
        this.queuedNextSlash = true;
      }
      ctx.input.clearActionBuffer(curAction);
    }

    if (this.stageTick >= this.stageSpec.cancelStartTick) {
      if (ctx.dodgeCooldownTicks === 0 && ctx.input.consumeBuffered('dodge')) {
        this.advanceComboCounter(ctx, def);
        return 'DodgeRoll';
      }
      const otherDef = ctx.inventory.getSlotDefinition(otherSlot);
      if (otherDef.category === 'SHIELD') {
        if (ctx.parryCooldownTicks === 0 && ctx.input.consumeBuffered(otherAction)) {
          this.advanceComboCounter(ctx, def);
          ctx.activeWeaponSlot = otherSlot;
          return 'Parry';
        }
      } else if (
        ctx.input.consumeBuffered(otherAction) &&
        ((otherDef.category !== 'RANGED_BOW' && otherDef.category !== 'RANGED_CROSSBOW') ||
          ctx.inventory.bowAmmoLeft > 0)
      ) {
        ctx.activeWeaponSlot = otherSlot;
        ctx.comboIndex = 0;
        this.beginComboStage(ctx);
        this.stageTick = 1;
      }

      const chainLinkTick = Math.max(this.stageSpec.cancelStartTick + 2, activeEnd + 2);
      if (this.queuedNextSlash && this.stageTick >= chainLinkTick) {
        this.advanceComboCounter(ctx, def);
        this.beginComboStage(ctx);
        this.stageTick = 1;
      }
    }

    const curDef = ctx.inventory.getSlotDefinition(ctx.activeWeaponSlot);
    const curStart = this.stageSpec.startupTicks + 1;
    const curEnd = this.stageSpec.startupTicks + this.stageSpec.activeTicks;
    const curTotal = curEnd + this.stageSpec.recoveryTicks;

    const inStartup = this.stageTick <= this.stageSpec.startupTicks;
    ctx.hasHyperArmor = !ctx.customComboStages && inStartup && curDef.startupHyperArmor;
    ctx.startupDamageReduction =
      !ctx.customComboStages && inStartup ? curDef.startupDamageReduction : 0;

    ctx.isAttackHitboxActive = this.stageTick >= curStart && this.stageTick <= curEnd;
    if (!ctx.customComboStages) {
      this.fireActiveStageTriggers(ctx, curDef, prevTick, this.stageTick, curStart);
    }
    this.syncSlashAnimationFrame(ctx, curStart, curEnd);
    this.applyWeaponKinematics(ctx, curDef, dtSec, inStartup);

    if (
      !ctx.customComboStages &&
      curDef.category === 'MAGIC_STAFF' &&
      this.stageTick >= COMBAT_CONSTANTS.ARC_STAFF_REPEAT_TICKS &&
      ctx.input.isHeld(slotActionFor(ctx.activeWeaponSlot))
    ) {
      this.stageTick = curStart - 1;
      return null;
    }

    if (this.stageTick >= curTotal) {
      this.advanceComboCounter(ctx, curDef);
      if (!ctx.physics.isGrounded) {
        ctx.pendingJumpLaunch = false;
        return 'Jump';
      }
      return Math.abs(ctx.input.moveX) > 0.05 ? 'Run' : 'Idle';
    }
    return null;
  }

  public exit(ctx: PlayerContext, _nextState: PlayerStateId): void {
    ctx.isAttackHitboxActive = false;
    ctx.hasHyperArmor = false;
    ctx.startupDamageReduction = 0;
    this.queuedNextSlash = false;
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Dead') return true;
    if (target === 'Hurt') return !ctx.isInvulnerable && !ctx.hasHyperArmor;
    if (target === 'DodgeRoll' || target === 'Parry') {
      return this.stageTick >= this.stageSpec.cancelStartTick;
    }
    const total =
      this.stageSpec.startupTicks + this.stageSpec.activeTicks + this.stageSpec.recoveryTicks;
    return this.stageTick >= total;
  }

  private fireActiveStageTriggers(
    ctx: PlayerContext,
    curDef: WeaponDefinition,
    prevTick: number,
    nowTick: number,
    curStart: number
  ): void {
    if (curDef.category === 'RANGED_CROSSBOW') {
      const gap = COMBAT_CONSTANTS.REPEATER_BURST_INTERVAL_TICKS;
      const triggers = [curStart, curStart + gap, curStart + gap * 2] as const;
      for (let i = 0; i < triggers.length; i++) {
        const t = triggers[i]!;
        if (prevTick < t && nowTick >= t && ctx.inventory.tryConsumeBowArrow()) {
          ctx.hooks.notifyWeaponStageActive(curDef.id, i, ctx.activeWeaponSlot);
        }
      }
      return;
    }
    if (prevTick < curStart && nowTick >= curStart) {
      if (curDef.category !== 'RANGED_BOW' || ctx.inventory.tryConsumeBowArrow()) {
        ctx.hooks.notifyWeaponStageActive(curDef.id, ctx.comboIndex, ctx.activeWeaponSlot);
      }
    }
  }

  private resolveStages(ctx: PlayerContext): readonly WeaponComboStageTiming[] {
    if (ctx.customComboStages && ctx.customComboStages.length > 0) return ctx.customComboStages;
    const def = ctx.inventory.getSlotDefinition(ctx.activeWeaponSlot);
    return def.stages.length > 0 ? def.stages : DEFAULT_MELEE_COMBO_STAGES;
  }

  private beginComboStage(ctx: PlayerContext): void {
    const stages = this.resolveStages(ctx);
    const idx = ctx.comboIndex % stages.length;
    this.stageSpec = stages[idx]!;
    this.stageTick = 0;
    this.speedAccum = 0;
    this.queuedNextSlash = false;
    ctx.isAttackHitboxActive = false;

    if (Math.abs(ctx.input.moveX) > 0.08) {
      ctx.physics.facing = ctx.input.moveX > 0 ? 1 : -1;
    }
    ctx.hooks.setSpriteFrame(`hero_atk_slash_${this.stageSpec.animStartFrame}`);
    ctx.hooks.notifyAttackStarted(idx);
  }

  private advanceComboCounter(ctx: PlayerContext, def: WeaponDefinition): void {
    const len = Math.max(1, this.resolveStages(ctx).length);
    ctx.comboIndex = (ctx.comboIndex + 1) % len;
    ctx.comboChainGraceTicks =
      def.id === 'wpn_athanor_cleaver' || def.id === 'wpn_crucible_maul' ? 46 : 26;
  }

  private applyWeaponKinematics(ctx: PlayerContext, def: WeaponDefinition, dtSec: number, inStartup: boolean): void {
    if (ctx.physics.isGrounded) {
      if (inStartup && this.stageSpec.startupTicks > 0 && this.stageSpec.lungePx > 0) {
        ctx.physics.vx = ctx.physics.facing * (this.stageSpec.lungePx / (this.stageSpec.startupTicks * dtSec));
      } else {
        ctx.physics.vx = 0;
      }
    } else {
      ctx.physics.applyHorizontalRun(ctx.input.moveX * 0.65, dtSec, PLAYER_KINEMATICS.MAX_RUN_SPEED * 0.75);
    }
    ctx.physics.applyThreeStageGravity(dtSec);
    if (!ctx.customComboStages && !ctx.physics.isGrounded && def.category === 'RANGED_BOW' && this.stageTick <= COMBAT_CONSTANTS.BOW_AIR_HOVER_TICKS) {
      ctx.physics.vy = Math.min(ctx.physics.vy, 24);
    }
    ctx.stepPhysics(dtSec, ctx.physics.isGrounded);
  }

  private syncSlashAnimationFrame(ctx: PlayerContext, activeStart: number, activeEnd: number): void {
    const base = this.stageSpec.animStartFrame;
    const mid = activeStart + Math.floor(this.stageSpec.activeTicks * 0.5);
    const offset = this.stageTick < activeStart ? 0 : this.stageTick <= mid ? 1 : this.stageTick <= activeEnd ? 2 : 3;
    ctx.hooks.setSpriteFrame(`hero_atk_slash_${Math.min(this.stageSpec.animEndFrame, base + offset)}`);
  }
}
