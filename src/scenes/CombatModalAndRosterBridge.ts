/**
 * 关卡 EnemyDirector 编队步进、招架/重力禁锢/酸爆反制仲裁与玩家战斗 HUD 快照投影器
 * （src/scenes/CombatModalAndRosterBridge.ts）。
 */

import type { ProjectilePool } from '../combat/ProjectilePool';
import type { SolidWallRect } from '../combat/CombatTypes';
import { COMBAT_CONSTANTS, type PlayerCombatHudSnapshot } from '../data/weapons.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import type { EnemyDirector } from '../entities/enemies/EnemyDirector';
import type { EnemyViewBounds } from '../entities/enemies/EnemyTypes';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { LightingDirector } from '../render/LightingDirector';
import type { ParticleDirector } from '../render/vfx/ParticleDirector';
import { CombatModalController } from './CombatModalController';
import type { SkillAndSynergyCoordinator } from './SkillAndSynergyCoordinator';

export { CombatModalController };

const viewBoundsScratch: { minX: number; minY: number; maxX: number; maxY: number } = {
  minX: 0, minY: 0, maxX: 0, maxY: 0,
};

export function stepEnemyDirectorRoster(
  dtSec: number,
  director: EnemyDirector,
  solidRects: readonly SolidWallRect[],
  player: PlayerEntity,
  projectiles: ProjectilePool,
  particles: ParticleDirector,
  lighting: LightingDirector,
  synergy: SkillAndSynergyCoordinator,
  onRespawnPlayer: () => void,
  cameraRig?: CameraRig,
  activeRoomId?: string
): void {
  let vb: EnemyViewBounds | undefined;
  if (cameraRig) {
    const cam = cameraRig.worldMainCam;
    viewBoundsScratch.minX = cam.scrollX;
    viewBoundsScratch.minY = cam.scrollY;
    viewBoundsScratch.maxX = cam.scrollX + cam.width;
    viewBoundsScratch.maxY = cam.scrollY + cam.height;
    vb = viewBoundsScratch;
  }
  const px = player.physics.x;
  const py = player.physics.y;
  const facing = player.physics.facing;
  const stealthed = synergy.mutations.stealthRemainingSec > 0;

  director.stepFixed(
    dtSec,
    px,
    py,
    facing,
    stealthed,
    solidRects,
    (eid) => projectiles.getEmbeddedArrowCount(eid),
    {
      onStrikePlayer: (dmg, dirX, parriable, source, rootSec) => {
        const res = player.receiveIncomingHit(dmg, dirX, parriable);
        if (res === 'parried') {
          const stunMs =
            source.speciesId === 'mob_05_brass_sentinel' && !source.isBoss
              ? 2500
              : source.onParriedByPlayer();
          source.forceStun(stunMs);
          const wardHeal = synergy.mutations.onGoldenParry(
            player.inventory.loadout.activeMutationIds,
            player.stats.snapshotLevels,
            player.stats.maxHp,
            source.id
          );
          if (wardHeal > 0) {
            const h = player.stats.healDirect(wardHeal);
            if (h > 0) particles.damageNumbers.spawnLabel(px, py - 34, `+${h}`, 'RALLY_HEAL');
          }
          if (player.inventory.getEquippedShieldId() === 'wpn_mirror_aegis') {
            synergy.statusMachine.apply(source.id, 'electrified', 3, 1.0, {
              worldX: source.x,
              worldY: source.y - 20,
            });
            synergy.statusMachine.apply(source.id, 'frozen', 1, 1.0, {
              worldX: source.x,
              worldY: source.y - 20,
              durationOverrideSec: COMBAT_CONSTANTS.AEGIS_MELEE_PARRY_FREEZE_SEC,
            });
          }
        } else if (res === 'blocked') {
          source.pushBack(-dirX * COMBAT_CONSTANTS.BUCKLER_BLOCK_PUSHBACK_PX);
          particles.bloodSparks.emitBrassSparks(px + facing * 10, py - 16, facing, 14);
        } else if (res === 'hurt') {
          particles.bloodSparks.emitMercuryBlood(px, py - 16, dirX, false);
          if (rootSec && rootSec > 0) {
            synergy.playerRootedSec = Math.max(synergy.playerRootedSec, rootSec);
            particles.damageNumbers.spawnLabel(px, py - 38, '✦重力禁锢!', 'REACTION');
          }
        } else if (res === 'dead') {
          onRespawnPlayer();
        }
      },
      onSpawnProjectile: (sid, ox, oy, vx, vy, dmg, grav, kind) => {
        projectiles.spawnEnemyFlaskBolt(sid, ox, oy, vx, vy, dmg, grav, kind);
      },
      onSpawnAcidOrFireHazard: (wx, wy, rad, isPoison) => {
        particles.emitWeaponSmear('react_burst_ring_0', wx, wy - 10, 1, 0.28, 'synergy_fx_atlas');
        lighting.spawnTransientFlash(wx, wy - 14, isPoison ? 0x3ce682 : 0xff5e2b, rad * 2.2, 2.3, 240);
      },
    },
    vb,
    activeRoomId
  );
}

