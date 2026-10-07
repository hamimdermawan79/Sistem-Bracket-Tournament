import RoundPage from '@/components/RoundPage';

export const metadata = { title: 'Grand Final' };

export default function PageFinal() {
  return <RoundPage roundNumber={7} roundLabel="Grand Final" totalMatches={1} prevRoundLabel="Semi Final" />;
}
