'use client';

import { useState } from 'react';
import { Player } from '@/types/tournament';
import MatchDetailModal, { MatchActions } from './MatchDetailModal';

interface BracketMatchProps extends MatchActions {
  round?: number;
  matchNumber: number;
  p1?: Player;
  p2?: Player;
  winnerSlot?: number | null;
  align?: 'left' | 'right';
}

export function BracketMatch({ round = 1, matchNumber, p1, p2, winnerSlot, align = 'left', ...actions }: BracketMatchProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  return <>
    <button type="button" className={`match-card match-detail-trigger ${align === 'right' ? 'align-right' : ''}`} style={{width:230}} aria-haspopup="dialog" aria-label={`Detail pertandingan ${matchNumber}: ${p1?.name || `Slot ${p1?.slot || 'kosong'}`} melawan ${p2?.name || `Slot ${p2?.slot || 'kosong'}`}`} onClick={() => setDetailOpen(true)}>
      <span className="match-header"><span>M{matchNumber}</span>{winnerSlot != null && <span className="match-completed-label">Selesai</span>}</span>
      {[p1, p2].map((player, index) => <span className={`player-row ${player?.slot != null && player.slot === winnerSlot ? 'is-winner' : ''}`} key={index}>
        <span className="slot-badge">{player?.slot ?? '?'}</span>
        {player?.team?.logo_url && <span className="team-logo-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={player.team.logo_url} alt={player.team.name} style={{width:15,height:15,objectFit:'contain'}} />
        </span>}
        <span className={`player-name ${!player?.name ? 'empty' : ''}`}>{player?.name || (round === 7 ? 'Menunggu finalis' : 'Slot Kosong')}</span>
      </span>)}
    </button>
    <MatchDetailModal {...actions} isOpen={detailOpen} round={round} matchNumber={matchNumber} p1={p1} p2={p2} winnerSlot={winnerSlot} onClose={() => setDetailOpen(false)} />
  </>;
}
