/**
 * BossArenaRig 武器攻击触发、黄金招架反馈与场地机关钩子装配辅助器
 * （src/scenes/BossCombatHelpers.ts）。
 */

import type { CombatTargetView, VoltaicChainSegment } from '../combat/CombatTypes';
import type { HitboxManager } from '../combat/HitboxManager';
import type { HitStopController } from '../combat/HitStopController';
import type { ProjectilePool } from '../combat/ProjectilePool';
import type { ClockController } from '../core/ClockController';
import { EventBus, type BossId } from '../core/EventBus';
import { WEAPON_CATALOG, type WeaponId, type WeaponSlotId } from '../data/weapons.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import type { BossArenaCallbacks } from '../entities/enemies/bosses/BossTypes';
import { FurnaceWardenBoss } from '../entities/enemies/bosses/FurnaceWardenBoss';
import { GrandAlchemistBoss } from '../entities/enemies/bosses/GrandAlchemistBoss';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import type { ParticleDirector } from '../render/vfx/ParticleDirector';
import type { BossArenaVisuals } from './BossArenaVisuals';
import { applyResolvedWeaponHits, type CombatResolverContext } from './CombatHitResolver';

export function buildArenaHookBundle(deps: {
  readonly visuals: BossArenaVisuals;
  readonly clock: ClockController;
  readonly cameraRig: CameraRig;
  readonly lighting: LightingDirector;
  readonly postFx: ActiveCameraPostFXBundle;
  readonly getBossPos: () => { readonly x: number; readonly y: number };
  readonly onSetBlackhole: (cx: number, spd: number) => void;
}): BossArenaCallbacks {
  const { visuals, clock, cameraRig, lighting, postFx, getBossPos, onSetBlackhole } = deps;
  return {
    onPhaseTransition: (bid: BossId, nextPhase: 1 | 2 | 3, trauma: number) => {
      const pos = getBossPos();
      cameraRig.addTrauma(trauma);
      postFx.chromaticImpact.triggerPulse(0.85, pos.x, pos.y - 40, cameraRig.worldMainCam);
      lighting.spawnTransientFlash(pos.x, pos.y - 40, nextPhase === 3 ? 0x38bdf8 : 0xff5e2b, 280, 2.9, 360);
      EventBus.emit('boss:phase_changed', { bossId: bid, phase: nextPhase });
    },
    onSyncFurnaceGrates: (pair, st) => visuals.syncGrates(pair, st),
    onSpawnSulfurWave: (ox, _fy, dirX) => visuals.spawnSulfurFlameWave(ox, dirX),
    onElevatePorcelainPlatforms: (el) => visuals.setPlatformsElevated(el),
    onSyncAstrolabeLaser: (l) => visuals.syncAstrolabeLaser(l),
    onApplyBlackholePull: (cx, _cy, spd, act) => {
      onSetBlackhole(cx, act ? spd : 0);
      visuals.setBlackholeVisible(act);
    },
    onSyncMatrixFloor: (st) => visuals.syncMatrixFloor(st),
    onActivateQuicksilverSea: () => {
      visuals.activateQuicksilverSea();
      lighting.setAmbientColor(0x3a4364);
    },
    onSyncQuicksilverBlades: (w) => visuals.syncQuicksilverBlades(w),
    onSyncCalcinationSun: (a, x, y, r) => visuals.syncCalcinationSun(a, x, y, r),
    onTriggerChromaticClash: (wx, wy, ms) => {
      clock.triggerHitStop(ms);
      cameraRig.addTrauma(0.5);
      postFx.chromaticImpact.triggerPulse(0.9, wx, wy, cameraRig.worldMainCam);
    },
  };
}

