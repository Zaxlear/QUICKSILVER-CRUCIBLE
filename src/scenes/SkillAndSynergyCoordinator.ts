/**
 * 场景级 6 元素状态机、20 词条引擎、12 变异与 6 主动技能协同调度器
 * （src/scenes/SkillAndSynergyCoordinator.ts）。
 */

import Phaser from 'phaser';
import { ActiveSkillRuntime } from '../combat/ActiveSkillRuntime';
import { AffixSynergyEngine } from '../combat/AffixSynergyEngine';
import type { CombatTargetView, VoltaicChainSegment } from '../combat/CombatTypes';
import { computeStatDamageMultiplier } from '../combat/DamageCalculator';
import { MutationProcessor } from '../combat/MutationProcessor';
import type { ProjectilePool } from '../combat/ProjectilePool';
import { StatusEffectMachine } from '../combat/StatusEffectMachine';
import { computeTargetMoveSpeedMultiplier } from '../combat/StatusReactionMath';
import { EventBus } from '../core/EventBus';
import { BIOME_CATALOG, type BiomeId } from '../data/biomes.data';
import { SKILL_CATALOG, SKILL_CONSTANTS, type SkillSlotId } from '../data/skills.data';
import { COMBAT_CONSTANTS } from '../data/weapons.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { ElementalAuraEmitter } from '../render/vfx/ElementalAuraEmitter';
import type { ParticleDirector } from '../render/vfx/ParticleDirector';

const REACTION_BANNER_MAP: Readonly<Record<string, string>> = {
  VIOLET_NAPALM: '✦炼金紫火!',
  THERMAL_SHOCK: '✦热震爆裂!',
  HEMORRHAGE_BURST: '✦大动脉崩裂!',
  BRITTLE_SHATTER: '✦脆性破冰!',
  ELECTROLYTIC_SURGE: '✦电解超导!',
  VITRIOL_DETONATION: '✦矾毒爆燃!',
};

export class SkillAndSynergyCoordinator {
  public readonly statusMachine: StatusEffectMachine;
  public readonly affixEngine: AffixSynergyEngine;
  public readonly mutations: MutationProcessor;
  public readonly skillRuntime: ActiveSkillRuntime;
  public readonly auraEmitter: ElementalAuraEmitter;
  public playerRootedSec = 0;

  private readonly unsubReaction: () => void;
  private readonly arcSegScratch: VoltaicChainSegment[] = [];

  public constructor(
    scene: Phaser.Scene,
    private readonly biomeId: BiomeId,
    private readonly player: PlayerEntity,
    private readonly agents: readonly BaseEnemy[],
    private readonly projectiles: ProjectilePool,
    private readonly particles: ParticleDirector,
    private readonly cameraRig: CameraRig,
    private readonly lighting: LightingDirector,
    private readonly postFx: ActiveCameraPostFXBundle,
    private readonly getTargets: () => readonly CombatTargetView[],
    private readonly onEnemyKilledHook?: (victim: BaseEnemy) => void
  ) {
    this.statusMachine = new StatusEffectMachine();
    this.mutations = new MutationProcessor(this.statusMachine);
    this.skillRuntime = new ActiveSkillRuntime(this.statusMachine);
    this.auraEmitter = new ElementalAuraEmitter(scene, cameraRig, lighting);

    this.affixEngine = new AffixSynergyEngine(this.statusMachine, {
      getTargets,
      onHealPlayerRatio: (ratio) => {
        const healed = this.player.stats.healDirect(this.player.stats.maxHp * ratio);
        if (healed > 0) this.particles.damageNumbers.spawnLabel(this.player.physics.x, this.player.physics.y - 34, `+${healed}`, 'RALLY_HEAL');
      },
      onAstralBreachLightning: (tid, wx, wy, dmg) => {
        this.applyAuxiliaryDamageToTarget(tid, dmg, true, wx, wy);
        this.lighting.spawnTransientFlash(wx, wy, 0x38bdf8, 175, 2.4, 150);
      },
      onSpawnHazardZone: (kind, wx, wy, rad, dur, scale) => { this.skillRuntime.spawnHazardZone(kind, wx, wy, rad, dur, scale); },
      onAreaDirectDamage: (wx, wy, rad, dmg, isCrit) => { this.applyRadiusAuxiliaryDamage(wx, wy, rad, dmg, isCrit); },
    });
    this.affixEngine.mount();

    this.unsubReaction = EventBus.on('status:reaction_triggered', (ev) => {
      const tag = REACTION_BANNER_MAP[ev.reactionId];
      if (tag && ev.worldX !== 0) {
        this.particles.damageNumbers.spawnLabel(ev.worldX, ev.worldY - 22, tag, 'REACTION');
        this.particles.emitWeaponSmear('react_burst_ring_0', ev.worldX, ev.worldY, 1, 0.24, 'synergy_fx_atlas');
      }
    });
  }

