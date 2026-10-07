'use client';

import { useEffect, useRef, useState } from 'react';
import { Player } from '@/types/tournament';
import GrandFinalEmblem from './GrandFinalEmblem';

export type MatchActions = {
  isAdmin?: boolean;
  onSelectWinner?: (round: number, matchNumber: number, winnerSlot: number) => void | Promise<void>;
  onCancelWinner?: (round: number, matchNumber: number) => void | Promise<void>;
  onSetPlaying?: (round: number, matchNumber: number, playing: boolean) => void | Promise<void>;
  onOpenAddPlayer?: (slot: number) => void;
};

type Props = MatchActions & {
  isOpen: boolean;
  round: number;
  matchNumber: number;
  p1?: Player;
  p2?: Player;
  winnerSlot?: number | null;
  isPlaying?: boolean;
  firstRound?: number;
  onClose: () => void;
};

export function getMatchPlayerLabel(player: Player | undefined, round: number, matchNumber: number, index: number, firstRound = 1) {
  if (player?.name?.trim()) return player.name.trim();
  if (player?.slot == null && round > firstRound) {
    return `Winner R${round - 1}-M${String(matchNumber * 2 - 1 + index).padStart(2, '0')}`;
  }
  return 'TBD';
}

export default function MatchDetailModal({ isOpen, round, matchNumber, p1, p2, winnerSlot, isPlaying = false, firstRound = 1, isAdmin, onSelectWinner, onCancelWinner, onSetPlaying, onOpenAddPlayer, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roundLabel = round === 7 ? 'Grand final' : round === 6 ? 'Semifinal' : round === 5 ? 'Perempat final' : `${2 ** (8 - round)} Besar`;
  useEffect(() => {
    if (isOpen && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [isOpen]);

  async function updateWinner(slot?: number) {
    if (!isAdmin || busy) return;
    setBusy(true); setError('');
    try {
      if (slot != null) await onSelectWinner?.(round, matchNumber, slot);
      else await onCancelWinner?.(round, matchNumber);
    } catch (err) { setError(err instanceof Error ? err.message : 'Hasil gagal disimpan.'); }
    finally { setBusy(false); }
  }

  async function togglePlaying() {
    if (!isAdmin || busy || !onSetPlaying) return;
    setBusy(true); setError('');
    try { await onSetPlaying(round, matchNumber, !isPlaying); }
    catch (err) { setError(err instanceof Error ? err.message : 'Status bermain gagal disimpan.'); }
    finally { setBusy(false); }
  }

  function closeDialog() {
    if (busy) return;
    dialogRef.current?.close();
    onClose();
  }

  function outsideDialog(dialog: HTMLDialogElement, x: number, y: number) {
    const bounds = dialog.getBoundingClientRect();
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  }

  if (!isOpen) return null;
  return <dialog ref={dialogRef} className={`match-detail-dialog ${round === 7 ? 'match-detail-final' : ''}`} aria-labelledby={`match-detail-${round}-${matchNumber}`} onCancel={event => { event.preventDefault(); closeDialog(); }} onPointerDown={event => { backdropPress.current = event.target === event.currentTarget && outsideDialog(event.currentTarget, event.clientX, event.clientY); }} onClick={event => { if (!busy && backdropPress.current && event.target === event.currentTarget && outsideDialog(event.currentTarget, event.clientX, event.clientY)) closeDialog(); backdropPress.current = false; }}>
    <header className="match-detail-heading"><div className="match-detail-heading-title"><span className="match-detail-eyebrow">{roundLabel} <span aria-hidden="true">·</span> M{String(matchNumber).padStart(2, '0')}</span><h2 id={`match-detail-${round}-${matchNumber}`}>Detail pertandingan</h2></div><div className="match-detail-heading-actions">{isAdmin && onSetPlaying && winnerSlot == null && <button type="button" className={`match-detail-button match-detail-icon ${isPlaying ? 'match-detail-playing-button' : 'match-detail-quiet'}`} aria-label={isPlaying ? 'Berhenti bermain' : 'Mulai bermain'} title={isPlaying ? 'Berhenti bermain' : 'Mulai bermain'} aria-pressed={isPlaying} disabled={busy || (!isPlaying && (!p1?.name?.trim() || !p2?.name?.trim()))} onClick={togglePlaying}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7h10c2 0 3 1 3.5 3l1 7c.3 2-1.8 3.3-3.2 1.9L15.5 16h-7l-2.8 2.9C4.3 20.3 2.2 19 2.5 17l1-7C4 8 5 7 7 7Z" /><path d="M8 10v5M5.5 12.5h5" /><circle cx="16" cy="11" r=".7" /><circle cx="18" cy="14" r=".7" /></svg></button>}<button type="button" className="match-detail-button match-detail-quiet match-detail-icon" aria-label="Tutup" title="Tutup" disabled={busy} onClick={closeDialog}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div></header>
    <span className="sr-only" role="status">{winnerSlot != null ? 'Pertandingan selesai' : isPlaying ? 'Sedang bermain' : 'Belum bermain'}</span>
    {round === 7 && <GrandFinalEmblem className="match-detail-final-emblem" />}
    <div className="match-detail-versus">
      {[p1, p2].map((player, index) => <section className={`match-detail-player ${!player?.name?.trim() ? 'is-awaiting' : ''} ${player?.slot != null && player.slot === winnerSlot ? 'is-winner' : winnerSlot != null ? 'is-loser' : ''}`} key={index} aria-label={`Pemain ${index + 1}`}>
        <div className="match-detail-logo">{player?.team?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.team.logo_url} alt={player.team.name} />
        ) : <svg className="match-detail-logo-placeholder" width="52" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="M9 12h6" /></svg>}</div>
        <h3>{getMatchPlayerLabel(player, round, matchNumber, index, firstRound)}</h3>
        <p>{player?.team?.name || (player?.slot == null && round > firstRound ? 'Menunggu pemenang' : 'Belum pilih tim')}</p>
        <span className="match-detail-slot">{player?.slot != null ? `Slot ${player.slot}` : 'Menunggu pemain'}</span>
        {player?.slot != null && player.slot === winnerSlot && <strong className="match-detail-winner">Pemenang</strong>}
        {isAdmin && player?.slot != null && <div className="match-detail-player-actions">
          {onOpenAddPlayer && <button type="button" className="match-detail-button match-detail-quiet match-detail-icon" aria-label={`${player.name?.trim() ? 'Edit' : 'Isi'} pemain & tim: ${player.name?.trim() || `Slot ${player.slot}`}`} title={player.name?.trim() ? 'Edit pemain & tim' : 'Isi pemain & tim'} disabled={busy} onClick={() => { closeDialog(); onOpenAddPlayer(player.slot); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z" /><path d="m13 6 5 5" /></svg></button>}
          {onSelectWinner && winnerSlot == null && <button type="button" className="match-detail-button match-detail-primary match-detail-icon" aria-label={`Pilih pemenang: ${player.name?.trim() || `Slot ${player.slot}`}`} title="Pilih pemenang" disabled={busy || !player.name?.trim()} onClick={() => updateWinner(player.slot)}>W</button>}
        </div>}
      </section>)}
      <span className="match-detail-vs" aria-hidden="true">VS</span>
    </div>
    {error && <p className="match-detail-error" role="alert">{error}</p>}
    {isAdmin && winnerSlot != null && onCancelWinner && <footer className="match-detail-footer"><button type="button" className="match-detail-button match-detail-quiet" disabled={busy} onClick={() => updateWinner()}>Batalkan hasil</button></footer>}
    {busy && <p className="match-detail-status" role="status">Menyimpan…</p>}
  </dialog>;
}
