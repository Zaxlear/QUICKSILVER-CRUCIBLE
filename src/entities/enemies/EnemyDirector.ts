/**
 * 房间遭遇战刷怪节奏、精英词缀赋予、邻接房间 AI 分级唤醒与仇恨统计总管
 * （src/entities/enemies/EnemyDirector.ts）。
 */

import type Phaser from 'phaser';
import type { SolidWallRect } from '../../combat/CombatTypes';
import { TILE_SIZE_PX } from '../../core/Constants';
import type { DeterministicRng } from '../../core/DeterministicRng';
import { EventBus } from '../../core/EventBus';
import { ALL_ELITE_AFFIX_IDS, BIOME_CATALOG, type EliteAffixId } from '../../data/biomes.data';
import { RNG_CHANNEL_HASH } from '../../data/runes.data';
import type { GeneratedBiomeDag } from '../../world/DagBiomeGenerator';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';
import { BaseEnemy, type EnemySpawnInit } from './BaseEnemy';
import { EliteAffixController } from './EliteAffixController';
import { instantiateEnemySpecies } from './EnemyFactory';
import type { EnemyStepContext, EnemyViewBounds } from './EnemyTypes';
import { TelegraphRenderer } from './TelegraphRenderer';

export { instantiateEnemySpecies };

