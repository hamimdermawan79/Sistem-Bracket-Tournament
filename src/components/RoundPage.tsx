'use client';

import React, { useEffect, useState } from 'react';
import { Player, Match, Team } from '@/types/tournament';
import { BracketMatch } from './BracketMatch';
import { AddPlayerModal } from './AddPlayerModal';

import { supabase } from '@/lib/supabase';
import { setMatchWinnerAndAdvance, cancelMatchWinner, setMatchPlaying } from '@/lib/tournament';
import { firstDrawingRound } from '@/lib/drawing';
import Link from 'next/link';
import TournamentNavigation from './TournamentNavigation';
import GrandFinalEmblem from './GrandFinalEmblem';
import SemifinalEmblem from './SemifinalEmblem';

interface RoundPageProps {
  roundNumber: number;     // 2=64, 3=32, 4=16, 5=8, 6=semi, 7=final
  roundLabel: string;      // "64 Besar", "32 Besar", etc.
  totalMatches: number;    // 32, 16, 8, 4, 2, 1
  prevRoundLabel: string;  // "128 Besar", "64 Besar", etc.
}



export default function RoundPage({ roundNumber, roundLabel, totalMatches }: RoundPageProps) {
  const [players, setPlayers] = useState<Record<number, Player>>({});
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [firstRound, setFirstRound] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSlotForModal, setSelectedSlotForModal] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('players').select('*').order('slot', { ascending: true }),
      supabase.from('matches').select('*'),
      supabase.from('teams').select('*').order('name', { ascending: true }),
    ]).then(([{ data: playerData }, { data: matchData }, { data: teamData }]) => {
      if (!active) return;
      const tList = (teamData as Team[]) || [];
      setTeams(tList);
      const teamMap = Object.fromEntries(tList.map(team => [team.id, team]));
      if (playerData) setPlayers(Object.fromEntries(playerData.map((player: Player) => [player.slot, {
        ...player, team: player.team_id ? teamMap[player.team_id] || null : null,
      }])));
      if (matchData) setMatches(Object.fromEntries(matchData.map((match: Match) => [match.id, match])));
    }).catch(error => console.error('Error fetching tournament data:', error));
    fetch('/api/admin/check').then(response => response.json()).then(data => {
      if (active) setIsAdmin(data.isAdmin === true);
    }).catch(() => {});
    supabase.from('drawing_config').select('capacity').maybeSingle().then(({ data }) => {
      if (active && data) setFirstRound(firstDrawingRound(data.capacity));
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const refreshMatches = () => {
      if (document.visibilityState !== 'visible') return;
      Promise.resolve(supabase.from('matches').select('*')).then(({ data }) => {
        if (active && data) setMatches(Object.fromEntries(data.map((match: Match) => [match.id, match])));
      }).catch(() => { /* Keep the last bracket while offline. */ });
    };
    const interval = setInterval(refreshMatches, 5000);
    window.addEventListener('focus', refreshMatches);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refreshMatches); };
  }, []);

  const emptySlots = Object.values(players)
    .filter((p) => !p.name || p.name.trim() === '')
    .map((p) => p.slot)
    .sort((a, b) => a - b);

  const handleSaveNewPlayer = async (slot: number, name: string, teamId?: string | null) => {
    const { error } = await supabase.from('players').upsert({
      slot,
      name,
      team_id: teamId || null,
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      const matchedTeam = teamId ? teams.find((t) => t.id === teamId) || null : null;
      setPlayers((prev) => ({
        ...prev,
        [slot]: {
          ...(prev[slot] || { slot }),
          name,
          team_id: teamId || null,
          team: matchedTeam,
        },
      }));
    }
  };

  const handleDeletePlayer = async (slot: number) => {
    const { error } = await supabase.from('players').upsert({
      slot,
      name: '',
      team_id: null,
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      setPlayers((prev) => ({
        ...prev,
        [slot]: { ...(prev[slot] || { slot }), name: '', team_id: null, team: null },
      }));
    }
  };

  const handleSelectWinner = async (round: number, matchNumber: number, winnerSlot: number) => {
    if (!isAdmin) return;
    const result = await setMatchWinnerAndAdvance(round, matchNumber, winnerSlot, matches);
    if (!result) throw new Error('Pemenang gagal disimpan. Coba lagi.');
    if (result && result.updatedMatches) {
      setMatches((prev) => {
        const nextState = { ...prev };
        result.updatedMatches.forEach((m) => {
          nextState[m.id] = m;
        });
        return nextState;
      });
    }
  };

  const handleSetPlaying = async (round: number, matchNumber: number, playing: boolean) => {
    if (!isAdmin) return;
    const match = await setMatchPlaying(round, matchNumber, playing);
    setMatches(prev => ({ ...prev, [match.id]: match }));
  };

  const handleCancelWinner = async (round: number, matchNumber: number) => {
    if (!isAdmin) return;
    const result = await cancelMatchWinner(round, matchNumber, matches);
    if (!result) throw new Error('Hasil gagal dibatalkan. Muat ulang pertandingan.');
    if (result && result.updatedMatches) {
      setMatches((prev) => {
        const nextState = { ...prev };
        result.updatedMatches.forEach((m) => {
          nextState[m.id] = m;
        });
        return nextState;
      });
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setIsAdmin(false);
    window.location.reload();
  };

  const isFinal = roundNumber === 7;
  const isSemi = roundNumber === 6;
  const leftCount = Math.ceil(totalMatches / 2);
  const rightCount = totalMatches - leftCount;



  const renderRoundMatchCard = (matchNum: number, align: 'left' | 'right') => {
    const matchId = `R${roundNumber}_M${matchNum}`;
    const mData = matches[matchId];
    const p1Slot = mData?.player1_slot;
    const p2Slot = mData?.player2_slot;
    const p1 = p1Slot ? players[p1Slot] : undefined;
    const p2 = p2Slot ? players[p2Slot] : undefined;

    return (
      <BracketMatch
        key={matchNum}
        round={roundNumber}
        matchNumber={matchNum}
        align={align}
        arena={roundNumber >= 2 && roundNumber <= 5}
        firstRound={firstRound}
        p1={p1}
        p2={p2}
        winnerSlot={mData?.winner_slot} isPlaying={mData?.is_playing}
        isAdmin={isAdmin}
        onSelectWinner={handleSelectWinner}
        onCancelWinner={handleCancelWinner} onSetPlaying={handleSetPlaying}
        onOpenAddPlayer={(slot) => {
          setSelectedSlotForModal(slot);
          setIsAddModalOpen(true);
        }}
      />
    );
  };

  const finalMatch = matches['R7_M1'];
  const championPlayer = finalMatch?.winner_slot ? players[finalMatch.winner_slot] : undefined;

  return (
    <div className="bracket-page round-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TournamentNavigation round={roundNumber} isAdmin={isAdmin}>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Link
                href="/admin/players"
                className="btn-modern btn-primary"
                style={{ padding: '5px 10px', fontSize: 10 }}
              >
                Kelola Player
              </Link>
              <Link
                href="/admin/teams"
                className="btn-modern btn-gold"
                style={{ padding: '5px 10px', fontSize: 10 }}
              >
                Kelola Tim ({teams.length})
              </Link>
              <button
                onClick={handleLogout}
                className="btn-modern btn-danger"
                style={{ padding: '5px 8px', fontSize: 10 }}
              >
                Logout
              </button>
            </div>
          )}
      </TournamentNavigation>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="round-stage">
        {!isFinal && !isSemi && <header className="round-stage-heading"><div><span>AMMA X SAVE</span><h2>{roundNumber === 5 ? 'Perempat final' : roundLabel}</h2></div><span className="round-stage-count">{totalMatches} pertandingan</span></header>}
        {/* Layout for Grand Final */}
        {isFinal ? (
          <section className="final-showcase" aria-label="Grand Final">
            <h2 className="sr-only">Grand Final</h2>
            <GrandFinalEmblem className="final-page-emblem" />
            <div className="final-match-stage">
              {renderRoundMatchCard(1, 'left')}
            </div>
            {championPlayer && <div className="final-champion"><span>Juara turnamen</span><strong>{championPlayer.name}</strong>{championPlayer.team && <p>{championPlayer.team.name}</p>}</div>}
          </section>
        ) : isSemi ? (
          <section className="semifinal-showcase" aria-label="Semifinal">
            <h2 className="sr-only">Semifinal</h2>
            <SemifinalEmblem className="semifinal-page-emblem" />
            <div className="semifinal-matches">{(['left', 'right'] as const).map((side, i) => <section className={`semifinal-match semifinal-match-${side}`} key={side}><header><h3>Semifinal {i + 1}</h3></header>{renderRoundMatchCard(i + 1, side)}</section>)}</div>
          </section>
        ) : (
          <div className="round-match-grid">
            {(['left', 'right'] as const).map((side, i) => {
              const count = i ? rightCount : leftCount;
              if (!count) return null;
              return <section className={`round-group round-group-${side}`} key={side} aria-label={`Bracket ${i ? 'kanan' : 'kiri'}`}><header className="round-group-heading"><h3>Bracket {i ? 'kanan' : 'kiri'}</h3><span>{count} match</span></header><div className="round-match-list">{Array.from({ length: count }, (_, j) => renderRoundMatchCard(j + 1 + (i ? leftCount : 0), side))}</div></section>;
            })}
          </div>
        )}

      </main>

      {/* Add / Edit Player Modal */}
      <AddPlayerModal
        isOpen={isAddModalOpen}
        players={players}
        teams={teams}
        emptySlots={emptySlots}
        selectedSlot={selectedSlotForModal}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveNewPlayer}
        onDelete={handleDeletePlayer}
      />


    </div>
  );
}
