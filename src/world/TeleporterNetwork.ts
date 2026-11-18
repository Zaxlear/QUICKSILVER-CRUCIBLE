/**
 * 房间传送石碑激活与小地图水银流光秒传网络（src/world/TeleporterNetwork.ts）。
 */

import Phaser from 'phaser';
import { DepthLayer, TILE_SIZE_PX } from '../core/Constants';
import {
  EventBus,
  type MinimapSnapshotPayload,
  type WorldBannerNotice,
} from '../core/EventBus';
import { BIOME_01_SLAG_LIGHTING } from '../data/palette.data';
import type { RuneId } from '../data/runes.data';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { PlacedRoomNode } from './DoorSocketStitcher';
import { composeMinimapSnapshot } from './MinimapProjection';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export interface TeleporterSteleNode {
  readonly nodeId: string;
  readonly role: string;
  readonly worldX: number;
  readonly worldY: number;
  activated: boolean;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly tagText: Phaser.GameObjects.Text;
}

export class TeleporterNetwork {
  private readonly steles = new Map<string, TeleporterSteleNode>();
  private readonly visitedNodeIds = new Set<string>();
  private readonly warpStreaks: Phaser.GameObjects.Sprite[] = [];
  private currentRoomId: string;
  private minimapExpanded = false;
  private banner: WorldBannerNotice | null = null;
  private bannerTimerMs = 0;
  private simClockMs = 0;

