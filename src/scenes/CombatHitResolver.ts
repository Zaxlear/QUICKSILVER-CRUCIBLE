/**
 * 场景级 12 武器战斗命中、暴击、破冰/毒蚀化学乘区、司铎无敌护盾拦截、精英棘壳反伤与 20 词条结算器
 * （src/scenes/CombatHitResolver.ts）。
 */

import type { TargetStatusSnapshotForAffix } from '../combat/AffixMultiplierMath';
import type { CombatTargetView, ProjectileImpactEvent, ResolvedWeaponHit } from '../combat/CombatTypes';
import { calculateFinalHitDamage, computeStatDamageMultiplier } from '../combat/DamageCalculator';
import type { HitStopController } from '../combat/HitStopController';
import type { ProjectilePool } from '../combat/ProjectilePool';
import { EventBus } from '../core/EventBus';
import { BIOME_CATALOG, type BiomeId } from '../data/biomes.data';
import { SKILL_CONSTANTS } from '../data/skills.data';
import { WEAPON_CATALOG, type RolledWeaponInstance, type WeaponId } from '../data/weapons.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import type { ParticleDirector } from '../render/vfx/ParticleDirector';
import type { SkillAndSynergyCoordinator } from './SkillAndSynergyCoordinator';

export interface CombatResolverContext {
  readonly biomeId: BiomeId;
  readonly player: PlayerEntity;
  readonly agents: readonly BaseEnemy[];
  readonly projectilePool: ProjectilePool;
  readonly hitStop: HitStopController;
  readonly particles: ParticleDirector;
  readonly cameraRig: CameraRig;
  readonly lighting: LightingDirector;
  readonly postFx: ActiveCameraPostFXBundle;
  readonly synergy: SkillAndSynergyCoordinator;
  readonly getTargets: () => readonly CombatTargetView[];
  readonly isPlayerInConductiveHazard: () => boolean;
  readonly onEnemySlain: (victim: BaseEnemy) => void;
  readonly onPlayerKilled: () => void;
}

function resolveEquippedInstance(ctx: CombatResolverContext, weaponId: WeaponId): RolledWeaponInstance {
  const prim = ctx.player.inventory.primaryWeapon;
  const sec = ctx.player.inventory.secondaryWeapon;
  if (prim.weaponId === weaponId) return prim;
  if (sec.weaponId === weaponId) return sec;
  return { instanceId: `temp_${weaponId}`, weaponId, level: 'I', forgeGrade: 'BASE', bonusStatColor: null, affixIds: [] };
}

function snapshotTargetStatuses(ctx: CombatResolverContext, agent: BaseEnemy): TargetStatusSnapshotForAffix & { readonly isOiled: boolean } {
  const sm = ctx.synergy.statusMachine;
  return {
    isBleeding: sm.has(agent.id, 'bleeding'),
    isPoisoned: sm.has(agent.id, 'poisoned'),
    isIgnited: sm.has(agent.id, 'ignited'),
    isVioletNapalm: sm.isVioletNapalm(agent.id),
    isFrozen: sm.has(agent.id, 'frozen'),
    isElectrified: sm.has(agent.id, 'electrified'),
    isStunnedOrRooted: sm.isImmobilized(agent.id, agent.isStunned),
    isOiled: sm.has(agent.id, 'oiled'),
  };
}

