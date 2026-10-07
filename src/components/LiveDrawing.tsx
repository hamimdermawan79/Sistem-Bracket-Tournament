'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DrawingEntry, DrawingState, parseNames, wheelRanges } from '@/lib/drawing';

type Entry = { slot: number; name: string };
type DrawingTeam = { id: string; name: string };
const colors = ['#106b60', '#25958a', '#15544d', '#438c75', '#177c78', '#326b5c'];
const playerNameOrder = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

export default function LiveDrawing() {
  const [state, setState] = useState<DrawingState | null>(null);
  const [players, setPlayers] = useState<Entry[]>([]);
  const [teams, setTeams] = useState<DrawingTeam[]>([]);
  const [resultTeam, setResultTeam] = useState('');
  const resultKeyRef = useRef('');
  const [text, setText] = useState('');
  const [capacity, setCapacity] = useState(128);
  const [count, setCount] = useState(4);
  const [spinDuration, setSpinDuration] = useState(4.2);
  const [selected, setSelected] = useState('');
  const [retryName, setRetryName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [search, setSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [notice, setNotice] = useState('');
  const pickerRef = useRef<HTMLDialogElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const resetRef = useRef<HTMLDialogElement>(null);
  const [resetRequest, setResetRequest] = useState<Record<string, unknown> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState<number | null>(null);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (state?.pending && !resultDialogRef.current?.open && !pickerRef.current?.open && !settingsRef.current?.open && !resetRef.current?.open) resultDialogRef.current?.showModal();
    if (!state?.pending) resultDialogRef.current?.close();
  }, [state?.pending]);

  function apply(data: { state: DrawingState | null; players: Entry[]; teams: DrawingTeam[] }) {
    setState(data.state); setPlayers(data.players);
    setTeams(data.teams);
    const resultKey = data.state?.pending ? `${data.state.pending.player_id}:${data.state.pending.slot}:${data.state.revision}` : '';
    if (resultKeyRef.current !== resultKey) { setResultTeam(''); resultKeyRef.current = resultKey; }
    else setResultTeam(current => data.teams.some(t => t.id === current) ? current : '');
    setRetryName(data.state?.retry_name || '');
    setSelected(current => data.state?.pending?.player_id || data.state?.retry_player_id ||
      (data.state?.entries.some(e => e.id === current) ? current : ''));
  }
  async function load() {
    try {
      const res = await fetch('/api/admin/drawing', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      apply(data); setReady(true); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal memuat drawing.'); }
  }
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (lock.current) return;
      fetch('/api/admin/drawing', { cache: 'no-store' }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (active) { apply(data); setReady(true); }
      }).catch(err => { if (active) setError(err.message || 'Gagal memuat drawing.'); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); if (timer.current) clearTimeout(timer.current); };
  }, []);

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/drawing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, revision: state?.revision, ...extra }),
      });
      const data = await res.json();
      if (data.code === 'RESET_REQUIRED' && actionName === 'configure') {
        setResetRequest({ revision: state?.revision, ...extra }); resetRef.current?.showModal();
        setBusy(false); lock.current = false; return;
      }
      if (!res.ok) throw new Error(data.error);
      if (actionName === 'spin') {
        const wheel = extra.wheel as number;
        const range = wheelRanges(state!.capacity, state!.wheel_count)[wheel];
        const available = players.filter(p => p.slot >= range.start && p.slot <= range.end && !p.name?.trim()).map(p => p.slot);
        const segment = available.indexOf(data.state.pending.slot);
        const target = 360 - (segment + 0.5) * 360 / available.length;
        setSpinning(wheel);
        setRotations(prev => {
          const old = prev[wheel] || 0;
          const turns = Math.max(2, Math.ceil(state!.spin_duration_ms / 850));
          return { ...prev, [wheel]: old + turns * 360 + ((target - old % 360 + 360) % 360) };
        });
        timer.current = setTimeout(() => {
          apply(data); setSpinning(null); setBusy(false); lock.current = false;
        }, state!.spin_duration_ms);
        return;
      }
      if (actionName === 'retry') { setRetryName(state!.pending!.name); setSelected(state!.pending!.player_id); }
      if (actionName === 'save' || actionName === 'configure') { setSelected(''); setRetryName(''); }
      if (actionName === 'change_player') { setSelected(extra.player_id as string); pickerRef.current?.close(); }
      if (actionName === 'configure' || actionName === 'settings') { setShowSetup(false); setRotations({}); settingsRef.current?.close(); resetRef.current?.close(); setResetRequest(null); }
      if (['add_names', 'configure', 'settings'].includes(actionName)) { setText(''); setNotice('Tersimpan.'); }
      apply(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal.');
      // Recover a committed result if the response was lost or another admin edited it.
      try {
        const res = await fetch('/api/admin/drawing', { cache: 'no-store' });
        if (res.ok) apply(await res.json());
      } catch { /* Keep last known state on network failure. */ }
    }
    setBusy(false); lock.current = false;
  }

  let inputCount = 0; let inputError = '';
  try { inputCount = parseNames(text).length; } catch (err) { inputError = (err as Error).message; }
  const occupied = new Map(players.filter(p => p.name?.trim()).map(p => [p.slot, p.name]));
  const pending = state?.pending;
  const sortedTeams = [...teams].sort((a, b) => playerNameOrder.compare(a.name, b.name));
  const validResultTeam = teams.some(t => t.id === resultTeam);
  const names = state?.entries || [];
  const selectedName = names.find(e => e.id === selected)?.name || '';
  const nameCounts = new Map<string, number>();
  names.forEach(e => nameCounts.set(e.name.toLocaleLowerCase(), (nameCounts.get(e.name.toLocaleLowerCase()) || 0) + 1));

  const sortedNames = [...names].sort((a, b) => playerNameOrder.compare(a.name, b.name));
  const filteredNames = sortedNames.filter(e => e.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const tableNames = sortedNames.filter(e => e.name.toLocaleLowerCase().includes(tableSearch.trim().toLocaleLowerCase()));
  const nameRows = Array.from({ length: Math.ceil(tableNames.length / 4) }, (_, i) => tableNames.slice(i * 4, i * 4 + 4));
  const filledCount = players.filter(p => p.slot <= (state?.capacity || 128) && p.name?.trim()).length;
  const configuring = !state || showSetup;

  function openSettings() {
    setShowSetup(false);
    setCapacity(state?.capacity || 128);
    setCount(state?.wheel_count || 4);
    setSpinDuration((state?.spin_duration_ms || 4200) / 1000);
    setError('');
    settingsRef.current?.showModal();
  }

  function choosePlayer(entry: DrawingEntry) {
    const current = pending?.player_id || state?.retry_player_id;
    if (current && current !== entry.id) { void action('change_player', { player_id: entry.id }); return; }
    setSelected(entry.id);
    pickerRef.current?.close();
    if (pending) resultDialogRef.current?.showModal();
  }

  function submitSettings() {
    const payload = { text, capacity, wheel_count: count, spin_duration_ms: Math.round(spinDuration * 1000), revision: state?.revision };
    if (configuring && (state || filledCount > 0)) {
      setResetRequest(payload);
      resetRef.current?.showModal();
      return;
    }
    void action(configuring ? 'configure' : 'settings', payload);
  }

  return <main className="drawing-page drawing-simple">
    <header className="drawing-header">
      <h1>Live Drawing</h1>
      <div className="drawing-header-actions"><Link className="drawing-button drawing-button-quiet" href="/">Bracket</Link><button className="drawing-button" disabled={!ready || busy} aria-haspopup="dialog" onClick={openSettings}>Settings</button></div>
    </header>
    <div aria-live="polite">{error && <div className="drawing-error">{error}<button className="drawing-button" onClick={load} disabled={busy}>Muat ulang</button></div>}{notice && <div className="drawing-notice">{notice}</div>}</div>
    {!ready && !error && <p>Memuat…</p>}
    {ready && <div className="drawing-workspace">
      {state && <section className="drawing-summary" aria-label="Ringkasan drawing">
        <div className="drawing-stats"><div><strong>{state.capacity}</strong><span>Slot</span></div><div><strong>{names.length}</strong><span>Belum diundi</span></div><div><strong>{filledCount}</strong><span>Terisi</span></div></div>
        <div className="drawing-current-player"><span className="drawing-current-label">Pemain</span><button className="drawing-player-picker" aria-haspopup="dialog" disabled={busy || !names.length} onClick={() => {setSearch('');pickerRef.current?.showModal();searchRef.current?.focus();}}><strong>{selectedName || 'Pilih pemain'}</strong><span className="drawing-picker-button-label">{selected ? 'Ganti pemain' : 'Buka daftar'}</span></button>
          <div className="drawing-current-status">{pending && <button className="drawing-button drawing-button-quiet" onClick={() => resultDialogRef.current?.showModal()}>Lihat hasil</button>}{spinning !== null ? <span role="status">Memutar…</span> : retryName && <span>Spin ulang</span>}</div>
        </div>
      </section>}
      <section className="drawing-stage">
        {state ? <>
          <div className="drawing-wheels" data-wheel-columns={Math.min(state.wheel_count, 4)}>{wheelRanges(state.capacity, state.wheel_count).map((range, wheel) => {
            const available = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i).filter(n => !occupied.has(n));
            const gradient = available.length ? `conic-gradient(${available.map((_, i) => `${colors[i % colors.length]} ${i * 360 / available.length}deg ${(i + 1) * 360 / available.length}deg`).join(',')})` : '#263148';
            return <section className={`drawing-panel drawing-wheel-card ${spinning === wheel ? 'is-spinning' : ''}`} key={wheel}><div className="drawing-wheel-heading"><h3>Wheel {wheel + 1}</h3><span>{range.start}–{range.end}</span></div><button aria-label={`Spin wheel ${wheel + 1}`} className="drawing-wheel-button" disabled={busy || !!pending || !selected || !available.length} onClick={() => action('spin', { wheel, player_id: selected })}><span className="drawing-pointer" aria-hidden="true" /><span className="drawing-wheel" style={{ background: gradient, transform: `rotate(${rotations[wheel] || 0}deg)`, transitionDuration: `${state.spin_duration_ms}ms` }}>{available.map((n, i) => <span key={n} className="drawing-wheel-number" style={{ transform: `translate(-50%, -50%) rotate(${(i + .5) * 360 / available.length}deg) translateY(calc(var(--drawing-wheel-radius, 104px) * -1)) rotate(90deg)` }}>{n}</span>)}</span><span className="drawing-wheel-center">{available.length ? 'SPIN' : 'HABIS'}</span></button><div className="drawing-wheel-footer"><span>{available.length} tersisa</span><details><summary>Nomor</summary><p>{available.join(', ') || 'Habis.'}</p></details></div></section>;
          })}</div>
        </> : <div className="drawing-empty-stage"><h2>Belum ada drawing</h2><button className="drawing-button drawing-button-primary" onClick={openSettings}>Settings</button></div>}
      </section>
      {state && <section className="drawing-remaining" aria-labelledby="drawing-remaining-title">
        <div className="drawing-remaining-heading"><h2 id="drawing-remaining-title">Pemain tersisa</h2><input type="search" aria-label="Cari pemain tersisa" placeholder="Cari pemain" value={tableSearch} onChange={e => setTableSearch(e.target.value)} /></div>
        <div className="drawing-table-scroll"><table className="drawing-remaining-table" aria-label="Daftar pemain tersisa, urut A sampai Z"><tbody>{nameRows.map((row, rowIndex) => <tr key={row[0].id}>{Array.from({length:4}, (_, column) => {const entry = row[column];return <td key={entry?.id || `empty-${column}`}>{entry && <button className={`drawing-name-cell ${selected === entry.id ? 'is-selected' : ''}`} disabled={busy} aria-pressed={selected === entry.id} aria-label={`Pilih ${entry.name}, entri ${rowIndex * 4 + column + 1}`} onDoubleClick={() => choosePlayer(entry)} onClick={event => { if (event.detail === 0) choosePlayer(entry); }}>{entry.name}</button>}</td>;})}</tr>)}{!tableNames.length && <tr><td colSpan={4} className="drawing-table-empty">{names.length ? 'Pemain tidak ditemukan.' : 'Tidak ada pemain tersisa.'}</td></tr>}</tbody></table></div>
      </section>}
    </div>}
    <dialog ref={settingsRef} className="drawing-picker-dialog drawing-settings-dialog" aria-labelledby="drawing-settings-title"><div className="drawing-picker-header"><h2 id="drawing-settings-title">Settings</h2><button className="drawing-button drawing-button-quiet" onClick={() => settingsRef.current?.close()}>Tutup</button></div>
      {state && <div className="drawing-settings-tabs"><button className={`drawing-button ${!showSetup ? 'drawing-button-primary' : ''}`} disabled={busy} onClick={() => {setShowSetup(false);setCapacity(state.capacity);setCount(state.wheel_count);setSpinDuration(state.spin_duration_ms / 1000);}}>Sesi aktif</button><button className={`drawing-button ${showSetup ? 'drawing-button-primary' : ''}`} disabled={busy} onClick={() => setShowSetup(true)}>Drawing baru</button></div>}
      <div className="drawing-fields"><label>Maksimum pemain<input type="number" min={2} max={128} disabled={!configuring || busy} value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></label><label>Jumlah wheel<input type="number" min={1} max={capacity} disabled={busy} value={count} onChange={e => setCount(Number(e.target.value))} /></label></div>
      <label>Durasi spin (detik)<input type="number" min={0.5} max={15} step={0.1} value={spinDuration} disabled={busy} onChange={e => setSpinDuration(Number(e.target.value))} /></label>
      <label htmlFor="drawing-names">{configuring ? 'Daftar pemain' : 'Tambah pemain'}</label><textarea id="drawing-names" value={text} onChange={e => setText(e.target.value)} rows={7} placeholder={'Satu baris, satu pemain'} />
      <div className="drawing-input-caption"><span>{state && !showSetup ? `${state.initial_count} terdaftar` : ''}</span><strong>{inputCount} nama</strong></div>
      {inputError && <p className="drawing-field-error">{inputError}</p>}{error && <p className="drawing-field-error" role="alert">{error}</p>}
      {pending && !configuring && <p className="drawing-helper">Simpan atau ulang hasil spin terlebih dahulu.</p>}
      <button className="drawing-button drawing-button-primary drawing-button-full" disabled={busy || !!inputError || (!!pending && !configuring) || (configuring && !inputCount)} onClick={submitSettings}>{configuring ? 'Buat drawing' : 'Simpan settings'}</button>
      {state && !showSetup && <details className="drawing-settings-positions"><summary>Posisi bracket</summary><div className="drawing-fields"><label>Dari slot<input type="number" min={1} max={state.capacity} value={from} onChange={e => setFrom(Number(e.target.value))} /></label><label>Ke slot<input type="number" min={1} max={state.capacity} value={to} onChange={e => setTo(Number(e.target.value))} /></label><button className="drawing-button" disabled={busy || !!pending} onClick={() => action('move', { from, to })}>Pindah / tukar</button></div><div className="drawing-bracket">{['Kiri', 'Kanan'].map((side, i) => <div key={side}><h3>{side}</h3>{Array.from({ length: i ? Math.floor(state.capacity / 2) : Math.ceil(state.capacity / 2) }, (_, j) => j + 1 + (i ? Math.ceil(state.capacity / 2) : 0)).map(slot => <div className="drawing-slot" key={slot}><span>#{slot}</span><span>{occupied.get(slot) || 'Kosong'}</span></div>)}</div>)}</div></details>}
    </dialog>
    <dialog ref={resetRef} className="drawing-picker-dialog drawing-result-dialog" aria-labelledby="drawing-reset-title" onCancel={event => { if (busy) event.preventDefault(); }}><div className="drawing-picker-header"><h2 id="drawing-reset-title">Kosongkan bracket?</h2></div><p>Pemain, antrean drawing, dan hasil pertandingan lama akan dihapus.</p>{error && <p className="drawing-field-error" role="alert">{error}</p>}<div className="drawing-result-actions"><button className="drawing-button drawing-button-quiet" disabled={busy} onClick={() => { resetRef.current?.close(); setResetRequest(null); }}>Batal</button><button className="drawing-button drawing-button-primary" disabled={busy || !resetRequest} onClick={() => action('configure', { ...resetRequest, reset_existing: true })}>Kosongkan &amp; mulai</button></div></dialog>
    <dialog ref={resultDialogRef} className="drawing-picker-dialog drawing-result-dialog" aria-labelledby="drawing-result-title"><div className="drawing-picker-header"><h2 id="drawing-result-title">Hasil drawing</h2><button className="drawing-button drawing-button-quiet" onClick={() => resultDialogRef.current?.close()}>Tutup</button></div>{pending && <div className="drawing-result"><div className="drawing-result-orbit"><strong>#{pending.slot}</strong></div><h3>{pending.name}</h3><p>Wheel {pending.wheel + 1} · {pending.slot <= Math.ceil(state!.capacity / 2) ? 'Kiri' : 'Kanan'}</p>{error && <p className="drawing-field-error" role="alert">{error}</p>}<label className="drawing-result-team" htmlFor="drawing-result-team">Tim<select id="drawing-result-team" value={resultTeam} required disabled={busy || !teams.length} onChange={e => setResultTeam(e.target.value)}><option value="">Pilih tim</option>{sortedTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>{!teams.length && <p className="drawing-helper">Tambahkan tim melalui <Link href="/admin/teams">Kelola Tim</Link>.</p>}<div className="drawing-result-actions"><button className="drawing-button drawing-button-quiet" disabled={busy} onClick={() => action('retry')}>Ulang</button><button className="drawing-button drawing-button-primary" disabled={busy || !validResultTeam} onClick={() => action('save', { team_id: resultTeam })}>Simpan</button></div></div>}</dialog>
    <dialog ref={pickerRef} className="drawing-picker-dialog" aria-labelledby="player-picker-title"><div className="drawing-picker-header"><h2 id="player-picker-title">Pilih pemain</h2><button className="drawing-button drawing-button-quiet" onClick={() => pickerRef.current?.close()}>Tutup</button></div><label className="drawing-picker-search"><input ref={searchRef} type="search" aria-label="Cari pemain" placeholder="Cari pemain" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="drawing-picker-count"><span>{filteredNames.length} pemain</span><span>A–Z</span></div>{(pending || retryName) && <p className="drawing-helper">Ganti pemain membatalkan hasil sementara.</p>}{error && <p className="drawing-field-error" role="alert">{error}</p>}<div className="drawing-picker-list">{filteredNames.length ? filteredNames.map((entry, index) => <button className={`drawing-picker-option ${selected === entry.id ? 'selected' : ''}`} key={entry.id} disabled={busy} onClick={() => choosePlayer(entry)}><strong>{entry.name}</strong>{(nameCounts.get(entry.name.toLocaleLowerCase()) || 0) > 1 && <span>Entri {index + 1}</span>}{selected === entry.id && <span>Dipilih</span>}</button>) : <p>Tidak ada pemain.</p>}</div></dialog>
  </main>;
}
