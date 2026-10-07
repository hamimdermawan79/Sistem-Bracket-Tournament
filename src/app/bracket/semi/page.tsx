import RoundPage from '@/components/RoundPage';

export const metadata = { title: 'Semi Final' };

export default function PageSemi() {
  return <RoundPage roundNumber={6} roundLabel="Semi Final" totalMatches={2} prevRoundLabel="Quarter Final" />;
}
