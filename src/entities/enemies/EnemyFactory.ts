/**
 * 12 物种多态实例化工厂与各群落起点先锋守卫配置（src/entities/enemies/EnemyFactory.ts）。
 */

import type Phaser from 'phaser';
import type { BiomeId, EnemyId } from '../../data/biomes.data';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';
import type { BaseEnemy } from './BaseEnemy';
import type { EnemySpawnInit } from './EnemyTypes';
import { AcidSpitterEnemy, AlembicThrowerEnemy } from './roster/AlembicThrowerEnemy';
import { BrassSentinelEnemy, FlailExecutorEnemy } from './roster/BrassSentinelEnemy';
import { AstralInquisitorEnemy, MercuryStalkerEnemy } from './roster/MercuryStalkerEnemy';
import { OssuaryPrelateEnemy, PendulumAssassinEnemy } from './roster/OssuaryPrelateEnemy';
import { FrenziedMinerEnemy, SlagHuskEnemy } from './roster/SlagHuskEnemy';
import { ClockworkTickEnemy, VoltaicWeaverEnemy } from './roster/VoltaicWeaverEnemy';
import type { TelegraphRenderer } from './TelegraphRenderer';

export const ENTRANCE_VANGUARDS: Readonly<Record<BiomeId, readonly [EnemyId, EnemyId]>> = {
  biome_01_slag_retort: ['mob_01_slag_husk', 'mob_05_brass_sentinel'],
  biome_02_vitriol_sewers: ['mob_04_acid_spitter', 'mob_02_frenzied_miner'],
  biome_03_clockwork_ossuary: ['mob_05_brass_sentinel', 'mob_09_ossuary_prelate'],
  biome_04_crucible_apex: ['mob_11_mercury_stalker', 'mob_12_astral_inquisitor'],
};

export function instantiateEnemySpecies(
  scene: Phaser.Scene | null,
  registrar: IWorldDisplayRegistrar | null,
  telegraph: TelegraphRenderer | null,
  init: EnemySpawnInit
): BaseEnemy {
  switch (init.speciesId) {
    case 'mob_01_slag_husk':
      return new SlagHuskEnemy(scene, registrar, telegraph, init);
    case 'mob_02_frenzied_miner':
      return new FrenziedMinerEnemy(scene, registrar, telegraph, init);
    case 'mob_03_alembic_thrower':
      return new AlembicThrowerEnemy(scene, registrar, telegraph, init);
    case 'mob_04_acid_spitter':
      return new AcidSpitterEnemy(scene, registrar, telegraph, init);
    case 'mob_05_brass_sentinel':
      return new BrassSentinelEnemy(scene, registrar, telegraph, init);
    case 'mob_06_flail_executor':
      return new FlailExecutorEnemy(scene, registrar, telegraph, init);
    case 'mob_07_voltaic_weaver':
      return new VoltaicWeaverEnemy(scene, registrar, telegraph, init);
    case 'mob_08_clockwork_tick':
      return new ClockworkTickEnemy(scene, registrar, telegraph, init);
    case 'mob_09_ossuary_prelate':
      return new OssuaryPrelateEnemy(scene, registrar, telegraph, init);
    case 'mob_10_pendulum_assassin':
      return new PendulumAssassinEnemy(scene, registrar, telegraph, init);
    case 'mob_11_mercury_stalker':
      return new MercuryStalkerEnemy(scene, registrar, telegraph, init);
    case 'mob_12_astral_inquisitor':
      return new AstralInquisitorEnemy(scene, registrar, telegraph, init);
  }
}
