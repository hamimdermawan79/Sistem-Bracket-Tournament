'use client';

import { useState } from 'react';
import { Player } from '@/types/tournament';
import MatchDetailModal, { MatchActions, getMatchPlayerLabel } from './MatchDetailModal';

interface BracketMatchProps extends MatchActions {
  round?: number;
  matchNumber: number;
  p1?: Player;
  p2?: Player;
  winnerSlot?: number | null;
  isPlaying?: boolean;
  align?: 'left' | 'right';
  arena?: boolean;
  firstRound?: number;
}

export function BracketMatch({ round = 1, matchNumber, p1, p2, winnerSlot, isPlaying = false, align = 'left', arena = false, firstRound = 1, ...actions }: BracketMatchProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  return <>
    <button type="button" className={`match-card match-detail-trigger ${!p1?.name?.trim() && !p2?.name?.trim() ? 'is-unseeded' : ''} ${arena ? 'round-match-card' : ''} ${align === 'right' ? 'align-right' : ''} ${winnerSlot != null ? 'is-completed' : isPlaying ? 'is-playing' : ''}`} style={{width:230}} title={`R${round}-M${String(matchNumber).padStart(2, '0')}`} aria-haspopup="dialog" aria-label={`Detail pertandingan ${matchNumber}: ${getMatchPlayerLabel(p1, round, matchNumber, 0, firstRound)} melawan ${getMatchPlayerLabel(p2, round, matchNumber, 1, firstRound)}${winnerSlot != null ? ', selesai' : isPlaying ? ', sedang bermain' : ''}`} onClick={() => setDetailOpen(true)}>
      <span className="match-header"><span>{arena ? `MATCH ${String(matchNumber).padStart(2, '0')}` : `M${matchNumber}`}</span>{arena ? <span className={`round-match-state ${winnerSlot != null ? 'is-finished' : isPlaying ? 'is-live' : ''}`}><i aria-hidden="true" />{winnerSlot != null ? 'Selesai' : isPlaying ? 'Bermain' : p1?.name?.trim() && p2?.name?.trim() ? 'Siap' : 'Menunggu'}</span> : winnerSlot != null && <span className="match-completed-label">Selesai</span>}</span>
      {[p1, p2].map((player, index) => <span className={`player-row ${!player?.name?.trim() ? 'is-awaiting' : ''} ${player?.slot != null && player.slot === winnerSlot ? 'is-winner' : winnerSlot != null ? 'is-loser' : ''}`} key={index}>
        <span className="slot-badge">{arena ? player?.slot != null ? `#${player.slot}` : '—' : player?.slot ?? '?'}</span>
        {player?.team?.logo_url && <span className="team-logo-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={player.team.logo_url} alt={player.team.name} style={{width:15,height:15,objectFit:'contain'}} />
        </span>}
        {arena && !player?.team?.logo_url && <span className="round-team-placeholder" aria-hidden="true"><svg width="24" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /></svg></span>}
        {arena ? <span className="round-player-info"><span className={`player-name ${!player?.name?.trim() ? 'empty' : ''}`}>{getMatchPlayerLabel(player, round, matchNumber, index, firstRound)}</span><span className="round-player-team">{player?.team?.name || (player?.name?.trim() ? 'Belum pilih tim' : '—')}</span></span> : <span className={`player-name ${!player?.name?.trim() ? 'empty' : ''}`}>{getMatchPlayerLabel(player, round, matchNumber, index, firstRound)}</span>}
      </span>)}
    </button>
    <MatchDetailModal {...actions} isOpen={detailOpen} round={round} matchNumber={matchNumber} p1={p1} p2={p2} winnerSlot={winnerSlot} firstRound={firstRound} isPlaying={isPlaying && winnerSlot == null} onClose={() => setDetailOpen(false)} />
  </>;
}
