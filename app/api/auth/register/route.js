import { NextResponse } from 'next/server';
import { registerWithSupabase } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, password } = body || {};

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Por favor ingrese su nombre completo.' },
        { status: 400 }
      );
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Por favor ingrese un correo electrónico válido.' },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    const result = await registerWithSupabase(name, email, password);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || 'Usuario registrado exitosamente en Supabase Auth.',
      user: result.user,
    });
  } catch (err) {
    console.error('Error en API Register con Supabase Auth:', err);
    return NextResponse.json(
      { success: false, error: 'Ocurrió un error interno al procesar el registro.' },
      { status: 500 }
    );
  }
}
