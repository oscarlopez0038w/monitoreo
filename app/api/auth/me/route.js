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

    return NextResponse.json({
      success: true,
      authenticated: true,
      user,
    });
  } catch (err) {
    console.error('Error en API auth/me:', err);
    return NextResponse.json(
      { success: false, authenticated: false, error: 'Error verificando la sesión' },
      { status: 500 }
    );
  }
}