  public activateSkillSlot(slot: SkillSlotId): boolean {
    const { x: px, y: py, facing } = this.player.physics;
    const peekInst = this.player.inventory.loadout.getSlotSkill(slot);
    if (peekInst.skillId === 'skl_aegis_tonics' && this.skillRuntime.aegisUrnSec > 0 && this.skillRuntime.aegisShieldHp > 0) {
      const burst = Math.max(1, Math.round(SKILL_CONSTANTS.AEGIS_TONICS_BURST_BASE_DMG * this.skillRuntime.aegisStatScale));
      this.skillRuntime.aegisUrnSec = 0;
      this.skillRuntime.aegisShieldHp = 0;
      this.applyRadiusAuxiliaryDamage(px, py - 16, SKILL_CONSTANTS.AEGIS_TONICS_BURST_RADIUS_PX, burst, true);
      this.particles.emitWeaponSmear('react_burst_ring_0', px, py - 18, facing, 0.28, 'synergy_fx_atlas');
      return true;
    }

    const inst = this.player.inventory.loadout.tryTriggerSkillCooldown(slot);
    if (!inst) return false;
    const scale = computeStatDamageMultiplier(SKILL_CATALOG[inst.skillId].colors, this.player.stats.snapshotLevels);

    if (inst.skillId === 'skl_vitriol_flask') {
      this.projectiles.spawnPlayerLobbedFlask('OIL_FOG_FLASK', px + facing * 14, py - 20, facing);
      this.lighting.spawnTransientFlash(px + facing * 14, py - 18, 0xa855f7, 150, 2.0, 120);
    } else if (inst.skillId === 'skl_clockwork_saw_trap') {
      this.skillRuntime.deploySawTrap(px + facing * 38, py, scale, inst.affixIds);
    } else if (inst.skillId === 'skl_tesla_coil_turret') {
      this.skillRuntime.deployTeslaTurret(px + facing * 42, py, scale, inst.affixIds);
      this.lighting.spawnTransientFlash(px + facing * 42, py - 22, 0x38bdf8, 175, 2.2, 160);
    } else if (inst.skillId === 'skl_cryo_mercury_nova') {
      const hits = this.skillRuntime.castCryoMercuryNova(px, py - 16, scale, inst.affixIds, this.getTargets());
      for (const h of hits) this.applyAuxiliaryDamageToTarget(h.targetId, h.amount, false, h.worldX, h.worldY);
      this.particles.emitWeaponSmear('cryo_nova_ring_0', px, py - 12, facing, 0.3, 'synergy_fx_atlas');
      this.lighting.spawnTransientFlash(px, py - 16, 0x38bdf8, 220, 2.5, 200);
    } else if (inst.skillId === 'skl_crimson_transfusion') {
      this.player.stats.sacrificeHpToRallyOrange(SKILL_CONSTANTS.CRIMSON_TRANSFUSION_HP_SACRIFICE_RATIO);
      this.skillRuntime.activateCrimsonTransfusion(px, py - 18, scale, inst.affixIds);
      this.particles.emitWeaponSmear('crimson_mist_0', px, py - 18, facing, 0.28, 'synergy_fx_atlas');
      this.lighting.spawnTransientFlash(px, py - 18, 0xe11d48, 185, 2.4, 180);
    } else if (inst.skillId === 'skl_aegis_tonics') {
      const healed = this.player.stats.healFromAegisUrn(SKILL_CONSTANTS.AEGIS_TONICS_FALLBACK_HEAL_RATIO);
      if (healed > 0) this.particles.damageNumbers.spawnLabel(px, py - 34, `+${healed}`, 'RALLY_HEAL');
      this.skillRuntime.activateAegisTonics(px, py - 18, this.player.stats.maxHp, scale, inst.affixIds);
      this.lighting.spawnTransientFlash(px, py - 18, 0x3ce682, 195, 2.3, 190);
    }
    return true;
  }

