/**
 * 关卡局内经济、蓝图卷轴爆落、6 主动技能掉落/熔解、明码标价军械商与 10 杀血咒协同编排器
 * （src/scenes/BiomeEconomyCoordinator.ts，严格 <= 200 行）。
 */

import type Phaser from 'phaser';
import {
  BlueprintScrollWorldPool,
  rollEnemyBlueprintDrop,
  rollEnemyGoldDrop,
} from '../combat/BlueprintDropResolver';
import { CurseStateController } from '../combat/CurseStateController';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import type { EnemyId } from '../data/biomes.data';
import { BLUEPRINT_BY_ID, ECONOMY_CONSTANTS } from '../data/economy.data';
import { RNG_CHANNEL_HASH } from '../data/runes.data';
import type { SkillId } from '../data/skills.data';
import { BIOME_DEPTH_BY_ID } from '../data/storage.data';
import type { WeaponId } from '../data/weapons.data';
import { computeLootQualityTier } from '../entities/player/ForgeGradeRoller';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import type { ParticleDirector } from '../render/vfx/ParticleDirector';
import type { CombatLootSpawner } from '../world/CombatLootSpawner';
import type { GeneratedBiomeDag } from '../world/DagBiomeGenerator';
import type { BakedStitchedWorld } from '../world/DoorSocketStitcher';
import { GoldPickupPool } from '../world/GoldPickupPool';
import type { IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import { ShopMerchantController } from '../world/ShopMerchantController';
import { SkillLootSpawner } from '../world/SkillLootSpawner';
import type { CombatModalController, CombatModalEconomyHooks } from './CombatModalController';

export class BiomeEconomyCoordinator {
  public readonly goldPool: GoldPickupPool;
  public readonly blueprintPool: BlueprintScrollWorldPool;
  public readonly skillLoot: SkillLootSpawner;
  public readonly shop: ShopMerchantController;
  public readonly curse: CurseStateController;
  private readonly goldRng: DeterministicRng;
  private readonly biomeDepth: 1 | 2 | 3 | 4;
  private readonly unsubKill: () => void;
  private trialDropSeq = 1;

  public constructor(
    scene: Phaser.Scene,
    registrar: IWorldDisplayRegistrar,
    dag: GeneratedBiomeDag,
    rootRng: DeterministicRng,
    private readonly lootRng: DeterministicRng,
    private readonly player: PlayerEntity,
    private readonly loot: CombatLootSpawner,
    private readonly particles: ParticleDirector,
    private readonly cameraRig: CameraRig,
    private readonly postFx: ActiveCameraPostFXBundle,
    modals: CombatModalController
  ) {
    this.biomeDepth = BIOME_DEPTH_BY_ID[dag.biomeId];
    this.goldRng = rootRng.fork(RNG_CHANNEL_HASH.GOLD_AND_BLUEPRINT);
    this.goldPool = new GoldPickupPool(scene, registrar, 64);
    this.blueprintPool = new BlueprintScrollWorldPool(scene, registrar, NarrativeStore);
    this.skillLoot = new SkillLootSpawner(
      scene, registrar, dag, player.inventory, lootRng, loot, this.biomeDepth
    );
    this.shop = new ShopMerchantController(
      scene,
      registrar,
      dag,
      player,
      lootRng,
      this.biomeDepth,
      (wpn, wx, wy) => modals.openWeaponCompare({ id: `shop_wpn_${++this.trialDropSeq}`, weapon: wpn, dropX: wx, dropY: wy, isShopBought: true }),
      (skl, wx, wy) => modals.openSkillCompare({ id: `shop_skl_${++this.trialDropSeq}`, skill: skl, dropX: wx, dropY: wy, isShopBought: true }),
      (label, wx, wy) => particles.damageNumbers.spawnLabel(wx, wy, label, 'RALLY_HEAL')
    );

    this.curse = new CurseStateController(player.stats, {
      onCurseLifted: () => {
        const { x: px, y: py } = player.physics;
        postFx.chromaticImpact.triggerPulse(0.62, px, py - 18, cameraRig.worldMainCam);
        particles.damageNumbers.spawnLabel(px, py - 42, '✦ 血咒已破除！', 'PARRY');
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_scroll_upgrade', worldX: px });
      },
    });
    this.curse.mount();

    this.unsubKill = EventBus.on('combat:enemy_killed', (ev) => {
      if (ev.isBoss) return;
      const floorY = ev.worldY + 18;
      const goldRoll = rollEnemyGoldDrop(this.goldRng, {
        biomeDepth: this.biomeDepth,
        crucibleHeat: NarrativeStore.maxCrucibleHeat,
        isElite: Boolean(ev.isElite),
      });
      this.goldPool.spawnBurst(goldRoll.chunks, goldRoll.isNugget, ev.worldX, floorY);

      if (ev.speciesId) {
        const bp = rollEnemyBlueprintDrop(
          this.goldRng,
          { speciesId: ev.speciesId as EnemyId, isElite: Boolean(ev.isElite) },
          NarrativeStore
        );
        if (bp) this.blueprintPool.spawnScroll(bp, ev.worldX, floorY);
      }
      if (ev.isElite) {
        this.skillLoot.trySpawnEliteBonusGear(ev.worldX + 18, floorY);
      }
    });
  }

  public buildModalHooks(): CombatModalEconomyHooks {
    return {
      skillLoot: this.skillLoot,
      shop: this.shop,
      onRecycleLootById: (lootId) => {
        const out = this.skillLoot.recycleFloorLootById(lootId);
        if (out) {
          this.player.stats.gold += out.goldEarned;
          this.particles.damageNumbers.spawnLabel(out.x, out.y - 28, `+${out.goldEarned}G ♻`, 'PARRY');
        }
      },
      onAcceptCursedChest: (chestId) => {
        const res = this.loot.openCursedChestAndSpawnLoot(chestId);
        if (!res) return;
        this.player.stats.gold += ECONOMY_CONSTANTS.CURSE_CHEST_BONUS_GOLD;
        this.curse.inflictCurse(ECONOMY_CONSTANTS.CURSE_KILL_PENALTY);
        this.cameraRig.addTrauma(0.45);
        this.postFx.chromaticImpact.triggerPulse(0.68, res.x, res.y - 18, this.cameraRig.worldMainCam);
        this.particles.damageNumbers.spawnLabel(res.x, res.y - 44, `☠ 10 杀血咒 · +${ECONOMY_CONSTANTS.CURSE_CHEST_BONUS_GOLD}G`, 'REACTION');
      },
      onBlueprintNewlyUnlocked: (blueprintId) => this.spawnFreeTrialItemAtFeet(blueprintId),
    };
  }

  public spawnFreeTrialItemAtFeet(blueprintId: string): void {
    const spec = BLUEPRINT_BY_ID[blueprintId];
    if (!spec) return;
    const { x: px, y: py } = this.player.physics;
    const tier = computeLootQualityTier(this.biomeDepth, NarrativeStore.maxCrucibleHeat, false);
    if (spec.category === 'WEAPON') {
      const wpn = this.player.inventory.rollWeaponInstance(this.lootRng, spec.blueprintId as WeaponId, tier, 'PLUS');
      this.loot.spawnDynamicWeaponDrop(`bp_trial_${++this.trialDropSeq}`, px + 22, py, wpn);
    } else if (spec.category === 'SKILL') {
      const skl = this.player.inventory.loadout.rollSkillInstance(this.lootRng, spec.blueprintId as SkillId, tier, 'PLUS');
      this.skillLoot.spawnSkillDrop(`bp_trial_${++this.trialDropSeq}`, px + 22, py, skl);
    }
    this.particles.damageNumbers.spawnLabel(px, py - 42, `✦ 新蓝图解锁：${spec.nameZh}!`, 'PARRY');
  }

  public stepFixed(
    dtSec: number,
    px: number,
    py: number,
    interactReady: boolean,
    recycleHeld: boolean,
    baked: BakedStitchedWorld,
    modals: CombatModalController
  ): void {
    this.goldPool.stepFixed(dtSec, px, py, baked.solidRects, baked.oneWayPlatforms, (amt, wx, wy) => {
      this.player.stats.gold += amt;
      this.particles.damageNumbers.spawnLabel(wx, wy - 18, `+${amt}G`, 'PARRY');
    });
    this.blueprintPool.stepFixed(dtSec, px, py, (spec, wx, wy) => {
      this.particles.damageNumbers.spawnLabel(wx, wy - 24, `✦ 拾获图纸【${spec.nameZh}】`, 'PARRY');
    });
    this.skillLoot.stepFixed(
      dtSec, px, py, interactReady, recycleHeld,
      (sklDrop) => modals.openSkillCompare(sklDrop),
      (gold, wx, wy) => {
        this.player.stats.gold += gold;
        this.particles.damageNumbers.spawnLabel(wx, wy - 28, `+${gold}G ♻`, 'PARRY');
      }
    );
    this.shop.stepFixed(px, py, interactReady, () => modals.notifyShopModalOpened());
  }

  public destroy(): void {
    this.unsubKill();
    this.curse.unmount();
    this.goldPool.destroy();
    this.blueprintPool.destroy();
    this.skillLoot.destroy();
    this.shop.destroy();
  }
}
