/**
 * 四大永久探索符文、精英守坛解封与房间升降梯交互控制器（src/world/RuneInteractionController.ts，严格 <= 250 行）。
 */

import type Phaser from 'phaser';
import { DepthLayer } from '../core/Constants';
import { EventBus, type WorldBannerNotice } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { BIOME_CATALOG } from '../data/biomes.data';
import { BIOME_01_SLAG_LIGHTING } from '../data/palette.data';
import { BIOME_DAG_CONFIGS, EXPLORATION_RUNES, type RuneId } from '../data/runes.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { BakedStitchedWorld } from './DoorSocketStitcher';
import { EliteAltarEncounter } from './EliteAltarEncounter';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';
import {
  spawnWorldInteractiveStations,
  sproutVitriolTendrilColumn,
  type InteractiveStation,
} from './RuneStationSpawner';

export class RuneInteractionController {
  public readonly eliteEncounter: EliteAltarEncounter;
  private readonly unlocked: Set<RuneId>;
  private readonly stations: InteractiveStation[];
  private readonly extraSprites: Phaser.GameObjects.Sprite[];
  private readonly vineColumns: { x: number; topY: number; bottomY: number }[] = [];
  private readonly promptLabel: Phaser.GameObjects.Text;
  private activePrompt: string | null = null;
  private activeConduitTransit: {
    elapsedMs: number; durationMs: number;
    fromX: number; fromY: number; toX: number; toY: number;
  } | null = null;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    private readonly dag: GeneratedBiomeDag,
    private readonly baked: BakedStitchedWorld,
    private readonly onShatterFloor: (floorId: string) => boolean,
    private readonly onShowBanner: (notice: WorldBannerNotice) => void,
    private readonly onRequestNextFloor: () => void,
    initialRunes: readonly RuneId[] = [],
    private readonly onGrantRepeatReliquary?: (ichor: number, wx: number, wy: number) => void
  ) {
    this.unlocked = new Set<RuneId>(initialRunes);
    this.eliteEncounter = new EliteAltarEncounter(scene, registrar, dag, baked);
    this.promptLabel = registrar.registerCrispOverlay(
      scene.add
        .text(0, 0, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', color: '#FBBF24', stroke: BIOME_01_SLAG_LIGHTING.backdropHex, strokeThickness: 3 })
        .setOrigin(0.5, 1.0).setDepth(DepthLayer.CRISP_TELEGRAPH).setVisible(false)
    );
    const spawned = spawnWorldInteractiveStations(scene, registrar, dag, baked);
    this.stations = spawned.stations;
    this.extraSprites = spawned.extraSprites;
  }

  public get unlockedRunes(): readonly RuneId[] { return Array.from(this.unlocked); }
  public get currentPrompt(): string | null { return this.activePrompt; }
  public get isInConduitTransit(): boolean { return this.activeConduitTransit !== null; }
  public hasRune(runeId: RuneId): boolean { return this.unlocked.has(runeId); }

  public unlockRune(runeId: RuneId): void {
    if (this.unlocked.has(runeId)) return;
    this.unlocked.add(runeId);
    NarrativeStore.syncUnlockedRunes([runeId]);
    const spec = EXPLORATION_RUNES[runeId];
    EventBus.emit('world:rune_unlocked', { runeId, nameZh: spec.nameZh });
    this.onShowBanner({
      title: `嬗变符文刻印 · ${spec.nameZh}`,
      body: spec.mechanicDescZh,
      accentHex: spec.accentHex,
    });
  }

  public toggleRune(runeId: RuneId): void {
    if (this.unlocked.has(runeId)) this.unlocked.delete(runeId);
    else this.unlockRune(runeId);
  }

  public isInsideVineZone(px: number, py: number): boolean {
    return this.vineColumns.some((v) => Math.abs(px - v.x) <= 22 && py >= v.topY - 8 && py <= v.bottomY + 12);
  }

  public handleSlamImpact(worldX: number, worldY: number): boolean {
    if (!this.unlocked.has('rune_calcined_ram')) return false;
    let brokeAny = false;
    for (const bf of this.baked.breakableFloors) {
      if (bf.shattered) continue;
      if (worldX >= bf.rectPx.x - 14 && worldX <= bf.rectPx.x + bf.rectPx.w + 14 && Math.abs(worldY - bf.rectPx.y) <= 20) {
        if (this.onShatterFloor(bf.id)) {
          brokeAny = true;
          this.registrar.spawnLightFlash(worldX, worldY, 0xff5e2b, 195, 2.5, 280);
        }
      }
    }
    return brokeAny;
  }

  public stepFixed(
    dtSec: number,
    px: number,
    py: number,
    interactJustPressed: boolean,
    relocatePlayer: (nx: number, ny: number) => void,
    spawnGhost: () => void,
    roomEnemies: readonly BaseEnemy[] = []
  ): void {
    this.eliteEncounter.stepFixed(dtSec, px, py, roomEnemies);

    if (this.activeConduitTransit) {
      const tr = this.activeConduitTransit;
      tr.elapsedMs += dtSec * 1000;
      const t = Math.min(1, tr.elapsedMs / tr.durationMs);
      relocatePlayer(tr.fromX + (tr.toX - tr.fromX) * t, tr.fromY + (tr.toY - tr.fromY) * t);
      spawnGhost();
      if (t >= 1) {
        this.registrar.spawnLightFlash(tr.toX, tr.toY - 16, 0x38bdf8, 185, 2.4, 240);
        this.activeConduitTransit = null;
      }
      return;
    }

    let nearest: InteractiveStation | null = null;
    let bestDist = 42;
    for (const st of this.stations) {
      const d = Math.hypot(px - st.x, py - st.y);
      if (d < bestDist) { bestDist = d; nearest = st; }
    }

    if (!nearest) {
      this.activePrompt = null;
      this.promptLabel.setVisible(false);
      return;
    }

    const label = this.describeStationPrompt(nearest);
    this.activePrompt = label;
    this.promptLabel.setText(label).setPosition(nearest.x, nearest.y - 44).setVisible(true);
    if (interactJustPressed) this.activateStation(nearest, relocatePlayer, roomEnemies);
  }

  public destroy(): void {
    this.eliteEncounter.destroy();
    for (const st of this.stations) {
      this.registrar.unregister(st.sprite);
      st.sprite.destroy();
      if (st.badgeSprite) { this.registrar.unregister(st.badgeSprite); st.badgeSprite.destroy(); }
    }
    for (const sp of this.extraSprites) { this.registrar.unregister(sp); sp.destroy(); }
    this.registrar.unregister(this.promptLabel);
    this.promptLabel.destroy();
    this.stations.length = 0;
    this.extraSprites.length = 0;
  }

  private describeStationPrompt(st: InteractiveStation): string {
    const nextDest = BIOME_DAG_CONFIGS[this.dag.biomeId].nextDestinationId;
    const destLabel =
      nextDest === 'boss_01_furnace_warden'
        ? 'Boss · 典狱长萨尔弗刑炉室'
        : nextDest === 'boss_02_grand_alchemist'
          ? '最终王座 · 帕拉塞尔苏斯'
          : `${BIOME_CATALOG[nextDest as keyof typeof BIOME_CATALOG]?.romanTier ?? 'II'}.${BIOME_CATALOG[nextDest as keyof typeof BIOME_CATALOG]?.nameZh ?? '下一层'}`;
    if (st.kind === 'ELITE_ALTAR') return this.eliteEncounter.describeAltarPrompt();
    if (st.kind === 'EXIT_LIFT') return `[E/ACT] 前往 ${destLabel}`;
    if (st.kind === 'TENDRIL_GRATE') {
      if (st.activated) return '[↑/SPACE] 攀爬钙化藤梯';
      return this.unlocked.has('rune_vitriol_tendril') ? '[E/ACT] 催生矾蚀藤蔓云梯' : '需解锁【矾蚀藤蔓符文】';
    }
    return this.unlocked.has('rune_mercury_conduit') ? '[E/ACT] 潜入水银毛细导管' : '需解锁【水银导管符文】';
  }

  private activateStation(
    st: InteractiveStation,
    relocate: (nx: number, ny: number) => void,
    roomEnemies: readonly BaseEnemy[]
  ): void {
    const altarRune = BIOME_DAG_CONFIGS[this.dag.biomeId].altarDropRune ?? 'rune_vitriol_tendril';
    if (st.kind === 'ELITE_ALTAR' && !st.activated) {
      const res = this.eliteEncounter.tryClaimAltar(
        roomEnemies,
        (r) => {
          st.activated = true;
          st.badgeSprite?.setVisible(false);
          this.registrar.spawnLightFlash(st.x, st.y - 20, EXPLORATION_RUNES[altarRune].accentNum, 220, 2.6, 360);
          this.unlockRune(r);
        },
        (ichor, wx, wy) => {
          st.activated = true;
          st.badgeSprite?.setVisible(false);
          this.registrar.spawnLightFlash(wx, wy - 20, 0xfbbf24, 220, 2.6, 340);
          this.onGrantRepeatReliquary?.(ichor, wx, wy);
        }
      );
      if (res === 'REJECTED_LOCKED') {
        this.onShowBanner({
          title: '高压蒸汽封门 · 守坛结界',
          body: '必须先击败房间内的精英守卫，方可解除蒸汽封门并刻印祭坛！',
          accentHex: '#E11D48',
        });
      }
    } else if (st.kind === 'EXIT_LIFT') {
      NarrativeStore.archiveCarriedBlueprints();
      this.registrar.spawnLightFlash(st.x, st.y - 24, 0x38bdf8, 240, 2.7, 320);
      this.onRequestNextFloor();
    } else if (st.kind === 'TENDRIL_GRATE' && !st.activated && this.unlocked.has('rune_vitriol_tendril')) {
      st.activated = true;
      const topY = st.vineTopY ?? st.y - 192;
      sproutVitriolTendrilColumn(this.scene, this.registrar, this.baked, this.extraSprites, st.x, st.y, topY);
      this.vineColumns.push({ x: st.x, topY, bottomY: st.y });
      this.registrar.spawnLightFlash(st.x, st.y - 40, 0x3ce682, 210, 2.5, 340);
    } else if (
      st.kind === 'CONDUIT_COFFIN' &&
      this.unlocked.has('rune_mercury_conduit') &&
      st.targetX !== undefined &&
      st.targetY !== undefined
    ) {
      st.sprite.setFrame('conduit_coffin_active');
      this.registrar.spawnLightFlash(st.x, st.y - 16, 0x38bdf8, 185, 2.4, 240);
      this.activeConduitTransit = { elapsedMs: 0, durationMs: 280, fromX: st.x, fromY: st.y, toX: st.targetX, toY: st.targetY };
      relocate(st.x, st.y);
    }
  }
}
