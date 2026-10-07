-- Run after migration 004. All fixtures and results are rolled back.
BEGIN;
UPDATE players SET name = 'Activity test' WHERE slot IN (127,128);
INSERT INTO matches(id, round, match_number, bracket_side, player1_slot, player2_slot)
VALUES ('activity_test', 1, 64, 'right', 127, 128), ('activity_empty', 7, 1, 'final', NULL, NULL);
DO $$
DECLARE result jsonb;
BEGIN
  result := set_match_playing('activity_test', true);
  IF NOT (result->>'is_playing')::boolean THEN RAISE EXCEPTION 'Start was not saved'; END IF;
  result := set_match_playing('activity_test', false);
  IF (result->>'is_playing')::boolean THEN RAISE EXCEPTION 'Stop was not saved'; END IF;
  BEGIN
    PERFORM set_match_playing('activity_empty', true);
    RAISE EXCEPTION 'Empty match accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Lengkapi kedua pemain sebelum mulai bermain.' THEN RAISE; END IF;
  END;
  UPDATE players SET name = '' WHERE slot = 128;
  BEGIN
    PERFORM set_match_playing('activity_test', true);
    RAISE EXCEPTION 'Empty name accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Lengkapi kedua pemain sebelum mulai bermain.' THEN RAISE; END IF;
  END;
  UPDATE players SET name = 'Activity test' WHERE slot = 128;
  PERFORM set_match_playing('activity_test', true);
  UPDATE matches SET winner_slot = 127 WHERE id = 'activity_test';
  IF (SELECT is_playing FROM matches WHERE id = 'activity_test') THEN RAISE EXCEPTION 'Winner did not stop playing'; END IF;
  BEGIN
    PERFORM set_match_playing('activity_test', true);
    RAISE EXCEPTION 'Completed match restarted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Pertandingan sudah selesai.' THEN RAISE; END IF;
  END;
  UPDATE matches SET winner_slot = NULL WHERE id = 'activity_test';
  IF (SELECT is_playing FROM matches WHERE id = 'activity_test') THEN RAISE EXCEPTION 'Cancel should return to normal'; END IF;
  PERFORM set_match_playing('activity_test', true);
  UPDATE matches SET player2_slot = NULL WHERE id = 'activity_test';
  IF (SELECT is_playing FROM matches WHERE id = 'activity_test') THEN RAISE EXCEPTION 'Changed participants did not stop playing'; END IF;
  IF has_function_privilege('anon', 'set_match_playing(text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'set_match_playing(text,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'set_match_playing(text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected activity function permissions';
  END IF;
END;
$$;
ROLLBACK;
