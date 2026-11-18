/**
 * 环境叙事剧情房抽样、真结局三封印圣坛与走廊偶遇修女维斯帕生成器
 * （src/world/LoreRoomSpawner.ts）。
 */

import type Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX, TILE_SIZE_PX } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import { NarrativeSessionStore, NarrativeStore } from '../core/NarrativeSessionStore';
import {
  LORE_ROOMS_CATALOG,
  type DialogueBannerSnapshot,
  type NpcGuardContext,
  type TrueEndingSealFlag,
} from '../data/dialogue.data';
import { EXPLORATION_RUNES, type BiomeId, type RuneId } from '../data/runes.data';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import { DialogueBannerController } from './DialogueBannerController';
import type { PlacedRoomNode } from './DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

const LORE_RNG_CHANNEL = 0x4c4f5245;

const BIOME_REGULAR_LORE_POOLS: Readonly<Record<BiomeId, readonly string[]>> = {
  biome_01_slag_retort: ['lore_01_quarantine_notice', 'lore_02_discarded_vessels'],
  biome_02_vitriol_sewers: ['lore_03_sluice_petition', 'lore_05_sulfur_chapel'],
  biome_03_clockwork_ossuary: ['lore_06_clockwork_vow', 'lore_08_lucas_workbench'],
  biome_04_crucible_apex: ['lore_09_noble_banquet'],
};

const BIOME_SEAL_LORE_MAP: Partial<Readonly<Record<BiomeId, string>>> = {
  biome_02_vitriol_sewers: 'lore_04_seal_conduit_lab',
  biome_03_clockwork_ossuary: 'lore_07_seal_ram_crypt',
  biome_04_crucible_apex: 'lore_10_seal_claws_astrolabe',
};

export interface LoreAnchorPoint {
  readonly id: string;
  readonly kind: 'LORE_SHRINE' | 'NPC_VESPER';
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  readonly loreId?: string;
  readonly sprite: Phaser.GameObjects.Sprite | null;
}

export class LoreRoomSpawner {
  public readonly anchors: LoreAnchorPoint[] = [];
  public readonly bannerCtrl = new DialogueBannerController();
  public isInSafeLoreRoom = false;

