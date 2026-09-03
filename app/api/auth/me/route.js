import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

    const user = await verifySessionToken(token);

    if (!user) {
      return NextResponse.json(
        { success: false, authenticated: false, error: 'Sesión no válida o expirada en Supabase Auth' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      authenticated: true,
      user,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    // Renovar la cookie de sesión por 7 días más al estar activo
    if (token) {
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (err) {
    console.error('Error en API auth/me:', err);
    return NextResponse.json(
      { success: false, authenticated: false, error: 'Error verificando la sesión' },
      { status: 500 }
    );
  }
}
