-- ============================================================================
-- Migration: 0001_initial_cloud_save.sql
-- Project  : QUICKSILVER CRUCIBLE (水银坩埚)
-- Engine   : Supabase PostgreSQL 15+ with Row-Level Security (RLS)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. 通用 updated_at 自动维护触发器函数
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- 2. 玩家档案表 (支持 Supabase Anonymous Auth 匿名游玩与无损转正)
CREATE TABLE IF NOT EXISTS public.player_profiles (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_moniker     TEXT NOT NULL DEFAULT 'Vessel-09',
  is_promoted_account BOOLEAN NOT NULL DEFAULT FALSE,
  last_device_id      TEXT,
  last_device_label   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER set_player_profiles_updated_at
  BEFORE UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_profiles (user_id, is_promoted_account)
  VALUES (NEW.id, NOT COALESCE(NEW.is_anonymous, TRUE))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.meta_progressions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.handle_auth_user_promoted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_anonymous IS TRUE AND NEW.is_anonymous IS FALSE THEN
    UPDATE public.player_profiles
       SET is_promoted_account = TRUE
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_promoted ON auth.users;
CREATE TRIGGER on_auth_user_promoted
  AFTER UPDATE OF is_anonymous ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_promoted();

-- 3. 轨道一：meta_progressions（局外永久成长表 — CRDT Set-Union 幂等并集模型）
CREATE TABLE IF NOT EXISTS public.meta_progressions (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version        INTEGER NOT NULL DEFAULT 1,
  unlocked_runes        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  unlocked_weapons      TEXT[] NOT NULL DEFAULT ARRAY['wpn_rust_scalpel', 'wpn_alembic_bow', 'wpn_slag_buckler']::TEXT[],
  unlocked_skills       TEXT[] NOT NULL DEFAULT ARRAY['skl_vitriol_flask']::TEXT[],
  unlocked_mutations    TEXT[] NOT NULL DEFAULT ARRAY['mut_crimson_frenzy', 'mut_mercury_ward', 'mut_tactical_reload']::TEXT[],
  discovered_lore_ids   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  seen_npc_dialogue_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  true_ending_flags     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blueprint_ichor_map   JSONB NOT NULL DEFAULT '{}'::JSONB,
  forge_tier_progress   JSONB NOT NULL DEFAULT '{"plus_tier_ichor": 0, "s_tier_ichor": 0, "flask_charges": 1, "gold_reserve_lvl": 0}'::JSONB,
  bestiary_kill_counts  JSONB NOT NULL DEFAULT '{}'::JSONB,
  banked_ichor          INTEGER NOT NULL DEFAULT 0 CHECK (banked_ichor >= 0),
  max_crucible_heat     SMALLINT NOT NULL DEFAULT 0 CHECK (max_crucible_heat BETWEEN 0 AND 5),
  total_runs_started    INTEGER NOT NULL DEFAULT 0 CHECK (total_runs_started >= 0),
  total_runs_cleared    INTEGER NOT NULL DEFAULT 0 CHECK (total_runs_cleared >= 0),
  crdt_revision         BIGINT NOT NULL DEFAULT 1,
  payload_sha256        TEXT NOT NULL DEFAULT '',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER set_meta_progressions_updated_at
  BEFORE UPDATE ON public.meta_progressions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.jsonb_max_numeric_merge(a JSONB, b JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      k,
      to_jsonb(
        GREATEST(
          COALESCE((a ->> k)::NUMERIC, 0),
          COALESCE((b ->> k)::NUMERIC, 0)
        )
      )
    ),
    '{}'::JSONB
  )
  FROM (
    SELECT jsonb_object_keys(COALESCE(a, '{}'::JSONB)) AS k
    UNION
    SELECT jsonb_object_keys(COALESCE(b, '{}'::JSONB)) AS k
  ) keys;
$$;

CREATE OR REPLACE FUNCTION public.text_array_set_union(a TEXT[], b TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT elem
      FROM unnest(COALESCE(a, ARRAY[]::TEXT[]) || COALESCE(b, ARRAY[]::TEXT[])) AS elem
      WHERE elem IS NOT NULL AND length(elem) > 0
      ORDER BY elem
    ),
    ARRAY[]::TEXT[]
  );
$$;

