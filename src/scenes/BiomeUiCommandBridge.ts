/**
 * 场景与 Preact UI 单向指令桥接器、NPC 守卫上下文投影器及跨关卡/Boss 构筑快照继承器
 * （src/scenes/BiomeUiCommandBridge.ts）。
 */

import type Phaser from 'phaser';
import type { ClockController } from '../core/ClockController';
import {
  EventBus,
  type BiomeId,
  type CampaignStageTarget,
  type RuneId,
  type TrueEndingSealFlag,
} from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import type { NpcGuardContext } from '../data/dialogue.data';
import { WEAPON_CATALOG, type RolledWeaponInstance, type StatColor } from '../data/weapons.data';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { PlayerSkillAndMutationLoadout } from '../entities/player/PlayerSkillAndMutationLoadout';
import type { CameraRig } from '../render/CameraRig';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import type { RuneInteractionController } from '../world/RuneInteractionController';
import type { TeleporterNetwork } from '../world/TeleporterNetwork';
import type { ShowcaseShaderController } from './ShowcaseShaderController';

export interface RunCarryoverSnapshot {
  readonly primaryWeapon: RolledWeaponInstance;
  readonly secondaryWeapon: RolledWeaponInstance;
  readonly loadout: PlayerSkillAndMutationLoadout;
  readonly statLevels: Readonly<Record<StatColor, number>>;
  readonly hp: number;
  readonly gold: number;
  readonly ichor: number;
  readonly flaskCharges: number;
  readonly maxFlaskCharges: number;
  readonly unlockedRunes: readonly RuneId[];
}

export function captureRunCarryover(
  player: PlayerEntity,
  unlockedRunes: readonly RuneId[]
): RunCarryoverSnapshot {
  NarrativeStore.syncUnlockedRunes(unlockedRunes);
  NarrativeStore.unlockWeaponBlueprint(player.inventory.primaryWeapon.weaponId);
  NarrativeStore.unlockWeaponBlueprint(player.inventory.secondaryWeapon.weaponId);
  return {
    primaryWeapon: player.inventory.primaryWeapon,
    secondaryWeapon: player.inventory.secondaryWeapon,
    loadout: player.inventory.loadout,
    statLevels: player.stats.snapshotLevels,
    hp: player.stats.hp,
    gold: player.stats.gold,
    ichor: player.stats.ichor,
    flaskCharges: player.stats.flaskCharges,
    maxFlaskCharges: player.stats.maxFlaskCharges,
    unlockedRunes: NarrativeStore.unlockedRunes,
  };
}

export function restorePlayerCarryover(player: PlayerEntity, snap: RunCarryoverSnapshot): void {
  player.inventory.equipToSlot('primary', snap.primaryWeapon);
  player.inventory.equipToSlot('secondary', snap.secondaryWeapon);
  const colors: readonly StatColor[] = ['rubedo', 'citrinitas', 'albedo'];
  for (const col of colors) {
    const extra = Math.max(0, snap.statLevels[col] - 1);
    for (let k = 0; k < extra; k++) player.stats.applyScrollUpgrade(col);
  }
  player.stats.hp = Math.min(player.stats.maxHp, Math.max(1, snap.hp));
  player.stats.gold = snap.gold;
  player.stats.ichor = snap.ichor;
  player.stats.maxFlaskCharges = snap.maxFlaskCharges;
  player.stats.flaskCharges = snap.flaskCharges;
}

export function buildPlayerNpcGuardContext(
  player: PlayerEntity,
  currentBiomeId: BiomeId | 'sanctum',
  unlockedRunes: readonly RuneId[]
): NpcGuardContext {
  const primId = player.inventory.primaryWeapon.weaponId;
  const secId = player.inventory.secondaryWeapon.weaponId;
  const primCat = WEAPON_CATALOG[primId].category;
  const secCat = WEAPON_CATALOG[secId].category;
  const isHeavy =
    primCat === 'MELEE_HEAVY' || primCat === 'MELEE_HALBERD' ||
    secCat === 'MELEE_HEAVY' || secCat === 'MELEE_HALBERD';
  return {
    currentBiomeId,
    deathCount: NarrativeStore.deathCount,
    forgeUpgradeCount: NarrativeStore.forgeUpgradeCount,
    forgePlusPct: NarrativeStore.forgePlusPct,
    forgeDoublePlusPct: NarrativeStore.forgeDoublePlusPct,
    unlockedRunes,
    defeatedBoss1: NarrativeStore.hasDefeatedBoss('boss_01_furnace_warden'),
    normalEndingCleared: NarrativeStore.normalEndingCleared,
    unlockedWeaponCount: NarrativeStore.unlockedWeapons.length,
    sealCount: NarrativeStore.collectedSeals.length,
    crucibleHeat: NarrativeStore.maxCrucibleHeat,
    holdingHeavyWeapon: isHeavy,
    holdingClockworkRepeater: primId === 'wpn_clockwork_repeater' || secId === 'wpn_clockwork_repeater',
    isPlayerLowHp: player.stats.hp < player.stats.maxHp * 0.3,
    isPlayerCursed: false,
  };
}

