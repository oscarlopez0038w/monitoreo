import { NextResponse } from 'next/server';
import { createAppSessionToken, loginWithSupabase, AUTH_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, password } = body || {};

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Por favor ingrese su correo y contraseña.' },
        { status: 400 }
      );
    }

    const result = await loginWithSupabase(username, password);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }

    const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;
    const maxAgeSeconds = SEVEN_DAYS_SECONDS; // 7 días de sesión activa por defecto
    const sessionToken = await createAppSessionToken(result.user, maxAgeSeconds);

    const response = NextResponse.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: result.user,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    });

    return response;
  } catch (err) {
    console.error('Error en API Login con Supabase Auth:', err);
    return NextResponse.json(
      { success: false, error: 'Ocurrió un error interno al procesar el inicio de sesión.' },
      { status: 500 }
    );
  }
}
