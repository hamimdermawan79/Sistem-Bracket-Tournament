import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LiveDrawing from '@/components/LiveDrawing';

export const metadata = { title: 'Live Drawing' };

export default async function DrawingPage() {
  if ((await cookies()).get('admin_session')?.value !== 'authenticated_token_save_pes_2026') redirect('/admin/login');
  return <LiveDrawing />;
}
