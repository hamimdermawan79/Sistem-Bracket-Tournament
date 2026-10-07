import RoundPage from '@/components/RoundPage';

export const metadata = { title: '16 Besar' };

export default function Page16() {
  return <RoundPage roundNumber={4} roundLabel="16 Besar" totalMatches={8} prevRoundLabel="32 Besar" />;
}