  private activeWarp: {
    elapsedMs: number;
    durationMs: number;
    targetNodeId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    relocated: boolean;
  } | null = null;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    private readonly dag: GeneratedBiomeDag
  ) {
    this.currentRoomId = dag.nodes[0]?.nodeId ?? 'room_00_entrance';
    this.visitedNodeIds.add(this.currentRoomId);
    this.buildSteleSprites();
    const startStele = this.steles.get(this.currentRoomId);
    if (startStele) this.activateStele(startStele, false);
  }

  public get isWarping(): boolean { return this.activeWarp !== null; }
  public get activeRoomId(): string { return this.currentRoomId; }
  public get activatedSteleIds(): readonly string[] {
    const out: string[] = [];
    for (const st of this.steles.values()) if (st.activated) out.push(st.nodeId);
    return out;
  }

  public setMinimapExpanded(expanded?: boolean): void {
    this.minimapExpanded = expanded !== undefined ? expanded : !this.minimapExpanded;
  }

  public showBanner(notice: WorldBannerNotice, durationMs = 4600): void {
    this.banner = notice;
    this.bannerTimerMs = durationMs;
  }

  public markRoomEntered(node: PlacedRoomNode): boolean {
    const changed = this.currentRoomId !== node.nodeId || !this.visitedNodeIds.has(node.nodeId);
    this.currentRoomId = node.nodeId;
    this.visitedNodeIds.add(node.nodeId);
    return changed;
  }

  public requestTeleportTo(targetNodeId: string, playerX: number, playerY: number): boolean {
    if (this.activeWarp || targetNodeId === this.currentRoomId) return false;
    const target = this.steles.get(targetNodeId);
    if (!target || !target.activated) return false;

    this.minimapExpanded = false;
    this.activeWarp = {
      elapsedMs: 0,
      durationMs: 360,
      targetNodeId,
      fromX: playerX,
      fromY: playerY,
      toX: target.worldX,
      toY: target.worldY,
      relocated: false,
    };
    this.registrar.spawnLightFlash(playerX, playerY - 20, 0x38bdf8, 220, 2.6, 260);
    return true;
  }

  public stepFixed(
    dtSec: number,
    playerX: number,
    playerY: number,
    onWarpRelocate: (targetNodeId: string, destX: number, destY: number, progress: number) => void
  ): boolean {
    const dtMs = dtSec * 1000;
    this.simClockMs += dtMs;
    let dirty = false;

    if (this.bannerTimerMs > 0) {
      this.bannerTimerMs = Math.max(0, this.bannerTimerMs - dtMs);
      if (this.bannerTimerMs === 0 && this.banner) {
        this.banner = null;
        dirty = true;
      }
    }

    const animIdx = Math.floor(this.simClockMs / 130) % 3;
    for (const st of this.steles.values()) {
      if (st.activated) st.sprite.setFrame(`stele_active_${animIdx}`);
      else if (Math.hypot(playerX - st.worldX, playerY - st.worldY) <= 46) {
        this.activateStele(st, true);
        dirty = true;
      }
    }

    if (this.activeWarp) {
      const w = this.activeWarp;
      w.elapsedMs += dtMs;
      const t = Math.min(1, w.elapsedMs / w.durationMs);
      const sf = `mercury_warp_streak_${Math.floor(this.simClockMs / 60) & 1}`;
      this.warpStreaks[0]?.setFrame(sf).setPosition(w.fromX, w.fromY).setVisible(t < 0.65);
      this.warpStreaks[1]?.setFrame(sf).setPosition(w.toX, w.toY).setVisible(t >= 0.35);

      const fx = w.fromX + (w.toX - w.fromX) * t;
      const fy = w.fromY + (w.toY - w.fromY) * t;
      onWarpRelocate(w.targetNodeId, w.relocated ? w.toX : fx, w.relocated ? w.toY : fy, t);

      if (!w.relocated && t >= 0.52) {
        w.relocated = true;
        this.currentRoomId = w.targetNodeId;
        this.visitedNodeIds.add(w.targetNodeId);
        this.registrar.spawnLightFlash(w.toX, w.toY - 20, 0x38bdf8, 240, 2.8, 300);
        onWarpRelocate(w.targetNodeId, w.toX, w.toY, t);
        dirty = true;
      }
      if (t >= 1) {
        this.warpStreaks[0]?.setVisible(false);
        this.warpStreaks[1]?.setVisible(false);
        this.activeWarp = null;
        dirty = true;
      }
    }
    return dirty;
  }

  public buildMinimapSnapshot(
    unlockedRunes: readonly RuneId[],
    interactPrompt: string | null
  ): MinimapSnapshotPayload {
    const steleMap = new Map<string, boolean>();
    for (const [k, st] of this.steles) steleMap.set(k, st.activated);
    return composeMinimapSnapshot({
      dag: this.dag,
      currentRoomId: this.currentRoomId,
      expanded: this.minimapExpanded,
      isWarping: this.activeWarp !== null,
      visitedNodeIds: this.visitedNodeIds,
      steleStates: steleMap,
      unlockedRunes,
      banner: this.banner,
      interactPrompt,
    });
  }

  public destroy(): void {
    for (const st of this.steles.values()) {
      this.registrar.unregister(st.sprite);
      st.sprite.destroy();
      this.registrar.unregister(st.tagText);
      st.tagText.destroy();
    }
    for (const ws of this.warpStreaks) {
      this.registrar.unregister(ws);
      ws.destroy();
    }
    this.steles.clear();
    this.warpStreaks.length = 0;
  }

  private buildSteleSprites(): void {
    for (const node of this.dag.nodes) {
      if (!node.chunk.teleporterTilePos) continue;
      const wx = (node.worldTileX + node.chunk.teleporterTilePos.tileX) * TILE_SIZE_PX + 8;
      const wy = (node.worldTileY + node.chunk.teleporterTilePos.tileY + 1) * TILE_SIZE_PX;
      const sprite = this.registrar.registerWorldLit(
        this.scene.add.sprite(wx, wy, 'world_props_atlas', 'stele_dormant').setOrigin(0.5, 1.0).setDepth(DepthLayer.LOOT).setPipeline('Light2D')
      );
      const tagText = this.registrar.registerCrispOverlay(
        this.scene.add
          .text(wx, wy - 50, 'STELE', {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '9px',
            color: '#7C8599',
            stroke: BIOME_01_SLAG_LIGHTING.backdropHex,
            strokeThickness: 3,
          })
          .setOrigin(0.5, 0.5)
          .setDepth(DepthLayer.CRISP_TELEGRAPH)
      );
      this.steles.set(node.nodeId, { nodeId: node.nodeId, role: node.chunk.role, worldX: wx, worldY: wy, activated: false, sprite, tagText });
    }
    for (let i = 0; i < 2; i++) {
      this.warpStreaks.push(
        this.registrar.registerWorldLit(
          this.scene.add.sprite(0, 0, 'world_props_atlas', 'mercury_warp_streak_0').setOrigin(0.5, 1.0).setDepth(DepthLayer.VFX_PARTICLES).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        )
      );
    }
  }

  private activateStele(st: TeleporterSteleNode, notify: boolean): void {
    st.activated = true;
    st.sprite.setFrame('stele_active_0');
    st.tagText.setText('✦ WARP READY').setColor('#38BDF8');
    this.registrar.registerAmbientLight({
      id: `stele_light_${st.nodeId}`,
      x: st.worldX,
      y: st.worldY - 22,
      preset: 'VOLTAIC_CYAN',
      radiusPx: 165,
      flickerAmplitude: 0.05,
    });
    if (notify) {
      this.registrar.spawnLightFlash(st.worldX, st.worldY - 20, 0x38bdf8, 195, 2.3, 260);
      EventBus.emit('world:teleporter_activated', { nodeId: st.nodeId, role: st.role });
    }
  }
}
