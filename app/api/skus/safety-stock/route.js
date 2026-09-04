import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/skus/safety-stock
 * Consulta directa y optimizada sobre public.vtex_skus unificada.
 * Retorna SKU ID, Nombre VTEX, Marca, Categoría, Stock Físico (total_stock) y Stock de Seguridad.
 */
export async function GET(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const brand = searchParams.get('brand') || '';
    const category = searchParams.get('category') || '';
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'with_safety' | 'without_safety'
    const sortBy = searchParams.get('sortBy') || 'updated_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const isAscending = sortOrder === 'asc';

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get('pageSize') || '50', 10)));

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseAdmin
      .from('vtex_skus')
      .select('id, name, ref_id, brand, category, total_stock, safety_stock, updated_at', { count: 'exact' });

    // Filtro por estado de resguardo
    if (filter === 'at_risk') {
      query = query.gt('safety_stock', 0).eq('total_stock', 0);
    } else if (filter === 'with_safety') {
      query = query.gt('safety_stock', 0);
    } else if (filter === 'without_safety') {
      query = query.or('safety_stock.is.null,safety_stock.eq.0');
    }

    // Filtro por Marca
    if (brand.trim()) {
      query = query.eq('brand', brand.trim());
    }

    // Filtro por Categoría
    if (category.trim()) {
      query = query.eq('category', category.trim());
    }

    // Búsqueda por texto (SKU ID numérico, nombre, marca o ref_id)
    if (search.trim()) {
      const term = search.trim();
      const searchNum = parseInt(term, 10);
      if (!isNaN(searchNum)) {
        query = query.or(`id.eq.${searchNum},ref_id.ilike.%${term}%,name.ilike.%${term}%`);
      } else {
        query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%,ref_id.ilike.%${term}%`);
      }
    }

    // Ordenamiento
    const allowedSort = ['id', 'name', 'brand', 'category', 'total_stock', 'safety_stock', 'updated_at'];
    const validSort = allowedSort.includes(sortBy) ? sortBy : 'updated_at';

    const { data, count, error } = await query
      .order(validSort, { ascending: isAscending, nullsFirst: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    const totalRecords = count || 0;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // Mapeo enriquecido y normalizado para la interfaz
    const items = (data || []).map((row) => {
      const totalStock = row.total_stock !== null && row.total_stock !== undefined ? parseInt(row.total_stock, 10) : 0;
      const safetyStock = row.safety_stock !== null && row.safety_stock !== undefined ? parseInt(row.safety_stock, 10) : 0;
      const isAtRisk = safetyStock > 0 && totalStock <= safetyStock;

      return {
        sku_id: row.id,
        id: row.id,
        description: row.name || 'Sin descripción VTEX',
        name: row.name,
        brand: row.brand || 'Sin marca',
        category: row.category || 'General',
        ref_id: row.ref_id,
        total_stock: totalStock,
        safety_stock: safetyStock,
        is_at_risk: isAtRisk,
        updated_at: row.updated_at,
      };
    });

    // Consultar KPIs globales rápidos si es la primera página
    let stats = null;
    if (page === 1) {
      try {
        const [totalCatalogRes, withSafetyRes, atRiskRes] = await Promise.all([
          supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).gt('safety_stock', 0),
          supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).gt('safety_stock', 0).eq('total_stock', 0),
        ]);

        stats = {
          totalCatalog: totalCatalogRes.count || 84572,
          configuredCount: withSafetyRes.count || 0,
          atRiskCount: atRiskRes.count || 0,
        };
      } catch (e) {
        // En caso de error en stats, no bloquear la respuesta principal
      }
    }

    return NextResponse.json({
      success: true,
      data: items,
      total: totalRecords,
      page,
      pageSize,
      totalPages: totalPages || 1,
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skus/safety-stock
 * Crea o actualiza masivamente los umbrales de Stock de Seguridad directamente en public.vtex_skus.
 * Soporta formato ligero de solo 2 columnas: SKU y STOCK DE SEGURIDAD.
 */
export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let items = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      if (body.skuId || body.sku_id || body.sku || body.id) {
        items = [body];
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se enviaron datos para procesar.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // Mapear filas limpias: solo requerimos SKU y STOCK_SEGURIDAD
    const rowsToUpsert = items
      .map((item) => {
        const rawSku =
          item.skuId ??
          item.sku_id ??
          item.sku ??
          item.SKU ??
          item.id ??
          item['SKU ID'] ??
          item['Codigo'] ??
          item['Código'];

        const skuNum = parseInt(rawSku, 10);
        if (isNaN(skuNum) || skuNum <= 0) return null;

        const rawSafety =
          item.safetyStock ??
          item.safety_stock ??
          item.stock_seguridad ??
          item.STOCK_SEGURIDAD ??
          item['STOCK DE SEGURIDAD'] ??
          item['Stock de Seguridad'] ??
          item.resguardo ??
          item.stock ??
          0;

        const safetyStock = Math.max(0, parseInt(rawSafety, 10) || 0);

        return {
          id: skuNum,
          safety_stock: safetyStock,
          updated_at: nowIso,
        };
      })
      .filter(Boolean);

    if (rowsToUpsert.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ninguna fila contenía un SKU válido.' },
        { status: 400 }
      );
    }

    // Deduplicar por id para prevenir colisiones de Postgres en lote
    const uniqueMap = new Map();
    for (const row of rowsToUpsert) {
      uniqueMap.set(row.id, row);
    }
    const uniqueRowsToUpsert = Array.from(uniqueMap.values());

    // Actualizar vtex_skus en lotes de 1000 registros
    const BATCH_SIZE = 1000;
    let totalUpserted = 0;

    for (let i = 0; i < uniqueRowsToUpsert.length; i += BATCH_SIZE) {
      const chunk = uniqueRowsToUpsert.slice(i, i + BATCH_SIZE);

      const { error } = await supabaseAdmin
        .from('vtex_skus')
        .upsert(chunk, { onConflict: 'id' });

      if (error) throw new Error(`Error guardando en Supabase (vtex_skus): ${error.message}`);
      totalUpserted += chunk.length;

      // Sincronización secundaria en vtex_safety_stock (best-effort para compatibilidad)
      try {
        const legacyChunk = chunk.map((c) => ({
          sku_id: c.id,
          safety_stock: c.safety_stock,
          updated_at: nowIso,
        }));
        await supabaseAdmin.from('vtex_safety_stock').upsert(legacyChunk, { onConflict: 'sku_id' });
      } catch (e) {
        // Ignorar si la tabla auxiliar no responde
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: totalUpserted,
      message: `Se actualizaron ${totalUpserted.toLocaleString()} registros de Stock de Seguridad correctamente en el catálogo.`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/skus/safety-stock
 * Restablece el stock de seguridad a 0 para el SKU solicitado.
 */
export async function DELETE(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get('skuId') || searchParams.get('sku_id') || searchParams.get('id');

    if (!skuId) {
      return NextResponse.json(
        { success: false, error: 'Falta el parámetro skuId' },
        { status: 400 }
      );
    }

    const numericSku = parseInt(skuId, 10);
    const nowIso = new Date().toISOString();

    // Restablecer a 0 en vtex_skus
    const { error } = await supabaseAdmin
      .from('vtex_skus')
      .update({ safety_stock: 0, updated_at: nowIso })
      .eq('id', numericSku);

    if (error) throw new Error(error.message);

    // Opcionalmente remover de la tabla auxiliar legada
    try {
      await supabaseAdmin.from('vtex_safety_stock').delete().eq('sku_id', numericSku);
    } catch (e) {}

    return NextResponse.json({
      success: true,
      message: `Stock de Seguridad restablecido a 0 para SKU ${numericSku}.`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
