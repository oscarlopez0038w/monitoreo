import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Cerrar sesión en la API de Supabase si aplica
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignorar errores en el servidor
    }

    const response = NextResponse.json({
      success: true,
      message: 'Sesión cerrada exitosamente en Supabase Auth',
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  } catch (err) {
    console.error('Error en API Logout:', err);
    return NextResponse.json(
      { success: false, error: 'Error al cerrar la sesión' },
      { status: 500 }
    );
  }
}
