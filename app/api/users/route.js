import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: Obtener lista completa de usuarios y estadísticas de aprobación
export async function GET(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || 'all'; // all, active, pending, inactive

    let query = supabaseAdmin
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    if (statusFilter === 'active') {
      query = query.eq('is_active', true);
    } else if (statusFilter === 'pending') {
      query = query.or('is_active.eq.false,role.eq.Pendiente,role.is.null');
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('Error cargando usuarios en API:', error);
      return NextResponse.json(
        { success: false, error: 'Error al consultar usuarios en la base de datos.' },
        { status: 500 }
      );
    }

    // Calcular estadísticas
    const totalUsers = users ? users.length : 0;
    const activeUsers = users ? users.filter((u) => u.is_active && u.role && u.role !== 'Pendiente').length : 0;
    const pendingUsers = users ? users.filter((u) => !u.is_active || !u.role || u.role === 'Pendiente').length : 0;
    const adminUsers = users ? users.filter((u) => u.role && u.role.toLowerCase().includes('admin')).length : 0;

    return NextResponse.json({
      success: true,
      data: users || [],
      stats: {
        total: totalUsers,
        active: activeUsers,
        pending: pendingUsers,
        admin: adminUsers,
      },
    });
  } catch (err) {
    console.error('Excepción en GET /api/users:', err);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}

// POST: Crear usuario manualmente por un administrador
export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { name, email, password, role, is_active } = body || {};

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Ingrese el nombre completo del usuario.' }, { status: 400 });
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ success: false, error: 'Ingrese un correo electrónico válido.' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const userRole = role || 'Ejecutivo OMS';
    const isActiveStatus = typeof is_active === 'boolean' ? is_active : true;

    // 1. Crear en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        role: userRole,
      },
    });

    if (authError) {
      let msg = authError.message || 'Error al crear usuario en Supabase Auth.';
      if (msg.includes('already exists') || msg.includes('already been registered')) {
        msg = 'Este correo electrónico ya está registrado en Supabase Auth.';
      }
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Insertar/Actualizar en public.app_users
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('app_users')
      .upsert(
        {
          id: userId,
          email: cleanEmail,
          username: cleanEmail,
          name: name.trim(),
          password: password,
          role: userRole,
          is_active: isActiveStatus,
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (dbError) {
      console.error('Error al guardar en app_users:', dbError);
      return NextResponse.json({ success: false, error: 'Error al registrar en la tabla app_users.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Usuario creado y autorizado exitosamente.',
      data: dbUser,
    });
  } catch (err) {
    console.error('Excepción en POST /api/users:', err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}

// PATCH: Actualizar estado de aprobación (is_active), rol o datos de un usuario
export async function PATCH(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const body = await request.json();
    const { id, email, is_active, role, name } = body || {};

    if (!id && !email) {
      return NextResponse.json({ success: false, error: 'Se requiere el ID o correo del usuario para actualizar.' }, { status: 400 });
    }

    const updateFields = {};
    if (typeof is_active === 'boolean') updateFields.is_active = is_active;
    if (role !== undefined) updateFields.role = role;
    if (name !== undefined) updateFields.name = name.trim();
    updateFields.updated_at = new Date().toISOString();

    let query = supabaseAdmin.from('app_users').update(updateFields);

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('email', String(email).trim().toLowerCase());
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('Error actualizando usuario:', error);
      return NextResponse.json({ success: false, error: 'Error al actualizar datos en app_users.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Usuario actualizado exitosamente.',
      data: data ? data[0] : null,
    });
  } catch (err) {
    console.error('Excepción en PATCH /api/users:', err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}

// DELETE: Eliminar o revocar usuario
export async function DELETE(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const email = searchParams.get('email');

    if (!id && !email) {
      return NextResponse.json({ success: false, error: 'Especifique el ID o email del usuario a eliminar.' }, { status: 400 });
    }

    // 1. Eliminar de public.app_users
    let query = supabaseAdmin.from('app_users').delete();
    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('email', email);
    }

    const { error: dbError } = await query;
    if (dbError) {
      console.error('Error eliminando de app_users:', dbError);
    }

    // 2. Intentar eliminar de Supabase Auth si se tiene el ID
    if (id) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(id);
      } catch (e) {
        // Silencioso si no se encuentra en auth
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Usuario eliminado y accesos revocados exitosamente.',
    });
  } catch (err) {
    console.error('Excepción en DELETE /api/users:', err);
    return NextResponse.json({ success: false, error: 'Error interno al eliminar usuario.' }, { status: 500 });
  }
}
