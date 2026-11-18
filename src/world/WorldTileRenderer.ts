/**
 * 拼接关卡 47-Tile 法线瓦片、特殊地形、走廊封印拱门与空间视口裁剪渲染器
 * （src/world/WorldTileRenderer.ts）。
 */

import Phaser from 'phaser';
import { DepthLayer, TILE_SIZE_PX } from '../core/Constants';
import { computeGridAutotileIndex, SPECIAL_TILE_INDEX } from './AutotileBitmask47';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import {
  packWorldTileKey,
  unpackWorldTileKey,
  type BakedBreakableFloor,
  type BakedStitchedWorld,
} from './DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

interface SpatialSpriteBucket {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly sprites: Phaser.GameObjects.Sprite[];
  visible: boolean;
}

const BUCKET_PX = 28 * TILE_SIZE_PX;

export class WorldTileRenderer {
  private readonly buckets = new Map<string, SpatialSpriteBucket>();
  private readonly breakableSprites = new Map<string, Phaser.GameObjects.Sprite[]>();
  private readonly allSprites: Phaser.GameObjects.Sprite[] = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    private readonly dag: GeneratedBiomeDag,
    private readonly baked: BakedStitchedWorld,
    private readonly tilesetKey = 'biome01_slag_tileset'
  ) {
    this.buildTilesAndProps();
  }

  public shatterBreakableFloor(floorId: string): BakedBreakableFloor | null {
    const target = this.baked.breakableFloors.find((f) => f.id === floorId && !f.shattered);
    if (!target) return null;
    target.shattered = true;
    const idx = this.baked.solidRects.indexOf(target.rectPx);
    if (idx >= 0) this.baked.solidRects.splice(idx, 1);

    const sprites = this.breakableSprites.get(floorId);
    if (sprites) {
      for (const s of sprites) {
        this.registrar.unregister(s);
        s.setVisible(false).destroy();
      }
      this.breakableSprites.delete(floorId);
    }
    return target;
  }

  public cullToViewport(camLeft: number, camTop: number, camRight: number, camBottom: number): void {
    const pad = 192;
    for (const b of this.buckets.values()) {
      const inView = !(
        b.maxX < camLeft - pad ||
        b.minX > camRight + pad ||
        b.maxY < camTop - pad ||
        b.minY > camBottom + pad
      );
      if (b.visible !== inView) {
        b.visible = inView;
        for (let i = 0; i < b.sprites.length; i++) {
          const sp = b.sprites[i]!;
          if (sp.active) sp.setVisible(inView);
        }
      }
    }
  }

  public destroy(): void {
    for (const sp of this.allSprites) {
      if (sp.scene) {
        this.registrar.unregister(sp);
        sp.destroy();
      }
    }
    this.allSprites.length = 0;
    this.buckets.clear();
    this.breakableSprites.clear();
  }

  private addBucketed(sp: Phaser.GameObjects.Sprite): Phaser.GameObjects.Sprite {
    sp.setPipeline('Light2D');
    this.registrar.registerWorldLit(sp);
    this.allSprites.push(sp);
    const bx = Math.floor(sp.x / BUCKET_PX);
    const by = Math.floor(sp.y / BUCKET_PX);
    const key = `${bx}:${by}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        minX: bx * BUCKET_PX,
        minY: by * BUCKET_PX,
        maxX: (bx + 1) * BUCKET_PX,
        maxY: (by + 1) * BUCKET_PX,
        sprites: [],
        visible: true,
      };
      this.buckets.set(key, bucket);
    }
    bucket.sprites.push(sp);
    return sp;
  }

  private buildTilesAndProps(): void {
    const climbLeft = new Set<number>();
    const climbRight = new Set<number>();
    for (const cw of this.baked.climbableWalls) {
      const topTy = Math.floor(cw.topY / TILE_SIZE_PX);
      const botTy = Math.floor(cw.bottomY / TILE_SIZE_PX);
      const wallTx = cw.normalX === 1 ? Math.floor(cw.x / TILE_SIZE_PX) - 1 : Math.floor(cw.x / TILE_SIZE_PX);
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

    for (const key of this.baked.backWallTileKeys) {
      if (this.baked.solidTileKeys.has(key)) continue;
      const { tx, ty } = unpackWorldTileKey(key);
      this.addBucketed(
        this.scene.add
          .sprite(tx * 16 + 8, ty * 16 + 8, this.tilesetKey, computeGridAutotileIndex(isBack, tx, ty))
          .setDepth(DepthLayer.TILE_BACK)
          .setTint(0x9aa5b8)
      );
    }

    for (const key of this.baked.solidTileKeys) {
      const { tx, ty } = unpackWorldTileKey(key);
      let f = computeGridAutotileIndex(isSolid, tx, ty);
      if (climbRight.has(key)) f = SPECIAL_TILE_INDEX.CLIMB_WALL_RIGHT;
      else if (climbLeft.has(key)) f = SPECIAL_TILE_INDEX.CLIMB_WALL_LEFT;
      else if (!isSolid(tx, ty - 1) && ((tx * 7 + ty) & 7) === 0) f = SPECIAL_TILE_INDEX.FURNACE_MOLTEN_GRATE;
      else if (f === 46 && ((tx + ty) & 3) === 0) f = SPECIAL_TILE_INDEX.SOLID_ALT_MASONRY;
      this.addBucketed(
        this.scene.add.sprite(tx * 16 + 8, ty * 16 + 8, this.tilesetKey, f).setDepth(DepthLayer.TILE_MAIN)
      );
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
        this.addBucketed(
          this.scene.add.sprite((tx0 + i) * 16 + 8, ty * 16 + 8, this.tilesetKey, f).setDepth(DepthLayer.TILE_MAIN)
        );
      }
    }

    for (const bf of this.baked.breakableFloors) {
      const list: Phaser.GameObjects.Sprite[] = [];
      for (let i = 0; i < bf.widthTiles; i++) {
        const f = i % 2 === 0 ? SPECIAL_TILE_INDEX.BREAKABLE_SLAG_LEFT : SPECIAL_TILE_INDEX.BREAKABLE_SLAG_RIGHT;
        list.push(
          this.addBucketed(
            this.scene.add
              .sprite((bf.worldTileX + i) * 16 + 8, bf.worldTileY * 16 + 8, this.tilesetKey, f)
              .setDepth(DepthLayer.TILE_MAIN)
          )
        );
      }
      this.breakableSprites.set(bf.id, list);
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
          this.addBucketed(
            this.scene.add
              .sprite(ax, b.bridgeFloorY, 'world_props_atlas', 'corridor_seal_arch')
              .setOrigin(0.5, 1.0)
              .setDepth(DepthLayer.PROPS_BACK)
          );
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