export function resolvePlayerShieldAndCarapaceHooks(
  player: PlayerEntity,
  agents: readonly BaseEnemy[],
  particles: ParticleDirector,
  lighting: LightingDirector,
  synergy: SkillAndSynergyCoordinator
) {
  return {
    absorbIncomingWithSkillShield: (rawDamage: number): number => {
      const px = player.physics.x;
      const py = player.physics.y - 16;
      const res = synergy.skillRuntime.absorbWithAegisShield(rawDamage, px, py);
      if (res.shatteredBurstDmg > 0) {
        synergy.applyRadiusAuxiliaryDamage(px, py, 110, res.shatteredBurstDmg, true);
        particles.emitWeaponSmear('react_burst_ring_0', px, py, 1, 0.26, 'synergy_fx_atlas');
      }
      return res.remainingDamage;
    },
    tryEmergencyCarapaceSave: (hpBefore: number, hpAfter: number): boolean => {
      const saved = synergy.mutations.tryTriggerEmergencyCarapace(
        player.inventory.loadout.activeMutationIds,
        hpBefore,
        player.stats.maxHp,
        hpAfter
      );
      if (saved) {
        const { x: px, y: py, facing } = player.physics;
        particles.damageNumbers.spawnLabel(px, py - 38, '✦应急凝壳 1HP!', 'PARRY');
        particles.emitParrySunburst(px, py - 18, facing);
        for (const ag of agents) if (ag.isAlive) ag.pushBack((ag.x >= px ? 1 : -1) * 48);
      }
      return saved;
    },
    handleFlaskDrunk: (healedAmount: number): void => {
      const { x: px, y: py } = player.physics;
      const mod = synergy.mutations.resolveFlaskOrFoodModifier(
        player.inventory.loadout.activeMutationIds,
        false
      );
      const bonus =
        mod.healMultiplier > 1
          ? player.stats.healDirect(Math.round(healedAmount * (mod.healMultiplier - 1)))
          : 0;
      particles.damageNumbers.spawnLabel(px, py - 34, `+${healedAmount + bonus} HP`, 'RALLY_HEAL');
      lighting.spawnTransientFlash(px, py - 18, 0xe11d48, 175, 2.2, 220);
    },
  };
}

export function buildPlayerCombatHudSnapshot(
  player: PlayerEntity,
  synergy?: SkillAndSynergyCoordinator
): PlayerCombatHudSnapshot {
  const levels = player.stats.snapshotLevels;
  const loadout = player.inventory.loadout;
  return {
    hp: player.stats.hp,
    maxHp: player.stats.maxHp,
    rallyOrangeHp: Math.round(player.stats.rallyOrangeHp),
    rallyFrozen: player.stats.isRallyFrozen,
    stats: levels,
    flaskCharges: player.stats.flaskCharges,
    maxFlaskCharges: player.stats.maxFlaskCharges,
    gold: player.stats.gold,
    ichor: player.stats.ichor,
    rapierCritReady: player.stats.rapierCritWindowMs > 0,
    cleaverRhythmWindowOpen: player.stats.isCleaverRhythmWindowOpen,
    isInvulnerable: player.isInvulnerable,
    isParryWindowActive: player.ctx.isParryWindowActive,
    primarySlot: player.inventory.buildHudSlotSummary('primary', levels, true),
    secondarySlot: player.inventory.buildHudSlotSummary('secondary', levels, player.ctx.parryCooldownTicks === 0),
    skillOneSlot: loadout.buildHudSkillSummary('skill_1'),
    skillTwoSlot: loadout.buildHudSkillSummary('skill_2'),
    activeMutationIds: [...loadout.activeMutationIds],
    aegisShieldHp: synergy?.skillRuntime.aegisShieldHp ?? 0,
    crimsonTransfusionActive: (synergy?.skillRuntime.crimsonTransfusionSec ?? 0) > 0,
    predatorStealthActive: (synergy?.mutations.stealthRemainingSec ?? 0) > 0,
    teslaTetherLinked: Boolean(synergy?.skillRuntime.turret.active && synergy.skillRuntime.turret.tetherLinkedToPlayer),
    carapaceReady: Boolean(loadout.activeMutationIds.includes('mut_emergency_carapace') && synergy?.mutations.carapaceReady),
  };
}