  private readonly safeRoomRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  private readonly promptLabel: Phaser.GameObjects.Text | null;
  private animClockMs = 0;
  private pendingInvestigation: { anchor: LoreAnchorPoint; remainingMs: number } | null = null;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    dag: GeneratedBiomeDag,
    rootRng: DeterministicRng,
    private readonly store: NarrativeSessionStore = NarrativeStore
  ) {
    const loreRng = rootRng.fork(LORE_RNG_CHANNEL);
    this.populateBiomeLoreAndVesper(dag, loreRng);

    this.promptLabel =
      scene && registrar
        ? registrar.registerCrispOverlay(
            scene.add
              .text(0, 0, '', {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '10px',
                color: '#38BDF8',
                stroke: PALETTE_VOID_HEX,
                strokeThickness: 3,
              })
              .setOrigin(0.5, 1.0)
              .setDepth(DepthLayer.CRISP_TELEGRAPH + 1)
              .setVisible(false)
          )
        : null;
  }

  public get currentBanner(): DialogueBannerSnapshot | null {
    return this.bannerCtrl.current;
  }

  public stepFixed(params: {
    readonly dtSec: number;
    readonly playerX: number;
    readonly playerY: number;
    readonly interactJustPressed: boolean;
    readonly isRollingOrMoving: boolean;
    readonly isRolling: boolean;
    readonly unlockedRunes: readonly RuneId[];
    readonly guardCtx: NpcGuardContext;
    readonly onGrantIchor: (amount: number, worldX: number, worldY: number) => void;
  }): void {
    const dtMs = params.dtSec * 1000;
    this.animClockMs += dtMs;
    const { playerX: px, playerY: py } = params;

    this.isInSafeLoreRoom = this.safeRoomRects.some(
      (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
    );

    const bit = (Math.floor(this.animClockMs / 360) & 1) as 0 | 1;
    for (const a of this.anchors) {
      if (a.kind === 'NPC_VESPER' && a.sprite) a.sprite.setFrame(`npc_vesper_idle_${bit}`);
    }

    if (this.pendingInvestigation) {
      this.pendingInvestigation.remainingMs -= dtMs;
      if (this.pendingInvestigation.remainingMs <= 0) {
        const target = this.pendingInvestigation.anchor;
        this.pendingInvestigation = null;
        if (target.loreId) {
          const res = this.store.discoverLoreEntry(target.loreId);
          if (res.ichorGranted > 0) params.onGrantIchor(res.ichorGranted, target.x, target.y - 28);
          if (res.newlyUnlockedSeal) {
            EventBus.emit('narrative:seal_collected', {
              flagId: res.newlyUnlockedSeal as TrueEndingSealFlag,
              totalSeals: this.store.collectedSeals.length,
            });
          }
          this.bannerCtrl.showLoreDiscovery(res.entry, res.ichorGranted, target.x);
        }
      }
    }

    this.bannerCtrl.stepFixed(dtMs, px, params.isRolling, params.isRollingOrMoving);

    let nearest: LoreAnchorPoint | null = null;
    let bestDist = 44;
    for (const a of this.anchors) {
      const d = Math.hypot(px - a.x, py - a.y);
      if (d < bestDist) { bestDist = d; nearest = a; }
    }

    if (!nearest) {
      this.promptLabel?.setVisible(false);
      return;
    }

    this.promptLabel?.setText(this.describePrompt(nearest, params.unlockedRunes)).setPosition(nearest.x, nearest.y - 54).setVisible(true);
    if (params.interactJustPressed) this.triggerInteraction(nearest, params.unlockedRunes, params.guardCtx);
  }

  public destroy(): void {
    this.bannerCtrl.destroy();
    if (this.registrar) {
      for (const a of this.anchors) {
        if (a.sprite) { this.registrar.unregister(a.sprite); a.sprite.destroy(); }
      }
      if (this.promptLabel) { this.registrar.unregister(this.promptLabel); this.promptLabel.destroy(); }
    }
    this.anchors.length = 0;
  }

  private populateBiomeLoreAndVesper(dag: GeneratedBiomeDag, rng: DeterministicRng): void {
    const startNode = dag.nodes[0];
    if (startNode) {
      const vx = (startNode.worldTileX + 6) * TILE_SIZE_PX + 8;
      const vy = (startNode.worldTileY + 26) * TILE_SIZE_PX;
      const vSprite = this.spawnSprite(vx, vy, 'sanctum_hub_atlas', 'npc_vesper_idle_0');
      this.registrar?.registerAmbientLight({ id: `vesper_light_${dag.biomeId}`, x: vx + 10, y: vy - 24, preset: 'TORCH_AMBER', radiusPx: 150, flickerAmplitude: 0.08 });
      this.anchors.push({ id: `vesper_${dag.biomeId}`, kind: 'NPC_VESPER', roomId: startNode.nodeId, x: vx, y: vy, sprite: vSprite });
    }

    const regularPool = BIOME_REGULAR_LORE_POOLS[dag.biomeId];
    const sealLoreId = BIOME_SEAL_LORE_MAP[dag.biomeId];

    for (const node of dag.nodes) {
      if (node.chunk.role === 'LORE' || node.chunk.role === 'RUNE_SECRET') this.registerSafeRect(node);
      if (!node.chunk.loreAnchor) continue;
      const ax = (node.worldTileX + node.chunk.loreAnchor.tileX) * TILE_SIZE_PX + 8;
      const ay = (node.worldTileY + node.chunk.loreAnchor.tileY + 1) * TILE_SIZE_PX;
      const isSecret = node.chunk.role === 'RUNE_SECRET' && Boolean(sealLoreId);
      const unread = regularPool.filter((id) => !this.store.discoveredLoreIds.includes(id));
      const src = unread.length > 0 ? unread : regularPool;
      const chosenLoreId = isSecret ? sealLoreId! : src[rng.nextInt(0, src.length - 1)]!;
      this.anchors.push({
        id: `${node.nodeId}_lore_${chosenLoreId}`,
        kind: 'LORE_SHRINE',
        roomId: node.nodeId,
        x: ax,
        y: ay,
        loreId: chosenLoreId,
        sprite: this.spawnSprite(ax, ay, isSecret ? 'sanctum_hub_atlas' : 'world_props_atlas', isSecret ? 'sanctum_seal_pedestal' : 'lore_notice_board'),
      });
    }
  }

  private registerSafeRect(node: PlacedRoomNode): void {
    this.safeRoomRects.push({
      x: node.worldTileX * TILE_SIZE_PX, y: node.worldTileY * TILE_SIZE_PX,
      w: node.chunk.widthTiles * TILE_SIZE_PX, h: node.chunk.heightTiles * TILE_SIZE_PX,
    });
  }

  private spawnSprite(x: number, y: number, atlas: string, frame: string): Phaser.GameObjects.Sprite | null {
    if (!this.scene || !this.registrar) return null;
    return this.registrar.registerWorldLit(
      this.scene.add.sprite(x, y, atlas, frame).setOrigin(0.5, 1.0).setDepth(DepthLayer.LOOT).setPipeline('Light2D')
    );
  }

  private describePrompt(a: LoreAnchorPoint, runes: readonly RuneId[]): string {
    if (a.kind === 'NPC_VESPER') return '[E/ACT] 与提灯告解修女·维斯帕交谈';
    const spec = LORE_ROOMS_CATALOG[a.loreId ?? ''];
    if (spec?.requiredRune && !runes.includes(spec.requiredRune)) {
      return `需持有【${EXPLORATION_RUNES[spec.requiredRune].nameZh}】解封真名手稿`;
    }
    return `[E/ACT] 调查 ${spec?.titleZh ?? '炼金遗物'} (200ms)`;
  }

  private triggerInteraction(a: LoreAnchorPoint, runes: readonly RuneId[], guardCtx: NpcGuardContext): void {
    if (a.kind === 'NPC_VESPER') {
      this.bannerCtrl.showNpcLine(this.store.selectNextNpcDialogue('vesper', guardCtx), a.x);
      return;
    }
    const spec = LORE_ROOMS_CATALOG[a.loreId ?? ''];
    if (!spec || (spec.requiredRune && !runes.includes(spec.requiredRune))) return;
    this.registrar?.spawnLightFlash(a.x, a.y - 24, 0x38bdf8, 185, 2.3, 200);
    this.pendingInvestigation = { anchor: a, remainingMs: 200 };
  }
}
