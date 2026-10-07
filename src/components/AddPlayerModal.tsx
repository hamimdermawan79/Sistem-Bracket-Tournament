'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Player, Team } from '@/types/tournament';

interface AddPlayerModalProps {
  isOpen: boolean;
  players?: Record<number, Player>;
  teams?: Team[];
  emptySlots?: number[];
  selectedSlot?: number | null;
  onClose: () => void;
  onSave: (slot: number, name: string, teamId?: string | null) => Promise<void>;
  onDelete?: (slot: number) => Promise<void>;
}

export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({
  isOpen,
  players = {},
  teams = [],
  emptySlots = [],
  selectedSlot: initialSlot,
  onClose,
  onSave,
  onDelete,
}) => {
  const [slot, setSlot] = useState<number>(1);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (isOpen && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [isOpen]);

  useEffect(() => {
    let targetSlot = 1;
    if (initialSlot && initialSlot >= 1 && initialSlot <= 128) {
      targetSlot = initialSlot;
    } else if (emptySlots.length > 0) {
      targetSlot = emptySlots[0];
    }
    setSlot(targetSlot);
    setName(players[targetSlot]?.name || '');
    setTeamId(players[targetSlot]?.team_id || '');
    setConfirmDelete(false);
  }, [isOpen, initialSlot, emptySlots, players]);

  const handleSlotChange = (newSlot: number) => {
    setSlot(newSlot);
    setName(players[newSlot]?.name || '');
    setTeamId(players[newSlot]?.team_id || '');
    setConfirmDelete(false);
  };

  const handlePrevSlot = () => {
    const prev = slot > 1 ? slot - 1 : 128;
    handleSlotChange(prev);
  };

  const handleNextSlot = () => {
    const next = slot < 128 ? slot + 1 : 1;
    handleSlotChange(next);
  };

  if (!isOpen) return null;

  const currentOriginalName = players[slot]?.name || '';
  const selectedTeamObj = teams.find((t) => t.id === teamId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSave(slot, name.trim(), teamId || null);
    setLoading(false);
    onClose();
  };

  const handleDelete = async () => {
    setLoading(true);
    if (onDelete) {
      await onDelete(slot);
    } else {
      await onSave(slot, '', null);
    }
    setLoading(false);
    setName('');
    setTeamId('');
    setConfirmDelete(false);
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="player-edit-dialog" aria-labelledby="player-edit-title" onCancel={e => { if (loading) e.preventDefault(); else onClose(); }}>
      <header className="player-edit-heading"><h2 id="player-edit-title">Edit Player & Tim</h2><button type="button" className="player-edit-button player-edit-quiet" disabled={loading} onClick={onClose}>Tutup</button></header>
      <nav className="player-edit-slot-nav" aria-label="Navigasi slot">
        <button type="button" disabled={loading} onClick={handlePrevSlot} aria-label={`Slot sebelumnya, ${slot > 1 ? slot - 1 : 128}`}><span aria-hidden="true">‹</span> {slot > 1 ? slot - 1 : 128}</button>
        <strong>Slot {slot}</strong>
        <button type="button" disabled={loading} onClick={handleNextSlot} aria-label={`Slot berikutnya, ${slot < 128 ? slot + 1 : 1}`}>{slot < 128 ? slot + 1 : 1} <span aria-hidden="true">›</span></button>
      </nav>
      <form className="player-edit-form" onSubmit={handleSubmit}>
        <label htmlFor="player-edit-slot">Nomor slot</label>
        <select id="player-edit-slot" value={slot} disabled={loading} onChange={e => handleSlotChange(Number(e.target.value))}>
          {Array.from({ length: 128 }, (_, idx) => {const slotNum = idx + 1; const playerName = players[slotNum]?.name?.trim(); return <option key={slotNum} value={slotNum}>Slot {slotNum} — {playerName || 'Kosong'} ({slotNum <= 64 ? 'Kiri' : 'Kanan'})</option>;})}
        </select>
        <label htmlFor="player-edit-name">Nama pemain</label>
        <input id="player-edit-name" type="text" placeholder="Nama pemain" value={name} disabled={loading} onChange={e => setName(e.target.value)} autoFocus />
        <label htmlFor="player-edit-team">Tim</label>
        <div className="player-edit-team-field">
          <div className="player-edit-team-logo">{selectedTeamObj?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedTeamObj.logo_url} alt={selectedTeamObj.name} />
          ) : <span>—</span>}</div>
          <select id="player-edit-team" value={teamId} disabled={loading} onChange={e => setTeamId(e.target.value)}><option value="">Belum pilih tim</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        {confirmDelete && <div className="player-edit-confirm"><p>Kosongkan Slot {slot} ({currentOriginalName})?</p><div><button type="button" className="player-edit-button player-edit-quiet" disabled={loading} onClick={() => setConfirmDelete(false)}>Batal</button><button type="button" className="player-edit-button player-edit-clear" disabled={loading} onClick={handleDelete}>{loading ? 'Mengosongkan…' : 'Kosongkan'}</button></div></div>}
        <footer className="player-edit-actions"><div>{currentOriginalName && !confirmDelete && <button type="button" className="player-edit-button player-edit-quiet" disabled={loading} onClick={() => setConfirmDelete(true)}>Kosongkan</button>}</div><div><button type="button" className="player-edit-button player-edit-quiet" disabled={loading} onClick={onClose}>Batal</button><button type="submit" className="player-edit-button player-edit-save" disabled={loading}>{loading ? 'Menyimpan…' : 'Simpan'}</button></div></footer>
      </form>
    </dialog>
  );
};
