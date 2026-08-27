import { supabase, supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const AUTH_COOKIE_NAME = 'sinsa_session';

/**
  Inicia sesión validando credenciales cifradas en Supabase Auth Y autorización + rol en public.app_users
 */
export async function loginWithSupabase(email, password) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase no está configurado en las variables de entorno del servidor.' };
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // 1. Autenticar credenciales nativas con Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (authError || !authData?.session) {
    let msg = authError?.message || 'Error de inicio de sesión.';
    if (msg.includes('Invalid login credentials')) {
      msg = 'Correo electrónico o contraseña incorrectos. Verifique sus datos.';
    }
    return { success: false, error: msg };
  }

  // 2. Verificar autorización obligatoria y rol en la tabla public.app_users
  const { data: dbUser, error: dbError } = await supabaseAdmin
    .from('app_users')
    .select('*')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (dbError || !dbUser) {
    return {
      success: false,
      error: 'Acceso no autorizado. Tu cuenta no está registrada en la tabla de control app_users.',
    };
  }

  if (!dbUser.is_active || !dbUser.role || !String(dbUser.role).trim()) {
    return {
      success: false,
      error: 'Tu solicitud de acceso está en espera. Un administrador debe activar tu cuenta en la tabla app_users y asignarte un rol.',
    };
  }

  // 3. Actualizar fecha de último login en la tabla app_users
  try {
    await supabaseAdmin
      .from('app_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', dbUser.id);
  } catch (e) {
    // Ignorar errores silenciosos
  }

  return {
    success: true,
    session: authData.session,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
    },
  };
}

/**
  Registra el usuario en Supabase Auth y crea la solicitud en public.app_users (is_active = false, role = null)
 */
export async function registerWithSupabase(name, email, password) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase no está configurado en el servidor.' };
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // 1. Crear el usuario en Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password: password,
    email_confirm: true,
    user_metadata: {
      name: name.trim(),
    },
  });

  if (authError) {
    let msg = authError.message || 'Error al registrar el usuario.';
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      msg = 'Este correo electrónico ya se encuentra registrado. Solicite su activación o intente iniciar sesión.';
    }
    return { success: false, error: msg };
  }

  const userId = authData.user.id;

  // 2. Insertar o actualizar la fila en la tabla de control public.app_users (is_active = false, role = null)
  const { error: dbError } = await supabaseAdmin
    .from('app_users')
    .upsert(
      {
        id: userId,
        email: cleanEmail,
        username: cleanEmail,
        name: name.trim(),
        role: 'Pendiente', // Rol inicial asignado
        is_active: false, // Inactivo hasta que un administrador active el acceso
      },
      { onConflict: 'email' }
    );

  if (dbError) {
    console.error('Error al guardar la solicitud en app_users:', dbError);
  }

  return {
    success: true,
    message: 'Solicitud enviada exitosamente. Tu cuenta ha sido registrada y esta en espera de que un administrador active tu usuario.',
    user: authData.user,
  };
}

/**
  Verifica el token de sesión y valida la vigencia del acceso y rol en public.app_users
 */
export async function verifySessionToken(token) {
  if (!token || !isSupabaseConfigured()) return null;

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return null;
    }

    const email = authData.user.email;

    // Verificar en la tabla de control public.app_users
    const { data: dbUser, error: dbError } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (dbError || !dbUser || !dbUser.is_active || !dbUser.role) {
      return null;
    }

    // Cargar permisos concedidos al rol del usuario
    let permissions = [];
    if (dbUser.role === 'Administrador Ejecutivo') {
      permissions = ['*']; // Acceso total
    } else {
      try {
        const { data: roleData } = await supabaseAdmin
          .from('app_roles')
          .select('id')
          .eq('name', dbUser.role)
          .maybeSingle();

        if (roleData) {
          const { data: rpData } = await supabaseAdmin
            .from('app_role_permissions')
            .select('permission_id, app_permissions(code)')
            .eq('role_id', roleData.id);

          if (rpData) {
            permissions = rpData
              .map((rp) => rp.app_permissions?.code)
              .filter(Boolean);
          }
        }
      } catch (e) {
        // Silencioso
      }
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      permissions,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Restablece la contraseña de un usuario en Supabase Auth
 */
export async function resetUserPasswordByEmail(email, newPassword) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // 1. Buscar usuario en app_users por email
  const { data: dbUser, error: dbError } = await supabaseAdmin
    .from('app_users')
    .select('id, email, name')
    .ilike('email', cleanEmail)
    .maybeSingle();

  if (dbError || !dbUser) {
    return { success: false, error: 'No se encontró ninguna cuenta registrada con este correo electrónico.' };
  }

  // 2. Actualizar contraseña en Supabase Auth (auth.users)
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(dbUser.id, {
    password: newPassword,
  });

  if (authError) {
    return { success: false, error: `Error al actualizar la contraseña en Auth: ${authError.message}` };
  }

  // 3. Actualizar fecha de modificación en public.app_users
  try {
    await supabaseAdmin
      .from('app_users')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', dbUser.id);
  } catch (e) {
    console.error('Error actualizando fecha en app_users tras reset:', e);
  }

  return {
    success: true,
    message: `Contraseña restablecida exitosamente para el usuario ${dbUser.name || dbUser.email}.`,
    user: dbUser,
  };
}

/**
 * Valida la autenticación de una petición API consultando las cookies o el encabezado Authorization
 */
export async function requireApiAuth(request) {
  const token =
    request.cookies.get(AUTH_COOKIE_NAME)?.value ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { authenticated: false, user: null, error: 'No autorizado. Token de sesión ausente.' };
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return { authenticated: false, user: null, error: 'No autorizado. Token de sesión no válido o expirado.' };
  }

  return { authenticated: true, user: session };
}

