'use client';

import { useState } from 'react';
import { Player } from '@/types/tournament';
import MatchDetailModal, { MatchActions, getMatchPlayerLabel } from './MatchDetailModal';

interface CompactMatchProps extends MatchActions {
  round?: number;
  matchNumber?: number;
  label?: string;
  p1?: Player;
  p2?: Player;
  winnerSlot?: number | null;
  isPlaying?: boolean;
  firstRound?: number;
  align?: 'left' | 'right';
}

export function CompactMatch({ round = 1, matchNumber = 1, p1, p2, winnerSlot, isPlaying = false, firstRound = 1, align = 'left', ...actions }: CompactMatchProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  return <>
    <button type="button" className={`compact-match match-detail-trigger ${!p1?.name?.trim() && !p2?.name?.trim() ? 'is-unseeded' : ''} ${align === 'right' ? 'align-right' : ''} ${winnerSlot != null ? 'is-completed' : isPlaying ? 'is-playing' : ''}`} title={`R${round}-M${String(matchNumber).padStart(2, '0')}`} aria-haspopup="dialog" aria-label={`Detail pertandingan ${matchNumber}: ${getMatchPlayerLabel(p1, round, matchNumber, 0, firstRound)} melawan ${getMatchPlayerLabel(p2, round, matchNumber, 1, firstRound)}${winnerSlot != null ? ', selesai' : isPlaying ? ', sedang bermain' : ''}`} onClick={() => setDetailOpen(true)}>
      {[p1, p2].map((player, index) => <span className={`cm-row ${!player?.name?.trim() ? 'is-awaiting' : ''} ${player?.slot != null && player.slot === winnerSlot ? 'winner' : winnerSlot != null ? 'is-loser' : ''}`} key={index}>
        <span className="cm-slot">{player?.slot ?? ''}</span>
        {player?.team?.logo_url && <span className="cm-team-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={player.team.logo_url} alt={player.team.name} style={{width:12,height:12,objectFit:'contain'}} />
        </span>}
        <span className="cm-name">{getMatchPlayerLabel(player, round, matchNumber, index, firstRound)}</span>
      </span>)}
    </button>
    <MatchDetailModal {...actions} isOpen={detailOpen} round={round} matchNumber={matchNumber} p1={p1} p2={p2} winnerSlot={winnerSlot} firstRound={firstRound} isPlaying={isPlaying && winnerSlot == null} onClose={() => setDetailOpen(false)} />
  </>;
}