export function applyResolvedWeaponHits(ctx: CombatResolverContext, hits: readonly ResolvedWeaponHit[]): number {
  let lastHitStopMs = 0;
  const extraTargets = Math.max(0, hits.length - 1);

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    const agent = ctx.agents.find((a) => a.id === h.targetId);
    if (!agent || !agent.isAlive) continue;

    const slashDir: -1 | 1 = ctx.player.physics.x <= agent.x ? 1 : -1;
    if (h.blockedByFrontShield || agent.isShieldedByPrelate) {
      ctx.particles.bloodSparks.emitBrassSparks(h.impactX, h.impactY, -slashDir as -1 | 1, 18);
      ctx.particles.damageNumbers.spawnLabel(h.impactX, h.impactY - 12, agent.isShieldedByPrelate ? '⛨WARDED' : 'BLOCKED', 'BLOCKED');
      ctx.lighting.spawnTransientFlash(h.impactX, h.impactY, 0xfbbf24, 135, 1.9, 95);
      ctx.cameraRig.addTrauma(0.09);
      EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_hit_clockwork', worldX: h.impactX });
      continue;
    }

    const inst = resolveEquippedInstance(ctx, h.weaponId);
    const def = WEAPON_CATALOG[h.weaponId];
    const stage = def.stages[h.stageIndex % def.stages.length]!;
    const levels = ctx.player.stats.snapshotLevels;
    const distPx = Math.abs(agent.x - ctx.player.physics.x);
    const isMelee = def.category !== 'MAGIC_STAFF' && def.category !== 'RANGED_BOW' && def.category !== 'RANGED_CROSSBOW' && def.category !== 'THROWN_FLASK';

    const targetStatuses = snapshotTargetStatuses(ctx, agent);
    const elemMods = ctx.synergy.statusMachine.consumeDirectHitModifiers(agent.id, h.impactX, h.impactY);
    const mutBonuses = ctx.synergy.mutations.evaluateAttackBonuses({
      activeIds: ctx.player.inventory.loadout.activeMutationIds, stats: levels, isMelee, isRanged: !isMelee,
      distancePx: distPx, nearDeployedConstruct: ctx.synergy.skillRuntime.isNearAnyConstruct(ctx.player.physics.x, ctx.player.physics.y),
    });

    const out = calculateFinalHitDamage({
      weaponId: h.weaponId, stageIndex: h.stageIndex, level: inst.level, forgeGrade: inst.forgeGrade,
      bonusStatColor: inst.bonusStatColor, isColorlessLegendary: inst.isColorlessLegendary, affixIds: inst.affixIds,
      playerStats: levels, targetStatuses,
      externalDamageMultiplier: elemMods.brittleMultiplier * elemMods.poisonVulnerabilityMultiplier * mutBonuses.damageMultiplier,
      flatBonusDamage: mutBonuses.flatHolyBonus,
      critInput: {
        rule: def.critRule, attackerX: ctx.player.physics.x, targetX: agent.x, targetFacing: agent.facing,
        rapierCritWindowMs: ctx.player.stats.rapierCritWindowMs, comboIndex: h.stageIndex,
        cleaverRhythmPrimed: ctx.player.stats.cleaverRhythmPrimed, distancePx: distPx,
        targetStuckArrows: ctx.projectilePool.getEmbeddedArrowCount(agent.id),
        inConductiveHazard: ctx.isPlayerInConductiveHazard() || agent.toTargetView(false).inConductiveHazard,
        chainBounceIndex: h.chainBounceIndex, forceParryCrit: h.forceParryCrit,
      },
    });

    if (h.weaponId === 'wpn_quicksilver_rapier' && out.isCrit) ctx.player.stats.consumeRapierCritWindow();
    if (h.weaponId === 'wpn_cinnabar_twinblades' && targetStatuses.isBleeding) ctx.player.stats.armTwinbladesBleedHaste();
    if (h.weaponId === 'wpn_athanor_cleaver') {
      if (h.stageIndex === 0) ctx.player.stats.notifyCleaverStageOneHit();
      else ctx.player.stats.clearCleaverRhythm();
    }

    if (isMelee) {
      const ripped = ctx.projectilePool.ripOutArrowsFromTarget(agent.id);
      if (ripped > 0) {
        ctx.player.inventory.refillBowArrows(ripped);
        const ripDmg = ctx.synergy.mutations.computeBarbedRipOutDamage(ctx.player.inventory.loadout.activeMutationIds, levels, ripped);
        if (ripDmg > 0) ctx.synergy.applyAuxiliaryDamageToTarget(agent.id, ripDmg, true, h.impactX, h.impactY);
      }
    }

    commitDamageAndSynergyFeedback(
      ctx, agent, out.finalDamage, stage.baseDamage, out.statMultiplier, out.breachDamage, out.isCrit,
      def.rallyCoeff, stage.hitWeight, inst.affixIds, isMelee, h.impactX, h.impactY, slashDir, extraTargets,
      (ms) => { lastHitStopMs = Math.max(lastHitStopMs, ms); }
    );
  }
  return lastHitStopMs;
}

