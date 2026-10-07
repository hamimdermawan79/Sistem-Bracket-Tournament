'use client';

import { useState } from 'react';
import { Player } from '@/types/tournament';
import MatchDetailModal, { MatchActions } from './MatchDetailModal';

interface CompactMatchProps extends MatchActions {
  round?: number;
  matchNumber?: number;
  label?: string;
  p1?: Player;
  p2?: Player;
  winnerSlot?: number | null;
  align?: 'left' | 'right';
}

export function CompactMatch({ round = 1, matchNumber = 1, p1, p2, winnerSlot, align = 'left', ...actions }: CompactMatchProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  return <>
    <button type="button" className={`compact-match match-detail-trigger ${align === 'right' ? 'align-right' : ''}`} aria-haspopup="dialog" aria-label={`Detail pertandingan ${matchNumber}: ${p1?.name || `Slot ${p1?.slot || 'kosong'}`} melawan ${p2?.name || `Slot ${p2?.slot || 'kosong'}`}`} onClick={() => setDetailOpen(true)}>
      {[p1, p2].map((player, index) => <span className={`cm-row ${player?.slot != null && player.slot === winnerSlot ? 'winner' : ''}`} key={index}>
        <span className="cm-slot">{player?.slot ?? ''}</span>
        {player?.team?.logo_url && <span className="cm-team-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={player.team.logo_url} alt={player.team.name} style={{width:12,height:12,objectFit:'contain'}} />
        </span>}
        <span className="cm-name">{player?.name || 'Empty'}</span>
      </span>)}
    </button>
    <MatchDetailModal {...actions} isOpen={detailOpen} round={round} matchNumber={matchNumber} p1={p1} p2={p2} winnerSlot={winnerSlot} onClose={() => setDetailOpen(false)} />
  </>;
}
