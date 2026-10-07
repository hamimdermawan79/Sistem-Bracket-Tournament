export interface Team {
  id: string;
  name: string;
  logo_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface Player {
  slot: number;
  name: string;
  team_id?: string | null;
  team?: Team | null;
  updated_at?: string;
}

export interface Match {
  id: string;
  round: number; // 1: 128-besar, 2: 64-besar, 3: 32-besar, 4: 16-besar, 5: 8-besar, 6: Semi Final, 7: Grand Final
  match_number: number;
  bracket_side: 'left' | 'right' | 'final';
  player1_slot: number | null;
  player2_slot: number | null;
  winner_slot: number | null;
  is_playing?: boolean;
  player1_name?: string;
  player2_name?: string;
  player1_team?: Team | null;
  player2_team?: Team | null;
}
