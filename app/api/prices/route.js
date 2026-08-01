import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);
    const search = (searchParams.get('search') || '').trim();
    const filterDiscount = searchParams.get('discount') || 'all'; // 'all', 'with_discount', 'no_discount'
    const sortBy = searchParams.get('sortBy') || 'id'; // 'id', 'base_price', 'list_price', 'discount_pct', 'price_updated_at'
    const sortOrder = searchParams.get('sortOrder') || 'asc';

    // 1. Consultar mapa de descripciones desde vtex_safety_stock para nombres de productos
    const { data: safetyData } = await supabaseAdmin
      .from('vtex_safety_stock')
      .select('sku_id, description');

    const descMap = new Map();
    const matchingIdsFromDesc = [];

    if (safetyData) {
      safetyData.forEach((row) => {
        const skuStr = String(row.sku_id);
        descMap.set(skuStr, row.description);

        if (search && row.description && row.description.toLowerCase().includes(search.toLowerCase())) {
          matchingIdsFromDesc.push(row.sku_id);
        }
      });
    }

    // 2. Consulta ultra-rápida paginada a la tabla principal public.vtex_skus
    let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

    if (search) {
      if (!isNaN(search)) {
        query = query.eq('id', parseInt(search, 10));
      } else if (matchingIdsFromDesc.length > 0) {
        query = query.in('id', matchingIdsFromDesc.slice(0, 100));
      }
    }

    // Filtros de descuento
    if (filterDiscount === 'with_discount') {
      query = query.not('list_price', 'is', null).not('base_price', 'is', null).gt('list_price', 0);
    }

    // Ordenamiento SQL
    const isAsc = sortOrder.toLowerCase() === 'asc';
    if (['base_price', 'list_price', 'price_updated_at', 'id'].includes(sortBy)) {
      query = query.order(sortBy, { ascending: isAsc, nullsFirst: false });
    } else {
      query = query.order('id', { ascending: isAsc });
    }

    // Paginación SQL
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: skus, count, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Mapear solo los 25 SKUs de la página actual
    let formattedSkus = (skus || []).map((s) => {
      const skuIdStr = String(s.id);
      const description = descMap.get(skuIdStr) || s.description || 'Producto SINSA';

      const listPrice = s.list_price !== null && s.list_price !== undefined ? parseFloat(s.list_price) : null;
      const basePrice = s.base_price !== null && s.base_price !== undefined ? parseFloat(s.base_price) : null;
      const costPrice = s.cost_price !== null && s.cost_price !== undefined ? parseFloat(s.cost_price) : null;

      let discountPct = 0;
      if (listPrice && basePrice && listPrice > basePrice) {
        discountPct = parseFloat((((listPrice - basePrice) / listPrice) * 100).toFixed(1));
      }

      return {
        id: s.id,
        description,
        listPrice,
        basePrice,
        costPrice,
        discountPct,
        priceUpdatedAt: s.price_updated_at || s.updated_at,
        isActive: s.is_active ?? true,
      };
    });

    // Filtros client-side por descuento si aplica
    if (filterDiscount === 'with_discount') {
      formattedSkus = formattedSkus.filter((s) => s.discountPct > 0);
    } else if (filterDiscount === 'no_discount') {
      formattedSkus = formattedSkus.filter((s) => s.discountPct === 0);
    }

    // Ordenamiento por discount_pct si aplica
    if (sortBy === 'discount_pct') {
      formattedSkus.sort((a, b) => (isAsc ? a.discountPct - b.discountPct : b.discountPct - a.discountPct));
    }

    // 3. Consultas de metadatos SQL ultra-optimizadas (< 5ms) sin transferir filas completas
    const [{ count: totalPricedSkus }, { data: lastSyncData }, { count: totalCatalogCount }] = await Promise.all([
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
      supabaseAdmin.from('vtex_skus').select('price_updated_at').order('price_updated_at', { ascending: false, nullsFirst: true }).limit(1),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
    ]);

    const lastSyncTime = lastSyncData?.[0]?.price_updated_at || null;
    const realTotalCount = search ? (count || 0) : (totalCatalogCount || count || 0);
    const totalPages = Math.ceil(realTotalCount / pageSize) || 1;

    return NextResponse.json({
      success: true,
      skus: formattedSkus,
      paging: {
        total: realTotalCount,
        totalCatalog: totalCatalogCount || 0,
        page,
        pageSize,
        totalPages,
      },
      stats: {
        totalPricedSkus: totalPricedSkus || 0,
        totalCatalogCount: totalCatalogCount || 0,
        discountedSkusCount: 0,
        lastSyncTime,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
