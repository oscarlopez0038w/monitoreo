import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/prices/export
 * Obtiene todos los SKUs con precios y descuentos desde Supabase para exportación a Excel
 */
export async function GET(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 400 });
    }

    // 1. Cargar mapa de descripciones completo desde vtex_safety_stock (paginando para evitar el límite de 1000 filas)
    const descMap = new Map();
    let safetyPage = 0;
    const safetyPageSize = 1000;
    let hasMoreSafety = true;

    while (hasMoreSafety) {
      const fromSafety = safetyPage * safetyPageSize;
      const toSafety = fromSafety + safetyPageSize - 1;

      const { data: safetyData } = await supabaseAdmin
        .from('vtex_safety_stock')
        .select('sku_id, description')
        .range(fromSafety, toSafety);

      if (safetyData && safetyData.length > 0) {
        safetyData.forEach((row) => {
          if (row.sku_id && row.description) {
            descMap.set(String(row.sku_id), row.description);
          }
        });
        if (safetyData.length < safetyPageSize) hasMoreSafety = false;
        else safetyPage++;
      } else {
        hasMoreSafety = false;
      }
    }

    // 2. Obtener la cantidad total de SKUs con precios
    const { count: totalCount } = await supabaseAdmin
      .from('vtex_skus')
      .select('id', { count: 'exact', head: true })
      .or('list_price.not.is.null,base_price.not.is.null');

    const total = totalCount || 0;
    if (total === 0) {
      return NextResponse.json({ success: true, count: 0, skus: [] });
    }

    // 3. Consultar en lotes de 1000 de forma concurrente para alta velocidad (< 1 segundo)
    const pageSize = 1000;
    const totalPages = Math.ceil(total / pageSize);
    const promises = [];

    for (let i = 0; i < totalPages; i++) {
      const from = i * pageSize;
      const to = from + pageSize - 1;
      promises.push(
        supabaseAdmin
          .from('vtex_skus')
          .select('id, list_price, base_price, cost_price, is_active, price_updated_at, updated_at')
          .or('list_price.not.is.null,base_price.not.is.null')
          .order('id', { ascending: true })
          .range(from, to)
      );
    }

    const pageResults = await Promise.all(promises);
    const rawSkus = pageResults.flatMap((r) => r.data || []);

    // 4. Mapear y formatear todos los precios y descuentos
    const skus = rawSkus.map((s) => {
      const skuIdStr = String(s.id);
      const description = descMap.get(skuIdStr) || 'Producto SINSA';
      const listPrice = s.list_price !== null && s.list_price !== undefined ? parseFloat(s.list_price) : null;
      const basePrice = s.base_price !== null && s.base_price !== undefined ? parseFloat(s.base_price) : null;
      const costPrice = s.cost_price !== null && s.cost_price !== undefined ? parseFloat(s.cost_price) : null;

      let discountAmount = 0;
      let discountPct = 0;
      if (listPrice && basePrice && listPrice > basePrice) {
        discountAmount = parseFloat((listPrice - basePrice).toFixed(2));
        discountPct = parseFloat((((listPrice - basePrice) / listPrice) * 100).toFixed(1));
      }

      return {
        id: s.id,
        description,
        listPrice,
        basePrice,
        costPrice,
        discountAmount,
        discountPct,
        hasDiscount: discountAmount > 0,
        isActive: s.is_active ?? true,
        priceUpdatedAt: s.price_updated_at || s.updated_at || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: skus.length,
      skus,
    });
  } catch (err) {
    console.error('Error en exportación de precios:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error al exportar precios' }, { status: 500 });
  }
}
