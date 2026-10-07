-- Run only in an isolated test database, after the migration and table fixtures.
BEGIN;
DO $$
DECLARE s live_drawing%ROWTYPE; picked integer; before_count integer; cap integer; first_id text; second_id text;
  test_team_id teams.id%TYPE := 'd1111111-1111-4111-8111-111111111111';
BEGIN
  INSERT INTO teams(id,name,logo_url) VALUES(test_team_id,'Drawing Test Team','');
  ASSERT NOT has_function_privilege('anon', 'live_drawing_action(jsonb)', 'EXECUTE'), 'anonymous users cannot mutate drawing';
  ASSERT has_function_privilege('service_role', 'live_drawing_action(jsonb)', 'EXECUTE'), 'admin server can mutate drawing';
  PERFORM live_drawing_action('{"action":"configure","capacity":128,"wheel_count":4,"names":["Alice","Bob","Carol"]}');
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  PERFORM live_drawing_action(jsonb_build_object('action','add_names','revision',s.revision,'names',jsonb_build_array('Dave')));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  ASSERT s.names ? 'Dave' AND s.initial_count = 4, 'append players to active drawing';
  PERFORM live_drawing_action(jsonb_build_object('action','settings','revision',s.revision,'capacity',128,'wheel_count',2,'spin_duration_ms',500,'names','[]'::jsonb));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  ASSERT s.spin_duration_ms = 500 AND s.wheel_count = 2, 'spin speed and wheel count persist';
  PERFORM live_drawing_action(jsonb_build_object('action','settings','revision',s.revision,'capacity',128,'wheel_count',4,'spin_duration_ms',4200,'names','[]'::jsonb));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','settings','revision',s.revision,'capacity',128,'wheel_count',4,'spin_duration_ms',0,'names','[]'::jsonb));
    RAISE EXCEPTION 'invalid duration accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Durasi spin harus 0,5–15 detik.'; END;
  PERFORM live_drawing_action(jsonb_build_object('action','add_names','revision',s.revision,'names',jsonb_build_array('alice')));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'name','Alice','wheel',1));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  picked := (s.pending->>'slot')::integer;
  ASSERT picked BETWEEN 33 AND 64, 'wheel range';
  ASSERT NOT EXISTS (SELECT FROM players WHERE name = 'Alice'), 'spin must not assign player';
  PERFORM live_drawing_action(jsonb_build_object('action','retry','revision',s.revision));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  ASSERT s.retry_name = 'Alice' AND s.pending IS NULL, 'retry keeps selected player';
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'name','Bob','wheel',0));
    RAISE EXCEPTION 'different retry player accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Ulang harus menggunakan pemain yang sama.'; END;
  PERFORM live_drawing_action(jsonb_build_object('action','change_player','revision',s.revision,'name','Bob'));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  ASSERT s.pending IS NULL AND s.retry_name IS NULL AND s.names ? 'Alice' AND s.names ? 'Bob', 'explicit change releases retry without losing players';
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'name','Bob','wheel',0));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  PERFORM live_drawing_action(jsonb_build_object('action','change_player','revision',s.revision,'name','Alice'));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  ASSERT s.pending IS NULL AND NOT EXISTS(SELECT FROM players WHERE name='Bob'), 'explicit change cancels only unsaved result';
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'name','Alice','wheel',0));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  picked := (s.pending->>'slot')::integer;
  ASSERT picked BETWEEN 1 AND 32;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision));
    RAISE EXCEPTION 'save without team accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Pilih tim sebelum menyimpan hasil drawing.'; END;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id',''));
    RAISE EXCEPTION 'save with blank team accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Pilih tim sebelum menyimpan hasil drawing.'; END;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id','d2222222-2222-4222-8222-222222222222'));
    RAISE EXCEPTION 'save with unknown team accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Tim tidak tersedia. Pilih tim yang sudah terdaftar.'; END;
  INSERT INTO teams(id,name,logo_url) VALUES('d2222222-2222-4222-8222-222222222222','Removed Team','');
  DELETE FROM teams WHERE id::text='d2222222-2222-4222-8222-222222222222';
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id','d2222222-2222-4222-8222-222222222222'));
    RAISE EXCEPTION 'save with deleted team accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Tim tidak tersedia. Pilih tim yang sudah terdaftar.'; END;
  ASSERT (SELECT pending FROM live_drawing WHERE id=1)=s.pending AND (SELECT revision FROM live_drawing WHERE id=1)=s.revision, 'invalid team preserves pending result';
  ASSERT NOT EXISTS(SELECT FROM players WHERE name='Alice'), 'invalid team must not assign player';
  PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id',test_team_id));
  ASSERT (SELECT name FROM players WHERE slot = picked) = 'Alice';
  ASSERT (SELECT team_id FROM players WHERE slot=picked)=test_team_id, 'saved result includes chosen team';
  ASSERT NOT (SELECT names ? 'Alice' FROM live_drawing WHERE id = 1);
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id',test_team_id));
    RAISE EXCEPTION 'stale revision accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Data berubah. Muat ulang drawing.'; END;
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  PERFORM live_drawing_action(jsonb_build_object('action','move','revision',s.revision,'from',picked,'to',128));
  ASSERT (SELECT name FROM players WHERE slot = 128) = 'Alice';
  ASSERT (SELECT team_id FROM players WHERE slot=128)=test_team_id, 'moving a player preserves the team';
  ASSERT (SELECT name FROM players WHERE slot = picked) = '';
  UPDATE players SET name = '';
  -- Validate every supported capacity: all numbered slots occur once and sides balance.
  FOR cap IN 2..128 LOOP
    PERFORM live_drawing_action(jsonb_build_object('action','configure','capacity',cap,'wheel_count',least(cap,4),'names',jsonb_build_array('Alice','Bob')));
    SELECT count(*) INTO before_count FROM (SELECT player1_slot AS slot FROM matches UNION ALL SELECT player2_slot FROM matches) x WHERE slot IS NOT NULL;
    ASSERT before_count = cap, 'each numbered position must be seeded';
    ASSERT (SELECT count(DISTINCT slot) FROM (SELECT player1_slot AS slot FROM matches UNION ALL SELECT player2_slot FROM matches) x) = cap, 'no duplicate position';
    IF cap > 2 THEN
      ASSERT (SELECT count(*) FROM (SELECT player1_slot AS slot, bracket_side FROM matches UNION ALL SELECT player2_slot, bracket_side FROM matches) x WHERE slot IS NOT NULL AND bracket_side = 'left') = (cap+1)/2, 'balanced left';
    END IF;
  END LOOP;
  -- Exhaust a complete two-player drawing and ensure used numbers never return.
  PERFORM live_drawing_action('{"action":"configure","capacity":2,"wheel_count":1,"names":["Alice","Bob"]}');
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','add_names','revision',s.revision,'names',jsonb_build_array('Carol')));
    RAISE EXCEPTION 'capacity overflow accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Jumlah pemain melebihi kapasitas slot.'; END;
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'name','Alice','wheel',0));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  picked := (s.pending->>'slot')::integer;
  PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id',test_team_id));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'name','Bob','wheel',0));
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  ASSERT (s.pending->>'slot')::integer <> picked, 'saved number is excluded';
  PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id',test_team_id));
  ASSERT (SELECT jsonb_array_length(names) FROM live_drawing WHERE id = 1) = 0, 'drawing completes';
  UPDATE players SET name = '';
  PERFORM live_drawing_action('{"action":"configure","capacity":128,"wheel_count":4,"names":["Alice","Bob"]}');
  -- Equal names remain distinct throughout retry, save and append.
  PERFORM live_drawing_action('{"action":"configure","capacity":4,"wheel_count":1,"names":["Twin","Twin"]}');
  SELECT * INTO s FROM live_drawing WHERE id=1;
  first_id:=s.entries->0->>'id'; second_id:=s.entries->1->>'id';
  ASSERT first_id <> second_id;
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'player_id',first_id,'wheel',0));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  PERFORM live_drawing_action(jsonb_build_object('action','retry','revision',s.revision));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'player_id',second_id,'wheel',0));
    RAISE EXCEPTION 'retry switched duplicate identity';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Ulang harus menggunakan pemain yang sama.'; END;
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'player_id',first_id,'wheel',0));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  picked:=(s.pending->>'slot')::integer;
  PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id',test_team_id));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT jsonb_array_length(s.entries)=1 AND s.entries->0->>'id'=second_id AND s.names ? 'Twin';
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'player_id',first_id,'wheel',0));
    RAISE EXCEPTION 'saved identity redrawn';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Pemain tidak tersedia.'; END;
  PERFORM live_drawing_action(jsonb_build_object('action','spin','revision',s.revision,'player_id',second_id,'wheel',0));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT (s.pending->>'slot')::integer <> picked;
  PERFORM live_drawing_action(jsonb_build_object('action','save','revision',s.revision,'team_id',test_team_id));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT jsonb_array_length(s.entries)=0 AND (SELECT count(*) FROM players WHERE name='Twin')=2;
  PERFORM live_drawing_action(jsonb_build_object('action','add_names','revision',s.revision,'names',jsonb_build_array('Twin')));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT jsonb_array_length(s.entries)=1;
  UPDATE players SET name='';
  PERFORM live_drawing_action('{"action":"configure","capacity":128,"wheel_count":4,"names":["Alice","Bob"]}');
  UPDATE matches SET winner_slot = 1 WHERE id = 'R1_M1';
  SELECT * INTO s FROM live_drawing WHERE id = 1;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','move','revision',s.revision,'from',1,'to',2));
    RAISE EXCEPTION 'move after tournament starts accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Posisi tidak dapat dipindah setelah pertandingan dimulai.'; END;
  UPDATE players SET name='Existing' WHERE slot=1;
  BEGIN
    PERFORM live_drawing_action('{"action":"configure","capacity":4,"wheel_count":2,"names":["New"]}');
    RAISE EXCEPTION 'reset without confirmation accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'DRAWING_RESET_REQUIRED'; END;
  ASSERT (SELECT name FROM players WHERE slot=1)='Existing';
  ASSERT (SELECT winner_slot FROM matches WHERE id='R1_M1')=1;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','configure','capacity',4,'wheel_count',2,'names',jsonb_build_array('New'),'reset_existing',true,'revision',s.revision-1));
    RAISE EXCEPTION 'stale reset accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Data berubah. Muat ulang drawing.'; END;
  BEGIN
    PERFORM live_drawing_action(jsonb_build_object('action','configure','capacity',1,'wheel_count',2,'names',jsonb_build_array('New'),'reset_existing',true,'revision',s.revision));
    RAISE EXCEPTION 'invalid reset accepted';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'Konfigurasi tidak valid.'; END;
  ASSERT (SELECT name FROM players WHERE slot=1)='Existing';
  PERFORM live_drawing_action(jsonb_build_object('action','configure','capacity',4,'wheel_count',2,'names',jsonb_build_array('New'),'reset_existing',true,'revision',s.revision));
  SELECT * INTO s FROM live_drawing WHERE id=1;
  ASSERT s.capacity=4 AND s.names='["New"]'::jsonb AND s.pending IS NULL AND s.retry_name IS NULL;
  ASSERT NOT EXISTS (SELECT FROM players WHERE coalesce(name,'')<>'' OR team_id IS NOT NULL);
  ASSERT NOT EXISTS (SELECT FROM matches WHERE winner_slot IS NOT NULL OR round<>6);
  ASSERT (SELECT count(*) FROM matches)=2;
END $$;
ROLLBACK;