  public handleLobbedFlaskShattered(kind: 'VITRIOL_FLASK' | 'OIL_FOG_FLASK' | 'ENEMY_FLASK', worldX: number, worldY: number): void {
    EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_flask_shatter', worldX });
    if (kind === 'ENEMY_FLASK') {
      this.particles.emitWeaponSmear('react_burst_ring_0', worldX, worldY - 8, 1, 0.22, 'synergy_fx_atlas');
      this.lighting.spawnTransientFlash(worldX, worldY - 12, 0xff5e2b, 145, 2.0, 160);
      return;
    }
    const scale = computeStatDamageMultiplier(['rubedo', 'citrinitas'], this.player.stats.snapshotLevels);
    if (kind === 'OIL_FOG_FLASK') {
      const s1 = this.player.inventory.loadout.skillOne;
      const skl = s1.skillId === 'skl_vitriol_flask' ? s1 : this.player.inventory.loadout.skillTwo;
      const hits = this.skillRuntime.detonateBlackFireOilFlask(worldX, worldY, scale, skl.affixIds, this.getTargets());
      for (const h of hits) this.applyAuxiliaryDamageToTarget(h.targetId, h.amount, true, h.worldX, h.worldY);
      this.lighting.spawnTransientFlash(worldX, worldY - 20, 0xa855f7, 240, 2.8, 260);
      this.cameraRig.addTrauma(0.22);
      return;
    }
    this.skillRuntime.spawnHazardZone('VITRIOL_ACID_FIRE_POOL', worldX, worldY, COMBAT_CONSTANTS.VITRIOL_POOL_WIDTH_PX * 0.5, COMBAT_CONSTANTS.VITRIOL_POOL_DURATION_SEC, scale);
    this.lighting.spawnTransientFlash(worldX, worldY - 14, 0x3ce682, 165, 2.1, 180);
  }

