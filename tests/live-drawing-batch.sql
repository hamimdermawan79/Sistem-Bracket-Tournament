-- Run only in an isolated database after local-schema.sql, 001 and 003.
BEGIN;
DO $$
DECLARE
  s live_drawing%ROWTYPE; before_results jsonb; selections jsonb; result jsonb;
  first_id text; old_slot integer; conflict_slot integer; conflict_id text;
  test_team teams.id%TYPE := 'batch-test-team';
BEGIN
  INSERT INTO teams(id,name,logo_url) VALUES(test_team,'Batch Test Team','');
  ASSERT NOT has_function_privilege('anon','live_drawing_batch_action(jsonb)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','live_drawing_batch_action(jsonb)','EXECUTE');
  ASSERT has_function_privilege('service_role','live_drawing_batch_action(jsonb)','EXECUTE');
  PERFORM live_drawing_action('{"action":"configure","capacity":16,"wheel_count":4,"names":["Twin","Twin","Putra3","Putra4"]}');
  SELECT * INTO s FROM live_drawing WHERE id=1;
  SELECT jsonb_agg(jsonb_build_object('player_id',e->>'id','wheel',ordinal-1) ORDER BY ordinal) INTO selections FROM jsonb_array_elements(s.entries) WITH ORDINALITY x(e,ordinal);
  first_id := s.entries->0->>'id';
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','spin_all','revision',s.revision,'selections',jsonb_build_array(selections->0,selections->0)));
    RAISE EXCEPTION 'duplicate entry and wheel accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Setiap pemain dan wheel hanya boleh dipilih sekali.'; END;
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','spin_all','revision',s.revision,'selections',jsonb_build_array(selections->0,(selections->1)||'{"wheel":0}'::jsonb)));
    RAISE EXCEPTION 'duplicate wheel accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Setiap pemain dan wheel hanya boleh dipilih sekali.'; END;
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','spin_all','revision',s.revision-1,'selections',selections));
    RAISE EXCEPTION 'stale spin accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Data berubah. Muat ulang drawing.'; END;
  UPDATE players SET name='Filled' WHERE slot BETWEEN 9 AND 12;
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','spin_all','revision',s.revision,'selections',selections));
    RAISE EXCEPTION 'full wheel accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Wheel 3 sudah habis.'; END;
  ASSERT (SELECT pending_batch='[]'::jsonb AND revision=s.revision FROM live_drawing WHERE id=1), 'failed batch must reserve nothing';
  UPDATE players SET name='' WHERE slot BETWEEN 9 AND 12;
  PERFORM live_drawing_batch_action(jsonb_build_object('action','spin_all','revision',s.revision,'selections',selections));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT jsonb_array_length(s.pending_batch)=4 AND jsonb_array_length(s.entries)=4;
  ASSERT NOT EXISTS(SELECT FROM players WHERE coalesce(name,'')<>''), 'spin must not assign bracket players';
  ASSERT (SELECT count(DISTINCT e->>'slot') FROM jsonb_array_elements(s.pending_batch) e)=4;
  FOR result IN SELECT e FROM jsonb_array_elements(s.pending_batch) e LOOP
    ASSERT (result->>'slot')::integer BETWEEN (result->>'wheel')::integer*4+1 AND ((result->>'wheel')::integer+1)*4;
  END LOOP;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','settings','revision',s.revision,'capacity',16,'wheel_count',2,'names','[]'::jsonb));
    RAISE EXCEPTION 'settings bypassed reservations';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Simpan seluruh hasil spin terlebih dahulu.'; END;
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','spin_all','revision',s.revision,'selections',selections));
    RAISE EXCEPTION 'new spin bypassed reservations';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Simpan seluruh hasil spin terlebih dahulu.'; END;
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','batch_team','revision',s.revision,'player_id',first_id,'team_id','missing'));
    RAISE EXCEPTION 'unknown team accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Tim tidak tersedia. Pilih tim yang sudah terdaftar.'; END;
  PERFORM live_drawing_batch_action(jsonb_build_object('action','batch_team','revision',s.revision,'player_id',first_id,'team_id',test_team));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  before_results := s.pending_batch;
  old_slot := (s.pending_batch->0->>'slot')::integer;
  PERFORM live_drawing_batch_action(jsonb_build_object('action','retry_one','revision',s.revision,'player_id',first_id));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT (s.pending_batch->0->>'slot')::integer <> old_slot AND (s.pending_batch->0->>'slot')::integer BETWEEN 1 AND 4;
  ASSERT s.pending_batch->0->>'team_id'=test_team, 'reroll preserves chosen team';
  ASSERT s.pending_batch->1=before_results->1 AND s.pending_batch->2=before_results->2 AND s.pending_batch->3=before_results->3, 'reroll preserves other results';
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','save_all','revision',s.revision));
    RAISE EXCEPTION 'incomplete teams accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Pilih tim untuk semua pemain sebelum menyimpan.'; END;
  ASSERT NOT EXISTS(SELECT FROM players WHERE coalesce(name,'')<>''), 'missing later team rolls back earlier assignments';
  FOR result IN SELECT e FROM jsonb_array_elements(s.pending_batch) e LOOP
    SELECT * INTO s FROM live_drawing WHERE id=1;
    PERFORM live_drawing_batch_action(jsonb_build_object('action','batch_team','revision',s.revision,'player_id',result->>'player_id','team_id',test_team));
  END LOOP;
  SELECT * INTO s FROM live_drawing WHERE id=1;
  conflict_slot := (s.pending_batch->3->>'slot')::integer;
  conflict_id := s.pending_batch->3->>'player_id';
  UPDATE players SET name='External Edit' WHERE slot=conflict_slot;
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','save_all','revision',s.revision));
    RAISE EXCEPTION 'conflicting slot accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Slot sudah terisi. Ulang spin pemain tersebut.'; END;
  ASSERT (SELECT count(*) FROM players WHERE coalesce(name,'')<>'')=1, 'conflict rolls back the whole save';
  ASSERT (SELECT pending_batch FROM live_drawing WHERE id=1)=s.pending_batch;
  PERFORM live_drawing_batch_action(jsonb_build_object('action','retry_one','revision',s.revision,'player_id',conflict_id));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  before_results := s.pending_batch;
  PERFORM live_drawing_batch_action(jsonb_build_object('action','save_all','revision',s.revision));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT s.pending_batch='[]'::jsonb AND s.entries='[]'::jsonb AND s.names='[]'::jsonb;
  ASSERT (SELECT count(*) FROM players WHERE name='Twin')=2, 'identical names remain distinct entries';
  FOR result IN SELECT e FROM jsonb_array_elements(before_results) e LOOP
    ASSERT (SELECT name=result->>'name' AND team_id=test_team FROM players WHERE slot=(result->>'slot')::integer), 'every result is assigned with its team';
  END LOOP;
  ASSERT (SELECT name FROM players WHERE slot=conflict_slot)='External Edit';
  PERFORM live_drawing_action(jsonb_build_object('action','configure','revision',s.revision,'capacity',2,'wheel_count',2,'names',jsonb_build_array('A','B'),'reset_existing',true));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  PERFORM live_drawing_batch_action(jsonb_build_object('action','spin_all','revision',s.revision,'selections',jsonb_build_array(jsonb_build_object('wheel',0,'player_id',s.entries->0->>'id'))));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT jsonb_array_length(s.pending_batch)=1, 'empty wheels do not spin';
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','configure','capacity',4,'wheel_count',1,'names',jsonb_build_array('New')));
    RAISE EXCEPTION 'new drawing discarded reservations without confirmation';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='DRAWING_RESET_REQUIRED'; END;
  BEGIN
    PERFORM live_drawing_batch_action(jsonb_build_object('action','retry_one','revision',s.revision,'player_id',s.entries->0->>'id'));
    RAISE EXCEPTION 'reroll with no alternative accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Tidak ada nomor lain yang tersedia di wheel ini.'; END;
  PERFORM live_drawing_action(jsonb_build_object('action','configure','revision',s.revision,'capacity',4,'wheel_count',1,'names',jsonb_build_array('New'),'reset_existing',true));
  ASSERT (SELECT pending_batch FROM live_drawing WHERE id=1)='[]'::jsonb, 'confirmed new drawing clears reservations';
END $$;
ROLLBACK;