export function applyResolvedProjectileImpacts(
  ctx: CombatResolverContext,
  impacts: readonly ProjectileImpactEvent[],
  onPlayerKilled: () => void
): void {
  for (let i = 0; i < impacts.length; i++) {
    const imp = impacts[i]!;
    if (imp.faction === 'ENEMY') {
      const dirX: -1 | 1 = imp.originX < ctx.player.physics.x ? 1 : -1;
      if (ctx.player.receiveIncomingHit(imp.rawEnemyDamage, dirX, true) === 'dead') onPlayerKilled();
      continue;
    }

    const agent = ctx.agents.find((a) => a.id === imp.targetId);
    if (!agent || !agent.isAlive) continue;

    const dirX: -1 | 1 = imp.originX <= agent.x ? 1 : -1;
    if (imp.blockedByFrontShield || agent.isShieldedByPrelate) {
      ctx.particles.bloodSparks.emitBrassSparks(imp.impactX, imp.impactY, -dirX as -1 | 1, 14);
      ctx.particles.damageNumbers.spawnLabel(imp.impactX, imp.impactY - 12, agent.isShieldedByPrelate ? '⛨WARDED' : 'BLOCKED', 'BLOCKED');
      continue;
    }

    const wpnInst = resolveEquippedInstance(ctx, imp.weaponId);
    const wpnDef = WEAPON_CATALOG[imp.weaponId];
    const levels = ctx.player.stats.snapshotLevels;
    const targetStatuses = snapshotTargetStatuses(ctx, agent);
    const elemMods = ctx.synergy.statusMachine.consumeDirectHitModifiers(agent.id, imp.impactX, imp.impactY);
    const mutBonuses = ctx.synergy.mutations.evaluateAttackBonuses({
      activeIds: ctx.player.inventory.loadout.activeMutationIds, stats: levels, isMelee: false, isRanged: true,
      distancePx: imp.distanceTravelledPx, nearDeployedConstruct: ctx.synergy.skillRuntime.isNearAnyConstruct(ctx.player.physics.x, ctx.player.physics.y),
    });

    const out = calculateFinalHitDamage({
      weaponId: imp.weaponId, stageIndex: 0, level: wpnInst.level, forgeGrade: wpnInst.forgeGrade,
      bonusStatColor: wpnInst.bonusStatColor, isColorlessLegendary: wpnInst.isColorlessLegendary, affixIds: wpnInst.affixIds, playerStats: levels, targetStatuses,
      externalDamageMultiplier: imp.reflectedDamageScale * elemMods.brittleMultiplier * elemMods.poisonVulnerabilityMultiplier * mutBonuses.damageMultiplier,
      critInput: {
        rule: wpnDef.critRule, attackerX: imp.originX, targetX: agent.x, targetFacing: agent.facing,
        rapierCritWindowMs: 0, comboIndex: 0, cleaverRhythmPrimed: false, distancePx: imp.distanceTravelledPx,
        targetStuckArrows: imp.embeddedArrowsBeforeHit + 1, inConductiveHazard: false, chainBounceIndex: 0,
        forceParryCrit: imp.isReflectedParryBolt || imp.kind === 'PRISM_BEAM',
      },
    });

    commitDamageAndSynergyFeedback(
      ctx, agent, out.finalDamage, wpnDef.stages[0]!.baseDamage, out.statMultiplier,
      imp.isReflectedParryBolt ? 99 : out.breachDamage, out.isCrit, wpnDef.rallyCoeff,
      imp.isReflectedParryBolt ? 'PARRY' : 'LIGHT', wpnInst.affixIds, false, imp.impactX, imp.impactY, dirX, 0
    );
  }
}

