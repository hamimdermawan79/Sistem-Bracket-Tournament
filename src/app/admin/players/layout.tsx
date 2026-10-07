import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Kelola Player' };

export default function PlayersLayout({ children }: { children: ReactNode }) {
  return children;
}
