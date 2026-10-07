-- Run after 001 (and 002 if already used), in the intended Supabase project.
-- Existing players and matches are preserved. Unsaved single results become a batch.
BEGIN;
ALTER TABLE public.live_drawing ADD COLUMN IF NOT EXISTS pending_batch jsonb NOT NULL DEFAULT '[]';
UPDATE public.live_drawing
SET pending_batch = jsonb_build_array(pending || jsonb_build_object('team_id', NULL)),
    pending = NULL, retry_name = NULL, retry_player_id = NULL, revision = revision + 1
WHERE pending IS NOT NULL AND jsonb_array_length(pending_batch) = 0;

CREATE OR REPLACE FUNCTION public.live_drawing_action(payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  s live_drawing%ROWTYPE;
  action text := payload->>'action';
  cap integer; wc integer; duration integer; first_round integer; size integer; half integer;
  i integer; a integer; b integer; lo integer; hi integer; picked integer;
  selected_name text; selected_id text; new_entries jsonb; remaining_entries jsonb; p1 players%ROWTYPE; p2 players%ROWTYPE;
  selected_team teams.id%TYPE;
BEGIN
  -- Serialize all admins, including first-time setup, and lock bracket edits.
  PERFORM pg_advisory_xact_lock(728194);
  LOCK TABLE players, matches IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO s FROM live_drawing WHERE id = 1 FOR UPDATE;
  IF action <> 'configure' AND jsonb_array_length(coalesce(s.pending_batch, '[]')) > 0 THEN
    RAISE EXCEPTION 'Simpan seluruh hasil spin terlebih dahulu.';
  END IF;
  IF action = 'configure' THEN
    cap := (payload->>'capacity')::integer;
    wc := (payload->>'wheel_count')::integer;
    duration := coalesce((payload->>'spin_duration_ms')::integer, 4200);
    IF duration NOT BETWEEN 500 AND 15000 THEN RAISE EXCEPTION 'Durasi spin harus 0,5–15 detik.'; END IF;
    IF cap NOT BETWEEN 2 AND 128 OR wc NOT BETWEEN 1 AND cap
      OR jsonb_array_length(payload->'names') NOT BETWEEN 1 AND cap THEN
      RAISE EXCEPTION 'Konfigurasi tidak valid.';
    END IF;
    IF payload->'reset_existing' = 'true'::jsonb THEN
      IF s.id IS NOT NULL AND (payload->>'revision')::integer IS DISTINCT FROM s.revision THEN
        RAISE EXCEPTION 'Data berubah. Muat ulang drawing.';
      END IF;
      -- This app stores one bracket. Reset all its rows only after confirmation.
      -- Explicit primary-key predicates keep pg-safeupdate enabled.
      DELETE FROM matches WHERE id IS NOT NULL;
      UPDATE players SET name='', team_id=NULL, updated_at=now() WHERE slot IS NOT NULL;
    ELSIF jsonb_array_length(s.pending_batch) > 0 OR s.pending IS NOT NULL
      OR EXISTS (SELECT 1 FROM players WHERE coalesce(trim(name), '') <> '')
      OR EXISTS (SELECT 1 FROM matches WHERE winner_slot IS NOT NULL OR (round > coalesce(8 - ceil(log(2, s.capacity))::integer, 1) AND (player1_slot IS NOT NULL OR player2_slot IS NOT NULL))) THEN
      RAISE EXCEPTION 'DRAWING_RESET_REQUIRED';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'name',n) ORDER BY ordinal),'[]') INTO new_entries FROM jsonb_array_elements_text(payload->'names') WITH ORDINALITY AS x(n,ordinal);
    INSERT INTO live_drawing (id, capacity, wheel_count, initial_count, names, pending, retry_name, revision, spin_duration_ms, entries, retry_player_id) VALUES (1, cap, wc, jsonb_array_length(payload->'names'), payload->'names', NULL, NULL, coalesce(s.revision, 0) + 1, duration, new_entries, NULL)
    ON CONFLICT (id) DO UPDATE SET capacity = EXCLUDED.capacity, wheel_count = EXCLUDED.wheel_count,
      names = EXCLUDED.names, initial_count = EXCLUDED.initial_count, pending = NULL, pending_batch = '[]', retry_name = NULL, revision = EXCLUDED.revision, spin_duration_ms = EXCLUDED.spin_duration_ms, entries=EXCLUDED.entries, retry_player_id=NULL;
    INSERT INTO players(slot, name) SELECT generate_series(1, cap), '' ON CONFLICT DO NOTHING;
    first_round := 8 - ceil(log(2, cap))::integer;
    size := power(2, 8 - first_round)::integer;
    half := size / 2;
    -- Rebuild the single bracket after the existing-data check above.
    DELETE FROM matches WHERE id IS NOT NULL;
    FOR i IN 1..(size / 2) LOOP
      a := (i * 2 - 1); b := i * 2;
      -- Equal numbered slots per side; unused padded positions become BYEs.
      IF size = 2 THEN
        a := 1; b := 2;
      ELSIF a <= half THEN
        a := CASE WHEN a <= (cap + 1) / 2 THEN a ELSE NULL END;
        b := CASE WHEN b <= (cap + 1) / 2 THEN b ELSE NULL END;
      ELSE
        a := CASE WHEN a - half <= cap / 2 THEN (cap + 1) / 2 + a - half ELSE NULL END;
        b := CASE WHEN b - half <= cap / 2 THEN (cap + 1) / 2 + b - half ELSE NULL END;
      END IF;
      INSERT INTO matches(id, round, match_number, bracket_side, player1_slot, player2_slot)
      VALUES ('R' || first_round || '_M' || i, first_round, i,
        CASE WHEN size = 2 THEN 'final' WHEN i <= size / 4 THEN 'left' ELSE 'right' END, a, b);
    END LOOP;
    RETURN;
  END IF;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Siapkan drawing terlebih dahulu.'; END IF;
  IF (payload->>'revision')::integer IS DISTINCT FROM s.revision THEN RAISE EXCEPTION 'Data berubah. Muat ulang drawing.'; END IF;
  IF action IN ('add_names', 'settings') THEN
    IF s.pending IS NOT NULL THEN RAISE EXCEPTION 'Simpan atau ulang hasil sebelumnya sebelum menambah pemain.'; END IF;
    IF jsonb_typeof(payload->'names') IS DISTINCT FROM 'array' OR (action = 'add_names' AND jsonb_array_length(payload->'names') = 0) THEN RAISE EXCEPTION 'Masukkan nama pemain.'; END IF;
    wc := s.wheel_count;
    duration := s.spin_duration_ms;
    IF action = 'settings' THEN
      wc := (payload->>'wheel_count')::integer;
      duration := coalesce((payload->>'spin_duration_ms')::integer, 4200);
      IF duration NOT BETWEEN 500 AND 15000 THEN RAISE EXCEPTION 'Durasi spin harus 0,5–15 detik.'; END IF;
      IF wc IS NULL OR wc NOT BETWEEN 1 AND s.capacity THEN RAISE EXCEPTION 'Jumlah wheel tidak valid.'; END IF;
      IF (payload->>'capacity')::integer IS DISTINCT FROM s.capacity THEN RAISE EXCEPTION 'Kapasitas hanya dapat diubah pada drawing baru.'; END IF;
    END IF;
    SELECT count(*) INTO i FROM players WHERE slot BETWEEN 1 AND s.capacity AND coalesce(trim(name),'') <> '';
    IF i + jsonb_array_length(s.names) + jsonb_array_length(payload->'names') > s.capacity THEN RAISE EXCEPTION 'Jumlah pemain melebihi kapasitas slot.'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'name',n) ORDER BY ordinal),'[]') INTO new_entries FROM jsonb_array_elements_text(payload->'names') WITH ORDINALITY AS x(n,ordinal);
    UPDATE live_drawing SET entries=entries || new_entries, names = names || (payload->'names'), initial_count = initial_count + jsonb_array_length(payload->'names'), wheel_count=wc, spin_duration_ms=duration, revision = revision + 1 WHERE id=1;
  ELSIF action IN ('change_player', 'spin') THEN
    selected_id := payload->>'player_id';
    IF selected_id IS NULL THEN
      SELECT e->>'id' INTO selected_id FROM jsonb_array_elements(s.entries) e WHERE e->>'name'=payload->>'name' LIMIT 1;
    END IF;
    SELECT e->>'name' INTO selected_name FROM jsonb_array_elements(s.entries) e WHERE e->>'id'=selected_id;
    IF selected_name IS NULL THEN RAISE EXCEPTION 'Pemain tidak tersedia.'; END IF;
    IF action='change_player' THEN
      UPDATE live_drawing SET pending=NULL, retry_name=NULL, retry_player_id=NULL, revision=revision+1 WHERE id=1;
      RETURN;
    END IF;
    IF s.pending IS NOT NULL THEN RAISE EXCEPTION 'Simpan atau ulang hasil sebelumnya.'; END IF;
    IF s.retry_player_id IS NOT NULL AND selected_id IS DISTINCT FROM s.retry_player_id THEN RAISE EXCEPTION 'Ulang harus menggunakan pemain yang sama.'; END IF;
    i := (payload->>'wheel')::integer;
    IF i NOT BETWEEN 0 AND s.wheel_count - 1 THEN RAISE EXCEPTION 'Wheel tidak valid.'; END IF;
    lo := floor(i::numeric * s.capacity / s.wheel_count)::integer + 1;
    hi := floor((i + 1)::numeric * s.capacity / s.wheel_count)::integer;
    SELECT slot INTO picked FROM players WHERE slot BETWEEN lo AND hi AND coalesce(trim(name), '') = '' ORDER BY random() LIMIT 1;
    IF picked IS NULL THEN RAISE EXCEPTION 'Wheel sudah habis.'; END IF;
    UPDATE live_drawing SET pending = jsonb_build_object('player_id', selected_id, 'name', selected_name, 'slot', picked, 'wheel', i), revision = revision + 1 WHERE id = 1;
  ELSIF action = 'retry' THEN
    IF s.pending IS NULL THEN RAISE EXCEPTION 'Belum ada hasil spin.'; END IF;
    UPDATE live_drawing SET retry_name = pending->>'name', retry_player_id=pending->>'player_id', pending = NULL, revision = revision + 1 WHERE id = 1;
  ELSIF action = 'save' THEN
    IF s.pending IS NULL THEN RAISE EXCEPTION 'Belum ada hasil spin.'; END IF;
    IF coalesce(trim(payload->>'team_id'), '') = '' THEN RAISE EXCEPTION 'Pilih tim sebelum menyimpan hasil drawing.'; END IF;
    SELECT id INTO selected_team FROM teams WHERE id::text = payload->>'team_id' FOR KEY SHARE;
    IF selected_team IS NULL THEN RAISE EXCEPTION 'Tim tidak tersedia. Pilih tim yang sudah terdaftar.'; END IF;
    picked := (s.pending->>'slot')::integer; selected_name := s.pending->>'name';
    selected_id := s.pending->>'player_id';
    UPDATE players SET name = selected_name, team_id = selected_team, updated_at = now() WHERE slot = picked AND coalesce(trim(name), '') = '';
    IF NOT FOUND THEN RAISE EXCEPTION 'Slot sudah terisi. Ulang spin.'; END IF;
    SELECT coalesce(jsonb_agg(e),'[]') INTO remaining_entries FROM jsonb_array_elements(s.entries) e WHERE e->>'id' <> selected_id;
    UPDATE live_drawing SET entries=remaining_entries, names=(SELECT coalesce(jsonb_agg(e->>'name'),'[]') FROM jsonb_array_elements(remaining_entries) e), pending=NULL, retry_name=NULL, retry_player_id=NULL, revision=revision+1 WHERE id=1;
  ELSIF action = 'move' THEN
    IF s.pending IS NOT NULL THEN RAISE EXCEPTION 'Selesaikan hasil spin terlebih dahulu.'; END IF;
    IF EXISTS (SELECT 1 FROM matches WHERE winner_slot IS NOT NULL) THEN RAISE EXCEPTION 'Posisi tidak dapat dipindah setelah pertandingan dimulai.'; END IF;
    a := (payload->>'from')::integer; b := (payload->>'to')::integer;
    IF a IS NULL OR b IS NULL OR a NOT BETWEEN 1 AND s.capacity OR b NOT BETWEEN 1 AND s.capacity OR a = b THEN RAISE EXCEPTION 'Slot tidak valid.'; END IF;
    SELECT * INTO p1 FROM players WHERE slot = a; SELECT * INTO p2 FROM players WHERE slot = b;
    UPDATE players SET name = p2.name, team_id = p2.team_id, updated_at = now() WHERE slot = a;
    UPDATE players SET name = p1.name, team_id = p1.team_id, updated_at = now() WHERE slot = b;
    UPDATE live_drawing SET revision = revision + 1 WHERE id = 1;
  ELSE RAISE EXCEPTION 'Aksi tidak valid.';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.live_drawing_action(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_drawing_action(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.live_drawing_batch_action(payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  s live_drawing%ROWTYPE;
  action text := payload->>'action';
  selection jsonb; result jsonb; results jsonb := '[]';
  player_id text; player_name text; team teams.id%TYPE;
  wheel integer; lo integer; hi integer; picked integer; previous_slot integer;
  target_index integer;
BEGIN
  PERFORM pg_advisory_xact_lock(728194);
  LOCK TABLE players, matches IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO s FROM live_drawing WHERE id=1 FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Siapkan drawing terlebih dahulu.'; END IF;
  IF (payload->>'revision')::integer IS DISTINCT FROM s.revision THEN
    RAISE EXCEPTION 'Data berubah. Muat ulang drawing.';
  END IF;
  IF s.pending IS NOT NULL THEN RAISE EXCEPTION 'Selesaikan hasil spin sebelumnya.'; END IF;

  IF action = 'spin_all' THEN
    IF jsonb_array_length(s.pending_batch) > 0 THEN RAISE EXCEPTION 'Simpan seluruh hasil spin terlebih dahulu.'; END IF;
    IF jsonb_typeof(payload->'selections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Pilih pemain untuk wheel yang akan diputar.'; END IF;
    IF jsonb_array_length(payload->'selections') NOT BETWEEN 1 AND s.wheel_count THEN RAISE EXCEPTION 'Jumlah pilihan wheel tidak valid.'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'selections') e GROUP BY e->>'player_id' HAVING count(*)>1)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'selections') e GROUP BY (e->>'wheel')::integer HAVING count(*)>1) THEN
      RAISE EXCEPTION 'Setiap pemain dan wheel hanya boleh dipilih sekali.';
    END IF;
    FOR selection IN SELECT e FROM jsonb_array_elements(payload->'selections') e ORDER BY (e->>'wheel')::integer LOOP
      wheel := (selection->>'wheel')::integer;
      player_id := selection->>'player_id';
      IF wheel IS NULL OR wheel NOT BETWEEN 0 AND s.wheel_count-1 THEN RAISE EXCEPTION 'Wheel tidak valid.'; END IF;
      SELECT e->>'name' INTO player_name FROM jsonb_array_elements(s.entries) e WHERE e->>'id'=player_id;
      IF player_name IS NULL THEN RAISE EXCEPTION 'Pemain tidak tersedia.'; END IF;
      lo := floor(wheel::numeric*s.capacity/s.wheel_count)::integer+1;
      hi := floor((wheel+1)::numeric*s.capacity/s.wheel_count)::integer;
      SELECT slot INTO picked FROM players WHERE slot BETWEEN lo AND hi AND coalesce(trim(name),'')='' ORDER BY random() LIMIT 1;
      IF picked IS NULL THEN RAISE EXCEPTION 'Wheel % sudah habis.', wheel+1; END IF;
      results := results || jsonb_build_array(jsonb_build_object('player_id',player_id,'name',player_name,'wheel',wheel,'slot',picked,'team_id',NULL));
    END LOOP;
    UPDATE live_drawing SET pending_batch=results, retry_name=NULL, retry_player_id=NULL, revision=revision+1 WHERE id=1;
    RETURN;
  END IF;

  IF jsonb_array_length(s.pending_batch)=0 THEN RAISE EXCEPTION 'Belum ada hasil spin.'; END IF;
  IF action IN ('retry_one','batch_team') THEN
    SELECT e, ordinal::integer-1 INTO result, target_index FROM jsonb_array_elements(s.pending_batch) WITH ORDINALITY x(e,ordinal) WHERE e->>'player_id'=payload->>'player_id';
    IF result IS NULL THEN RAISE EXCEPTION 'Hasil pemain tidak tersedia.'; END IF;
    IF action='retry_one' THEN
      wheel := (result->>'wheel')::integer;
      previous_slot := (result->>'slot')::integer;
      lo := floor(wheel::numeric*s.capacity/s.wheel_count)::integer+1;
      hi := floor((wheel+1)::numeric*s.capacity/s.wheel_count)::integer;
      SELECT slot INTO picked FROM players
      WHERE slot BETWEEN lo AND hi AND coalesce(trim(name),'')='' AND slot<>previous_slot
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.pending_batch) e WHERE (e->>'slot')::integer=players.slot)
      ORDER BY random() LIMIT 1;
      IF picked IS NULL THEN RAISE EXCEPTION 'Tidak ada nomor lain yang tersedia di wheel ini.'; END IF;
      result := result || jsonb_build_object('slot',picked);
    ELSE
      IF payload->'team_id' = 'null'::jsonb THEN
        result := result || jsonb_build_object('team_id',NULL);
      ELSE
        SELECT id INTO team FROM teams WHERE id::text=payload->>'team_id' FOR KEY SHARE;
        IF team IS NULL THEN RAISE EXCEPTION 'Tim tidak tersedia. Pilih tim yang sudah terdaftar.'; END IF;
        result := result || jsonb_build_object('team_id',team);
      END IF;
    END IF;
    UPDATE live_drawing SET pending_batch=jsonb_set(pending_batch,ARRAY[target_index::text],result), revision=revision+1 WHERE id=1;
  ELSIF action='save_all' THEN
    FOR result IN SELECT e FROM jsonb_array_elements(s.pending_batch) e LOOP
      SELECT id INTO team FROM teams WHERE id::text=result->>'team_id' FOR KEY SHARE;
      IF team IS NULL THEN RAISE EXCEPTION 'Pilih tim untuk semua pemain sebelum menyimpan.'; END IF;
      UPDATE players SET name=result->>'name', team_id=team, updated_at=now()
      WHERE slot=(result->>'slot')::integer AND coalesce(trim(name),'')='';
      IF NOT FOUND THEN RAISE EXCEPTION 'Slot sudah terisi. Ulang spin pemain tersebut.'; END IF;
    END LOOP;
    SELECT coalesce(jsonb_agg(e),'[]') INTO results FROM jsonb_array_elements(s.entries) e
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.pending_batch) b WHERE b->>'player_id'=e->>'id');
    UPDATE live_drawing SET entries=results, names=(SELECT coalesce(jsonb_agg(e->>'name'),'[]') FROM jsonb_array_elements(results) e),
      pending_batch='[]', revision=revision+1 WHERE id=1;
  ELSE
    RAISE EXCEPTION 'Aksi tidak valid.';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.live_drawing_batch_action(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_drawing_batch_action(jsonb) TO service_role;
COMMIT;
