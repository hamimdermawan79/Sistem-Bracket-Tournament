export interface DrawingEntry { id: string; name: string; }

export interface DrawingState {
  id: number;
  capacity: number;
  wheel_count: number;
  initial_count: number;
  spin_duration_ms: number;
  names: string[];
  entries: DrawingEntry[];
  retry_player_id: string | null;
  pending: { player_id: string; name: string; slot: number; wheel: number } | null;
  retry_name: string | null;
  revision: number;
}

export function wheelRanges(capacity: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    start: Math.floor(i * capacity / count) + 1,
    end: Math.floor((i + 1) * capacity / count),
  }));
}

export function parseNames(text: string) {
  const names = text.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  if (names.some(n => n.length > 120)) throw new Error('Nama maksimal 120 karakter.');
  return names;
}

export function firstDrawingRound(capacity: number) {
  return 8 - Math.ceil(Math.log2(capacity));
}
