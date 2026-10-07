import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    const expectedUser = process.env.ADMIN_USER || 'saveadmin';
    const expectedPass = process.env.ADMIN_PASS || 'anggaganteng2026';

    if (username === expectedUser && password === expectedPass) {
      const response = NextResponse.json({ success: true, message: 'Login berhasil' });
      response.cookies.set('admin_session', 'authenticated_token_save_pes_2026', {
        httpOnly: false,
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      return response;
    }

    return NextResponse.json(
      { success: false, message: 'Username atau password salah!' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}