export class EnemyDirector {
  public readonly enemies: BaseEnemy[] = [];
  public readonly telegraphRenderer: TelegraphRenderer;
  public readonly eliteController: EliteAffixController;
  private readonly spawnRng: DeterministicRng;
  private readonly roomBuckets = new Map<string, BaseEnemy[]>();
  private readonly roomNeighborhoods = new Map<string, Set<string>>();
  private readonly awakeElitesScratch: BaseEnemy[] = [];
  private lastAggroCount = -1;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    dag: GeneratedBiomeDag,
    rootRng: DeterministicRng,
    crucibleHeat = 0
  ) {
    this.spawnRng = rootRng.fork(RNG_CHANNEL_HASH.ENEMY_SPAWN);
    this.telegraphRenderer = new TelegraphRenderer(scene, registrar);
    this.eliteController = new EliteAffixController(scene, registrar);
    this.indexRoomNeighborhoods(dag);
    this.populateBiomeRoster(dag, crucibleHeat);
  }

  public get aggroCount(): number {
    let count = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      if (e.isAlive && e.aggroed) count += 1;
    }
    return count;
  }

  public spawnEnemy(init: EnemySpawnInit): BaseEnemy {
    const inst = instantiateEnemySpecies(this.scene, this.registrar, this.telegraphRenderer, init);
    if (init.speciesId === 'mob_09_ossuary_prelate') this.enemies.unshift(inst);
    else this.enemies.push(inst);

    let bucket = this.roomBuckets.get(init.roomId);
    if (!bucket) {
      bucket = [];
      this.roomBuckets.set(init.roomId, bucket);
    }
    bucket.push(inst);
    return inst;
  }

  public notifyEnemyKilled(victim: BaseEnemy): void {
    const allies = this.roomBuckets.get(victim.roomId);
    if (!allies) return;
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i]!;
      if (a.id !== victim.id && a.isAlive) a.onAllyKilledInRoom();
    }
  }

  public stepFixed(
    dtSec: number,
    playerX: number,
    playerY: number,
    playerFacing: -1 | 1,
    playerStealthed: boolean,
    solidRects: readonly SolidWallRect[],
    getEmbeddedArrows: (enemyId: string) => number,
    callbacks: Pick<EnemyStepContext, 'onStrikePlayer' | 'onSpawnProjectile' | 'onSpawnAcidOrFireHazard'>,
    viewBounds?: EnemyViewBounds,
    activeRoomId?: string
  ): void {
    const dtMs = dtSec * 1000;
    const awakeRooms = activeRoomId ? this.roomNeighborhoods.get(activeRoomId) : undefined;
    this.telegraphRenderer.beginFrame(dtMs);

    this.awakeElitesScratch.length = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      e.isShieldedByPrelate = false;
      if (e.isElite && !e.isClone && e.isAlive) {
        const nearOrAggro =
          !awakeRooms || awakeRooms.has(e.roomId) || e.aggroed || Math.abs(e.x - playerX) <= 640;
        if (nearOrAggro) this.awakeElitesScratch.push(e);
      }
    }

    const pendingClones: BaseEnemy[] = [];
    this.eliteController.stepFixed(
      dtSec, dtMs, this.awakeElitesScratch, playerX, playerY, playerFacing, solidRects,
      (dmg, dirX, src) => callbacks.onStrikePlayer(dmg, dirX, false, src),
      (host) => pendingClones.push(host)
    );
    for (const host of pendingClones) {
      const clone = this.spawnEnemy({
        id: `${host.id}_clone`, speciesId: host.speciesId, roomId: host.roomId,
        x: host.x + (host.facing > 0 ? -26 : 26), y: host.y,
        patrolMinX: host.patrolMinX, patrolMaxX: host.patrolMaxX,
        hpScale: 1.0, damageScale: host.damageScale * 0.75, isClone: true,
      });
      clone.hp = Math.max(10, Math.round(host.maxHp * 0.45));
      clone.aggroed = true;
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const en = this.enemies[i]!;
      if (
        awakeRooms &&
        !awakeRooms.has(en.roomId) &&
        !en.aggroed &&
        !en.isDissolving &&
        Math.abs(en.x - playerX) > 640
      ) {
        en.setDormantHidden();
        continue;
      }

      const roomAllies = this.roomBuckets.get(en.roomId) ?? [];
      const selfDestructed = en.stepFixed(
        {
          dtSec, dtMs, playerX, playerY, playerFacing, playerStealthed, solidRects, roomAllies,
          viewBounds,
          onStrikePlayer: callbacks.onStrikePlayer,
          onSpawnProjectile: callbacks.onSpawnProjectile,
          onSpawnAcidOrFireHazard: callbacks.onSpawnAcidOrFireHazard,
          onDrawBeam: (k, x0, y0, x1, y1, hot) => this.telegraphRenderer.drawBeam(k, x0, y0, x1, y1, hot),
          onDrawGroundEffect: (k, gx, gy) => this.telegraphRenderer.drawGroundEffect(k, gx, gy),
        },
        getEmbeddedArrows(en.id)
      );
      if (selfDestructed) this.notifyEnemyKilled(en);
    }
    this.telegraphRenderer.endFrame();

    const aggroNow = this.aggroCount;
    if (aggroNow !== this.lastAggroCount) {
      this.lastAggroCount = aggroNow;
      EventBus.emit('audio:combat_intensity_changed', { aggroCount: aggroNow, targetCombatWeight: aggroNow > 0 ? 1.0 : 0.0 });
    }
  }

  public destroy(): void {
    for (const en of this.enemies) en.destroy();
    this.enemies.length = 0;
    this.roomBuckets.clear();
    this.eliteController.destroy();
    this.telegraphRenderer.destroy();
  }

  private indexRoomNeighborhoods(dag: GeneratedBiomeDag): void {
    for (const n of dag.nodes) this.roomNeighborhoods.set(n.nodeId, new Set([n.nodeId]));
    for (const b of dag.bridges) {
      this.roomNeighborhoods.get(b.fromNodeId)?.add(b.toNodeId);
      this.roomNeighborhoods.get(b.toNodeId)?.add(b.fromNodeId);
    }
  }

  private populateBiomeRoster(dag: GeneratedBiomeDag, crucibleHeat: number): void {
    const bSpec = BIOME_CATALOG[dag.biomeId];
    for (let n = 0; n < dag.nodes.length; n++) {
      const node = dag.nodes[n]!;
      node.chunk.enemySpawns.forEach((sp, idx) => {
        if (sp.minCrucibleHeat > crucibleHeat) return;
        const tag = sp.allowedArchetypes[this.spawnRng.nextInt(0, sp.allowedArchetypes.length - 1)] ?? 'MELEE_FODDER';
        const candidates = bSpec.archetypePools[tag];
        const speciesId = candidates[this.spawnRng.nextInt(0, candidates.length - 1)]!;
        const isElite = tag === 'ELITE_GUARD' || node.chunk.role === 'ELITE';

        this.spawnEnemy({
          id: `mob_${node.nodeId}_${idx}`, speciesId, roomId: node.nodeId,
          x: (node.worldTileX + sp.tileX) * TILE_SIZE_PX, y: (node.worldTileY + sp.tileY + 1) * TILE_SIZE_PX,
          patrolMinX: (node.worldTileX + sp.patrolSpanTiles[0]) * TILE_SIZE_PX,
          patrolMaxX: (node.worldTileX + sp.patrolSpanTiles[1]) * TILE_SIZE_PX,
          hpScale: bSpec.hpScale, damageScale: bSpec.damageScale,
          isElite, eliteAffixes: isElite ? this.rollEliteAffixes() : [],
        });
      });
    }
  }

  private rollEliteAffixes(): readonly EliteAffixId[] {
    const count = this.spawnRng.nextInt(1, 2);
    const first = ALL_ELITE_AFFIX_IDS[this.spawnRng.nextInt(0, ALL_ELITE_AFFIX_IDS.length - 1)]!;
    if (count === 1) return [first];
    const rest = ALL_ELITE_AFFIX_IDS.filter((id) => id !== first);
    return [first, rest[this.spawnRng.nextInt(0, rest.length - 1)]!];
  }
}
