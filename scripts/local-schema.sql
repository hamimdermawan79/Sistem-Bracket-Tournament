DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE TABLE IF NOT EXISTS teams(id text PRIMARY KEY, name text NOT NULL, logo_url text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS players(slot integer PRIMARY KEY, name text, team_id text REFERENCES teams(id) ON DELETE SET NULL, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS matches(id text PRIMARY KEY, round integer NOT NULL, match_number integer NOT NULL, bracket_side text NOT NULL, player1_slot integer REFERENCES players(slot), player2_slot integer REFERENCES players(slot), winner_slot integer REFERENCES players(slot), updated_at timestamptz DEFAULT now());
INSERT INTO players(slot,name) SELECT generate_series(1,128), '' ON CONFLICT DO NOTHING;
