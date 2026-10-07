-- Adds match activity without changing existing players or results.
BEGIN;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_playing boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.reset_match_activity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.winner_slot IS NOT NULL THEN
    NEW.is_playing := false;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.player1_slot IS DISTINCT FROM OLD.player1_slot
       OR NEW.player2_slot IS DISTINCT FROM OLD.player2_slot
       OR NEW.winner_slot IS DISTINCT FROM OLD.winner_slot THEN
      NEW.is_playing := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reset_match_activity ON public.matches;
CREATE TRIGGER reset_match_activity BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.reset_match_activity();

CREATE OR REPLACE FUNCTION public.set_match_playing(match_id text, playing boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_match public.matches;
BEGIN
  IF playing IS NULL THEN RAISE EXCEPTION 'Status bermain tidak valid.'; END IF;
  SELECT * INTO current_match FROM public.matches WHERE id = match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pertandingan tidak ditemukan.'; END IF;
  IF playing THEN
    IF current_match.winner_slot IS NOT NULL THEN RAISE EXCEPTION 'Pertandingan sudah selesai.'; END IF;
    IF current_match.player1_slot IS NULL OR current_match.player2_slot IS NULL
       OR current_match.player1_slot = current_match.player2_slot
       OR (SELECT count(*) FROM public.players WHERE slot IN (current_match.player1_slot, current_match.player2_slot) AND nullif(btrim(name), '') IS NOT NULL) <> 2 THEN
      RAISE EXCEPTION 'Lengkapi kedua pemain sebelum mulai bermain.';
    END IF;
  END IF;
  UPDATE public.matches SET is_playing = playing, updated_at = now()
  WHERE id = match_id RETURNING * INTO current_match;
  RETURN to_jsonb(current_match);
END;
$$;
REVOKE ALL ON FUNCTION public.set_match_playing(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_match_playing(text, boolean) TO service_role;
COMMIT;
