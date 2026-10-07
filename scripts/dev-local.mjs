import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';

const bin = process.env.LOCAL_PG_BIN || 'C:\\Program Files\\PostgreSQL\\16\\bin';
const root = process.cwd();
const data = path.join(root, '.local-tournament', 'pg');
const port = process.env.LOCAL_PG_PORT || '55439';
const executable = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
function run(name, args) {
  const result = spawnSync(executable(name), args, { windowsHide: true, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error(`${name} gagal`);
}
mkdirSync(path.dirname(data), { recursive: true });
if (!existsSync(path.join(data, 'PG_VERSION'))) run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8']);
const status = spawnSync(executable('pg_ctl'), ['-D', data, 'status'], { windowsHide: true, stdio: 'ignore' });
if (status.status !== 0) run('pg_ctl', ['-D', data, '-l', path.join(root, '.local-tournament', 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, 'start']);
run('psql', ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', 'scripts/local-schema.sql', '-f', 'migrations/001_live_drawing.sql']);
console.log('Preview lokal: data tersimpan di .local-tournament dan tidak memakai Supabase.');
const child = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--hostname', '127.0.0.1', '--port', process.env.PORT || '3000'], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, LOCAL_TOURNAMENT: 'true', NEXT_PUBLIC_LOCAL_TOURNAMENT: 'true', LOCAL_PG_BIN: bin, LOCAL_PG_PORT: port },
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', code => process.exit(code || 0));
