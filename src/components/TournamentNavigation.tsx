'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef } from 'react';
import TournamentBrand from './TournamentBrand';

const rounds = [
  { href: '/', label: 'Bracket', round: 1 },
  { href: '/bracket/64', label: '64 Besar', round: 2 },
  { href: '/bracket/32', label: '32 Besar', round: 3 },
  { href: '/bracket/16', label: '16 Besar', round: 4 },
  { href: '/bracket/8', label: 'Perempat final', round: 5 },
  { href: '/bracket/semi', label: 'Semifinal', round: 6 },
  { href: '/bracket/final', label: 'Final', round: 7 },
];

type Props = {
  round: number;
  isAdmin: boolean;
  children?: ReactNode;
  side?: 'left' | 'right';
  onSide?: (side: 'left' | 'right') => void;
};

export default function TournamentNavigation({ round, isAdmin, children, side, onSide }: Props) {
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [round]);
  const shield = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /></svg>;
  return <header className="tournament-navigation tournament-single-row">
      <TournamentBrand />
      <nav ref={tabsRef} className="tournament-round-tabs" aria-label="Babak turnamen">
        {rounds.map(item => <Link key={item.href} href={item.href} className={`tournament-tab ${item.round === round ? 'is-active' : ''}`} aria-current={item.round === round ? 'page' : undefined}>{item.label}</Link>)}
      </nav>
      <div className="tournament-row-controls">
      {onSide && <div className="tournament-side-switch" role="group" aria-label="Sisi bracket">
        <button type="button" aria-pressed={side === 'left'} onClick={() => onSide('left')}>Kiri</button>
        <button type="button" aria-pressed={side === 'right'} onClick={() => onSide('right')}>Kanan</button>
      </div>}
      {isAdmin ? <details className="tournament-admin-menu"><summary className="tournament-shield" aria-label="Menu admin" title="Menu admin">{shield}</summary><div className="tournament-admin-popover">{children}</div></details> : <Link href="/admin/login" className="tournament-shield" aria-label="Login admin" title="Admin">{shield}</Link>}
      </div>
  </header>;
}
