/**
 * 精英祭坛房「踏入蒸汽封门 -> 斩杀守坛精英解封 -> 刻印符文 / 多周目圣物匣」遭遇战状态机
 * （src/world/EliteAltarEncounter.ts，严格 <= 170 行）。
 */

import type Phaser from 'phaser';
import type { SolidWallRect } from '../combat/CombatTypes';
import { DepthLayer, TILE_SIZE_PX } from '../core/Constants';
import { EventBus } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { ECONOMY_CONSTANTS } from '../data/economy.data';
import { BIOME_DAG_CONFIGS, EXPLORATION_RUNES, type RuneId } from '../data/runes.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { BakedStitchedWorld, PlacedRoomNode } from './DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export type EliteAltarState = 'DORMANT' | 'LOCKED_COMBAT' | 'CLEARED_UNLOCKABLE' | 'CONSUMED';

interface SealDoorBarrier {
  readonly rect: SolidWallRect;
  readonly sprite: Phaser.GameObjects.Sprite | null;
}

export class EliteAltarEncounter {
  private state: EliteAltarState = 'DORMANT';
  private readonly eliteNode: PlacedRoomNode | null;
  private readonly altarX: number;
  private readonly altarY: number;
  private readonly dropRune: RuneId | null;
  private readonly barriers: SealDoorBarrier[] = [];
  private animMs = 0;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    private readonly dag: GeneratedBiomeDag,
    private readonly baked: BakedStitchedWorld
  ) {
    this.eliteNode = dag.nodes.find((n) => n.chunk.role === 'ELITE') ?? null;
    this.dropRune = BIOME_DAG_CONFIGS[dag.biomeId].altarDropRune;
    const ped = this.eliteNode?.chunk.rewardPedestalTilePos ?? { tileX: 20, tileY: 25 };
    this.altarX = this.eliteNode ? (this.eliteNode.worldTileX + ped.tileX) * TILE_SIZE_PX + 8 : -9999;
    this.altarY = this.eliteNode ? (this.eliteNode.worldTileY + ped.tileY + 1) * TILE_SIZE_PX : -9999;
  }

  public get encounterState(): EliteAltarState { return this.state; }
  public get isLockedInCombat(): boolean { return this.state === 'LOCKED_COMBAT'; }
  public get isRepeatReliquaryMode(): boolean {
    return this.dropRune === null || NarrativeStore.unlockedRunes.includes(this.dropRune);
  }

  public describeAltarPrompt(): string {
    if (this.state === 'CONSUMED') return '祭坛圣火已归寂';
    if (this.state === 'LOCKED_COMBAT') return '⚠ 蒸汽封门生效！先斩杀房内守坛精英解封祭坛';
    if (this.isRepeatReliquaryMode) {
      return `[E/ACT] 开启淬火圣物匣（炼金卷轴 ×1 + ${ECONOMY_CONSTANTS.ELITE_ALTAR_REPEAT_ICHOR} ✦）`;
    }
    return `[E/ACT] 刻印【${EXPLORATION_RUNES[this.dropRune!].nameZh}】`;
  }

  public stepFixed(dtSec: number, playerX: number, playerY: number, roomEnemies: readonly BaseEnemy[]): void {
    if (!this.eliteNode || this.state === 'CONSUMED') return;
    this.animMs += dtSec * 1000;
    const hasAliveElite = roomEnemies.some((e) => e.roomId === this.eliteNode!.nodeId && e.isElite && e.isAlive);
    const dist = Math.hypot(playerX - this.altarX, playerY - this.altarY);

    if (this.state === 'DORMANT' && dist <= 140) {
      if (hasAliveElite) {
        this.state = 'LOCKED_COMBAT';
        this.raiseSteamDoorBarriers(this.eliteNode);
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_enemy_warn_red', worldX: this.altarX });
      } else {
        this.state = 'CLEARED_UNLOCKABLE';
        this.registrar?.spawnLightFlash(this.altarX, this.altarY - 24, 0x38bdf8, 220, 2.5, 320);
      }
    } else if (this.state === 'LOCKED_COMBAT') {
      const bit = (Math.floor(this.animMs / 95) & 1) as 0 | 1;
      for (const b of this.barriers) b.sprite?.setFrame(`elite_steam_gate_${bit}`);
      if (!hasAliveElite) {
        this.clearSteamDoorBarriers();
        this.state = 'CLEARED_UNLOCKABLE';
        this.registrar?.spawnLightFlash(this.altarX, this.altarY - 26, 0x38bdf8, 250, 2.8, 380);
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_scroll_upgrade', worldX: this.altarX });
      }
    }
  }

  public tryClaimAltar(
    roomEnemies: readonly BaseEnemy[],
    onUnlockRune: (runeId: RuneId) => void,
    onGrantRepeatReliquary: (ichorAmount: number, x: number, y: number) => void
  ): 'REJECTED_LOCKED' | 'UNLOCKED_RUNE' | 'GRANTED_RELIQUARY' | 'ALREADY_CONSUMED' {
    if (this.state === 'CONSUMED') return 'ALREADY_CONSUMED';
    const hasAliveElite = Boolean(
      this.eliteNode && roomEnemies.some((e) => e.roomId === this.eliteNode!.nodeId && e.isElite && e.isAlive)
    );
    if (hasAliveElite) {
      if (this.state === 'DORMANT' && this.eliteNode) {
        this.state = 'LOCKED_COMBAT';
        this.raiseSteamDoorBarriers(this.eliteNode);
      }
      EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_enemy_warn_red', worldX: this.altarX });
      return 'REJECTED_LOCKED';
    }
    this.clearSteamDoorBarriers();
    this.state = 'CONSUMED';
    if (!this.isRepeatReliquaryMode && this.dropRune) {
      onUnlockRune(this.dropRune);
      return 'UNLOCKED_RUNE';
    }
    onGrantRepeatReliquary(ECONOMY_CONSTANTS.ELITE_ALTAR_REPEAT_ICHOR, this.altarX, this.altarY);
    return 'GRANTED_RELIQUARY';
  }

  public destroy(): void { this.clearSteamDoorBarriers(); }

  private raiseSteamDoorBarriers(node: PlacedRoomNode): void {
    if (this.barriers.length > 0) return;
    const connected = new Set<string>();
    for (const br of this.dag.bridges) {
      if (br.fromNodeId === node.nodeId) connected.add(br.fromSocketId);
      if (br.toNodeId === node.nodeId) connected.add(br.toSocketId);
    }
    for (const sock of node.chunk.doorSockets) {
      if (!connected.has(sock.socketId) || (sock.direction !== 'WEST' && sock.direction !== 'EAST')) continue;
      const innerTileX = sock.direction === 'WEST' ? node.worldTileX + 3 : node.worldTileX + node.chunk.widthTiles - 4;
      const rect: SolidWallRect = { x: innerTileX * TILE_SIZE_PX, y: (node.worldTileY + sock.tileY - 3) * TILE_SIZE_PX, w: TILE_SIZE_PX, h: 4 * TILE_SIZE_PX };
      this.baked.solidRects.push(rect);
      const sprite = this.scene && this.registrar
        ? this.registrar.registerWorldLit(this.scene.add.sprite(rect.x + 8, rect.y + rect.h, 'world_props_atlas', 'elite_steam_gate_0').setOrigin(0.5, 1.0).setDepth(DepthLayer.TRAPS + 1).setPipeline('Light2D'))
        : null;
      this.barriers.push({ rect, sprite });
    }
  }

  private clearSteamDoorBarriers(): void {
    for (const b of this.barriers) {
      const idx = this.baked.solidRects.indexOf(b.rect);
      if (idx >= 0) this.baked.solidRects.splice(idx, 1);
      if (b.sprite && this.registrar) { this.registrar.unregister(b.sprite); b.sprite.destroy(); }
    }
    this.barriers.length = 0;
  }
}
