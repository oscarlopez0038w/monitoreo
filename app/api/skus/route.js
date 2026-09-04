import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Función auxiliar para obtener TODOS los SKUs realizando peticiones paginadas por lotes a Supabase
async function fetchAllSkus(sortColumn, isAscending, search = '') {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabaseAdmin
      .from('vtex_skus')
      .select(
        'id, name, ref_id, brand, category, is_active, safety_stock, wh1_total, wh1_reserved, stock_wh1, wh2_total, wh2_reserved, stock_wh2, total_quantity, total_reserved, total_stock, inventory_detail, inventory_updated_at, created_at, updated_at'
      );

    if (search.trim()) {
      const term = search.trim();
      const searchNum = parseInt(term, 10);
      if (!isNaN(searchNum)) {
        query = query.or(`id.eq.${searchNum},ref_id.ilike.%${term}%,name.ilike.%${term}%`);
      } else {
        query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%,ref_id.ilike.%${term}%`);
      }
    }

    const { data, error } = await query
      .order(sortColumn, { ascending: isAscending })
      .range(from, to);

    if (error) throw new Error(error.message);

    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows.map((row) => ({
    ...row,
    description: row.name || null,
    safety_stock: row.safety_stock || 0,
  }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const search = searchParams.get('search') || '';
    const format = searchParams.get('format') || 'json';

    const sortBy = searchParams.get('sortBy') || 'id';
    const sortOrder = searchParams.get('sortOrder') || 'asc';
    const isAscending = sortOrder === 'asc';

    // Validar columna permitida para ordenar
    const allowedSortColumns = [
      'id',
      'name',
      'ref_id',
      'is_active',
      'wh1_total',
      'wh1_reserved',
      'stock_wh1',
      'wh2_total',
      'wh2_reserved',
      'stock_wh2',
      'total_quantity',
      'total_reserved',
      'total_stock',
      'inventory_updated_at',
      'created_at',
      'updated_at',
    ];
    const validSortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'id';

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Supabase no está configurado. Revisa tu archivo .env.local',
          skus: [],
          total: 0,
        },
        { status: 400 }
      );
    }

    // Exportar todo como CSV si se solicita format=csv
    if (format === 'csv') {
      const allSkus = await fetchAllSkus(validSortColumn, isAscending, search);

      const csvLines = [
        'id,descripcion,stock_seguridad,Total_Disponible,Bajo_Stock_Seguridad,Accion_Recomendada,estado,Mega_LastUpdate,Mega_Reservado,Mega_Disponible,Cedis_LastUpdate,Cedis_Reservado,Cedis_Disponible,Total_LastUpdate,Total_Reservado,inventory_detail,fecha_inventario,created_at,updated_at',
      ];
      allSkus.forEach((row) => {
        const estado = row.is_active !== false ? 'Activo' : 'Inactivo';
        const displayDesc = row.name || row.description || '';
        const descEscaped = displayDesc ? `"${String(displayDesc).replace(/"/g, '""')}"` : '""';
        const invDetailEscaped = row.inventory_detail ? JSON.stringify(row.inventory_detail).replace(/"/g, '""') : '[]';

        const safetyStock = row.safety_stock ?? 0;
        const totalStock = row.total_stock ?? 0;
        const isUnderSafety = safetyStock > 0 && totalStock < safetyStock;

        let accionRecomendada = 'MANTENER ACTIVO';
        if (row.is_active === false) {
          accionRecomendada = 'YA INACTIVO EN VTEX';
        } else if (isUnderSafety) {
          accionRecomendada = 'DESACTIVAR EN VTEX (Bajo Stock de Seguridad)';
        } else if (safetyStock > 0 && totalStock <= 0) {
          accionRecomendada = 'DESACTIVAR EN VTEX (Sin Stock Disponible)';
        }

        const bajoStockStr = isUnderSafety ? 'SI' : 'NO';

        csvLines.push(
          `${row.id},${descEscaped},${safetyStock},${totalStock},"${bajoStockStr}","${accionRecomendada}","${estado}",${row.wh1_total ?? 0},${row.wh1_reserved ?? 0},${row.stock_wh1 ?? 0},${row.wh2_total ?? 0},${row.wh2_reserved ?? 0},${row.stock_wh2 ?? 0},${row.total_quantity ?? 0},${row.total_reserved ?? 0},"${invDetailEscaped}","${row.inventory_updated_at || ''}","${row.created_at}","${row.updated_at}"`
        );
      });

      // Incluir BOM UTF-8 (\uFEFF) para que Excel abra los caracteres especiales correctamente
      const csvContent = '\uFEFF' + csvLines.join('\n');
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="skus_inventario_vtex_sinsa.csv"`,
        },
      });
    }

    // Si limit > 1000, también usar fetchAllSkus para devolver todos los registros en JSON
    if (limit > 1000) {
      const allSkus = await fetchAllSkus(validSortColumn, isAscending, search);
      return NextResponse.json({
        success: true,
        skus: allSkus,
        total: allSkus.length,
        page: 1,
        limit: allSkus.length,
        totalPages: 1,
        sortBy: validSortColumn,
        sortOrder,
      });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('vtex_skus')
      .select(
        'id, name, ref_id, brand, category, is_active, safety_stock, wh1_total, wh1_reserved, stock_wh1, wh2_total, wh2_reserved, stock_wh2, total_quantity, total_reserved, total_stock, inventory_detail, inventory_updated_at, created_at, updated_at',
        { count: 'exact' }
      );

    if (search.trim()) {
      const term = search.trim();
      const searchNum = parseInt(term, 10);

      if (!isNaN(searchNum)) {
        query = query.or(`id.eq.${searchNum},ref_id.ilike.%${term}%,name.ilike.%${term}%`);
      } else {
        query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%,ref_id.ilike.%${term}%`);
      }
    }

    const { data, count, error } = await query
      .order(validSortColumn, { ascending: isAscending })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const enrichedSkus = (data || []).map((row) => ({
      ...row,
      description: row.name || null,
      safety_stock: row.safety_stock || 0,
    }));

    return NextResponse.json({
      success: true,
      skus: enrichedSkus,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      sortBy: validSortColumn,
      sortOrder,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
