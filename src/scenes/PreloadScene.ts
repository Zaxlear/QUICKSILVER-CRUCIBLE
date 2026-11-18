import Phaser from 'phaser';
import { ALL_BIOME_IDS, BIOME_CATALOG } from '../data/biomes.data';
import { registerCruciblePipelines } from '../render/pipelines/PipelineRegistry';
import { CloudSync } from '../storage/CloudSyncCoordinator';
import { validateRoomChunkTemplate, type RoomChunkTemplate } from '../world/RoomChunkSchema';
import { registerHeroAnimations } from './ShowcaseStageBuilder';

interface ChunkManifestJson {
  readonly biomeId: string;
  readonly chunks: readonly string[];
}

/**
 * 资源预加载与着色器预注册场景（src/scenes/PreloadScene.ts）：
 * 成对加载角色、12 怪、双多阶段 Boss、圣所 NPC 图集与全部 4 大生态群落法线贴图后：
 * - 若 Dexie 本地金库存在活跃局内快照（ActiveRunSnapshot），毫秒级断点续玩恢复至对应群落与房间；
 * - 否则进入出生基地「永恒锻炉圣所（SanctumHubScene）」。
 */
export class PreloadScene extends Phaser.Scene {
  private manifestIds: readonly string[] = [];

  public constructor() {
    super({ key: 'PreloadScene' });
  }

  public preload(): void {
    this.load.multiatlas('hero_atlas', '/assets/atlases/hero_atlas.json', '/assets/atlases');
    this.load.multiatlas('locomotion_fx_atlas', '/assets/atlases/locomotion_fx_atlas.json', '/assets/atlases');
    this.load.multiatlas('world_props_atlas', '/assets/atlases/world_props_atlas.json', '/assets/atlases');
    this.load.multiatlas('weapons_fx_atlas', '/assets/atlases/weapons_fx_atlas.json', '/assets/atlases');
    this.load.multiatlas('synergy_fx_atlas', '/assets/atlases/synergy_fx_atlas.json', '/assets/atlases');
    this.load.multiatlas('enemies_roster_atlas', '/assets/atlases/enemies_roster_atlas.json', '/assets/atlases');
    this.load.multiatlas('enemy_fx_atlas', '/assets/atlases/enemy_fx_atlas.json', '/assets/atlases');
    this.load.multiatlas('bosses_atlas', '/assets/atlases/bosses_atlas.json', '/assets/atlases');
    this.load.multiatlas('boss_fx_atlas', '/assets/atlases/boss_fx_atlas.json', '/assets/atlases');
    this.load.multiatlas('sanctum_hub_atlas', '/assets/atlases/sanctum_hub_atlas.json', '/assets/atlases');

    this.load.image('minimap_ui_sheet', [
      '/assets/atlases/minimap_ui_sheet.png',
      '/assets/atlases/minimap_ui_sheet_n.png',
    ]);
    this.load.image('weapon_icons_sheet', [
      '/assets/atlases/weapon_icons_sheet.png',
      '/assets/atlases/weapon_icons_sheet_n.png',
    ]);
    this.load.image('npc_portraits_sheet', [
      '/assets/atlases/npc_portraits_sheet.png',
      '/assets/atlases/npc_portraits_sheet_n.png',
    ]);

    for (const biomeId of ALL_BIOME_IDS) {
      const spec = BIOME_CATALOG[biomeId];
      this.load.spritesheet({
        key: spec.tilesetKey,
        url: `/assets/tilemaps/${spec.tilesetKey}.png`,
        normalMap: `/assets/tilemaps/${spec.tilesetKey}_n.png`,
        frameConfig: { frameWidth: 16, frameHeight: 16 },
      });
      for (let i = 0; i < 5; i++) {
        this.load.image(`${spec.parallaxPrefix}${i}`, [
          `/assets/tilemaps/${spec.parallaxPrefix}${i}.png`,
          `/assets/tilemaps/${spec.parallaxPrefix}${i}_n.png`,
        ]);
      }
    }

    this.load.json('all_chunk_manifest', '/assets/tilemaps/chunks/index.json');
    this.load.once(
      'filecomplete-json-all_chunk_manifest',
      (_key: string, _type: string, data: ChunkManifestJson) => {
        this.manifestIds = data?.chunks ?? [];
        for (const chunkId of this.manifestIds) {
          this.load.json(`chunk_tpl_${chunkId}`, `/assets/tilemaps/chunks/${chunkId}.json`);
        }
      }
    );
  }

  public create(): void {
    registerCruciblePipelines(this.game);
    registerHeroAnimations(this);

    const validatedChunks: RoomChunkTemplate[] = [];
    for (const chunkId of this.manifestIds) {
      const raw = this.cache.json.get(`chunk_tpl_${chunkId}`) as unknown;
      validatedChunks.push(validateRoomChunkTemplate(raw));
    }
    this.registry.set('all_biome_chunks', validatedChunks);
    this.registry.set(
      'biome01_chunks',
      validatedChunks.filter((c) => c.biomePool.includes('biome_01_slag_retort'))
    );

    void CloudSync.waitUntilBootReady().then((resumeSnapshot) => {
      if (resumeSnapshot && resumeSnapshot.lifecycleState === 'ACTIVE') {
        this.scene.start('BiomeRunScene', { resumeSnapshot });
      } else {
        this.scene.start('SanctumHubScene');
      }
    });
  }
}
