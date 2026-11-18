---
trigger: model_decision
description: Activate this rule whenever designing, generating, editing, or validating RoomChunk JSON templates, DoorSocket stitching, Biome DAG level generation, seeded loot/affix RNG, or cloud save snapshot serialization.
---

# 关卡切片拓扑可达性与全局确定性随机铁律

当处理 `src/world/`、`public/assets/tilemaps/`、`src/core/DeterministicRng.ts` 或 `src/storage/` 相关任务时，必须严格遵守以下规范：

---

## 1. 手工 `RoomChunk` 切片可达性硬约束

1. **禁止纯程序化噪点地形**：所有生态群落房间必须由人工精调或经 `validate_reachability.ts` 几何包络验证通过的 `RoomChunk` JSON 构成，严禁使用 Perlin/Simplex 噪点或随机游走挖洞生成不可达死胡同。
2. **跳跃运动学安全包络（Kinematic Reachability Envelope）**：
   - 无攀爬符文时的单段最大安全垂直跨越高度：`≤ 56 px`（`3.5` 格 `16px` 瓦片）；
   - 二段跳最大安全垂直跨越高度：`≤ 96 px`（`6` 格 `16px` 瓦片）；
   - 二段跳 + 空中翻滚最大安全水平跨越沟壑宽度：`≤ 144 px`（`9` 格 `16px` 瓦片）。
   - 任何超出上述包络的隐藏高台、易碎地面或导管通道，必须在 `DoorSocket.requiredRune` 字段显式声明所需符文 ID（`rune_vitriol_tendril` / `rune_mercury_conduit` / `rune_calcined_ram` / `rune_magnetic_claws`），严禁将主线必经出口置于未解锁符文门之后。
3. **`DoorSocket` 像素级严丝合缝拼接**：
   - 左右连接门锚点通道净高固定为 `4` 格瓦片（`64 px`），底部地面 Y 轴偏移必须在 `DoorSocketStitcher.ts` 中精确对齐，拼接处严禁出现 `1px` 台阶卡脚或碰撞体裂缝。

---

## 2. `Mulberry32` 确定性随机流隔离规范

1. **严禁混用随机流**：全局种子 `runSeed` 必须通过 `rng.fork(channelHash)` 派生互不干扰的子随机流：
   - `biomeTopologyRng`：仅用于生成关卡 DAG 节点与房间抽样；
   - `lootAndAffixRng`：仅用于宝箱掉落、商店刷货与重铸词条；
   - `enemySpawnRng`：仅用于精英怪词缀与巡逻初始相位。
   - **视觉粒子与音效音高微扰**（不影响游戏胜负状态的纯表现层随机）必须使用独立的非存档 `VisualFxRng`，严禁消耗存档 `DeterministicRng` 的 `stepCount`，以确保跨设备恢复快照后掉落物 100% 一致。
