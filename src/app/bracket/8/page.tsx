import RoundPage from '@/components/RoundPage';

export const metadata = { title: 'Quarter Final' };

export default function PageQF() {
  return <RoundPage roundNumber={5} roundLabel="Quarter Final" totalMatches={4} prevRoundLabel="16 Besar" />;
}
