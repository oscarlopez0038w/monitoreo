import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/skus/safety-stock/export
 * Obtiene todos los SKUs con marca, categoría, inventario y resguardo desde Supabase para exportar a Excel.
 * Soporta filtros: 'all', 'at_risk', 'with_safety', 'without_safety' y búsqueda por texto.
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
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'at_risk' | 'with_safety' | 'without_safety'
    const search = searchParams.get('search') || '';
    const brand = searchParams.get('brand') || '';
    const category = searchParams.get('category') || '';

    // 1. Contar la cantidad total de registros que cumplen los filtros
    let countQuery = supabaseAdmin
      .from('vtex_skus')
      .select('id', { count: 'exact', head: true });

    if (filter === 'at_risk') {
      countQuery = countQuery.gt('safety_stock', 0).eq('total_stock', 0);
    } else if (filter === 'with_safety') {
      countQuery = countQuery.gt('safety_stock', 0);
    } else if (filter === 'without_safety') {
      countQuery = countQuery.or('safety_stock.is.null,safety_stock.eq.0');
    }

    if (brand.trim()) {
      countQuery = countQuery.eq('brand', brand.trim());
    }

    if (category.trim()) {
      countQuery = countQuery.eq('category', category.trim());
    }

    if (search.trim()) {
      const term = search.trim();
      const searchNum = parseInt(term, 10);
      if (!isNaN(searchNum)) {
        countQuery = countQuery.or(`id.eq.${searchNum},ref_id.ilike.%${term}%,name.ilike.%${term}%`);
      } else {
        countQuery = countQuery.or(`name.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%,ref_id.ilike.%${term}%`);
      }
    }

    const { count: totalCount, error: countErr } = await countQuery;
    if (countErr) throw new Error(countErr.message);

    const total = totalCount || 0;
    if (total === 0) {
      return NextResponse.json({ success: true, count: 0, skus: [] });
    }

    // 2. Consultar en lotes de 1000 concurrentes de forma controlada
    const pageSize = 1000;
    const totalPages = Math.ceil(total / pageSize);
    const BATCH_CONCURRENCY = 15;
    let allRows = [];

    for (let i = 0; i < totalPages; i += BATCH_CONCURRENCY) {
      const batchPromises = [];
      const endBatch = Math.min(totalPages, i + BATCH_CONCURRENCY);

      for (let pageIdx = i; pageIdx < endBatch; pageIdx++) {
        const from = pageIdx * pageSize;
        const to = from + pageSize - 1;

        let pageQuery = supabaseAdmin
          .from('vtex_skus')
          .select('id, name, ref_id, brand, category, total_stock, safety_stock, updated_at');

        if (filter === 'at_risk') {
          pageQuery = pageQuery.gt('safety_stock', 0).eq('total_stock', 0);
        } else if (filter === 'with_safety') {
          pageQuery = pageQuery.gt('safety_stock', 0);
        } else if (filter === 'without_safety') {
          pageQuery = pageQuery.or('safety_stock.is.null,safety_stock.eq.0');
        }

        if (brand.trim()) {
          pageQuery = pageQuery.eq('brand', brand.trim());
        }

        if (category.trim()) {
          pageQuery = pageQuery.eq('category', category.trim());
        }

        if (search.trim()) {
          const term = search.trim();
          const searchNum = parseInt(term, 10);
          if (!isNaN(searchNum)) {
            pageQuery = pageQuery.or(`id.eq.${searchNum},ref_id.ilike.%${term}%,name.ilike.%${term}%`);
          } else {
            pageQuery = pageQuery.or(`name.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%,ref_id.ilike.%${term}%`);
          }
        }

        batchPromises.push(
          pageQuery
            .order('id', { ascending: true })
            .range(from, to)
        );
      }

      const results = await Promise.all(batchPromises);
      for (const res of results) {
        if (res.error) throw new Error(res.error.message);
        if (res.data) allRows.push(...res.data);
      }
    }

    // 3. Mapear filas formateadas para Excel
    const skus = allRows.map((row) => {
      const totalStock = row.total_stock !== null && row.total_stock !== undefined ? parseInt(row.total_stock, 10) : 0;
      const safetyStock = row.safety_stock !== null && row.safety_stock !== undefined ? parseInt(row.safety_stock, 10) : 0;
      
      let riskStatus = 'Normal';
      if (safetyStock === 0) {
        riskStatus = 'Sin Resguardo';
      } else if (totalStock <= safetyStock) {
        riskStatus = 'En Riesgo de Quiebre';
      }

      return {
        id: row.id,
        name: row.name || 'Sin nombre VTEX',
        ref_id: row.ref_id || '',
        brand: row.brand || 'SINSA',
        category: row.category || 'General',
        total_stock: totalStock,
        safety_stock: safetyStock,
        status: riskStatus,
        updated_at: row.updated_at ? new Date(row.updated_at).toLocaleString('es-NI') : 'N/A',
      };
    });

    return NextResponse.json({
      success: true,
      count: skus.length,
      skus,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
