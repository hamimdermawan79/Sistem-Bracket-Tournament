import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  const isAdmin = token === 'authenticated_token_save_pes_2026';
  return NextResponse.json({ isAdmin });
}
