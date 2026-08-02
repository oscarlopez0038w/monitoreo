import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Cache en memoria para candidatos a descuento (TTL de 15 segundos)
let candidateCache = null;
let candidateCacheTime = 0;

async function fetchCandidateSkus(search, matchingIdsFromDesc) {
  const now = Date.now();
  
  // Si no hay búsqueda por texto, intentar usar cache en memoria
  if (!search && candidateCache && now - candidateCacheTime < 15000) {
    return candidateCache;
  }

  let countQuery = supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .not('list_price', 'is', null)
    .not('base_price', 'is', null);

  if (search) {
    if (!isNaN(search)) {
      countQuery = countQuery.eq('id', parseInt(search, 10));
    } else if (matchingIdsFromDesc.length > 0) {
      countQuery = countQuery.in('id', matchingIdsFromDesc.slice(0, 100));
    }
  }

  const { count } = await countQuery;
  const totalCandidates = count || 0;
  if (totalCandidates === 0) return [];

  const pageSize = 1000;
  const pages = Math.ceil(totalCandidates / pageSize);

  const promises = [];
  for (let i = 0; i < pages; i++) {
    const from = i * pageSize;
    const to = from + pageSize - 1;
    let pageQuery = supabaseAdmin
      .from('vtex_skus')
      .select('*')
      .not('list_price', 'is', null)
      .not('base_price', 'is', null)
      .range(from, to);

    if (search) {
      if (!isNaN(search)) {
        pageQuery = pageQuery.eq('id', parseInt(search, 10));
      } else if (matchingIdsFromDesc.length > 0) {
        pageQuery = pageQuery.in('id', matchingIdsFromDesc.slice(0, 100));
      }
    }
    promises.push(pageQuery);
  }

  const results = await Promise.all(promises);
  const allCandidates = results.flatMap((r) => r.data || []);

  if (!search) {
    candidateCache = allCandidates;
    candidateCacheTime = now;
  }

  return allCandidates;
}

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
    const isAsc = sortOrder.toLowerCase() === 'asc';

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

    // 2. Caso A: Filtrar o ordenar por descuento % (utiliza consulta paginada en paralelo para evaluar el catálogo completo)
    if (sortBy === 'discount_pct' || filterDiscount === 'with_discount') {
      const candidateSkus = await fetchCandidateSkus(search, matchingIdsFromDesc);

      let formattedAll = candidateSkus.map((s) => {
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

      if (filterDiscount === 'with_discount') {
        formattedAll = formattedAll.filter((s) => s.discountPct > 0);
      } else if (filterDiscount === 'no_discount') {
        formattedAll = formattedAll.filter((s) => s.discountPct === 0);
      }

      // Ordenar por Descuento % (por defecto mayor descuento primero si desc)
      if (sortBy === 'discount_pct') {
        formattedAll.sort((a, b) => (isAsc ? a.discountPct - b.discountPct : b.discountPct - a.discountPct));
      } else {
        formattedAll.sort((a, b) => {
          const valA = a[sortBy] ?? 0;
          const valB = b[sortBy] ?? 0;
          return isAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });
      }

      const realCount = formattedAll.length;
      const totalPages = Math.ceil(realCount / pageSize) || 1;
      const from = (page - 1) * pageSize;
      const paginatedSkus = formattedAll.slice(from, from + pageSize);

      const [{ count: totalPricedSkus }, { count: totalCatalogCount }] = await Promise.all([
        supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
        supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
      ]);

      return NextResponse.json({
        success: true,
        skus: paginatedSkus,
        paging: {
          total: realCount,
          totalCatalog: totalCatalogCount || 0,
          page,
          pageSize,
          totalPages,
        },
        stats: {
          totalPricedSkus: totalPricedSkus || 0,
          totalCatalogCount: totalCatalogCount || 0,
          discountedSkusCount: realCount,
        },
      });
    }

    // Caso B: Consulta paginada estándar por ID, precio base, precio lista o fecha
    let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

    if (search) {
      if (!isNaN(search)) {
        query = query.eq('id', parseInt(search, 10));
      } else if (matchingIdsFromDesc.length > 0) {
        query = query.in('id', matchingIdsFromDesc.slice(0, 100));
      }
    }

    if (['base_price', 'list_price', 'price_updated_at', 'id'].includes(sortBy)) {
      query = query.order(sortBy, { ascending: isAsc, nullsFirst: false });
    } else {
      query = query.order('id', { ascending: isAsc });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: skus, count, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

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

    if (filterDiscount === 'no_discount') {
      formattedSkus = formattedSkus.filter((s) => s.discountPct === 0);
    }

    // Consulta exacta de conteos de metadatos SQL (< 5ms)
    const [{ count: totalPricedSkus }, { count: totalCatalogCount }] = await Promise.all([
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
    ]);

    // Para el conteo global de SKUs con descuento
    const globalCandidates = await fetchCandidateSkus('', []);
    const globalDiscountedCount = globalCandidates.filter(
      (s) => s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)
    ).length;

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
        discountedSkusCount: globalDiscountedCount || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
