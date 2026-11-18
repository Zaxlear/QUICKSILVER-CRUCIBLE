/**
 * 封闭式静态大厅几何烘焙、圣所 NPC/悬吊瓶装配器与公共场景遥测同步器
 * （src/scenes/SanctumStageBuilder.ts）。
 */

import Phaser from 'phaser';
import type { ClockController } from '../core/ClockController';
import { DepthLayer, FIXED_SIM_HZ, MAX_HARDWARE_LIGHTS, PALETTE_VOID_HEX, TILE_SIZE_PX } from '../core/Constants';
import { EventBus, type BootTelemetryPayload } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import type { MinimapSnapshotPayload } from '../data/runes.data';
import { ALL_WEAPON_IDS, type WeaponId } from '../data/weapons.data';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { LightingDirector } from '../render/LightingDirector';
import type { GeneratedBiomeDag } from '../world/DagBiomeGenerator';
import { bakeStitchedWorldGeometry, type BakedStitchedWorld } from '../world/DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import type { RoomChunkTemplate } from '../world/RoomChunkSchema';
import { buildPlayerCombatHudSnapshot } from './CombatModalAndRosterBridge';
import { buildPlayerNpcGuardContext } from './BiomeUiCommandBridge';
import type { DialogueBannerController } from '../world/DialogueBannerController';
import type { ParticleDirector } from '../render/vfx/ParticleDirector';
import type { ShowcaseShaderController } from './ShowcaseShaderController';
import type { SkillAndSynergyCoordinator } from './SkillAndSynergyCoordinator';

export const SANCTUM_FLOOR_Y = 26 * TILE_SIZE_PX;

export function buildEnclosedHallDag(
  biomeId: 'biome_01_slag_retort' | 'biome_04_crucible_apex',
  chunkId: string,
  widthTiles: number,
  heightTiles: number,
  extraOneWay: readonly { readonly tileX: number; readonly tileY: number; readonly widthTiles: number }[] = []
): { readonly dag: GeneratedBiomeDag; readonly baked: BakedStitchedWorld } {
  const chunk: RoomChunkTemplate = {
    chunkId,
    biomePool: [biomeId],
    role: 'ENTRANCE',
    widthTiles,
    heightTiles,
    solidRects: [
      { tileX: 0, tileY: 0, widthTiles, heightTiles: 3 },
      { tileX: 0, tileY: 3, widthTiles: 3, heightTiles: heightTiles - 7 },
      { tileX: widthTiles - 3, tileY: 3, widthTiles: 3, heightTiles: heightTiles - 7 },
      { tileX: 0, tileY: 26, widthTiles, heightTiles: 4 },
    ],
    oneWayPlatforms: extraOneWay,
    climbableWalls: [
      { tileX: 3, topTileY: 6, heightTiles: 18, normalSide: 'RIGHT' },
      { tileX: widthTiles - 4, topTileY: 6, heightTiles: 18, normalSide: 'LEFT' },
    ],
    breakableSlagFloors: [], doorSockets: [], enemySpawns: [], trapSlots: [],
    teleporterTilePos: null, rewardPedestalTilePos: null, loreAnchor: null, lightAnchors: [],
  };
  const node = { nodeId: chunkId, chunk, worldTileX: 0, worldTileY: 0, parentNodeId: null, isMainSpine: true };
  const dag: GeneratedBiomeDag = { seed: 0x51c0ffee, biomeId, nodes: [node], bridges: [], mainSpineNodeIds: [chunkId], branchNodeIds: [] };
  return { dag, baked: bakeStitchedWorldGeometry(dag.nodes, dag.bridges) };
}

export interface SanctumInteractiveProp {
  readonly id: 'corvus' | 'isolde' | 'seals' | 'depart';
  readonly x: number;
  readonly y: number;
  readonly promptZh: string;
}

export interface SanctumStageObjects {
  readonly corvusSprite: Phaser.GameObjects.Sprite;
  readonly isoldeSprite: Phaser.GameObjects.Sprite;
  readonly hearthSprite: Phaser.GameObjects.Sprite;
  readonly flaskSprites: ReadonlyArray<{ readonly weaponId: WeaponId; readonly sprite: Phaser.GameObjects.Sprite }>;
  readonly promptLabel: Phaser.GameObjects.Text;
  readonly stations: readonly SanctumInteractiveProp[];
  destroy(): void;
}

