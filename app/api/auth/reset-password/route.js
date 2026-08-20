import { NextResponse } from 'next/server';
import { resetUserPasswordByEmail } from '@/lib/auth';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, newPassword, action } = body || {};

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Por favor ingrese su correo electrónico.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Acción 1: Verificar existencia de correo electrónico (Paso 1 del recuperador)
    if (action === 'verify_email') {
      if (!isSupabaseConfigured()) {
        return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 500 });
      }

      const { data: dbUser, error: dbError } = await supabaseAdmin
        .from('app_users')
        .select('id, email, name, is_active')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (dbError || !dbUser) {
        return NextResponse.json(
          { success: false, error: 'No existe ninguna cuenta registrada con este correo electrónico.' },
          { status: 404 }
        );
      }

      if (!dbUser.is_active) {
        return NextResponse.json(
          { success: false, error: 'Tu cuenta está inactiva o en espera de aprobación por un Administrador.' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        exists: true,
        name: dbUser.name,
        email: dbUser.email,
        message: 'Cuenta verificada correctamente.',
      });
    }

    // Acción 2: Restablecer Contraseña (Paso 2 del recuperador o directo por Admin)
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    const result = await resetUserPasswordByEmail(cleanEmail, newPassword);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: '¡Tu contraseña ha sido restablecida exitosamente! Ya puedes iniciar sesión.',
    });
  } catch (err) {
    console.error('Error en API reset-password:', err);
    return NextResponse.json(
      { success: false, error: 'Ocurrió un error al procesar la recuperación de contraseña.' },
      { status: 500 }
    );
  }
}
