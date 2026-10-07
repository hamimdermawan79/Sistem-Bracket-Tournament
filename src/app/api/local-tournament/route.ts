import { cookies } from 'next/headers';
import { localSql, sqlLiteral } from '@/lib/localDatabase';

const tables: Record<string, string[]> = {
  players: ['slot', 'name', 'team_id', 'updated_at'],
  matches: ['id', 'round', 'match_number', 'bracket_side', 'player1_slot', 'player2_slot', 'winner_slot', 'updated_at'],
  teams: ['id', 'name', 'logo_url', 'created_at', 'updated_at'],
  drawing_config: ['capacity', 'wheel_count'],
};
export async function POST(request: Request) {
  if (process.env.LOCAL_TOURNAMENT !== 'true') return Response.json({ error: { message: 'Not found' } }, { status: 404 });
  try {
    const body = await request.json();
    const allowed = tables[body.table];
    if (!allowed) throw new Error('Tabel tidak valid.');
    const identifier = (column: string) => {
      if (!allowed.includes(column)) throw new Error('Kolom tidak valid.');
      return '"' + column + '"';
    };
    const table = '"' + body.table + '"';
    const where = body.filter ? ` WHERE ${identifier(body.filter.column)} = ${sqlLiteral(body.filter.value)}` : '';
    if (body.action === 'select') {
      const order = body.order ? ` ORDER BY ${identifier(body.order.column)} ${body.order.ascending ? 'ASC' : 'DESC'}` : '';
      const rows = await localSql(`SELECT coalesce(json_agg(t),'[]') FROM (SELECT * FROM ${table}${where}${order}) t`);
      return Response.json({ data: body.single ? rows[0] || null : rows, error: null });
    }
    if ((await cookies()).get('admin_session')?.value !== 'authenticated_token_save_pes_2026') return Response.json({ data: null, error: { message: 'Login admin diperlukan.' } }, { status: 401 });
    if (body.table === 'drawing_config') throw new Error('Konfigurasi hanya melalui Live Drawing.');
    if (body.action === 'upsert') {
      const rows: Record<string, unknown>[] = Array.isArray(body.data) ? body.data : [body.data];
      if (!rows.length) return Response.json({ data: null, error: null });
      const fields = [...new Set(rows.flatMap((row: Record<string, unknown>) => Object.keys(row)))];
      const columns = fields.map(identifier).join(',');
      const primary = body.table === 'players' ? 'slot' : 'id';
      const updates = fields.filter(f => f !== primary).map(f => `${identifier(f)}=EXCLUDED.${identifier(f)}`).join(',');
      await localSql(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${table}, ${sqlLiteral(JSON.stringify(rows))}::jsonb) ON CONFLICT (${primary}) DO ${updates ? 'UPDATE SET ' + updates : 'NOTHING'}`);
    } else if (body.action === 'update' && body.filter) {
      const changes = Object.entries(body.data).map(([key, value]) => `${identifier(key)}=${sqlLiteral(value)}`).join(',');
      await localSql(`UPDATE ${table} SET ${changes}${where}`);
    } else if (body.action === 'delete' && body.filter) {
      await localSql(`DELETE FROM ${table}${where}`);
    } else throw new Error('Aksi tidak valid.');
    return Response.json({ data: null, error: null });
  } catch (error) {
    return Response.json({ data: null, error: { message: error instanceof Error ? error.message : 'Database lokal gagal.' } }, { status: 400 });
  }
}
