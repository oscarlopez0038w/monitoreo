import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchCandidateSkus(search, matchingIdsFromDesc) {
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
    } else {
      return [];
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
      .select('id, list_price, base_price, cost_price, price_updated_at, updated_at, is_active')
      .not('list_price', 'is', null)
      .not('base_price', 'is', null)
      .order('id', { ascending: true })
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
  return results.flatMap((r) => r.data || []);
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

    // 1. Si hay término de búsqueda por texto, consultar vtex_safety_stock por ilike para encontrar SKUs coincidentes
    const matchingIdsFromDesc = [];
    if (search && isNaN(search)) {
      try {
        const { data: textMatches } = await supabaseAdmin
          .from('vtex_safety_stock')
          .select('sku_id')
          .ilike('description', `%${search.trim()}%`)
          .limit(1000);

        if (textMatches) {
          textMatches.forEach((row) => matchingIdsFromDesc.push(row.sku_id));
        }
      } catch (e) {}
    }

    // Conteos globales exactos de base de datos en paralelo (< 5ms)
    const [{ count: totalPricedSkus }, { count: totalCatalogCount }] = await Promise.all([
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
    ]);

    // Para conteo exacto y consistente de ofertas
    const globalCandidates = await fetchCandidateSkus('', []);
    const discountedSkusCountGlobal = globalCandidates.filter(
      (s) => s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)
    ).length;

    // Caso A: Filtrar por descuento o calcular descuento % para ordenar por descuento %
    if (sortBy === 'discount_pct' || filterDiscount === 'with_discount') {
      const candidateSkus = search ? await fetchCandidateSkus(search, matchingIdsFromDesc) : globalCandidates;

      let formattedCandidates = candidateSkus.map((s) => {
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

      let filteredSkus = formattedCandidates;
      if (filterDiscount === 'with_discount') {
        filteredSkus = formattedCandidates.filter((s) => s.discountPct > 0);
      }

      // Ordenar resultados
      if (sortBy === 'discount_pct') {
        filteredSkus.sort((a, b) => (isAsc ? a.discountPct - b.discountPct : b.discountPct - a.discountPct));
      } else if (['id', 'base_price', 'list_price', 'price_updated_at'].includes(sortBy)) {
        filteredSkus.sort((a, b) => {
          let valA = a[sortBy];
          let valB = b[sortBy];
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;
          if (typeof valA === 'string' && typeof valB === 'string') {
            return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          return isAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });
      }

      const realCount = filterDiscount === 'with_discount' ? filteredSkus.length : (search ? filteredSkus.length : (totalCatalogCount || 82234));
      const totalPages = Math.ceil(filteredSkus.length / pageSize) || 1;
      const from = (page - 1) * pageSize;
      const rawPaginatedSkus = filteredSkus.slice(from, from + pageSize);

      // Cargar descripciones exactas desde vtex_safety_stock para los SKUs de la página actual
      const pageSkuIds = rawPaginatedSkus.map((s) => s.id);
      const descMap = new Map();
      if (pageSkuIds.length > 0) {
        const { data: safetyRows } = await supabaseAdmin
          .from('vtex_safety_stock')
          .select('sku_id, description')
          .in('sku_id', pageSkuIds);

        if (safetyRows) {
          safetyRows.forEach((r) => {
            if (r.description) descMap.set(String(r.sku_id), r.description);
          });
        }
      }

      const paginatedSkus = rawPaginatedSkus.map((s) => ({
        ...s,
        description: descMap.get(String(s.id)) || s.description || 'Producto SINSA',
      }));

      return NextResponse.json({
        success: true,
        skus: paginatedSkus,
        paging: {
          total: realCount,
          totalCatalog: totalCatalogCount || 82234,
          page,
          pageSize,
          totalPages,
        },
        stats: {
          totalPricedSkus: totalPricedSkus || 0,
          totalCatalogCount: totalCatalogCount || 82234,
          discountedSkusCount: discountedSkusCountGlobal || 0,
        },
      });
    }

    // Caso B: Consulta paginada estándar por ID, precio base, precio lista o fecha (filterDiscount === 'all' o 'no_discount')
    let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

    if (search) {
      if (!isNaN(search)) {
        query = query.eq('id', parseInt(search, 10));
      } else if (matchingIdsFromDesc.length > 0) {
        query = query.in('id', matchingIdsFromDesc.slice(0, 100));
      }
    }

    if (filterDiscount === 'no_discount') {
      query = query.or('list_price.is.null,base_price.is.null');
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

    // Cargar descripciones exactas desde vtex_safety_stock para los SKUs de la página actual
    const pageSkuIds = (skus || []).map((s) => s.id);
    const descMap = new Map();
    if (pageSkuIds.length > 0) {
      const { data: safetyRows } = await supabaseAdmin
        .from('vtex_safety_stock')
        .select('sku_id, description')
        .in('sku_id', pageSkuIds);

      if (safetyRows) {
        safetyRows.forEach((r) => {
          if (r.description) descMap.set(String(r.sku_id), r.description);
        });
      }
    }

    const formattedSkus = (skus || []).map((s) => {
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

    const realTotalCount = search ? (count || 0) : (filterDiscount === 'no_discount' ? (count || 0) : (totalCatalogCount || count || 0));
    const totalPages = Math.ceil(realTotalCount / pageSize) || 1;

    return NextResponse.json({
      success: true,
      skus: formattedSkus,
      paging: {
        total: realTotalCount,
        totalCatalog: totalCatalogCount || 82234,
        page,
        pageSize,
        totalPages,
      },
      stats: {
        totalPricedSkus: totalPricedSkus || 0,
        totalCatalogCount: totalCatalogCount || 82234,
        discountedSkusCount: discountedSkusCountGlobal || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