export function bindBiomeUiCommands(deps: {
  readonly clock: ClockController;
  readonly player: PlayerEntity;
  readonly cameraRig: CameraRig;
  readonly lighting: LightingDirector;
  readonly postFx: ActiveCameraPostFXBundle;
  readonly shaderCtrl: ShowcaseShaderController;
  readonly runes?: RuneInteractionController;
  readonly teleporters?: TeleporterNetwork;
  readonly getSafeCheckpoint: () => { readonly x: number; readonly y: number };
  readonly onEmitMinimap: () => void;
  readonly onSetMinimapExpanded?: (expanded?: boolean) => void;
  readonly onStateChanged: () => void;
  readonly onRequestTransition: (targetBiomeId?: BiomeId, seed?: number) => void;
  readonly onWarpStage?: (target: CampaignStageTarget) => void;
  readonly onSealToggled?: (flag: TrueEndingSealFlag) => void;
}): () => void {
  const {
    clock, player, cameraRig, lighting, postFx, shaderCtrl,
    runes, teleporters, getSafeCheckpoint, onEmitMinimap, onStateChanged, onRequestTransition, onWarpStage, onSealToggled,
  } = deps;

  let orientationPaused = Boolean(window.__QC_GAME_APP__?.isPortraitLocked);
  let pauseMenuOpen = false;
  let conflictModalOpen = false;
  const syncClockPause = (): void => {
    clock.setPaused(orientationPaused || pauseMenuOpen || conflictModalOpen);
    onStateChanged();
  };

  const unbinds: Array<() => void> = [
    EventBus.on('ui:command:set_orientation_pause', ({ paused }) => {
      orientationPaused = paused;
      syncClockPause();
    }),
    EventBus.on('ui:pause_menu_updated', ({ open }) => {
      pauseMenuOpen = open;
      syncClockPause();
    }),
    EventBus.on('save:conflict_modal_updated', (payload) => {
      conflictModalOpen = Boolean(payload?.open);
      syncClockPause();
    }),
    EventBus.on('ui:command:trigger_trauma_pulse', ({ amount }) => {
      const px = player.physics.x;
      const py = player.physics.y - 18;
      cameraRig.addTrauma(amount);
      clock.triggerHitStop(50);
      postFx.chromaticImpact.triggerPulse(0.75, px, py, cameraRig.worldMainCam);
      lighting.spawnTransientFlash(px, py, 0xfbbf24, 220, 2.4, 140);
      onStateChanged();
    }),
    EventBus.on('ui:command:toggle_shader', ({ shader, active }) => {
      shaderCtrl.toggleShader(shader, active);
      onStateChanged();
    }),
    EventBus.on('ui:command:cycle_hero_anim', ({ direction, animKey }) => {
      shaderCtrl.cycleHeroAnim(direction, animKey);
      onStateChanged();
    }),
    EventBus.on('ui:command:debug_player_hurt', ({ damage }) => {
      player.receiveIncomingHit(damage, 1, true);
      onStateChanged();
    }),
    EventBus.on('ui:command:debug_player_respawn', () => {
      const cp = getSafeCheckpoint();
      player.respawnAt(cp.x, cp.y);
      onStateChanged();
    }),
    EventBus.on('ui:command:teleport_to_node', ({ nodeId }) => {
      if (teleporters?.requestTeleportTo(nodeId, player.physics.x, player.physics.y)) onEmitMinimap();
    }),
    EventBus.on('ui:command:toggle_minimap', ({ expanded }) => {
      if (teleporters) teleporters.setMinimapExpanded(expanded);
      else deps.onSetMinimapExpanded?.(expanded);
      onEmitMinimap();
    }),
    EventBus.on('ui:command:toggle_rune', ({ runeId }) => {
      runes?.toggleRune(runeId);
      onEmitMinimap();
    }),
    EventBus.on('ui:command:regenerate_biome', ({ seed }) => {
      onRequestTransition(undefined, seed);
    }),
    EventBus.on('ui:command:switch_biome', ({ biomeId, seed }) => {
      onRequestTransition(biomeId, seed);
    }),
    EventBus.on('ui:command:warp_campaign_stage', ({ target, toggleSeal }) => {
      if (toggleSeal) {
        NarrativeStore.toggleSeal(toggleSeal);
        onSealToggled?.(toggleSeal);
        onStateChanged();
      }
      if (target) onWarpStage?.(target);
    }),
    EventBus.on('ui:command:invest_forge_ichor', () => {
      NarrativeStore.recordForgeInvestment(25);
    }),
  ];

  return () => {
    for (const off of unbinds) off();
    unbinds.length = 0;
  };
}

export function dispatchBiomeRoute(
  scene: Phaser.Scene,
  destId: string,
  nextSeed: number,
  carry: RunCarryoverSnapshot
): void {
  if (destId === 'sanctum') {
    scene.scene.start('SanctumHubScene', { carryover: carry, skipPrologue: true });
  } else if (destId === 'boss_01_furnace_warden' || destId === 'boss_02_grand_alchemist') {
    scene.scene.start('BossArenaScene', { bossId: destId, carryover: carry });
  } else {
    scene.scene.restart({ biomeId: destId as BiomeId, seed: nextSeed, carryover: carry });
  }
}
