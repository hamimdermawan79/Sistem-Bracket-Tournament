import { supabase } from './supabase';
import { Match } from '@/types/tournament';

export async function setMatchPlaying(round: number, matchNumber: number, playing: boolean): Promise<Match> {
  const response = await fetch('/api/admin/matches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ round, matchNumber, playing }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Status bermain gagal disimpan.');
  return data.match;
}

/**
 * Calculates the next round match ID, slot target (player1 or player2), and bracket side.
 */
export function getNextMatchInfo(currentRound: number, currentMatchNum: number) {
  if (currentRound >= 7) return null; // Final has no next match

  const nextRound = currentRound + 1;
  const nextMatchNum = Math.ceil(currentMatchNum / 2);
  const isPlayer1 = currentMatchNum % 2 === 1;

  let nextSide: 'left' | 'right' | 'final' = 'left';
  if (nextRound === 2) nextSide = currentMatchNum <= 32 ? 'left' : 'right';
  else if (nextRound === 3) nextSide = currentMatchNum <= 16 ? 'left' : 'right';
  else if (nextRound === 4) nextSide = currentMatchNum <= 8 ? 'left' : 'right';
  else if (nextRound === 5) nextSide = currentMatchNum <= 4 ? 'left' : 'right';
  else if (nextRound === 6) nextSide = currentMatchNum <= 2 ? 'left' : 'right';
  else if (nextRound === 7) nextSide = 'final';

  return {
    nextMatchId: `R${nextRound}_M${nextMatchNum}`,
    nextRound,
    nextMatchNum,
    isPlayer1,
    nextSide,
  };
}

/**
 * Updates a match winner and automatically propagates the winner to the next round match.
 */
export async function setMatchWinnerAndAdvance(
  round: number,
  matchNum: number,
  winnerSlot: number,
  existingMatches: Record<string, Match>
) {
  const matchId = `R${round}_M${matchNum}`;
  const currentMatch = existingMatches[matchId];
  const side: 'left' | 'right' | 'final' = currentMatch?.bracket_side || (matchNum <= Math.pow(2, 6 - round) ? 'left' : 'right');

  // 1. Update current match winner
  const currentUpdate: Match = {
    id: matchId,
    round,
    match_number: matchNum,
    bracket_side: side,
    player1_slot: currentMatch ? currentMatch.player1_slot : round === 1 ? (matchNum * 2) - 1 : null,
    player2_slot: currentMatch ? currentMatch.player2_slot : round === 1 ? matchNum * 2 : null,
    winner_slot: winnerSlot,
    is_playing: false,
  };

  const { error: currentErr } = await supabase.from('matches').upsert(currentUpdate);

  if (currentErr) {
    console.error('Error updating match winner:', currentErr);
    return null;
  }

  // 2. Propagate to next round if available
  const nextInfo = getNextMatchInfo(round, matchNum);
  let updatedNextMatch: Match | null = null;

  if (nextInfo) {
    const existingNext = existingMatches[nextInfo.nextMatchId];
    const updateData: Match = {
      id: nextInfo.nextMatchId,
      round: nextInfo.nextRound,
      match_number: nextInfo.nextMatchNum,
      bracket_side: nextInfo.nextSide,
      player1_slot: existingNext?.player1_slot || null,
      player2_slot: existingNext?.player2_slot || null,
      winner_slot: existingNext?.winner_slot || null,
      is_playing: existingNext?.is_playing || false,
    };

    if (nextInfo.isPlayer1) {
      if (updateData.player1_slot !== winnerSlot) updateData.is_playing = false;
      updateData.player1_slot = winnerSlot;
    } else {
      if (updateData.player2_slot !== winnerSlot) updateData.is_playing = false;
      updateData.player2_slot = winnerSlot;
    }

    const { error: nextErr } = await supabase.from('matches').upsert(updateData);
    if (!nextErr) {
      updatedNextMatch = updateData;
    } else {
      console.error('Error advancing winner to next match:', nextErr);
    }
  }

  return {
    updatedMatches: [currentUpdate, ...(updatedNextMatch ? [updatedNextMatch] : [])],
  };
}

/**
 * Cancels/resets a match winner and clears their slot from subsequent rounds.
 */
export async function cancelMatchWinner(
  round: number,
  matchNum: number,
  existingMatches: Record<string, Match>
) {
  const matchId = `R${round}_M${matchNum}`;
  const currentMatch = existingMatches[matchId];
  if (!currentMatch || currentMatch.winner_slot == null) return null;

  const previousWinner = currentMatch.winner_slot;

  // 1. Reset current match winner
  const currentUpdate: Match = {
    ...currentMatch,
    winner_slot: null,
    is_playing: false,
  };

  const { error: currentErr } = await supabase.from('matches').upsert(currentUpdate);
  if (currentErr) {
    console.error('Error resetting match winner:', currentErr);
    return null;
  }

  const updatedMatches: Match[] = [currentUpdate];

  // 2. Recursively clear previous winner from subsequent rounds
  let checkRound = round;
  let checkMatchNum = matchNum;

  while (checkRound < 7) {
    const nextInfo = getNextMatchInfo(checkRound, checkMatchNum);
    if (!nextInfo) break;

    const nextMatch = existingMatches[nextInfo.nextMatchId];
    if (!nextMatch) break;

    let modified = false;
    const nextUpdate: Match = { ...nextMatch };

    if (nextUpdate.player1_slot === previousWinner) {
      nextUpdate.player1_slot = null;
      modified = true;
    }
    if (nextUpdate.player2_slot === previousWinner) {
      nextUpdate.player2_slot = null;
      modified = true;
    }

    if (nextUpdate.winner_slot === previousWinner) {
      nextUpdate.winner_slot = null;
      modified = true;
    }

    if (modified) {
      nextUpdate.is_playing = false;
      await supabase.from('matches').upsert(nextUpdate);
      updatedMatches.push(nextUpdate);
      checkRound = nextInfo.nextRound;
      checkMatchNum = nextInfo.nextMatchNum;
    } else {
      break;
    }
  }

  return { updatedMatches };
}
