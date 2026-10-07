'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Player, Match, Team } from '@/types/tournament';
import { BracketMatch } from './BracketMatch';
import { CompactMatch } from './CompactMatch';
import { AddPlayerModal } from './AddPlayerModal';

import { supabase } from '@/lib/supabase';
import { setMatchWinnerAndAdvance, cancelMatchWinner } from '@/lib/tournament';
import Link from 'next/link';
import TournamentNavigation from './TournamentNavigation';
import GrandFinalEmblem from './GrandFinalEmblem';
import DrawingBracket from './DrawingBracket';

export default function TournamentBracket() {
  const [players, setPlayers] = useState<Record<number, Player>>({});
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [drawingCapacity, setDrawingCapacity] = useState<number | null>(null);
  const [viewMode] = useState<'full' | '128'>('full');
  const [activeBracket, setActiveBracket] = useState<'left' | 'right'>('left');
  
  // Add/Edit player modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSlotForModal, setSelectedSlotForModal] = useState<number | null>(null);

  // Player details modal

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetchTournamentData();
    checkAdminSession();
    supabase.from('drawing_config').select('capacity').maybeSingle().then(({ data }) => {
      if (data) setDrawingCapacity(data.capacity);
    });
  }, []);

  const checkAdminSession = async () => {
    try {
      const res = await fetch('/api/admin/check');
      const data = await res.json();
      setIsAdmin(data.isAdmin === true);
    } catch {
      // ignore
    }
  };

  const fetchTournamentData = async () => {
    try {
      const [{ data: playerData }, { data: matchData }, { data: teamData }] = await Promise.all([
        supabase.from('players').select('*').order('slot', { ascending: true }),
        supabase.from('matches').select('*'),
        supabase.from('teams').select('*').order('name', { ascending: true }),
      ]);

      const tList = (teamData as Team[]) || [];
      setTeams(tList);

      const teamMap: Record<string, Team> = {};
      tList.forEach((t) => {
        teamMap[t.id] = t;
      });

      if (playerData) {
        const pMap: Record<number, Player> = {};
        playerData.forEach((p: Player) => {
          pMap[p.slot] = {
            ...p,
            team: p.team_id ? teamMap[p.team_id] || null : null,
          };
        });
        setPlayers(pMap);
      }

      if (matchData) {
        const mMap: Record<string, Match> = {};
        matchData.forEach((m: Match) => {
          mMap[m.id] = m;
        });
        setMatches(mMap);
      }
    } catch (err) {
      console.error('Error fetching tournament data:', err);
    }
  };

  const emptySlots = Object.values(players)
    .filter((p) => p.slot <= (drawingCapacity || 128) && (!p.name || p.name.trim() === ''))
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

  const scrollToBracket = (side: 'left' | 'right') => {
    setActiveBracket(side);
    if (viewMode === 'full' && mainRef.current) {
      if (side === 'left') {
        mainRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        mainRef.current.scrollTo({ left: mainRef.current.scrollWidth, behavior: 'smooth' });
      }
    } else if (viewMode === '128') {
      const ref = side === 'left' ? leftRef : rightRef;
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const totalPlayers = Object.values(players).filter((p) => p.name && p.name.trim() !== '').length;


  /* Render 128 Besar Match List for Side-by-Side View */
  const renderMatchList = (startMatch: number, endMatch: number, align: 'left' | 'right') => {
    return Array.from({ length: endMatch - startMatch + 1 }).map((_, i) => {
      const matchNum = startMatch + i;
      const p1Slot = matchNum * 2 - 1;
      const p2Slot = matchNum * 2;
      const matchData = matches[`R1_M${matchNum}`];

      return (
        <BracketMatch
          key={matchNum}
          round={1}
          matchNumber={matchNum}
          align={align}
          p1={players[p1Slot] || { slot: p1Slot, name: '' }}
          p2={players[p2Slot] || { slot: p2Slot, name: '' }}
          winnerSlot={matchData?.winner_slot}
          isAdmin={isAdmin}
          onSelectWinner={handleSelectWinner}
          onCancelWinner={handleCancelWinner}
          onOpenAddPlayer={(slot) => {
            setSelectedSlotForModal(slot);
            setIsAddModalOpen(true);
          }}
        />
      );
    });
  };

  /* Helper to render tree round column for Full View */
  const renderTreeRound = (
    roundNumber: number,
    side: 'left' | 'right',
    count: number,
    roundLabel: string,
    startMatchNum: number
  ) => {
    const pairsCount = count / 2;
    return (
      <div className="round-col">
        <div className="round-col-label">{roundLabel}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {Array.from({ length: pairsCount }).map((_, pairIdx) => (
            <div key={pairIdx} className="match-pair">
              {/* Match 1 in pair */}
              <div className="match-slot">
                {(() => {
                  const mNum = startMatchNum + pairIdx * 2;
                  const matchId = `R${roundNumber}_M${mNum}`;
                  const mData = matches[matchId];

                  let p1Slot = mData?.player1_slot;
                  let p2Slot = mData?.player2_slot;
                  if (roundNumber === 1) {
                    p1Slot = mNum * 2 - 1;
                    p2Slot = mNum * 2;
                  }

                  return (
                    <CompactMatch
                      round={roundNumber}
                      matchNumber={mNum}
                      align={side}
                      p1={p1Slot ? players[p1Slot] || { slot: p1Slot, name: '' } : undefined}
                      p2={p2Slot ? players[p2Slot] || { slot: p2Slot, name: '' } : undefined}
                      winnerSlot={mData?.winner_slot}
                      isAdmin={isAdmin}
                      onSelectWinner={handleSelectWinner}
                      onCancelWinner={handleCancelWinner}
                      onOpenAddPlayer={(slot) => {
                        setSelectedSlotForModal(slot);
                        setIsAddModalOpen(true);
                      }}
                    />
                  );
                })()}
              </div>

              {/* Match 2 in pair */}
              <div className="match-slot">
                {(() => {
                  const mNum = startMatchNum + pairIdx * 2 + 1;
                  const matchId = `R${roundNumber}_M${mNum}`;
                  const mData = matches[matchId];

                  let p1Slot = mData?.player1_slot;
                  let p2Slot = mData?.player2_slot;
                  if (roundNumber === 1) {
                    p1Slot = mNum * 2 - 1;
                    p2Slot = mNum * 2;
                  }

                  return (
                    <CompactMatch
                      round={roundNumber}
                      matchNumber={mNum}
                      align={side}
                      p1={p1Slot ? players[p1Slot] || { slot: p1Slot, name: '' } : undefined}
                      p2={p2Slot ? players[p2Slot] || { slot: p2Slot, name: '' } : undefined}
                      winnerSlot={mData?.winner_slot}
                      isAdmin={isAdmin}
                      onSelectWinner={handleSelectWinner}
                      onCancelWinner={handleCancelWinner}
                      onOpenAddPlayer={(slot) => {
                        setSelectedSlotForModal(slot);
                        setIsAddModalOpen(true);
                      }}
                    />
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Grand final match (R7_M1)
  const finalMatch = matches['R7_M1'];
  const finalP1 = finalMatch?.player1_slot ? players[finalMatch.player1_slot] : undefined;
  const finalP2 = finalMatch?.player2_slot ? players[finalMatch.player2_slot] : undefined;

  // Semi final left match (R6_M1)
  const sfLeftMatch = matches['R6_M1'];
  const sfLeftP1 = sfLeftMatch?.player1_slot ? players[sfLeftMatch.player1_slot] : undefined;
  const sfLeftP2 = sfLeftMatch?.player2_slot ? players[sfLeftMatch.player2_slot] : undefined;

  // Semi final right match (R6_M2)
  const sfRightMatch = matches['R6_M2'];
  const sfRightP1 = sfRightMatch?.player1_slot ? players[sfRightMatch.player1_slot] : undefined;
  const sfRightP2 = sfRightMatch?.player2_slot ? players[sfRightMatch.player2_slot] : undefined;

  return (
    <div className="bracket-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TournamentNavigation round={1} isAdmin={isAdmin} side={activeBracket} onSide={scrollToBracket}>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Link
                href="/admin/players"
                className="btn-modern btn-primary"
                style={{ padding: '5px 10px', fontSize: 10 }}
              >
                Kelola Player ({totalPlayers}/{drawingCapacity || 128})
              </Link>
              <Link
                href="/admin/teams"
                className="btn-modern btn-gold"
                style={{ padding: '5px 10px', fontSize: 10 }}
              >
                Kelola Tim ({teams.length})
              </Link>
              <Link href="/admin/drawing" className="btn-modern btn-primary" style={{ padding: '5px 10px', fontSize: 10 }}>Live Drawing</Link>
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

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <main ref={mainRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        {drawingCapacity ? <DrawingBracket capacity={drawingCapacity} players={players} matches={matches} isAdmin={isAdmin} onSelectWinner={handleSelectWinner} onCancelWinner={handleCancelWinner} onOpenAddPlayer={(slot) => { setSelectedSlotForModal(slot); setIsAddModalOpen(true); }} /> : viewMode === 'full' ? (
          /* FULL BRACKET TREE VIEW */
          <div style={{ padding: '20px 16px', display: 'flex', justifyContent: 'center', width: '100%', minWidth: 'max-content' }}>
            <div className="full-bracket">
              {/* ── LEFT BRACKET HALF ── */}
              <div className="bracket-half left">
                {renderTreeRound(1, 'left', 32, '128 Besar', 1)}
                {renderTreeRound(2, 'left', 16, '64 Besar', 1)}
                {renderTreeRound(3, 'left', 8, '32 Besar', 1)}
                {renderTreeRound(4, 'left', 4, '16 Besar', 1)}
                {renderTreeRound(5, 'left', 2, 'QF', 1)}

                {/* Round 6 (SF Left) */}
                <div className="round-col">
                  <div className="round-col-label" style={{ color: 'var(--accent-blue)' }}>
                    SEMI FINAL (KIRI)
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <div className="match-slot">
                      <CompactMatch
                        round={6}
                        matchNumber={1}
                        align="left"
                        p1={sfLeftP1}
                        p2={sfLeftP2}
                        winnerSlot={sfLeftMatch?.winner_slot}
                        isAdmin={isAdmin}
                        onSelectWinner={handleSelectWinner}
                        onCancelWinner={handleCancelWinner}
                        onOpenAddPlayer={(slot) => {
                          setSelectedSlotForModal(slot);
                          setIsAddModalOpen(true);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── CENTER: GRAND FINAL ── */}
              <div className="bracket-final">
                <div
                  style={{
                    fontFamily: "'Oswald', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    color: 'var(--accent-gold)',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    textAlign: 'center',
                  }}
                >
                  GRAND FINAL
                </div>
                <div
                  className="champion-card"
                  style={{
                    width: 160,
                    padding: 14,
                    border: '1px solid rgba(240, 178, 50, 0.4)',
                    background: 'rgba(14, 18, 36, 0.95)',
                  }}
                >
                  <GrandFinalEmblem className="tree-final-emblem" />
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: 'var(--accent-gold)',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                      borderBottom: '1px solid rgba(240, 178, 50, 0.25)',
                      paddingBottom: 4,
                      textAlign: 'center',
                    }}
                  >
                    CHAMPIONSHIP
                  </div>
                  <CompactMatch
                    round={7}
                    matchNumber={1}
                    align="left"
                    p1={finalP1}
                    p2={finalP2}
                    winnerSlot={finalMatch?.winner_slot}
                    isAdmin={isAdmin}
                    onSelectWinner={handleSelectWinner}
                    onCancelWinner={handleCancelWinner}
                    onOpenAddPlayer={(slot) => {
                      setSelectedSlotForModal(slot);
                      setIsAddModalOpen(true);
                    }}
                  />
                </div>
              </div>

              {/* ── RIGHT BRACKET HALF ── */}
              <div className="bracket-half right">
                {/* Round 6 (SF Right) */}
                <div className="round-col">
                  <div className="round-col-label" style={{ color: 'var(--accent-red)' }}>
                    SEMI FINAL (KANAN)
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <div className="match-slot">
                      <CompactMatch
                        round={6}
                        matchNumber={2}
                        align="right"
                        p1={sfRightP1}
                        p2={sfRightP2}
                        winnerSlot={sfRightMatch?.winner_slot}
                        isAdmin={isAdmin}
                        onSelectWinner={handleSelectWinner}
                        onCancelWinner={handleCancelWinner}
                        onOpenAddPlayer={(slot) => {
                          setSelectedSlotForModal(slot);
                          setIsAddModalOpen(true);
                        }}
                      />
                    </div>
                  </div>
                </div>

                {renderTreeRound(5, 'right', 2, 'QF', 3)}
                {renderTreeRound(4, 'right', 4, '16 Besar', 5)}
                {renderTreeRound(3, 'right', 8, '32 Besar', 9)}
                {renderTreeRound(2, 'right', 16, '64 Besar', 17)}
                {renderTreeRound(1, 'right', 32, '128 Besar', 33)}
              </div>
            </div>
          </div>
        ) : (
          /* 128 BESAR LIST VIEW */
          <div style={{ display: 'flex', flexDirection: 'row', minHeight: 'calc(100vh - 95px)' }} className="bracket-container">
            {/* LEFT BRACKET */}
            <div
              ref={leftRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 12px',
                borderRight: '1px solid var(--border-subtle)',
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
                <div style={{ width: 3, height: 16, background: 'var(--accent-blue)' }} />
                <h2
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-primary)',
                  }}
                >
                  BRACKET KIRI — SLOT 1 S/D 64
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                {renderMatchList(1, 32, 'left')}
              </div>
            </div>

            {/* RIGHT BRACKET */}
            <div
              ref={rightRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 12px',
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "'Oswald', sans-serif",
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-primary)',
                  }}
                >
                  BRACKET KANAN — SLOT 65 S/D 128
                </h2>
                <div style={{ width: 3, height: 16, background: 'var(--accent-red)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                {renderMatchList(33, 64, 'right')}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quick Add/Edit Player Modal */}
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



      <style>{`
        @media (max-width: 640px) {
          .bracket-container {
            flex-direction: column !important;
          }
          .bracket-container > div {
            border-right: none !important;
            border-bottom: 1px solid var(--border-subtle);
          }
          header h1 { font-size: 14px !important; }
        }
      `}</style>
    </div>
  );
}
