import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

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
    const allowedSortColumns = ['id', 'is_active', 'stock_wh1', 'stock_wh2', 'total_stock', 'inventory_updated_at', 'created_at', 'updated_at'];
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

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('vtex_skus')
      .select('id, is_active, stock_wh1, stock_wh2, total_stock, inventory_updated_at, created_at, updated_at', { count: 'exact' });

    if (search.trim()) {
      const searchNum = parseInt(search.trim(), 10);
      if (!isNaN(searchNum)) {
        query = query.eq('id', searchNum);
      }
    }

    // Exportar todo como CSV si se solicita format=csv
    if (format === 'csv') {
      const { data: allSkus, error } = await supabaseAdmin
        .from('vtex_skus')
        .select('id, is_active, stock_wh1, stock_wh2, total_stock, inventory_updated_at, created_at, updated_at')
        .order(validSortColumn, { ascending: isAscending });

      if (error) throw new Error(error.message);

      const csvLines = ['id,estado,stock_bodega_1,stock_bodega_2,total_stock,fecha_inventario,created_at,updated_at'];
      (allSkus || []).forEach((row) => {
        const estado = row.is_active !== false ? 'Activo' : 'Inactivo';
        csvLines.push(`${row.id},"${estado}",${row.stock_wh1 ?? 0},${row.stock_wh2 ?? 0},${row.total_stock ?? 0},"${row.inventory_updated_at || ''}","${row.created_at}","${row.updated_at}"`);
      });

      const csvContent = csvLines.join('\n');
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="skus_inventario_vtex_sinsa.csv"`,
        },
      });
    }

    const { data, count, error } = await query
      .order(validSortColumn, { ascending: isAscending })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      skus: data || [],
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
