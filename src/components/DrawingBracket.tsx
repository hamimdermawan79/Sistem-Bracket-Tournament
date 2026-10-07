'use client';
import { CompactMatch } from './CompactMatch';
import { firstDrawingRound } from '@/lib/drawing';
import { Match, Player } from '@/types/tournament';
import { ComponentProps } from 'react';
import GrandFinalEmblem from './GrandFinalEmblem';


type Props = { capacity: number; players: Record<number, Player>; matches: Record<string, Match> } & Pick<ComponentProps<typeof CompactMatch>, 'isAdmin' | 'onSelectWinner' | 'onCancelWinner' | 'onSetPlaying' | 'onOpenAddPlayer'>;
export default function DrawingBracket({ capacity, players, matches, ...handlers }: Props) {
  const first = firstDrawingRound(capacity);
  const treeHeight = Math.max(400, 2 ** (6 - first) * 64);
  function column(round: number, side: 'left' | 'right' | 'final') {
    const total = 2 ** (7 - round);
    const count = side === 'final' ? 1 : total / 2;
    const start = side === 'right' ? count + 1 : 1;
    const step = treeHeight / count;
    const edge = side === 'right' ? 40 : 0;
    const destination = side === 'right' ? 0 : 40;
    return <div className={`drawing-round drawing-round-${side}`} key={`${round}-${side}`}><h3>{round === 7 ? 'Grand Final' : round === 6 ? 'Semi Final' : `${2 ** (8 - round)} Besar`}</h3><div className="drawing-round-nodes" style={{ height: treeHeight }}>
      {side !== 'final' && <svg className="drawing-round-lines" width="40" height={treeHeight} viewBox={`0 0 40 ${treeHeight}`} aria-hidden="true">
        {count === 1 ? <path d={`M ${edge} ${treeHeight / 2} H ${destination}`} /> : Array.from({ length: count / 2 }, (_, pair) => {
          const upper = (pair * 2 + .5) * step;
          const lower = upper + step;
          return <path key={pair} d={`M ${edge} ${upper} H 20 V ${lower} H ${edge} M 20 ${(upper + lower) / 2} H ${destination}`} />;
        })}
      </svg>}
      {Array.from({ length: count }, (_, i) => {
      const number = start + i; const match = matches[`R${round}_M${number}`];
      const player = (slot?: number | null) => slot ? players[slot] || { slot, name: '' } : undefined;
      return <div className="drawing-tree-node" style={{ top: (i + .5) * step }} key={number}>{side === 'final' && <GrandFinalEmblem className="tree-final-emblem" />}<CompactMatch {...handlers} firstRound={first} round={round} matchNumber={number} align={side === 'right' ? 'right' : 'left'} p1={player(match?.player1_slot)} p2={player(match?.player2_slot)} winnerSlot={match?.winner_slot} isPlaying={match?.is_playing} /></div>;
    })}</div></div>;
  }
  return <div className="drawing-tree"><div className="drawing-half">{Array.from({ length: 7 - first }, (_, i) => column(first + i, 'left'))}</div>{column(7, 'final')}<div className="drawing-half">{Array.from({ length: 7 - first }, (_, i) => column(6 - i, 'right'))}</div></div>;
}
