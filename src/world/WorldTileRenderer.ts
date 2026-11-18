/**
 * 拼接关卡 47-Tile 法线瓦片、特殊地形、走廊封印拱门渲染器（src/world/WorldTileRenderer.ts）。
 *
 * 采用双层原生 Phaser.Tilemaps.TilemapLayer（TILE_BACK + TILE_MAIN）绑定 Light2D 法线管线，
 * 将全图 5,000~7,100 块瓦片压缩为 2 个 DisplayList 图层节点，依靠网格 O(视口) 硬件批次裁剪彻底消除遍历开销。
 */

import Phaser from 'phaser';
import { DepthLayer, TILE_SIZE_PX } from '../core/Constants';
import { invalidateSpatialRectIndex } from '../core/SpatialRectIndex';
import { computeGridAutotileIndex, SPECIAL_TILE_INDEX } from './AutotileBitmask47';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import {
  packWorldTileKey,
  unpackWorldTileKey,
  type BakedBreakableFloor,
  type BakedStitchedWorld,
} from './DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export class WorldTileRenderer {
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private backLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private mainLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private readonly archSprites: Phaser.GameObjects.Sprite[] = [];
  private originTileX = 0;
  private originTileY = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    private readonly dag: GeneratedBiomeDag,
    private readonly baked: BakedStitchedWorld,
    private readonly tilesetKey = 'biome01_slag_tileset'
  ) {
    this.buildTileLayersAndProps();
  }

  public shatterBreakableFloor(floorId: string): BakedBreakableFloor | null {
    const target = this.baked.breakableFloors.find((f) => f.id === floorId && !f.shattered);
    if (!target) return null;
    target.shattered = true;
    const idx = this.baked.solidRects.indexOf(target.rectPx);
    if (idx >= 0) {
      this.baked.solidRects.splice(idx, 1);
      invalidateSpatialRectIndex(this.baked.solidRects);
    }

    if (this.mainLayer) {
      const lty = target.worldTileY - this.originTileY;
      for (let i = 0; i < target.widthTiles; i++) {
        this.mainLayer.removeTileAt(target.worldTileX - this.originTileX + i, lty, true, false);
      }
    }
    return target;
  }

  public cullToViewport(camLeft: number, camTop: number, camRight: number, camBottom: number): void {
    const pad = 128;
    for (let i = 0; i < this.archSprites.length; i++) {
      const sp = this.archSprites[i]!;
      const inView =
        sp.x >= camLeft - pad &&
        sp.x <= camRight + pad &&
        sp.y >= camTop - pad &&
        sp.y <= camBottom + pad;
      if (sp.visible !== inView) sp.setVisible(inView);
    }
  }

  public destroy(): void {
    for (const sp of this.archSprites) {
      if (sp.scene) {
        this.registrar.unregister(sp);
        sp.destroy();
      }
    }
    this.archSprites.length = 0;
    if (this.backLayer) {
      this.registrar.unregister(this.backLayer);
      this.backLayer = null;
    }
    if (this.mainLayer) {
      this.registrar.unregister(this.mainLayer);
      this.mainLayer = null;
    }
    if (this.tilemap) {
      this.tilemap.destroy();
      this.tilemap = null;
    }
  }

  private buildTileLayersAndProps(): void {
    this.originTileX = Math.floor(this.baked.worldBoundsPx.minX / TILE_SIZE_PX) - 2;
    this.originTileY = Math.floor(this.baked.worldBoundsPx.minY / TILE_SIZE_PX) - 2;
    const mapWidthTiles = Math.max(
      8,
      Math.ceil(this.baked.worldBoundsPx.maxX / TILE_SIZE_PX) - this.originTileX + 4
    );
    const mapHeightTiles = Math.max(
      8,
      Math.ceil(this.baked.worldBoundsPx.maxY / TILE_SIZE_PX) - this.originTileY + 4
    );

    const map = this.scene.make.tilemap({
      tileWidth: TILE_SIZE_PX,
      tileHeight: TILE_SIZE_PX,
      width: mapWidthTiles,
      height: mapHeightTiles,
    });
    this.tilemap = map;
    const tileset = map.addTilesetImage(
      this.tilesetKey,
      this.tilesetKey,
      TILE_SIZE_PX,
      TILE_SIZE_PX,
      0,
      0,
      0
    );

    if (tileset) {
      const worldX = this.originTileX * TILE_SIZE_PX;
      const worldY = this.originTileY * TILE_SIZE_PX;
      this.backLayer = map.createBlankLayer('qc_tile_back', tileset, worldX, worldY);
      this.mainLayer = map.createBlankLayer('qc_tile_main', tileset, worldX, worldY);

      if (this.backLayer) {
        this.backLayer.setDepth(DepthLayer.TILE_BACK).setPipeline('Light2D');
        this.registrar.registerWorldLit(this.backLayer);
      }
      if (this.mainLayer) {
        this.mainLayer.setDepth(DepthLayer.TILE_MAIN).setPipeline('Light2D');
        this.registrar.registerWorldLit(this.mainLayer);
      }
    }

    const climbLeft = new Set<number>();
    const climbRight = new Set<number>();
    for (const cw of this.baked.climbableWalls) {
      const topTy = Math.floor(cw.topY / TILE_SIZE_PX);
      const botTy = Math.floor(cw.bottomY / TILE_SIZE_PX);
      const wallTx =
        cw.normalX === 1 ? Math.floor(cw.x / TILE_SIZE_PX) - 1 : Math.floor(cw.x / TILE_SIZE_PX);
      for (let ty = topTy; ty < botTy; ty++) {
        (cw.normalX === 1 ? climbRight : climbLeft).add(packWorldTileKey(wallTx, ty));
      }
    }

    const isSolid = (tx: number, ty: number): boolean =>
      this.baked.solidTileKeys.has(packWorldTileKey(tx, ty));
    const isBack = (tx: number, ty: number): boolean => {
      const k = packWorldTileKey(tx, ty);
      return this.baked.solidTileKeys.has(k) || this.baked.backWallTileKeys.has(k);
    };

    if (this.backLayer) {
      for (const key of this.baked.backWallTileKeys) {
        if (this.baked.solidTileKeys.has(key)) continue;
        const { tx, ty } = unpackWorldTileKey(key);
        const tile = this.backLayer.putTileAt(
          computeGridAutotileIndex(isBack, tx, ty),
          tx - this.originTileX,
          ty - this.originTileY,
          false
        );
        if (tile) tile.tint = 0x9aa5b8;
      }
    }

    if (this.mainLayer) {
      for (const key of this.baked.solidTileKeys) {
        const { tx, ty } = unpackWorldTileKey(key);
        let f = computeGridAutotileIndex(isSolid, tx, ty);
        if (climbRight.has(key)) f = SPECIAL_TILE_INDEX.CLIMB_WALL_RIGHT;
        else if (climbLeft.has(key)) f = SPECIAL_TILE_INDEX.CLIMB_WALL_LEFT;
        else if (!isSolid(tx, ty - 1) && ((tx * 7 + ty) & 7) === 0) f = SPECIAL_TILE_INDEX.FURNACE_MOLTEN_GRATE;
        else if (f === 46 && ((tx + ty) & 3) === 0) f = SPECIAL_TILE_INDEX.SOLID_ALT_MASONRY;
        this.mainLayer.putTileAt(f, tx - this.originTileX, ty - this.originTileY, false);
      }

      for (const ow of this.baked.oneWayPlatforms) {
        const tx0 = Math.round(ow.x / TILE_SIZE_PX);
        const ty = Math.round(ow.y / TILE_SIZE_PX);
        const tw = Math.max(1, Math.round(ow.w / TILE_SIZE_PX));
        for (let i = 0; i < tw; i++) {
          const f =
            i === 0
              ? SPECIAL_TILE_INDEX.ONEWAY_GRATE_LEFT
              : i === tw - 1
                ? SPECIAL_TILE_INDEX.ONEWAY_GRATE_RIGHT
                : SPECIAL_TILE_INDEX.ONEWAY_GRATE_MID;
          this.mainLayer.putTileAt(f, tx0 + i - this.originTileX, ty - this.originTileY, false);
        }
      }

      for (const bf of this.baked.breakableFloors) {
        if (bf.shattered) continue;
        const lty = bf.worldTileY - this.originTileY;
        for (let i = 0; i < bf.widthTiles; i++) {
          const f = i % 2 === 0 ? SPECIAL_TILE_INDEX.BREAKABLE_SLAG_LEFT : SPECIAL_TILE_INDEX.BREAKABLE_SLAG_RIGHT;
          this.mainLayer.putTileAt(f, bf.worldTileX - this.originTileX + i, lty, false);
        }
      }
    }

    for (const node of this.dag.nodes) {
      node.chunk.lightAnchors.forEach((la, i) => {
        this.registrar.registerAmbientLight({
          id: `${node.nodeId}_l${i}`,
          x: (node.worldTileX + la.tileX) * 16 + 8,
          y: (node.worldTileY + la.tileY) * 16 + 8,
          preset: la.preset,
          radiusPx: la.radiusPx,
          flickerAmplitude: la.flickerAmplitude,
        });
      });
    }

    for (const b of this.dag.bridges) {
      if (b.direction === 'EAST' || b.direction === 'WEST') {
        for (const ax of [b.worldTileX * 16 + 8, (b.worldTileX + b.lengthTiles) * 16 - 8]) {
          const arch = this.scene.add
            .sprite(ax, b.bridgeFloorY, 'world_props_atlas', 'corridor_seal_arch')
            .setOrigin(0.5, 1.0)
            .setDepth(DepthLayer.PROPS_BACK)
            .setPipeline('Light2D');
          this.registrar.registerWorldLit(arch);
          this.archSprites.push(arch);
        }
      }
      this.registrar.registerAmbientLight({
        id: `${b.bridgeId}_lantern`,
        x: b.checkpointWorldX,
        y: b.checkpointWorldY - 28,
        preset: b.requiredRune ? 'VITRIOL_VAT_GREEN' : 'TORCH_AMBER',
        radiusPx: 165,
        flickerAmplitude: 0.09,
      });
    }
  }
}