  public stepFixed(dtSec: number, heroSprite?: Phaser.GameObjects.Sprite): void {
    if (this.playerRootedSec > 0) this.playerRootedSec = Math.max(0, this.playerRootedSec - dtSec);
    const { x: px, y: py } = this.player.physics;
    const targets = this.getTargets();
    const mutIds = this.player.inventory.loadout.activeMutationIds;
    const levels = this.player.stats.snapshotLevels;

    const stOut = this.statusMachine.stepFixed(dtSec, targets);
    for (const ev of stOut.damageEvents) {
      if (ev.aoeRadiusPx > 0) this.applyRadiusAuxiliaryDamage(ev.worldX, ev.worldY, ev.aoeRadiusPx, ev.amount, ev.isCrit);
      else this.applyAuxiliaryDamageToTarget(ev.targetId, ev.amount, ev.isCrit, ev.worldX, ev.worldY);
    }

    const skOut = this.skillRuntime.stepFixed(dtSec, px, py, targets);
    for (const h of skOut.hits) this.applyAuxiliaryDamageToTarget(h.targetId, h.amount, h.isCrit, h.worldX, h.worldY);

    if (stOut.shockArcs.length > 0 || skOut.turretArcs.length > 0) {
      this.arcSegScratch.length = 0;
      for (const a of stOut.shockArcs) this.arcSegScratch.push({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, bounceIndex: a.isSurgeCrit ? 1 : 0 });
      for (const a of skOut.turretArcs) this.arcSegScratch.push({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, bounceIndex: 0 });
      this.particles.emitVoltaicChainBolts(this.arcSegScratch);
    }

    const mutTicks = this.mutations.stepFixed(dtSec, mutIds, levels, targets, (tid) => this.projectiles.getEmbeddedArrowCount(tid));
    for (const mt of mutTicks) this.applyAuxiliaryDamageToTarget(mt.targetId, mt.amount, false, mt.worldX, mt.worldY);

    for (const ag of this.agents) {
      ag.statusBadgeLabel = ElementalAuraEmitter.formatStatusBadges(ag.id, this.statusMachine);
      ag.speedScale = computeTargetMoveSpeedMultiplier(this.statusMachine.getRecord(ag.id), ag.isBoss);
    }

    this.player.ctx.attackSpeedMultiplier = 1.0 + (this.skillRuntime.crimsonTransfusionSec > 0 ? SKILL_CONSTANTS.CRIMSON_TRANSFUSION_ATK_SPEED_BONUS : 0);
    const baseMoveMult = 1.0 + (this.skillRuntime.crimsonTransfusionSec > 0 ? SKILL_CONSTANTS.CRIMSON_TRANSFUSION_MOVE_SPEED_BONUS : 0) + (this.mutations.frenzyRemainingSec > 0 ? 0.25 : 0);
    this.player.ctx.moveSpeedMultiplier = this.playerRootedSec > 0 ? 0.12 : baseMoveMult;

    if (heroSprite) {
      if (this.mutations.stealthRemainingSec > 0) heroSprite.setAlpha(0.46);
      else if (heroSprite.alpha < 0.99 && heroSprite.alpha > 0.3) heroSprite.setAlpha(1.0);
    }
    this.auraEmitter.stepFixed(dtSec, px, py, targets, this.statusMachine, this.skillRuntime);
  }

  public applyRadiusAuxiliaryDamage(wx: number, wy: number, radiusPx: number, damage: number, isCrit: boolean): void {
    for (const ag of this.agents) {
      if (ag.isAlive && Math.hypot(ag.x - wx, ag.y - 20 - wy) <= radiusPx) {
        this.applyAuxiliaryDamageToTarget(ag.id, damage, isCrit, ag.x, ag.y - 20);
      }
    }
  }

  public applyAuxiliaryDamageToTarget(targetId: string, damage: number, isCrit: boolean, wx: number, wy: number): void {
    const ag = this.agents.find((a) => a.id === targetId);
    if (!ag || !ag.isAlive) return;
    const controlledBefore = this.statusMachine.isSlowedOrFrozen(ag.id) || ag.isStunned;
    const res = ag.applyHit(damage, isCrit ? 0.4 : 0.1, this.player.physics.x <= ag.x ? 1 : -1);
    if (res.blockedByWard) {
      this.particles.damageNumbers.spawnLabel(wx, wy - 10, '⛨WARDED', 'BLOCKED');
      return;
    }
    this.particles.damageNumbers.spawnDamageNumber(wx, wy - 8, damage, isCrit);
    if (isCrit) this.postFx.chromaticImpact.triggerPulse(0.28, wx, wy, this.cameraRig.worldMainCam);
    if (res.killed) {
      this.player.stats.ichor += BIOME_CATALOG[this.biomeId].ichorPerKill;
      this.skillRuntime.extendCrimsonOnKill();
      this.onEnemyKilledHook?.(ag);
      const affixes = this.player.inventory.collectAllEquippedAffixIds();
      this.mutations.onEnemyKilled(this.player.inventory.loadout.activeMutationIds, ag.id, ag.x, ag.y - 18, false, controlledBefore, this.getTargets());
      EventBus.emit('combat:enemy_killed', { enemyId: ag.id, archetypeId: ag.archetype, worldX: ag.x, worldY: ag.y - 18, killerAffixIds: affixes, killedByMelee: false });
      this.statusMachine.clearTarget(ag.id);
    }
  }

  public destroy(): void {
    this.unsubReaction();
    this.affixEngine.unmount();
    this.auraEmitter.destroy();
    this.skillRuntime.releaseAll();
    this.statusMachine.resetAll();
  }
}
