import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: Obtener lista de roles, lista de permisos y la matriz asignada
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 500 });
    }

    // 1. Cargar catálogo de roles
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('app_roles')
      .select('*')
      .order('name');

    if (rolesError) {
      console.error('Error al cargar roles:', rolesError);
    }

    // 2. Cargar catálogo de permisos
    let { data: permissions, error: permError } = await supabaseAdmin
      .from('app_permissions')
      .select('*')
      .order('category, code');

    if (permError) {
      console.error('Error al cargar permisos:', permError);
    }

    // Auto-registrar permiso de Kits si aún no existe en app_permissions
    if (Array.isArray(permissions) && !permissions.some((p) => p.code === 'kits:manage')) {
      try {
        await supabaseAdmin.from('app_permissions').insert({
          code: 'kits:manage',
          name: 'Kits VTEX & Combos',
          description: 'Monitorear inventario, modificar precios e importar Kits desde Excel',
          category: 'Catálogo & Inventario',
        });
        const reload = await supabaseAdmin.from('app_permissions').select('*').order('category, code');
        if (reload.data) permissions = reload.data;
      } catch (e) {
        console.warn('No se pudo auto-registrar el permiso kits:manage:', e.message);
      }
    }

    // Auto-registrar permiso de Vitrinas Home si aún no existe
    if (Array.isArray(permissions) && !permissions.some((p) => p.code === 'showcases:manage')) {
      try {
        await supabaseAdmin.from('app_permissions').insert({
          code: 'showcases:manage',
          name: 'Vitrinas Destacadas Home',
          description: 'Curar, analizar y guardar vitrinas de productos destacados para el Home',
          category: 'Catálogo & Inventario',
        });
        const reload = await supabaseAdmin.from('app_permissions').select('*').order('category, code');
        if (reload.data) permissions = reload.data;
      } catch (e) {
        console.warn('No se pudo auto-registrar el permiso showcases:manage:', e.message);
      }
    }

    // Auto-registrar permiso de Marketing & UTMs si aún no existe
    if (Array.isArray(permissions) && !permissions.some((p) => p.code === 'marketing:view')) {
      try {
        await supabaseAdmin.from('app_permissions').insert({
          code: 'marketing:view',
          name: 'Marketing & UTMs',
          description: 'Ver métricas de atribución de campañas UTMs, fuentes de tráfico y promociones VTEX',
          category: 'Analítica & Reportes',
        });
        const reload = await supabaseAdmin.from('app_permissions').select('*').order('category, code');
        if (reload.data) permissions = reload.data;
      } catch (e) {
        console.warn('No se pudo auto-registrar el permiso marketing:view:', e.message);
      }
    }

    // Auto-registrar permiso de Patrones de Compra si aún no existe
    if (Array.isArray(permissions) && !permissions.some((p) => p.code === 'patrones:view')) {
      try {
        await supabaseAdmin.from('app_permissions').insert({
          code: 'patrones:view',
          name: 'Patrones de Compra & Horarios Pico',
          description: 'Analizar patrones de compra por día de la semana, horarios pico e ingresos',
          category: 'Analítica & Reportes',
        });
        const reload = await supabaseAdmin.from('app_permissions').select('*').order('category, code');
        if (reload.data) permissions = reload.data;
      } catch (e) {
        console.warn('No se pudo auto-registrar el permiso patrones:view:', e.message);
      }
    }

    // Auto-registrar permiso de Embudo de Checkout si aún no existe
    if (Array.isArray(permissions) && !permissions.some((p) => p.code === 'embudo:view')) {
      try {
        await supabaseAdmin.from('app_permissions').insert({
          code: 'embudo:view',
          name: 'Embudo de Checkout & Conversión OMS',
          description: 'Analizar conversión progresiva de checkout, tasas de aprobación bancaria y fugas',
          category: 'Analítica & Reportes',
        });
        const reload = await supabaseAdmin.from('app_permissions').select('*').order('category, code');
        if (reload.data) permissions = reload.data;
      } catch (e) {
        console.warn('No se pudo auto-registrar el permiso embudo:view:', e.message);
      }
    }

    // 3. Cargar matriz de asignaciones role_permissions
    const { data: rolePermissions, error: rpError } = await supabaseAdmin
      .from('app_role_permissions')
      .select('*');

    if (rpError) {
      console.error('Error al cargar role_permissions:', rpError);
    }

    // Mapear matriz por ID de Rol
    const matrix = {};
    if (rolePermissions) {
      rolePermissions.forEach((rp) => {
        if (!matrix[rp.role_id]) matrix[rp.role_id] = [];
        matrix[rp.role_id].push(rp.permission_id);
      });
    }

    return NextResponse.json({
      success: true,
      roles: roles || [],
      permissions: permissions || [],
      matrix: matrix || {},
    });
  } catch (err) {
    console.error('Excepción en GET /api/roles:', err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}

// POST: Crear un nuevo rol
export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const body = await request.json();
    const { name, description, permission_ids } = body || {};

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Ingrese el nombre del rol.' }, { status: 400 });
    }

    const cleanName = name.trim();

    // 1. Insertar nuevo rol
    const { data: newRole, error: roleError } = await supabaseAdmin
      .from('app_roles')
      .insert([{ name: cleanName, description: description ? description.trim() : null }])
      .select()
      .single();

    if (roleError) {
      console.error('Error creando rol:', roleError);
      return NextResponse.json({ success: false, error: 'Este nombre de rol ya existe o no se pudo crear.' }, { status: 400 });
    }

    // 2. Asignar permisos iniciales si fueron enviados
    if (Array.isArray(permission_ids) && permission_ids.length > 0) {
      const inserts = permission_ids.map((pid) => ({
        role_id: newRole.id,
        permission_id: pid,
      }));
      await supabaseAdmin.from('app_role_permissions').insert(inserts);
    }

    return NextResponse.json({
      success: true,
      message: 'Rol creado exitosamente.',
      role: newRole,
    });
  } catch (err) {
    console.error('Excepción en POST /api/roles:', err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}

// PATCH: Activar/Desactivar un permiso específico para un rol en la matriz (Toggle)
export async function PATCH(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const body = await request.json();
    const { role_id, permission_id, assigned } = body || {};

    if (!role_id || !permission_id) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros role_id o permission_id.' }, { status: 400 });
    }

    if (assigned) {
      // Insertar permiso en la matriz
      const { error } = await supabaseAdmin
        .from('app_role_permissions')
        .upsert([{ role_id, permission_id }], { onConflict: 'role_id,permission_id' });

      if (error) {
        console.error('Error asignando permiso:', error);
        return NextResponse.json({ success: false, error: 'No se pudo asignar el permiso.' }, { status: 500 });
      }
    } else {
      // Eliminar permiso de la matriz
      const { error } = await supabaseAdmin
        .from('app_role_permissions')
        .delete()
        .eq('role_id', role_id)
        .eq('permission_id', permission_id);

      if (error) {
        console.error('Error revocando permiso:', error);
        return NextResponse.json({ success: false, error: 'No se pudo revocar el permiso.' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: assigned ? 'Permiso asignado al rol.' : 'Permiso revocado del rol.',
    });
  } catch (err) {
    console.error('Excepción en PATCH /api/roles:', err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}

// DELETE: Eliminar un rol
export async function DELETE(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Especifique el ID del rol a eliminar.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('app_roles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error al eliminar rol:', error);
      return NextResponse.json({ success: false, error: 'Error al eliminar el rol de la base de datos.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Rol eliminado exitosamente.',
    });
  } catch (err) {
    console.error('Excepción en DELETE /api/roles:', err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}