export function triggerArenaPlayerWeaponStage(params: {
  readonly weaponId: WeaponId;
  readonly stageIndex: number;
  readonly slot: WeaponSlotId;
  readonly player: PlayerEntity;
  readonly projectiles: ProjectilePool;
  readonly hitboxes: HitboxManager;
  readonly particles: ParticleDirector;
  readonly targets: readonly CombatTargetView[];
  readonly chainScratch: VoltaicChainSegment[];
  readonly resolverCtx: CombatResolverContext;
}): void {
  const { weaponId, stageIndex, slot, player, projectiles, hitboxes, particles, targets, chainScratch, resolverCtx } = params;
  const def = WEAPON_CATALOG[weaponId];
  const stage = def.stages[stageIndex % def.stages.length]!;
  const { x: px, y: py, facing } = player.physics;
  const pierces = player.inventory.getSlotWeapon(slot).affixIds.includes('afx_pierce_first');

  if (def.category === 'RANGED_BOW') { projectiles.spawnPlayerMercuryArrow(px + facing * 14, py - 17, facing, pierces); return; }
  if (def.category === 'RANGED_CROSSBOW') { projectiles.spawnPlayerRepeaterBolt(px + facing * 16, py - 17, facing, (stageIndex - 1) * 14, pierces); return; }
  if (def.category === 'THROWN_FLASK') { projectiles.spawnPlayerLobbedFlask('VITRIOL_FLASK', px + facing * 12, py - 20, facing); return; }
  if (def.category === 'MAGIC_STAFF') {
    const hits = hitboxes.resolveVoltaicArcPulse(px + facing * 10, py - 18, facing, targets, chainScratch);
    particles.emitVoltaicChainBolts(chainScratch);
    applyResolvedWeaponHits(resolverCtx, hits);
    return;
  }
  const cx = px + facing * stage.hitboxOffsetX;
  const cy = py + stage.hitboxOffsetY;
  hitboxes.beginPlayerSwingBox(weaponId, stageIndex, cx, cy, stage.hitboxWidthPx, stage.hitboxHeightPx, stage.activeTicks);
  particles.emitWeaponSmear(stage.smearFrame, cx, cy, facing, def.category === 'MELEE_HEAVY' ? 0.22 : 0.14, stage.smearAtlas ?? 'weapons_fx_atlas');
}

export function triggerArenaParryShockwave(
  player: PlayerEntity,
  hitboxes: HitboxManager,
  particles: ParticleDirector,
  hitStop: HitStopController,
  cameraRig: CameraRig,
  postFx: ActiveCameraPostFXBundle,
  bossAgents: readonly BaseEnemy[]
): void {
  const { x: px, y: py, facing } = player.physics;
  const shieldId = player.inventory.getEquippedShieldId() === 'wpn_mirror_aegis' ? 'wpn_mirror_aegis' : 'wpn_slag_buckler';
  hitboxes.spawnBucklerParryShockwave(px, py, facing, shieldId);
  particles.emitParrySunburst(px, py - 18, facing);
  const cue = hitStop.registerImpact('PARRY', true, true, bossAgents[0]?.id ?? null, 0);
  cameraRig.addTrauma(cue.traumaDelta);
  postFx.chromaticImpact.triggerPulse(cue.chromaticIntensity, px, py - 18, cameraRig.worldMainCam);
}

declare global {
  interface Window {
    __QC_BOSS_ARENA__?: {
      damageBoss: (amount: number) => void;
      chooseEnding: (choice: 'USURP_THRONE' | 'INJECT_ALKAHEST') => void;
    };
  }
}

export function bindArenaUiCommands(deps: {
  readonly boss: FurnaceWardenBoss | GrandAlchemistBoss;
  readonly player: PlayerEntity;
  readonly onCommitVictory: () => void;
  readonly onCheckVictory: () => void;
  readonly onEmitHud: () => void;
}): () => void {
  const { boss, player, onCommitVictory, onCheckVictory, onEmitHud } = deps;
  if (import.meta.env.DEV) {
    window.__QC_BOSS_ARENA__ = {
      damageBoss: (amt) => {
        boss.applyHit(amt, 2.5, 1, player.physics.x);
        onCheckVictory();
        onEmitHud();
      },
      chooseEnding: (c) => EventBus.emit('ui:command:resolve_ending_choice', { choice: c }),
    };
  }
  const offChoice = EventBus.on('ui:command:resolve_ending_choice', ({ choice }) => {
    if (boss instanceof GrandAlchemistBoss) {
      if (boss.applyAlkahestDecision(choice) === 'END_FALSE_CALCIFICATION') onCommitVictory();
      onEmitHud();
    }
  });
  const offSmite = EventBus.on('ui:command:debug_boss_smite', ({ ratio }) => {
    if (!import.meta.env.DEV) return;
    player.stats.resetFullHealth();
    player.ctx.isInvulnerable = true;
    player.ctx.mercyInvulnTicks = 1200;
    if (boss.isTransitioning) return;
    if (boss instanceof GrandAlchemistBoss && boss.phase === 1) boss.prismShieldHp = 0;
    const pct = ratio ?? (boss.phase === 1 ? 0.48 : 0.65);
    boss.applyHit(Math.max(1, Math.round(boss.maxHp * pct)), 3.0, 1, player.physics.x);
    onCheckVictory();
    onEmitHud();
  });
  return () => {
    delete window.__QC_BOSS_ARENA__;
    offChoice();
    offSmite();
  };
}
