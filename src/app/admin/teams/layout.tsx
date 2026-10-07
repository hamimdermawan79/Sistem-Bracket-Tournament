import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Kelola Tim' };

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return children;
}
