import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { parseNames } from '@/lib/drawing';
import { localDrawingData, localSql, sqlLiteral } from '@/lib/localDatabase';

async function client() {
  if ((await cookies()).get('admin_session')?.value !== 'authenticated_token_save_pes_2026') throw new Error('UNAUTHORIZED');
  if (process.env.LOCAL_TOURNAMENT === 'true') return null;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Drawing gagal.';
  if (message === 'DRAWING_RESET_REQUIRED') return Response.json({ code: 'RESET_REQUIRED', error: 'Kosongkan bracket untuk memulai drawing baru?' }, { status: 409 });
  return Response.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 });
}
export async function GET() {
  try {
    const db = await client();
    if (!db) return Response.json(await localDrawingData(), { headers: { 'Cache-Control': 'no-store' } });
    const [state, players, teams] = await Promise.all([
      db.from('live_drawing').select('*').eq('id', 1).maybeSingle(),
      db.from('players').select('slot,name').order('slot'),
      db.from('teams').select('id,name').order('name'),
    ]);
    if (state.error || players.error || teams.error) throw new Error('Database Live Drawing belum siap. Jalankan migrations/001_live_drawing.sql.');
    return Response.json({ state: state.data, players: players.data, teams: teams.data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const db = await client();
    const body = await request.json();
    const actions = ['configure', 'settings', 'add_names', 'change_player', 'spin', 'retry', 'save', 'move'];
    if (!actions.includes(body.action)) throw new Error('Aksi tidak valid.');
    const payload = { ...body };
    if (body.action === 'save') {
      if (typeof body.team_id !== 'string' || !body.team_id.trim()) throw new Error('Pilih tim sebelum menyimpan hasil drawing.');
      payload.team_id = body.team_id.trim();
    }
    if (['configure', 'settings'].includes(body.action)) {
      payload.spin_duration_ms = body.spin_duration_ms ?? 4200;
      if (!Number.isInteger(payload.spin_duration_ms) || payload.spin_duration_ms < 500 || payload.spin_duration_ms > 15000) throw new Error('Durasi spin harus 0,5–15 detik.');
    }
    if (body.action === 'add_names') {
      payload.names = parseNames(body.text || '');
      if (!payload.names.length) throw new Error('Masukkan nama pemain terlebih dahulu.');
    }
    if (body.action === 'settings') {
      payload.names = parseNames(body.text || '');
      if (!Number.isInteger(body.wheel_count) || body.wheel_count < 1 || body.wheel_count > 128) throw new Error('Jumlah wheel tidak valid.');
    }
    if (body.action === 'configure') {
      payload.names = parseNames(body.text || '');
      if (!Number.isInteger(body.capacity) || body.capacity < 2 || body.capacity > 128) throw new Error('Maksimum pemain harus 2–128.');
      if (!Number.isInteger(body.wheel_count) || body.wheel_count < 1 || body.wheel_count > body.capacity) throw new Error('Jumlah wheel tidak valid.');
      if (!payload.names.length || payload.names.length > body.capacity) throw new Error('Isi nama pemain sesuai kapasitas.');
    }
    if (!db) {
      await localSql(`SELECT live_drawing_action(${sqlLiteral(JSON.stringify(payload))}::jsonb)`);
    } else {
      const { error } = await db.rpc('live_drawing_action', { payload });
      if (error) throw new Error(error.message);
    }
    return GET();
  } catch (error) { return failure(error); }
}
