import RoundPage from '@/components/RoundPage';

export const metadata = { title: '64 Besar' };

export default function Page64() {
  return <RoundPage roundNumber={2} roundLabel="64 Besar" totalMatches={32} prevRoundLabel="128 Besar" />;
}
