'use client';

import { useEffect, useRef, useState } from 'react';
import { Player } from '@/types/tournament';
import GrandFinalEmblem from './GrandFinalEmblem';

export type MatchActions = {
  isAdmin?: boolean;
  onSelectWinner?: (round: number, matchNumber: number, winnerSlot: number) => void | Promise<void>;
  onCancelWinner?: (round: number, matchNumber: number) => void | Promise<void>;
  onOpenAddPlayer?: (slot: number) => void;
};

type Props = MatchActions & {
  isOpen: boolean;
  round: number;
  matchNumber: number;
  p1?: Player;
  p2?: Player;
  winnerSlot?: number | null;
  onClose: () => void;
};

export default function MatchDetailModal({ isOpen, round, matchNumber, p1, p2, winnerSlot, isAdmin, onSelectWinner, onCancelWinner, onOpenAddPlayer, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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

  if (!isOpen) return null;
  return <dialog ref={dialogRef} className={`match-detail-dialog ${round === 7 ? 'match-detail-final' : ''}`} aria-labelledby={`match-detail-${round}-${matchNumber}`} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header className="match-detail-heading"><h2 id={`match-detail-${round}-${matchNumber}`}>Detail pertandingan</h2><button type="button" className="match-detail-button match-detail-quiet" disabled={busy} onClick={onClose}>Tutup</button></header>
    {round === 7 && <GrandFinalEmblem className="match-detail-final-emblem" />}
    <div className="match-detail-versus">
      {[p1, p2].map((player, index) => <section className={`match-detail-player ${player?.slot != null && player.slot === winnerSlot ? 'is-winner' : ''}`} key={index} aria-label={`Pemain ${index + 1}`}>
        <div className="match-detail-logo">{player?.team?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.team.logo_url} alt={player.team.name} />
        ) : <span>—</span>}</div>
        <h3>{player?.name?.trim() || 'Slot kosong'}</h3>
        <p>{player?.team?.name || 'Belum pilih tim'}</p>
        <span className="match-detail-slot">{player?.slot != null ? `Slot ${player.slot}` : 'Menunggu pemain'}</span>
        {player?.slot != null && player.slot === winnerSlot && <strong className="match-detail-winner">Pemenang</strong>}
        {isAdmin && player?.slot != null && <div className="match-detail-player-actions">
          {onOpenAddPlayer && <button type="button" className="match-detail-button match-detail-quiet" disabled={busy} onClick={() => { onClose(); onOpenAddPlayer(player.slot); }}>{player.name?.trim() ? 'Edit pemain & tim' : 'Isi pemain & tim'}</button>}
          {onSelectWinner && winnerSlot == null && <button type="button" className="match-detail-button match-detail-primary" disabled={busy || !player.name?.trim()} onClick={() => updateWinner(player.slot)}>Pilih pemenang</button>}
        </div>}
      </section>)}
      <span className="match-detail-vs" aria-hidden="true">VS</span>
    </div>
    {error && <p className="match-detail-error" role="alert">{error}</p>}
    {isAdmin && winnerSlot != null && onCancelWinner && <footer className="match-detail-footer"><button type="button" className="match-detail-button match-detail-quiet" disabled={busy} onClick={() => updateWinner()}>Batalkan hasil</button></footer>}
    {busy && <p className="match-detail-status" role="status">Menyimpan…</p>}
  </dialog>;
}
