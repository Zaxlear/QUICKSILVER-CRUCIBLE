import Phaser from 'phaser';
import { DepthLayer, LOGICAL_MAX_HEIGHT, LOGICAL_MAX_WIDTH, TILE_SIZE_PX } from '../core/Constants';
import { BIOME_01_SLAG_LIGHTING } from '../data/palette.data';
import type {
  ClimbableWallPx,
  CollisionWorld,
  OneWayPlatformPx,
  SolidRectPx,
} from '../entities/player/PlayerPhysics';
import { CameraRig, type WorldCameraBounds } from '../render/CameraRig';
import { computeGridAutotileIndex, SPECIAL_TILE_INDEX } from '../world/AutotileBitmask47';

export interface HeroAnimSpec {
  readonly key: string;
  readonly prefix: string;
  readonly frames: number;
  readonly fps: number;
  readonly repeat?: number;
}

export const HERO_ANIM_SPECS: readonly HeroAnimSpec[] = [
  { key: 'hero_idle', prefix: 'hero_idle_', frames: 6, fps: 8 },
  { key: 'hero_run', prefix: 'hero_run_', frames: 8, fps: 14 },
  { key: 'hero_jump_fall', prefix: 'hero_jump_fall_', frames: 4, fps: 8 },
  { key: 'hero_djump', prefix: 'hero_djump_', frames: 4, fps: 16, repeat: 0 },
  { key: 'hero_wall_slide', prefix: 'hero_wall_slide_', frames: 3, fps: 10 },
  { key: 'hero_dodge_roll', prefix: 'hero_dodge_roll_', frames: 6, fps: 18, repeat: 0 },
  { key: 'hero_parry', prefix: 'hero_parry_', frames: 5, fps: 16, repeat: 0 },
  { key: 'hero_atk_slash', prefix: 'hero_atk_slash_', frames: 12, fps: 16 },
  { key: 'hero_hurt', prefix: 'hero_hurt_', frames: 3, fps: 12, repeat: 0 },
  { key: 'hero_collapse', prefix: 'hero_collapse_', frames: 8, fps: 10, repeat: 0 },
];

export interface ShowcaseStageRefs {
  readonly parallaxLayers: readonly Phaser.GameObjects.TileSprite[];
  readonly heroSprite: Phaser.GameObjects.Sprite;
  readonly flashDummySprite: Phaser.GameObjects.Sprite;
  readonly dissolveDummySprite: Phaser.GameObjects.Sprite;
  readonly collisionWorld: CollisionWorld;
  readonly cameraBounds: WorldCameraBounds;
  readonly spawnPoint: { readonly x: number; readonly y: number };
}

export function registerHeroAnimations(scene: Phaser.Scene): void {
  for (const spec of HERO_ANIM_SPECS) {
    if (scene.anims.exists(spec.key)) continue;
    const frameNames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < spec.frames; i++) {
      frameNames.push({ key: 'hero_atlas', frame: `${spec.prefix}${i}` });
    }
    scene.anims.create({
      key: spec.key,
      frames: frameNames,
      frameRate: spec.fps,
      repeat: spec.repeat ?? -1,
    });
  }
}

/**
 * 构建 Milestone 3 矿渣蒸馏厂可操控试炼厅（54x30 格 = 864x480 px）：
 * 涵盖宽阔冲刺跑道、双层单向黄铜格栅跳台、两侧磁铁攀爪高墙井道、法线背景祭坛及 5 大着色器检视靶。
 */