CREATE OR REPLACE FUNCTION public.merge_meta_progression(
  p_schema_version        INTEGER,
  p_unlocked_runes        TEXT[],
  p_unlocked_weapons      TEXT[],
  p_unlocked_skills       TEXT[],
  p_unlocked_mutations    TEXT[],
  p_discovered_lore_ids   TEXT[],
  p_seen_npc_dialogue_ids TEXT[],
  p_true_ending_flags     TEXT[],
  p_blueprint_ichor_map   JSONB,
  p_forge_tier_progress   JSONB,
  p_bestiary_kill_counts  JSONB,
  p_banked_ichor          INTEGER,
  p_max_crucible_heat     SMALLINT,
  p_total_runs_started    INTEGER,
  p_total_runs_cleared    INTEGER,
  p_payload_sha256        TEXT
)
RETURNS public.meta_progressions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_result public.meta_progressions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: auth.uid() is null';
  END IF;

  INSERT INTO public.meta_progressions (
    user_id, schema_version,
    unlocked_runes, unlocked_weapons, unlocked_skills, unlocked_mutations,
    discovered_lore_ids, seen_npc_dialogue_ids, true_ending_flags,
    blueprint_ichor_map, forge_tier_progress, bestiary_kill_counts,
    banked_ichor, max_crucible_heat, total_runs_started, total_runs_cleared,
    crdt_revision, payload_sha256
  ) VALUES (
    v_uid, p_schema_version,
    public.text_array_set_union(ARRAY[]::TEXT[], p_unlocked_runes),
    public.text_array_set_union(ARRAY['wpn_rust_scalpel', 'wpn_alembic_bow', 'wpn_slag_buckler']::TEXT[], p_unlocked_weapons),
    public.text_array_set_union(ARRAY['skl_vitriol_flask']::TEXT[], p_unlocked_skills),
    public.text_array_set_union(ARRAY['mut_crimson_frenzy', 'mut_mercury_ward', 'mut_tactical_reload']::TEXT[], p_unlocked_mutations),
    public.text_array_set_union(ARRAY[]::TEXT[], p_discovered_lore_ids),
    public.text_array_set_union(ARRAY[]::TEXT[], p_seen_npc_dialogue_ids),
    public.text_array_set_union(ARRAY[]::TEXT[], p_true_ending_flags),
    COALESCE(p_blueprint_ichor_map, '{}'::JSONB),
    COALESCE(p_forge_tier_progress, '{}'::JSONB),
    COALESCE(p_bestiary_kill_counts, '{}'::JSONB),
    GREATEST(0, p_banked_ichor),
    GREATEST(0::SMALLINT, LEAST(5::SMALLINT, p_max_crucible_heat)),
    GREATEST(0, p_total_runs_started),
    GREATEST(0, p_total_runs_cleared),
    1,
    p_payload_sha256
  )
  ON CONFLICT (user_id) DO UPDATE SET
    schema_version        = GREATEST(meta_progressions.schema_version, EXCLUDED.schema_version),
    unlocked_runes        = public.text_array_set_union(meta_progressions.unlocked_runes, EXCLUDED.unlocked_runes),
    unlocked_weapons      = public.text_array_set_union(meta_progressions.unlocked_weapons, EXCLUDED.unlocked_weapons),
    unlocked_skills       = public.text_array_set_union(meta_progressions.unlocked_skills, EXCLUDED.unlocked_skills),
    unlocked_mutations    = public.text_array_set_union(meta_progressions.unlocked_mutations, EXCLUDED.unlocked_mutations),
    discovered_lore_ids   = public.text_array_set_union(meta_progressions.discovered_lore_ids, EXCLUDED.discovered_lore_ids),
    seen_npc_dialogue_ids = public.text_array_set_union(meta_progressions.seen_npc_dialogue_ids, EXCLUDED.seen_npc_dialogue_ids),
    true_ending_flags     = public.text_array_set_union(meta_progressions.true_ending_flags, EXCLUDED.true_ending_flags),
    blueprint_ichor_map   = public.jsonb_max_numeric_merge(meta_progressions.blueprint_ichor_map, EXCLUDED.blueprint_ichor_map),
    forge_tier_progress   = public.jsonb_max_numeric_merge(meta_progressions.forge_tier_progress, EXCLUDED.forge_tier_progress),
    bestiary_kill_counts  = public.jsonb_max_numeric_merge(meta_progressions.bestiary_kill_counts, EXCLUDED.bestiary_kill_counts),
    banked_ichor          = EXCLUDED.banked_ichor,
    max_crucible_heat     = GREATEST(meta_progressions.max_crucible_heat, EXCLUDED.max_crucible_heat),
    total_runs_started    = GREATEST(meta_progressions.total_runs_started, EXCLUDED.total_runs_started),
    total_runs_cleared    = GREATEST(meta_progressions.total_runs_cleared, EXCLUDED.total_runs_cleared),
    crdt_revision         = meta_progressions.crdt_revision + 1,
    payload_sha256        = EXCLUDED.payload_sha256
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- 4. 轨道二：active_run_snapshots（当前局内进度快照 — 支持跨设备接力与分叉检测）
CREATE TABLE IF NOT EXISTS public.active_run_snapshots (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id              UUID NOT NULL,
  schema_version      INTEGER NOT NULL DEFAULT 1,
  lifecycle_state     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_state IN ('ACTIVE', 'VICTORY', 'DEAD', 'ABANDONED')),
  device_id           TEXT NOT NULL,
  device_label        TEXT NOT NULL DEFAULT 'Unknown Device',
  run_seed            BIGINT NOT NULL CHECK (run_seed >= 0 AND run_seed <= 4294967295),
  rng_internal_state  BIGINT NOT NULL CHECK (rng_internal_state >= 0 AND rng_internal_state <= 4294967295),
  rng_step_count      BIGINT NOT NULL DEFAULT 0 CHECK (rng_step_count >= 0),
  biome_id            TEXT NOT NULL,
  biome_depth         SMALLINT NOT NULL DEFAULT 1 CHECK (biome_depth BETWEEN 1 AND 4),
  current_room_id     TEXT NOT NULL,
  spawn_checkpoint_id TEXT NOT NULL,
  playtime_ms         BIGINT NOT NULL DEFAULT 0 CHECK (playtime_ms >= 0),
  player_snapshot     JSONB NOT NULL,
  loadout_summary     JSONB NOT NULL,
  world_delta         JSONB NOT NULL DEFAULT '{}'::JSONB,
  revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  payload_sha256      TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  client_saved_at     TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER set_active_run_snapshots_updated_at
  BEFORE UPDATE ON public.active_run_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.push_active_run_snapshot(
  p_run_id              UUID,
  p_schema_version      INTEGER,
  p_lifecycle_state     TEXT,
  p_device_id           TEXT,
  p_device_label        TEXT,
  p_run_seed            BIGINT,
  p_rng_internal_state  BIGINT,
  p_rng_step_count      BIGINT,
  p_biome_id            TEXT,
  p_biome_depth         SMALLINT,
  p_current_room_id     TEXT,
  p_spawn_checkpoint_id TEXT,
  p_playtime_ms         BIGINT,
  p_player_snapshot     JSONB,
  p_loadout_summary     JSONB,
  p_world_delta         JSONB,
  p_base_revision       INTEGER,
  p_payload_sha256      TEXT,
  p_client_saved_at     TIMESTAMPTZ,
  p_force_overwrite     BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := (SELECT auth.uid());
  v_existing public.active_run_snapshots;
  v_saved    public.active_run_snapshots;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: auth.uid() is null';
  END IF;

  SELECT * INTO v_existing
    FROM public.active_run_snapshots
   WHERE user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND
     OR p_force_overwrite IS TRUE
     OR (v_existing.lifecycle_state <> 'ACTIVE' AND v_existing.run_id <> p_run_id)
  THEN
    INSERT INTO public.active_run_snapshots (
      user_id, run_id, schema_version, lifecycle_state,
      device_id, device_label, run_seed, rng_internal_state, rng_step_count,
      biome_id, biome_depth, current_room_id, spawn_checkpoint_id, playtime_ms,
      player_snapshot, loadout_summary, world_delta,
      revision, payload_sha256, client_saved_at
    ) VALUES (
      v_uid, p_run_id, p_schema_version, p_lifecycle_state,
      p_device_id, p_device_label, p_run_seed, p_rng_internal_state, p_rng_step_count,
      p_biome_id, p_biome_depth, p_current_room_id, p_spawn_checkpoint_id, p_playtime_ms,
      p_player_snapshot, p_loadout_summary, p_world_delta,
      COALESCE(v_existing.revision, 0) + 1, p_payload_sha256, p_client_saved_at
    )
    ON CONFLICT (user_id) DO UPDATE SET
      run_id              = EXCLUDED.run_id,
      schema_version      = EXCLUDED.schema_version,
      lifecycle_state     = EXCLUDED.lifecycle_state,
      device_id           = EXCLUDED.device_id,
      device_label        = EXCLUDED.device_label,
      run_seed            = EXCLUDED.run_seed,
      rng_internal_state  = EXCLUDED.rng_internal_state,
      rng_step_count      = EXCLUDED.rng_step_count,
      biome_id            = EXCLUDED.biome_id,
      biome_depth         = EXCLUDED.biome_depth,
      current_room_id     = EXCLUDED.current_room_id,
      spawn_checkpoint_id = EXCLUDED.spawn_checkpoint_id,
      playtime_ms         = EXCLUDED.playtime_ms,
      player_snapshot     = EXCLUDED.player_snapshot,
      loadout_summary     = EXCLUDED.loadout_summary,
      world_delta         = EXCLUDED.world_delta,
      revision            = active_run_snapshots.revision + 1,
      payload_sha256      = EXCLUDED.payload_sha256,
      client_saved_at     = EXCLUDED.client_saved_at
    RETURNING * INTO v_saved;

    RETURN jsonb_build_object('status', 'COMMITTED', 'snapshot', to_jsonb(v_saved));
  END IF;

  IF v_existing.payload_sha256 = p_payload_sha256 THEN
    RETURN jsonb_build_object('status', 'NO_OP', 'snapshot', to_jsonb(v_existing));
  END IF;

  IF v_existing.run_id = p_run_id AND v_existing.revision = p_base_revision THEN
    UPDATE public.active_run_snapshots SET
      schema_version      = p_schema_version,
      lifecycle_state     = p_lifecycle_state,
      device_id           = p_device_id,
      device_label        = p_device_label,
      rng_internal_state  = p_rng_internal_state,
      rng_step_count      = p_rng_step_count,
      biome_id            = p_biome_id,
      biome_depth         = p_biome_depth,
      current_room_id     = p_current_room_id,
      spawn_checkpoint_id = p_spawn_checkpoint_id,
      playtime_ms         = p_playtime_ms,
      player_snapshot     = p_player_snapshot,
      loadout_summary     = p_loadout_summary,
      world_delta         = p_world_delta,
      revision            = v_existing.revision + 1,
      payload_sha256      = p_payload_sha256,
      client_saved_at     = p_client_saved_at
    WHERE user_id = v_uid
    RETURNING * INTO v_saved;

    RETURN jsonb_build_object('status', 'COMMITTED', 'snapshot', to_jsonb(v_saved));
  END IF;

  RETURN jsonb_build_object(
    'status', 'CONFLICT',
    'remote_snapshot', to_jsonb(v_existing)
  );
END;
$$;

-- 5. 历史战绩归档表
CREATE TABLE IF NOT EXISTS public.run_history_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL UNIQUE,
  outcome         TEXT NOT NULL CHECK (outcome IN ('VICTORY', 'DEAD', 'ABANDONED')),
  run_seed        BIGINT NOT NULL,
  reached_biome   TEXT NOT NULL,
  killed_by_id    TEXT,
  playtime_ms     BIGINT NOT NULL,
  final_loadout   JSONB NOT NULL,
  finished_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_run_history_user_finished
  ON public.run_history_logs (user_id, finished_at DESC);

-- 6. 严格行级安全策略 (RLS)
ALTER TABLE public.player_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_progressions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_run_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_history_logs     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.player_profiles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.player_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own profile"
  ON public.player_profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can read own meta progression"
  ON public.meta_progressions FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own meta progression"
  ON public.meta_progressions FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own meta progression"
  ON public.meta_progressions FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can read own active run snapshot"
  ON public.active_run_snapshots FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own active run snapshot"
  ON public.active_run_snapshots FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own active run snapshot"
  ON public.active_run_snapshots FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own active run snapshot"
  ON public.active_run_snapshots FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can read own run history"
  ON public.run_history_logs FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own run history"
  ON public.run_history_logs FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
