import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { localSql, sqlLiteral } from '@/lib/localDatabase';

export async function POST(request: Request) {
  if ((await cookies()).get('admin_session')?.value !== 'authenticated_token_save_pes_2026') {
    return Response.json({ error: 'Login admin diperlukan.' }, { status: 401 });
  }
  try {
    const { round, matchNumber, playing } = await request.json();
    if (!Number.isInteger(round) || round < 1 || round > 7 || !Number.isInteger(matchNumber) || matchNumber < 1 || matchNumber > 2 ** (7 - round) || typeof playing !== 'boolean') {
      throw new Error('Pertandingan atau status bermain tidak valid.');
    }
    const matchId = `R${round}_M${matchNumber}`;
    if (process.env.LOCAL_TOURNAMENT === 'true') {
      const match = await localSql(`SELECT public.set_match_playing(${sqlLiteral(matchId)}, ${playing ? 'true' : 'false'})`);
      return Response.json({ match });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await db.rpc('set_match_playing', { match_id: matchId, playing });
    if (error) throw new Error(error.code === 'PGRST202' ? 'Jalankan migrations/004_match_playing.sql di Supabase.' : error.message);
    return Response.json({ match: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Status bermain gagal disimpan.' }, { status: 400 });
  }
}
