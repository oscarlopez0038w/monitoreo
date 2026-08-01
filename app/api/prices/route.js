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

    // 1. Consultar mapa de descripciones desde vtex_safety_stock para nombres de productos usando supabaseAdmin
    const { data: safetyData } = await supabaseAdmin
      .from('vtex_safety_stock')
      .select('sku_id, description');

    const descMap = new Map();
    if (safetyData) {
      safetyData.forEach((row) => descMap.set(String(row.sku_id), row.description));
    }

    // 2. Consulta con permisos de Admin a la tabla principal public.vtex_skus (65,200 SKUs)
    let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

    if (search) {
      if (!isNaN(search)) {
        query = query.eq('id', parseInt(search, 10));
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

    // Mapear los SKUs de vtex_skus
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

    // 3. Estadísticas globales rápidas usando supabaseAdmin
    const { data: allPricesData } = await supabaseAdmin
      .from('vtex_skus')
      .select('list_price, base_price, price_updated_at')
      .not('base_price', 'is', null);

    let totalPricedSkus = 0;
    let totalPriceSum = 0;
    let discountedSkusCount = 0;
    let lastSyncTime = null;

    if (allPricesData) {
      totalPricedSkus = allPricesData.length;
      allPricesData.forEach((p) => {
        const bp = parseFloat(p.base_price || 0);
        const lp = parseFloat(p.list_price || 0);
        totalPriceSum += bp;

        if (lp > bp && lp > 0) {
          discountedSkusCount++;
        }

        if (p.price_updated_at) {
          const t = new Date(p.price_updated_at).getTime();
          if (!lastSyncTime || t > lastSyncTime) {
            lastSyncTime = t;
          }
        }
      });
    }

    const avgPrice = totalPricedSkus > 0 ? totalPriceSum / totalPricedSkus : 0;
    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    return NextResponse.json({
      success: true,
      skus: formattedSkus,
      paging: {
        total: totalCount,
        page,
        pageSize,
        totalPages,
      },
      stats: {
        totalPricedSkus,
        avgPrice: parseFloat(avgPrice.toFixed(2)),
        discountedSkusCount,
        lastSyncTime: lastSyncTime ? new Date(lastSyncTime).toISOString() : null,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
