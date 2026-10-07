import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true, message: 'Logged out' });
  response.cookies.delete('admin_session');
  return response;
}