function commitDamageAndSynergyFeedback(
  ctx: CombatResolverContext, agent: BaseEnemy, damage: number, baseWeaponDamage: number, statScale: number,
  breach: number, isCrit: boolean, rallyCoeff: number, weight: 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'PARRY',
  affixIds: readonly string[], isMelee: boolean, impactX: number, impactY: number, slashDir: -1 | 1,
  extraTargets: number, onStopMs?: (ms: number) => void
): void {
  const levels = ctx.player.stats.snapshotLevels;
  const mutIds = ctx.player.inventory.loadout.activeMutationIds;
  const rallyHealed = ctx.player.stats.recoverRallyOnWeaponHit(rallyCoeff, isCrit);
  const mutHit = ctx.synergy.mutations.onWeaponHitLanded({
    activeIds: mutIds, stats: levels, maxHp: ctx.player.stats.maxHp,
    targetId: agent.id, worldX: impactX, worldY: impactY, isMelee, isCrit,
  });
  const totalHeal = rallyHealed + ctx.player.stats.healDirect(mutHit.healAmount);
  if (totalHeal > 0) ctx.particles.damageNumbers.spawnLabel(ctx.player.physics.x, ctx.player.physics.y - 34, `+${totalHeal}`, 'RALLY_HEAL');
  if (mutHit.skillCooldownReducedSec > 0) ctx.player.inventory.loadout.reduceAllCooldowns(mutHit.skillCooldownReducedSec);

  const controlledBefore = ctx.synergy.statusMachine.isSlowedOrFrozen(agent.id) || agent.isStunned;
  let res = agent.applyHit(damage, breach, slashDir, ctx.player.physics.x);
  if (res.thornsReflectedDamage > 0) {
    ctx.particles.damageNumbers.spawnLabel(ctx.player.physics.x, ctx.player.physics.y - 36, `✦棘壳-${res.thornsReflectedDamage}`, 'REACTION');
    if (ctx.player.receiveIncomingHit(res.thornsReflectedDamage, -slashDir as -1 | 1, false) === 'dead') ctx.onPlayerKilled();
  }
  if (!res.killed && ctx.synergy.mutations.checkScorchExecution(mutIds, agent.id, agent.hp, agent.maxHp, agent.isBoss, agent.x, agent.y - 18, ctx.getTargets())) {
    res = agent.applyHit(agent.hp + 999, 99, slashDir);
    ctx.particles.damageNumbers.spawnLabel(agent.x, agent.y - 36, '✦熔毁处决!', 'REACTION');
  }

  const cue = ctx.hitStop.registerImpact(weight, isCrit, res.triggeredBreachStun, agent.id, extraTargets);
  onStopMs?.(cue.hitStopMs);
  ctx.cameraRig.addTrauma(cue.traumaDelta);
  if (cue.chromaticIntensity > 0) ctx.postFx.chromaticImpact.triggerPulse(cue.chromaticIntensity, impactX, impactY, ctx.cameraRig.worldMainCam);
  ctx.lighting.spawnTransientFlash(impactX, impactY, isCrit ? 0xfbbf24 : 0xff5e2b, isCrit ? 210 : 145, isCrit ? 2.5 : 1.9, 130);

  if (agent.isMetallicClockwork) ctx.particles.bloodSparks.emitBrassSparks(impactX, impactY, slashDir, isCrit ? 24 : 15);
  else ctx.particles.bloodSparks.emitMercuryBlood(impactX, impactY, slashDir, isCrit);
  ctx.particles.damageNumbers.spawnDamageNumber(impactX, impactY - 12, damage, isCrit);

  if (ctx.synergy.skillRuntime.crimsonTransfusionSec > 0) {
    const splash = Math.max(1, Math.round(SKILL_CONSTANTS.CRIMSON_TRANSFUSION_SPLASH_BASE_DMG * computeStatDamageMultiplier(['rubedo'], levels)));
    ctx.synergy.applyRadiusAuxiliaryDamage(impactX, impactY, 54, splash, false);
  }

  EventBus.emit('combat:hit_landed', {
    attackerId: 'player_vessel_09', targetId: agent.id, damage, isCrit, worldX: impactX, worldY: impactY,
    affixIds, attackerStatScale: statScale, baseWeaponDamage, triggeredBreachStun: res.triggeredBreachStun, isMeleeHit: isMelee, isMetallicTarget: agent.isMetallicClockwork,
  });
  if (isCrit) EventBus.emit('combat:crit_triggered', { attackerId: 'player_vessel_09', targetId: agent.id, worldX: impactX, worldY: impactY });
  if (res.killed) {
    ctx.player.stats.ichor += BIOME_CATALOG[ctx.biomeId].ichorPerKill;
    ctx.projectilePool.ripOutArrowsFromTarget(agent.id);
    ctx.player.inventory.refillBowArrows();
    ctx.synergy.skillRuntime.extendCrimsonOnKill();
    ctx.onEnemySlain(agent);
    ctx.synergy.mutations.onEnemyKilled(mutIds, agent.id, agent.x, agent.y - 18, isMelee, controlledBefore, ctx.getTargets());
    EventBus.emit('combat:enemy_killed', { enemyId: agent.id, archetypeId: agent.archetype, worldX: agent.x, worldY: agent.y - 18, killerAffixIds: affixIds, killedByMelee: isMelee, isElite: agent.isElite, isBoss: agent.isBoss, speciesId: agent.speciesId });
    ctx.synergy.statusMachine.clearTarget(agent.id);
  }
}