export function buildSlagShowcaseStage(scene: Phaser.Scene, cameraRig: CameraRig): ShowcaseStageRefs {
  const layerDepths = [
    DepthLayer.PARALLAX_FAR,
    DepthLayer.PARALLAX_MID_FAR,
    DepthLayer.PARALLAX_MID,
    DepthLayer.PARALLAX_NEAR,
    DepthLayer.PARALLAX_FOREGROUND,
  ] as const;

  const parallaxLayers: Phaser.GameObjects.TileSprite[] = [];
  for (let i = 0; i < 5; i++) {
    const ts = scene.add
      .tileSprite(0, 0, LOGICAL_MAX_WIDTH, LOGICAL_MAX_HEIGHT, `biome01_parallax_L${i}`)
      .setScrollFactor(0)
      .setOrigin(0, 0)
      .setDepth(layerDepths[i]!);
    if (i === 2 || i === 3) ts.setPipeline('Light2D');
    if (i === 4) ts.setAlpha(0.9);
    cameraRig.registerWorldLit(ts);
    parallaxLayers.push(ts);
  }

  const solidRects: SolidRectPx[] = [];
  const oneWayPlatforms: OneWayPlatformPx[] = [];
  const climbableWalls: ClimbableWallPx[] = [];
  const solidSet = new Set<string>();
  const backWallSet = new Set<string>();
  const keyOf = (tx: number, ty: number): string => `${tx},${ty}`;

  const addSolidTileRect = (tx0: number, ty0: number, tw: number, th: number): void => {
    solidRects.push({
      x: tx0 * TILE_SIZE_PX,
      y: ty0 * TILE_SIZE_PX,
      w: tw * TILE_SIZE_PX,
      h: th * TILE_SIZE_PX,
    });
    for (let ty = ty0; ty < ty0 + th; ty++) {
      for (let tx = tx0; tx < tx0 + tw; tx++) {
        solidSet.add(keyOf(tx, ty));
      }
    }
  };

  // 封闭试炼厅边界 [-27..26] x [-19..10] (864x480 px) + 左右磁铁攀爬立柱
  addSolidTileRect(-27, 3, 54, 8); // 主甲板 y = 48
  addSolidTileRect(-27, -19, 54, 3); // 穹顶天花板
  addSolidTileRect(-27, -16, 3, 19); // 左侧封边外墙 (内壁 x = -384)
  addSolidTileRect(24, -16, 3, 19); // 右侧封边外墙 (内壁 x = 384)
  addSolidTileRect(-19, -9, 3, 12); // 左磁铁攀爬塔柱 (x = -304..-256, 顶台 y = -144)
  addSolidTileRect(16, -9, 3, 12); // 右磁铁攀爬塔柱 (x = 256..304, 顶台 y = -144)

  // 中央后景矮墙（仅渲染法线受光，不阻挡角色跑酷）
  for (let ty = -1; ty < 3; ty++) {
    for (let tx = -5; tx < 5; tx++) backWallSet.add(keyOf(tx, ty));
  }

  climbableWalls.push(
    { x: -384, topY: -256, bottomY: 48, normalX: 1 },
    { x: -304, topY: -144, bottomY: 48, normalX: -1 },
    { x: -256, topY: -144, bottomY: 48, normalX: 1 },
    { x: 256, topY: -144, bottomY: 48, normalX: -1 },
    { x: 304, topY: -144, bottomY: 48, normalX: 1 },
    { x: 384, topY: -256, bottomY: 48, normalX: -1 }
  );

  const isSolid = (tx: number, ty: number): boolean => {
    if (ty >= 11 || ty < -19 || tx < -27 || tx >= 27) return true;
    return solidSet.has(keyOf(tx, ty)) || backWallSet.has(keyOf(tx, ty));
  };

  const renderTileCell = (tx: number, ty: number, depth: number): void => {
    const wx = tx * TILE_SIZE_PX + 8;
    const wy = ty * TILE_SIZE_PX + 8;
    let frameIdx = computeGridAutotileIndex(isSolid, tx, ty);

    if (ty === 3 && (tx === -7 || tx === -6 || tx === 6 || tx === 7)) {
      frameIdx = SPECIAL_TILE_INDEX.FURNACE_MOLTEN_GRATE;
    } else if (ty >= -8 && ty < 3 && (tx === -25 || tx === -17 || tx === 18)) {
      frameIdx = SPECIAL_TILE_INDEX.CLIMB_WALL_RIGHT;
    } else if (ty >= -8 && ty < 3 && (tx === -19 || tx === 16 || tx === 24)) {
      frameIdx = SPECIAL_TILE_INDEX.CLIMB_WALL_LEFT;
    } else if (frameIdx === 46 && ((tx + ty) & 3) === 0) {
      frameIdx = SPECIAL_TILE_INDEX.SOLID_ALT_MASONRY;
    }

    cameraRig.registerWorldLit(
      scene.add.sprite(wx, wy, 'biome01_slag_tileset', frameIdx).setDepth(depth).setPipeline('Light2D')
    );
  };

  for (const k of backWallSet) {
    const [xs, ys] = k.split(',');
    renderTileCell(Number(xs), Number(ys), DepthLayer.TILE_BACK);
  }
  for (const k of solidSet) {
    const [xs, ys] = k.split(',');
    renderTileCell(Number(xs), Number(ys), DepthLayer.TILE_MAIN);
  }

  // 三组单向黄铜格栅跳台（左右一层 y=0，中央二层 y=-32，全部支持下+跳穿透）
  const grateSpecs: readonly { readonly tx: number; readonly ty: number; readonly w: number }[] = [
    { tx: -13, ty: 0, w: 7 },
    { tx: 6, ty: 0, w: 7 },
    { tx: -4, ty: -2, w: 8 },
  ];
  for (const g of grateSpecs) {
    oneWayPlatforms.push({
      x: g.tx * TILE_SIZE_PX,
      y: g.ty * TILE_SIZE_PX,
      w: g.w * TILE_SIZE_PX,
    });
    for (let i = 0; i < g.w; i++) {
      const f =
        i === 0
          ? SPECIAL_TILE_INDEX.ONEWAY_GRATE_LEFT
          : i === g.w - 1
            ? SPECIAL_TILE_INDEX.ONEWAY_GRATE_RIGHT
            : SPECIAL_TILE_INDEX.ONEWAY_GRATE_MID;
      cameraRig.registerWorldLit(
        scene.add
          .sprite((g.tx + i) * TILE_SIZE_PX + 8, g.ty * TILE_SIZE_PX + 8, 'biome01_slag_tileset', f)
          .setDepth(DepthLayer.TILE_MAIN)
          .setPipeline('Light2D')
      );
    }
  }

  const deckY = 3 * TILE_SIZE_PX; // y = 48
  const heroSprite = cameraRig.registerWorldLit(
    scene.add
      .sprite(0, deckY, 'hero_atlas', 'hero_idle_0')
      .setOrigin(0.5, 1.0)
      .setDepth(DepthLayer.PLAYER)
      .setPipeline('Light2D')
  );

  const flashDummySprite = cameraRig.registerWorldLit(
    scene.add
      .sprite(-108, deckY, 'hero_atlas', 'hero_parry_1')
      .setOrigin(0.5, 1.0)
      .setDepth(DepthLayer.ENEMIES)
      .setPipeline('Light2D')
  );

  const dissolveDummySprite = cameraRig.registerWorldLit(
    scene.add
      .sprite(108, deckY, 'hero_atlas', 'hero_hurt_0')
      .setOrigin(0.5, 1.0)
      .setFlipX(true)
      .setDepth(DepthLayer.ENEMIES)
      .setPipeline('Light2D')
  );

  const makeCrispText = (x: number, y: number, text: string, color: string, sizePx: string) => {
    cameraRig.registerCrispOverlay(
      scene.add
        .text(x, y, text, {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: sizePx,
          color,
          stroke: BIOME_01_SLAG_LIGHTING.backdropHex,
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DepthLayer.CRISP_DAMAGE_NUMBER)
    );
  };

  makeCrispText(-168, -22, 'ONE-WAY GRATE [S + SPACE]', '#FBBF24', '10px');
  makeCrispText(168, -22, '[!] PARRY · 0px BLUR', '#F8FAFC', '10px');
  makeCrispText(-280, -96, 'CLIMB WALL', '#38BDF8', '10px');
  makeCrispText(280, -96, 'CLIMB WALL', '#38BDF8', '10px');

  return {
    parallaxLayers,
    heroSprite,
    flashDummySprite,
    dissolveDummySprite,
    collisionWorld: { solidRects, oneWayPlatforms, climbableWalls },
    cameraBounds: { minX: -432, minY: -304, maxX: 432, maxY: 144 },
    spawnPoint: { x: 0, y: deckY },
  };
}
