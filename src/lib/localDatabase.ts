import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
export function sqlLiteral(value: unknown): string {
  if (value == null) return 'NULL';
  return "'" + String(value).replaceAll("'", "''") + "'";
}
export async function localSql(sql: string) {
  if (process.env.LOCAL_TOURNAMENT !== 'true') throw new Error('Mode lokal tidak aktif.');
  const bin = process.env.LOCAL_PG_BIN || 'C:\\Program Files\\PostgreSQL\\16\\bin';
  try {
    const { stdout } = await run(path.join(bin, process.platform === 'win32' ? 'psql.exe' : 'psql'), [
      '-h', '127.0.0.1', '-p', process.env.LOCAL_PG_PORT || '55439', '-U', 'postgres', '-d', 'postgres',
      '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim() ? JSON.parse(stdout.trim()) : null;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr || '';
    throw new Error(stderr.match(/ERROR:\s*(.*)/)?.[1] || 'Database lokal tidak tersedia. Jalankan npm run dev:local.');
  }
}
export async function localDrawingData() {
  const state = await localSql("SELECT row_to_json(s) FROM live_drawing s WHERE id=1");
  const players = await localSql("SELECT coalesce(json_agg(p ORDER BY slot),'[]') FROM (SELECT slot,name FROM players) p");
  const teams = await localSql("SELECT coalesce(json_agg(t ORDER BY name),'[]') FROM (SELECT id,name FROM teams) t");
  return { state, players, teams };
}