export function buildSanctumPropsAndNpcs(
  scene: Phaser.Scene,
  registrar: IWorldDisplayRegistrar,
  floorY: number
): SanctumStageObjects {
  const allSprites: Phaser.GameObjects.Sprite[] = [];
  const mk = (x: number, y: number, frame: string, depth: number = DepthLayer.LOOT): Phaser.GameObjects.Sprite => {
    const s = registrar.registerWorldLit(
      scene.add.sprite(x, y, 'sanctum_hub_atlas', frame).setOrigin(0.5, 1.0).setDepth(depth).setPipeline('Light2D')
    );
    allSprites.push(s);
    return s;
  };

  const unlockedSet = new Set(NarrativeStore.unlockedWeapons);
  const flaskSprites = ALL_WEAPON_IDS.map((wid, idx) => {
    const fx = 116 + idx * 44;
    const fy = 212 + (idx % 2) * 14;
    const isLit = unlockedSet.has(wid);
    const sprite = mk(fx, fy, isLit ? 'sanctum_hanging_flask_lit' : 'sanctum_hanging_flask_empty', DepthLayer.PROPS_BACK);
    if (isLit && idx % 3 === 0) {
      registrar.registerAmbientLight({ id: `flask_light_${idx}`, x: fx, y: fy - 20, preset: 'VOLTAIC_CYAN', radiusPx: 120, flickerAmplitude: 0.05 });
    }
    return { weaponId: wid, sprite };
  });

  mk(256, floorY, 'sanctum_rebirth_slab', DepthLayer.PROPS_BACK);
  mk(344, floorY, 'sanctum_seal_pedestal', DepthLayer.PROPS_BACK);
  const hearthSprite = mk(502, floorY, 'sanctum_athanor_hearth_0', DepthLayer.PROPS_BACK);
  mk(648, floorY, 'sanctum_departure_pipe', DepthLayer.PROPS_BACK);
  const corvusSprite = mk(164, floorY, 'npc_corvus_idle_0', DepthLayer.ENEMIES);
  const isoldeSprite = mk(446, floorY, 'npc_isolde_idle_0', DepthLayer.ENEMIES);

  registrar.registerAmbientLight({ id: 's_corvus', x: 164, y: floorY - 28, preset: 'VITRIOL_VAT_GREEN', radiusPx: 175, flickerAmplitude: 0.07 });
  registrar.registerAmbientLight({ id: 's_seals', x: 344, y: floorY - 36, preset: 'MERCURY_SILVER', radiusPx: 165, flickerAmplitude: 0.05 });
  registrar.registerAmbientLight({ id: 's_hearth', x: 502, y: floorY - 38, preset: 'FURNACE_CRIMSON', radiusPx: 230, flickerAmplitude: 0.14 });
  registrar.registerAmbientLight({ id: 's_depart', x: 648, y: floorY - 36, preset: 'VOLTAIC_CYAN', radiusPx: 185, flickerAmplitude: 0.08 });

  const promptLabel = registrar.registerCrispOverlay(
    scene.add
      .text(0, 0, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', color: '#FBBF24', stroke: PALETTE_VOID_HEX, strokeThickness: 3 })
      .setOrigin(0.5, 1.0).setDepth(DepthLayer.CRISP_TELEGRAPH + 1).setVisible(false)
  );

  const stations: readonly SanctumInteractiveProp[] = [
    { id: 'corvus', x: 164, y: floorY, promptZh: '[E/ACT] 与收藏官·科尔维斯对话 · [V] 灵液坩埚' },
    { id: 'seals', x: 344, y: floorY, promptZh: '[E/ACT] 检视原初质三真名封印星盘碑' },
    { id: 'isolde', x: 446, y: floorY, promptZh: '[E/ACT] 与断臂钟表匠·伊索尔德对话并淬火武器' },
    { id: 'depart', x: 648, y: floorY, promptZh: '[E/ACT] 潜入毛细出发管 -> I. 矿渣蒸馏厂' },
  ];

  return {
    corvusSprite, isoldeSprite, hearthSprite, flaskSprites, promptLabel, stations,
    destroy: () => {
      for (const s of allSprites) { registrar.unregister(s); s.destroy(); }
      registrar.unregister(promptLabel); promptLabel.destroy();
    },
  };
}

export function buildSingleHallMinimapSnapshot(
  biomeId: 'biome_01_slag_retort' | 'biome_04_crucible_apex',
  titleZh: string,
  roomId: string,
  widthTiles: number,
  expanded: boolean,
  interactPrompt: string | null
): MinimapSnapshotPayload {
  return {
    biomeId, biomeNameZh: titleZh, runSeed: 0x51c0ffee, currentRoomId: roomId,
    expanded, isWarping: false, unlockedRunes: NarrativeStore.unlockedRunes,
    nodes: [{
      nodeId: roomId, role: 'ENTRANCE', worldTileX: 0, worldTileY: 0,
      widthTiles, heightTiles: 30, isMainSpine: true, visited: true, hasTeleporter: true, teleporterActive: true,
    }],
    bridges: [], banner: null, interactPrompt,
    collectedSeals: NarrativeStore.collectedSeals,
    crucibleHeat: NarrativeStore.maxCrucibleHeat,
  };
}

export function publishEnclosedSceneTelemetry(params: {
  readonly sceneKey: string;
  readonly game: Phaser.Game;
  readonly clock: ClockController;
  readonly cameraRig: CameraRig;
  readonly lighting: LightingDirector;
  readonly shaderCtrl: ShowcaseShaderController;
  readonly heroSprite: Phaser.GameObjects.Sprite;
  readonly player: PlayerEntity;
  readonly synergy?: SkillAndSynergyCoordinator;
  readonly lastHitStopMs?: number;
}): void {
  const boot: BootTelemetryPayload = {
    rendererType: params.game.renderer.type, isWebGL: params.game.renderer.type === Phaser.WEBGL, framebufferLit: true,
    maxLights: MAX_HARDWARE_LIGHTS, activeLights: params.lighting.activeHardwareLightCount, fixedSimHz: FIXED_SIM_HZ,
    totalFixedTicks: params.clock.totalFixedTicks, isPaused: params.clock.isPaused,
    trauma: Number(params.cameraRig.currentTrauma.toFixed(3)), rngSeed: 0x51c0ffee,
  };
  window.__QC_BOOT_STATE__ = boot;
  EventBus.emit('system:telemetry_updated', boot);
  const pSnap = params.player.snapshotTelemetry();
  window.__QC_PLAYER_STATE__ = pSnap;
  EventBus.emit('player:telemetry_updated', pSnap);
  const combatSnap = buildPlayerCombatHudSnapshot(params.player, params.synergy);
  window.__QC_COMBAT_STATE__ = { ...combatSnap, lastHitStopMs: params.lastHitStopMs ?? 0 };
  EventBus.emit('player:combat_hud_updated', combatSnap);
  const animKey = params.heroSprite.anims.currentAnim?.key ?? 'hero_idle';
  const show = { ...params.shaderCtrl.snapshot(params.lighting.activeHardwareLightCount, animKey), activeSceneKey: params.sceneKey };
  window.__QC_SHOWCASE_STATE__ = show;
  EventBus.emit('system:showcase_state_changed', show);
}

export function stepSanctumInteractionTick(params: {
  readonly dtMs: number;
  readonly animMs: number;
  readonly interactPressed: boolean;
  readonly player: PlayerEntity;
  readonly props: SanctumStageObjects;
  readonly bannerCtrl: DialogueBannerController;
  readonly particles: ParticleDirector;
  readonly lighting: LightingDirector;
  readonly prevPrompt: string | null;
  readonly onPromptChanged: (next: string | null) => void;
  readonly onDepart: () => void;
}): void {
  const bit = (Math.floor(params.animMs / 380) & 1) as 0 | 1;
  params.props.corvusSprite.setFrame(`npc_corvus_idle_${bit}`);
  params.props.isoldeSprite.setFrame(`npc_isolde_idle_${bit}`);
  params.props.hearthSprite.setFrame(`sanctum_athanor_hearth_${bit}`);

  const { x: px, y: py, vx } = params.player.physics;
  params.bannerCtrl.stepFixed(params.dtMs, px, params.player.state === 'DodgeRoll', Math.abs(vx) > 25);

  const near = params.props.stations.find((s) => Math.hypot(px - s.x, py - s.y) <= 46) ?? null;
  params.props.promptLabel.setVisible(Boolean(near));
  if (near) params.props.promptLabel.setText(near.promptZh).setPosition(near.x, near.y - 58);
  if ((near?.promptZh ?? null) !== params.prevPrompt) params.onPromptChanged(near?.promptZh ?? null);
  if (!near || !params.interactPressed) return;

  const guard = buildPlayerNpcGuardContext(params.player, 'sanctum', NarrativeStore.unlockedRunes);
  if (near.id === 'corvus') params.bannerCtrl.showNpcLine(NarrativeStore.selectNextNpcDialogue('corvus', guard), near.x);
  else if (near.id === 'isolde') {
    NarrativeStore.recordForgeInvestment(50);
    params.particles.damageNumbers.spawnLabel(near.x, near.y - 44, '✦炉温淬火完成!', 'PARRY');
    params.lighting.spawnTransientFlash(near.x + 32, near.y - 24, 0xff5e2b, 220, 2.5, 220);
    params.bannerCtrl.showNpcLine(NarrativeStore.selectNextNpcDialogue('isolde', guard), near.x);
  } else if (near.id === 'seals') {
    params.particles.damageNumbers.spawnLabel(near.x, near.y - 48, `真名封印 ${NarrativeStore.collectedSeals.length}/3`, 'REACTION');
  } else if (near.id === 'depart') params.onDepart();
}
