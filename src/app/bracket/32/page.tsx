import RoundPage from '@/components/RoundPage';

export const metadata = { title: '32 Besar' };

export default function Page32() {
  return <RoundPage roundNumber={3} roundLabel="32 Besar" totalMatches={16} prevRoundLabel="64 Besar" />;
}
