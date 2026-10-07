import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminRootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  const isAdmin = token === 'authenticated_token_save_pes_2026';

  if (isAdmin) {
    redirect('/');
  } else {
    redirect('/admin/login');
  }
}
