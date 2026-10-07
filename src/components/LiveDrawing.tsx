'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DrawingEntry, DrawingResult, DrawingState, parseNames, wheelRanges } from '@/lib/drawing';

type Entry = { slot: number; name: string };
type DrawingTeam = { id: string; name: string; logo_url: string };
type DrawingData = { state: DrawingState | null; players: Entry[]; teams: DrawingTeam[] };
const colors = ['#106b60', '#25958a', '#15544d', '#438c75', '#177c78', '#326b5c'];
const nameOrder = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

function TeamLogo({ team }: { team?: DrawingTeam }) {
  if (!team?.logo_url) return <span className="drawing-team-placeholder" aria-label="Belum ada logo tim">—</span>;
  // Logos can be external URLs or uploaded data URLs from the team editor.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="drawing-team-logo" src={team.logo_url} alt={`Logo ${team.name}`} width={40} height={40} />;
}

export default function LiveDrawing() {
  const [state, setState] = useState<DrawingState | null>(null);
  const [players, setPlayers] = useState<Entry[]>([]);
  const [teams, setTeams] = useState<DrawingTeam[]>([]);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [activeWheel, setActiveWheel] = useState<number | null>(null);
  const [rerollPlayer, setRerollPlayer] = useState<string | null>(null);
  const [rerollComplete, setRerollComplete] = useState(false);
  const [text, setText] = useState('');
  const [capacity, setCapacity] = useState(128);
  const [count, setCount] = useState(4);
  const [spinDuration, setSpinDuration] = useState(4.2);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2);
  const [resetRequest, setResetRequest] = useState<Record<string, unknown> | null>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const resetRef = useRef<HTMLDialogElement>(null);
  const resultRef = useRef<HTMLDialogElement>(null);
  const rerollRef = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = state?.pending_batch || [];
  const hasPending = pending.length > 0;
  const rerollResult = pending.find(result => result.player_id === rerollPlayer);
  const names = state?.entries || [];
  const occupied = new Map(players.filter(p => p.name?.trim()).map(p => [p.slot, p.name]));
  const ranges = state ? wheelRanges(state.capacity, state.wheel_count) : [];
  const sortedTeams = [...teams].sort((a, b) => nameOrder.compare(a.name, b.name));
  const tableNames = [...names].sort((a, b) => nameOrder.compare(a.name, b.name)).filter(e => e.name.toLocaleLowerCase().includes(tableSearch.trim().toLocaleLowerCase()));
  const nameRows = Array.from({ length: Math.ceil(tableNames.length / 4) }, (_, i) => tableNames.slice(i * 4, i * 4 + 4));
  const selections = Object.entries(assignments).map(([wheel, player_id]) => ({ wheel: Number(wheel), player_id }));
  const filledCount = players.filter(p => p.slot <= (state?.capacity || 128) && p.name?.trim()).length;
  const configuring = !state || showSetup;
  const allTeamsSelected = hasPending && pending.every(result => teams.some(team => team.id === result.team_id));
  let inputCount = 0; let inputError = '';
  try { inputCount = parseNames(text).length; } catch (err) { inputError = (err as Error).message; }

  useEffect(() => {
    if (hasPending && !rerollPlayer && !resultRef.current?.open && !settingsRef.current?.open && !resetRef.current?.open) resultRef.current?.showModal();
    if (!hasPending) { resultRef.current?.close(); rerollRef.current?.close(); }
  }, [state?.pending_batch, hasPending, rerollPlayer]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  function apply(data: DrawingData) {
    setState(data.state); setPlayers(data.players); setTeams(data.teams);
    setAssignments(current => Object.fromEntries(Object.entries(current).filter(([wheel, id]) => Number(wheel) < (data.state?.wheel_count || 0) && data.state?.entries.some(entry => entry.id === id))));
    setActiveWheel(current => current !== null && current < (data.state?.wheel_count || 0) ? current : null);
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
    refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); if (timer.current) clearTimeout(timer.current); };
  }, []);

  function availableSlots(wheel: number, retry?: DrawingResult) {
    const range = ranges[wheel];
    if (!range) return [];
    return Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i)
      .filter(slot => !occupied.has(slot) && !pending.some(result => result.slot === slot && result.player_id !== retry?.player_id));
  }

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    if (actionName === 'retry_one') setRerollComplete(false);
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
      if (actionName === 'spin_all' || actionName === 'retry_one') {
        const animated: DrawingResult[] = actionName === 'spin_all' ? data.state.pending_batch : data.state.pending_batch.filter((result: DrawingResult) => result.player_id === extra.player_id);
        setSpinning(animated.map(result => result.wheel));
        setRotations(prev => {
          const next = { ...prev };
          for (const result of animated) {
            const available = availableSlots(result.wheel, pending.find(row => row.player_id === result.player_id));
            const target = 360 - (available.indexOf(result.slot) + 0.5) * 360 / available.length;
            const old = prev[result.wheel] || 0;
            const turns = Math.max(2, Math.ceil(state!.spin_duration_ms / 850));
            next[result.wheel] = old + turns * 360 + ((target - old % 360 + 360) % 360);
          }
          return next;
        });
        // Drawing motion is the requested interaction, including when OS animations are disabled.
        const duration = state!.spin_duration_ms;
        timer.current = setTimeout(() => {
          apply(data); setSpinning([]); setBusy(false); lock.current = false;
          if (actionName === 'retry_one') setRerollComplete(true);
        }, duration);
        return;
      }
      if (actionName === 'configure') { setAssignments({}); setActiveWheel(null); setRerollPlayer(null); }
      if (actionName === 'save_all') setRerollPlayer(null);
      if (actionName === 'save_all') { setNotice('Semua hasil drawing tersimpan.'); resultRef.current?.close(); }
      if (actionName === 'configure' || actionName === 'settings') { setShowSetup(false); setRotations({}); settingsRef.current?.close(); resetRef.current?.close(); setResetRequest(null); }
      if (['add_names', 'configure', 'settings'].includes(actionName)) { setText(''); setNotice('Tersimpan.'); }
      apply(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal.');
      // Recover server reservations if a committed response was lost.
      try {
        const res = await fetch('/api/admin/drawing', { cache: 'no-store' });
        if (res.ok) apply(await res.json());
      } catch { /* Keep last known state on network failure. */ }
    }
    setBusy(false); lock.current = false;
  }

  function choosePlayer(entry: DrawingEntry) {
    if (busy || hasPending) return;
    if (activeWheel === null) { setNotice('Klik kartu wheel terlebih dahulu, lalu double-click nama pemain.'); return; }
    const other = selections.find(selection => selection.player_id === entry.id && selection.wheel !== activeWheel);
    if (other) { setNotice(`${entry.name} sudah dipilih untuk wheel ${other.wheel + 1}.`); return; }
    setAssignments(current => ({ ...current, [activeWheel]: entry.id }));
    setNotice(`${entry.name} masuk ke wheel ${activeWheel + 1}.`);
  }
  function openSettings() {
    setShowSetup(false); setCapacity(state?.capacity || 128); setCount(state?.wheel_count || 4);
    setSpinDuration((state?.spin_duration_ms || 4200) / 1000); setError(''); settingsRef.current?.showModal();
  }
  function submitSettings() {
    const payload = { text, capacity, wheel_count: count, spin_duration_ms: Math.round(spinDuration * 1000), revision: state?.revision };
    if (configuring && (state || filledCount > 0 || hasPending)) { setResetRequest(payload); resetRef.current?.showModal(); return; }
    void action(configuring ? 'configure' : 'settings', payload);
  }
  function openReroll(result: DrawingResult) {
    setError(''); setRerollComplete(false); resultRef.current?.close(); setRerollPlayer(result.player_id); rerollRef.current?.showModal();
  }
  function closeReroll() {
    if (busy) return;
    rerollRef.current?.close(); setRerollPlayer(null);
  }
  function selectWheel(wheel: number) {
    if (busy || hasPending) return;
    setActiveWheel(wheel);
    setNotice('');
  }
  function wheelFace(wheel: number, available: number[]) {
    const gradient = available.length ? `conic-gradient(${available.map((_, i) => `${colors[i % colors.length]} ${i * 360 / available.length}deg ${(i + 1) * 360 / available.length}deg`).join(',')})` : '#263148';
    return <><span className="drawing-pointer" aria-hidden="true" /><span className="drawing-wheel" style={{ background: gradient, transform: `rotate(${rotations[wheel] || 0}deg)`, transitionDuration: `${state?.spin_duration_ms || 4200}ms` }}>{available.map((n, i) => <span key={n} className="drawing-wheel-number" style={{ transform: `translate(-50%, -50%) rotate(${(i + .5) * 360 / available.length}deg) translateY(calc(var(--drawing-wheel-radius, 104px) * -1)) rotate(90deg)` }}>{n}</span>)}</span></>;
  }

  return <main className="drawing-page drawing-simple">
    <header className="drawing-header"><div className="drawing-header-title"><h1>Live Drawing</h1>{state && <div className="drawing-header-kpis" aria-label="Ringkasan drawing"><span><strong>{state.capacity}</strong> Slot</span><span><strong>{names.length}</strong> Tersisa</span><span><strong>{filledCount}</strong> Terisi</span></div>}</div><div className="drawing-header-actions"><Link className="drawing-button drawing-button-quiet" href="/">Bracket</Link><button className="drawing-button" disabled={!ready || busy} aria-haspopup="dialog" onClick={openSettings}>Settings</button></div></header>
    <div className="drawing-toast-container">
      {error && <div className="drawing-error" role="alert"><span>{error}</span><button className="drawing-button" onClick={load} disabled={busy}>Muat ulang</button><button className="drawing-toast-close" aria-label="Tutup pesan error" onClick={() => setError('')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>}
      <div role="status" aria-live="polite" aria-atomic="true">{notice && <div className="drawing-notice"><span>{notice}</span><button className="drawing-toast-close" aria-label="Tutup notifikasi" onClick={() => setNotice('')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>}</div>
    </div>
    {!ready && !error && <p>Memuat…</p>}
    {ready && <div className="drawing-workspace">
      <section className="drawing-stage">
        {state ? <><div className="drawing-wheel-toolbar">
          {hasPending ? <button className="drawing-button drawing-bulk-spin" disabled={busy} onClick={() => resultRef.current?.showModal()}>Lihat hasil</button> : <button className="drawing-button drawing-button-primary drawing-bulk-spin" disabled={busy || !selections.length} onClick={() => action('spin_all', { selections })}>{spinning.length ? 'Memutar…' : 'Spin semua'}</button>}
        </div><div className="drawing-wheels" data-wheel-columns={Math.min(state.wheel_count, 4)}>{ranges.map((range, wheel) => {
          const result = pending.find(row => row.wheel === wheel);
          const available = availableSlots(wheel, result);
          const assigned = names.find(entry => entry.id === assignments[wheel]);
          return <section className={`drawing-panel drawing-wheel-card ${activeWheel === wheel ? 'is-active' : ''} ${spinning.includes(wheel) ? 'is-spinning' : ''}`} key={wheel}>
            <button className="drawing-wheel-card-selector" aria-label={`Pilih wheel ${wheel + 1}`} aria-pressed={activeWheel === wheel} disabled={busy || hasPending || !available.length} onClick={() => selectWheel(wheel)} />
            <div className="drawing-wheel-heading"><h3>Wheel {wheel + 1}</h3><span>{range.start}–{range.end}</span></div>
            <div className="drawing-wheel-button">{wheelFace(wheel, available)}<button className="drawing-wheel-center" aria-label={`Spin wheel ${wheel + 1}`} disabled={busy || hasPending || !assigned || !available.length} onClick={() => action('spin_all', { selections: [{ wheel, player_id: assigned!.id }] })}>{spinning.includes(wheel) ? 'SPIN' : !available.length ? 'HABIS' : assigned ? 'SPIN' : `W${wheel + 1}`}</button></div>
            <div className="drawing-wheel-assignment"><strong>{result?.name || assigned?.name || 'Belum ada pemain'}</strong>{assigned && !hasPending && <button className="drawing-button drawing-button-quiet" aria-label={`Lepas pemain wheel ${wheel + 1}`} disabled={busy} onClick={() => setAssignments(current => Object.fromEntries(Object.entries(current).filter(([key]) => Number(key) !== wheel)))}>Lepas</button>}{result && <span>#{result.slot}</span>}</div>
            <div className="drawing-wheel-footer"><span>{available.length} tersedia</span><details><summary>Nomor</summary><p>{available.join(', ') || 'Habis.'}</p></details></div>
          </section>;
        })}</div></> : <div className="drawing-empty-stage"><h2>Belum ada drawing</h2><button className="drawing-button drawing-button-primary" onClick={openSettings}>Settings</button></div>}
      </section>
      {state && <section className="drawing-remaining" aria-labelledby="drawing-remaining-title">
        <div className="drawing-remaining-heading"><h2 id="drawing-remaining-title">Pemain tersisa</h2><input type="search" aria-label="Cari pemain tersisa" placeholder="Cari pemain" value={tableSearch} onChange={e => setTableSearch(e.target.value)} /></div>
        <div className="drawing-table-scroll"><table className="drawing-remaining-table" aria-label="Daftar pemain tersisa, urut A sampai Z"><tbody>{nameRows.map((row, rowIndex) => <tr key={row[0].id}>{Array.from({length:4}, (_, column) => {
          const entry = row[column]; const selection = selections.find(item => item.player_id === entry?.id); const result = pending.find(item => item.player_id === entry?.id);
          return <td key={entry?.id || `empty-${column}`}>{entry && <button className={`drawing-name-cell ${selection || result ? 'is-selected' : ''}`} disabled={busy || hasPending || (!!selection && selection.wheel !== activeWheel)} aria-pressed={!!selection || !!result} aria-label={`Pilih ${entry.name}, entri ${rowIndex * 4 + column + 1}`} onDoubleClick={() => choosePlayer(entry)} onClick={event => { if (event.detail === 0) choosePlayer(entry); }}><span>{entry.name}</span>{(selection || result) && <small>Wheel {(result?.wheel ?? selection!.wheel) + 1}</small>}</button>}</td>;
        })}</tr>)}{!tableNames.length && <tr><td colSpan={4} className="drawing-table-empty">{names.length ? 'Pemain tidak ditemukan.' : 'Tidak ada pemain tersisa.'}</td></tr>}</tbody></table></div>
      </section>}
    </div>}
    <dialog ref={settingsRef} className="drawing-picker-dialog drawing-settings-dialog" aria-labelledby="drawing-settings-title"><div className="drawing-picker-header"><h2 id="drawing-settings-title">Settings</h2><button className="drawing-button drawing-button-quiet" disabled={busy} onClick={() => settingsRef.current?.close()}>Tutup</button></div>
      {state && <div className="drawing-settings-tabs"><button className={`drawing-button ${!showSetup ? 'drawing-button-primary' : ''}`} disabled={busy} onClick={() => {setShowSetup(false);setCapacity(state.capacity);setCount(state.wheel_count);setSpinDuration(state.spin_duration_ms / 1000);}}>Sesi aktif</button><button className={`drawing-button ${showSetup ? 'drawing-button-primary' : ''}`} disabled={busy} onClick={() => setShowSetup(true)}>Drawing baru</button></div>}
      <div className="drawing-fields"><label>Maksimum pemain<input type="number" min={2} max={128} disabled={!configuring || busy} value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></label><label>Jumlah wheel<input type="number" min={1} max={capacity} disabled={busy} value={count} onChange={e => setCount(Number(e.target.value))} /></label></div>
      <label>Durasi spin (detik)<input type="number" min={0.5} max={15} step={0.1} value={spinDuration} disabled={busy} onChange={e => setSpinDuration(Number(e.target.value))} /></label>
      <label htmlFor="drawing-names">{configuring ? 'Daftar pemain' : 'Tambah pemain'}</label><textarea id="drawing-names" value={text} disabled={busy} onChange={e => setText(e.target.value)} rows={7} placeholder="Satu baris, satu pemain" />
      <div className="drawing-input-caption"><span>{state && !showSetup ? `${state.initial_count} terdaftar` : ''}</span><strong>{inputCount} nama</strong></div>
      {inputError && <p className="drawing-field-error">{inputError}</p>}{error && <p className="drawing-field-error" role="alert">{error}</p>}
      {hasPending && !configuring && <p className="drawing-helper">Simpan seluruh hasil spin terlebih dahulu.</p>}
      <button className="drawing-button drawing-button-primary drawing-button-full" disabled={busy || !!inputError || (hasPending && !configuring) || (configuring && !inputCount)} onClick={submitSettings}>{configuring ? 'Buat drawing' : 'Simpan settings'}</button>
      {state && !showSetup && <details className="drawing-settings-positions"><summary>Posisi bracket</summary><div className="drawing-fields"><label>Dari slot<input type="number" min={1} max={state.capacity} value={from} onChange={e => setFrom(Number(e.target.value))} /></label><label>Ke slot<input type="number" min={1} max={state.capacity} value={to} onChange={e => setTo(Number(e.target.value))} /></label><button className="drawing-button" disabled={busy || hasPending} onClick={() => action('move', { from, to })}>Pindah / tukar</button></div><div className="drawing-bracket">{['Kiri', 'Kanan'].map((side, i) => <div key={side}><h3>{side}</h3>{Array.from({ length: i ? Math.floor(state.capacity / 2) : Math.ceil(state.capacity / 2) }, (_, j) => j + 1 + (i ? Math.ceil(state.capacity / 2) : 0)).map(slot => <div className="drawing-slot" key={slot}><span>#{slot}</span><span>{occupied.get(slot) || 'Kosong'}</span></div>)}</div>)}</div></details>}
    </dialog>
    <dialog ref={resetRef} className="drawing-picker-dialog drawing-result-dialog" aria-labelledby="drawing-reset-title" onCancel={event => { if (busy) event.preventDefault(); }}><div className="drawing-picker-header"><h2 id="drawing-reset-title">Kosongkan bracket?</h2></div><p>Pemain, antrean drawing, dan hasil pertandingan lama akan dihapus.</p>{error && <p className="drawing-field-error" role="alert">{error}</p>}<div className="drawing-result-actions"><button className="drawing-button drawing-button-quiet" disabled={busy} onClick={() => {resetRef.current?.close();setResetRequest(null);}}>Batal</button><button className="drawing-button drawing-button-primary" disabled={busy || !resetRequest} onClick={() => action('configure', { ...resetRequest, reset_existing: true })}>Kosongkan &amp; mulai</button></div></dialog>
    <dialog ref={resultRef} className="drawing-picker-dialog drawing-batch-dialog" aria-labelledby="drawing-result-title" onCancel={event => {if (busy) event.preventDefault();}}>
      <div className="drawing-picker-header"><div><h2 id="drawing-result-title">Hasil drawing</h2><p>{pending.length} pemain · pilih tim untuk setiap hasil.</p></div><button className="drawing-button drawing-button-quiet" disabled={busy} onClick={() => resultRef.current?.close()}>Tutup</button></div>
      {error && <p className="drawing-field-error" role="alert">{error}</p>}
      <div className="drawing-batch-results">{pending.map(result => {
        const team = teams.find(item => item.id === result.team_id);
        return <section className="drawing-batch-row" key={result.player_id} aria-label={`Hasil ${result.name}`}>
          <div className="drawing-batch-player"><strong>{result.name}</strong><span>Wheel {result.wheel + 1}</span></div><strong className="drawing-batch-number">#{result.slot}</strong>
          <button className="drawing-button drawing-button-quiet drawing-refresh-button" disabled={busy || availableSlots(result.wheel, result).filter(slot => slot !== result.slot).length === 0} aria-label={`Ulang ${result.name}`} title={`Spin ulang ${result.name}`} onClick={() => openReroll(result)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></svg></button>
          <label className="drawing-result-team"><span className="sr-only">Tim {result.name}</span><select aria-label={`Tim ${result.name}`} value={team?.id || ''} disabled={busy || !teams.length} onChange={e => action('batch_team', { player_id: result.player_id, team_id: e.target.value || null })}><option value="">Pilih tim</option>{sortedTeams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><TeamLogo team={team} />
        </section>;
      })}</div>
      {!teams.length && <p className="drawing-helper">Tambahkan tim melalui <Link href="/admin/teams">Kelola Tim</Link>.</p>}
      <p className="drawing-helper">Hasil belum masuk bracket. Lengkapi semua tim, lalu simpan bersama.</p>
      <button className="drawing-button drawing-button-primary drawing-button-full" disabled={busy || !allTeamsSelected} onClick={() => action('save_all')}>{busy ? 'Memproses…' : 'Simpan semua hasil'}</button>
    </dialog>
    <dialog ref={rerollRef} className="drawing-picker-dialog drawing-reroll-dialog" aria-labelledby="drawing-reroll-title" onCancel={event => {if (busy) event.preventDefault(); else setRerollPlayer(null);}}>
      <div className="drawing-picker-header"><h2 id="drawing-reroll-title">Spin ulang {rerollResult?.name}</h2><button className="drawing-button drawing-button-quiet" disabled={busy} onClick={closeReroll}>Kembali</button></div>
      {rerollResult && <><div className={`drawing-wheel-button drawing-reroll-wheel ${spinning.includes(rerollResult.wheel) ? 'is-spinning' : ''}`} aria-label={`Wheel ulang ${rerollResult.name}`}>{wheelFace(rerollResult.wheel, availableSlots(rerollResult.wheel, rerollResult))}<button className="drawing-wheel-center" aria-label={`Spin ulang ${rerollResult.name}`} disabled={busy || availableSlots(rerollResult.wheel, rerollResult).filter(slot => slot !== rerollResult.slot).length === 0} onClick={() => action('retry_one', { player_id: rerollResult.player_id })}>{spinning.includes(rerollResult.wheel) ? 'SPIN' : `W${rerollResult.wheel + 1}`}</button></div>{error && <p className="drawing-field-error" role="alert">{error}</p>}<output className="drawing-reroll-result" aria-live="polite"><span>Result</span><strong>{busy ? '…' : rerollComplete ? `#${rerollResult.slot}` : '—'}</strong></output></>}
    </dialog>
  </main>;
}
