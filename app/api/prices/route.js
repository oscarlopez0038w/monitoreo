import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchCandidateSkus(search, matchingIdsFromSafety = []) {
  let countQuery = supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .or('discount_pct.gt.0,promo_name.not.is.null,and(list_price.not.is.null,base_price.not.is.null)');

  if (search) {
    if (!isNaN(search)) {
      const searchNum = parseInt(search, 10);
      countQuery = countQuery.or(`id.eq.${searchNum},ref_id.ilike.%${search}%,name.ilike.%${search}%`);
    } else if (matchingIdsFromSafety.length > 0) {
      countQuery = countQuery.or(`name.ilike.%${search}%,ref_id.ilike.%${search}%,id.in.(${matchingIdsFromSafety.join(',')})`);
    } else {
      countQuery = countQuery.or(`name.ilike.%${search}%,ref_id.ilike.%${search}%`);
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
      .select('id, name, ref_id, list_price, base_price, cost_price, final_price, discount_pct, promo_name, promo_id, promotions_updated_at, price_updated_at, updated_at, is_active')
      .or('discount_pct.gt.0,promo_name.not.is.null,and(list_price.not.is.null,base_price.not.is.null)')
      .order('id', { ascending: true })
      .range(from, to);

    if (search) {
      if (!isNaN(search)) {
        const searchNum = parseInt(search, 10);
        pageQuery = pageQuery.or(`id.eq.${searchNum},ref_id.ilike.%${search}%,name.ilike.%${search}%`);
      } else if (matchingIdsFromSafety.length > 0) {
        pageQuery = pageQuery.or(`name.ilike.%${search}%,ref_id.ilike.%${search}%,id.in.(${matchingIdsFromSafety.join(',')})`);
      } else {
        pageQuery = pageQuery.or(`name.ilike.%${search}%,ref_id.ilike.%${search}%`);
      }
    }
    promises.push(pageQuery);
  }

  const results = await Promise.all(promises);
  return results.flatMap((r) => r.data || []);
}

let candidatesCache = null;
let candidatesCacheTime = 0;

async function getGlobalCandidates() {
  const now = Date.now();
  if (candidatesCache && now - candidatesCacheTime < 60000) {
    return candidatesCache;
  }
  const fresh = await fetchCandidateSkus('', []);
  candidatesCache = fresh;
  candidatesCacheTime = now;
  return fresh;
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

    // 1. Si hay término de búsqueda por texto, consultar vtex_safety_stock como fallback para SKUs sin nombre
    const matchingIdsFromSafety = [];
    if (search && isNaN(search)) {
      try {
        const { data: textMatches } = await supabaseAdmin
          .from('vtex_safety_stock')
          .select('sku_id')
          .ilike('description', `%${search}%`)
          .limit(300);

        if (textMatches) {
          textMatches.forEach((row) => matchingIdsFromSafety.push(row.sku_id));
        }
      } catch (e) {}
    }

    // Conteos globales exactos de base de datos en paralelo (< 5ms)
    const [{ count: totalPricedSkus }, { count: totalCatalogCount }, { count: totalPromosInDb }] = await Promise.all([
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('promo_name', 'is', null),
    ]);

    let discountedSkusCountGlobal = 0;

    // Caso A: Filtrar por descuento o calcular descuento % para ordenar por descuento %
    if ((sortBy === 'discount_pct' && filterDiscount !== 'with_promo') || filterDiscount === 'with_discount' || filterDiscount === 'with_fixed_price') {
      const candidateSkus = search ? await fetchCandidateSkus(search, matchingIdsFromSafety) : await getGlobalCandidates();

      let formattedCandidates = candidateSkus.map((s) => {
        const listPrice = s.list_price !== null && s.list_price !== undefined ? parseFloat(s.list_price) : null;
        const basePrice = s.base_price !== null && s.base_price !== undefined ? parseFloat(s.base_price) : null;
        const costPrice = s.cost_price !== null && s.cost_price !== undefined ? parseFloat(s.cost_price) : null;
        const finalPrice = s.final_price !== null && s.final_price !== undefined ? parseFloat(s.final_price) : (basePrice ?? null);
        const promoName = s.promo_name || null;
        const promoId = s.promo_id || null;

        let discountPct = 0;
        if (listPrice && finalPrice && listPrice > finalPrice) {
          discountPct = parseFloat((((listPrice - finalPrice) / listPrice) * 100).toFixed(1));
        } else if (listPrice && basePrice && listPrice > basePrice) {
          discountPct = parseFloat((((listPrice - basePrice) / listPrice) * 100).toFixed(1));
        } else if (s.discount_pct !== null && s.discount_pct !== undefined && parseFloat(s.discount_pct) > 0) {
          discountPct = parseFloat(parseFloat(s.discount_pct).toFixed(1));
        }

        const isFixedPrice = !promoName && listPrice !== null && basePrice !== null && listPrice > basePrice;
        const isVtexPromo = Boolean(promoName || promoId);

        return {
          id: s.id,
          description: s.name || s.description || 'Producto SINSA',
          name: s.name || null,
          refId: s.ref_id || null,
          listPrice,
          basePrice,
          finalPrice,
          costPrice,
          discountPct,
          promoName,
          promoId,
          isFixedPrice,
          isVtexPromo,
          discountType: isVtexPromo ? 'vtex_promo' : (isFixedPrice ? 'fixed_price' : 'none'),
          promotionsUpdatedAt: s.promotions_updated_at || null,
          priceUpdatedAt: s.price_updated_at || s.updated_at,
          isActive: s.is_active ?? true,
        };
      });

      let filteredSkus = formattedCandidates;
      if (filterDiscount === 'with_discount') {
        filteredSkus = formattedCandidates.filter(
          (s) => s.discountPct > 0 || s.promoName !== null || (s.listPrice && s.finalPrice && s.listPrice > s.finalPrice)
        );
      } else if (filterDiscount === 'with_promo') {
        filteredSkus = formattedCandidates.filter((s) => s.promoName !== null || s.promoId !== null);
      } else if (filterDiscount === 'with_fixed_price') {
        filteredSkus = formattedCandidates.filter((s) => s.isFixedPrice);
      }

      // Ordenar resultados
      if (sortBy === 'discount_pct') {
        filteredSkus.sort((a, b) => {
          if (a.discountPct !== b.discountPct) {
            return isAsc ? a.discountPct - b.discountPct : b.discountPct - a.discountPct;
          }
          return isAsc ? a.id - b.id : b.id - a.id;
        });
      } else if (['id', 'base_price', 'list_price', 'final_price', 'price_updated_at'].includes(sortBy)) {
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

      const realCount = (filterDiscount === 'with_discount' || filterDiscount === 'with_promo' || filterDiscount === 'with_fixed_price')
        ? filteredSkus.length
        : (search ? filteredSkus.length : (totalCatalogCount || 82234));
      const totalPages = Math.ceil(filteredSkus.length / pageSize) || 1;
      const from = (page - 1) * pageSize;
      const rawPaginatedSkus = filteredSkus.slice(from, from + pageSize);

      // Cargar descripciones fallback desde vtex_safety_stock solo para los SKUs de la página que no tengan name
      const missingDescIds = rawPaginatedSkus.filter((s) => !s.name).map((s) => s.id);
      const descMap = new Map();
      if (missingDescIds.length > 0) {
        const { data: safetyRows } = await supabaseAdmin
          .from('vtex_safety_stock')
          .select('sku_id, description')
          .in('sku_id', missingDescIds);

        if (safetyRows) {
          safetyRows.forEach((r) => {
            if (r.description) descMap.set(String(r.sku_id), r.description);
          });
        }
      }

      const paginatedSkus = rawPaginatedSkus.map((s) => ({
        ...s,
        description: s.name || descMap.get(String(s.id)) || s.description || 'Producto SINSA',
      }));

      const candidatesAll = await getGlobalCandidates();
      discountedSkusCountGlobal = candidatesAll.filter(
        (s) =>
          (s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)) ||
          s.promo_name !== null ||
          (s.discount_pct !== null && parseFloat(s.discount_pct) > 0)
      ).length;

      const fixedPriceSkusCountGlobal = candidatesAll.filter(
        (s) => !s.promo_name && s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)
      ).length;

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
          promotionsSkusCount: totalPromosInDb || 0,
          fixedPriceSkusCount: fixedPriceSkusCountGlobal || 0,
        },
      });
    }

    // Caso B: Consulta paginada estándar por ID, precio base, precio lista o fecha (filterDiscount === 'all' o 'no_discount')
    let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

    if (search) {
      if (!isNaN(search)) {
        const searchNum = parseInt(search, 10);
        query = query.or(`id.eq.${searchNum},ref_id.ilike.%${search}%,name.ilike.%${search}%`);
      } else if (matchingIdsFromSafety.length > 0) {
        query = query.or(`name.ilike.%${search}%,ref_id.ilike.%${search}%,id.in.(${matchingIdsFromSafety.join(',')})`);
      } else {
        query = query.or(`name.ilike.%${search}%,ref_id.ilike.%${search}%`);
      }
    }

    if (filterDiscount === 'no_discount') {
      query = query.or('list_price.is.null,base_price.is.null');
    } else if (filterDiscount === 'with_promo') {
      query = query.not('promo_name', 'is', null);
    }

    if (['base_price', 'list_price', 'final_price', 'price_updated_at', 'id', 'discount_pct'].includes(sortBy)) {
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

    // Cargar descripciones fallback desde vtex_safety_stock solo para los SKUs que no tengan name
    const missingDescIds = (skus || []).filter((s) => !s.name).map((s) => s.id);
    const descMap = new Map();
    if (missingDescIds.length > 0) {
      const { data: safetyRows } = await supabaseAdmin
        .from('vtex_safety_stock')
        .select('sku_id, description')
        .in('sku_id', missingDescIds);

      if (safetyRows) {
        safetyRows.forEach((r) => {
          if (r.description) descMap.set(String(r.sku_id), r.description);
        });
      }
    }

    const formattedSkus = (skus || []).map((s) => {
      const skuIdStr = String(s.id);
      const description = s.name || descMap.get(skuIdStr) || 'Producto SINSA';
      const listPrice = s.list_price !== null && s.list_price !== undefined ? parseFloat(s.list_price) : null;
      const basePrice = s.base_price !== null && s.base_price !== undefined ? parseFloat(s.base_price) : null;
      const costPrice = s.cost_price !== null && s.cost_price !== undefined ? parseFloat(s.cost_price) : null;
      const finalPrice = s.final_price !== null && s.final_price !== undefined ? parseFloat(s.final_price) : (basePrice ?? null);
      const promoName = s.promo_name || null;
      const promoId = s.promo_id || null;

      let discountPct = 0;
      if (listPrice && finalPrice && listPrice > finalPrice) {
        discountPct = parseFloat((((listPrice - finalPrice) / listPrice) * 100).toFixed(1));
      } else if (listPrice && basePrice && listPrice > basePrice) {
        discountPct = parseFloat((((listPrice - basePrice) / listPrice) * 100).toFixed(1));
      } else if (s.discount_pct !== null && s.discount_pct !== undefined && parseFloat(s.discount_pct) > 0) {
        discountPct = parseFloat(parseFloat(s.discount_pct).toFixed(1));
      }

      const isFixedPrice = !promoName && listPrice !== null && basePrice !== null && listPrice > basePrice;
      const isVtexPromo = Boolean(promoName || promoId);

      return {
        id: s.id,
        description,
        name: s.name || null,
        refId: s.ref_id || null,
        listPrice,
        basePrice,
        finalPrice,
        costPrice,
        discountPct,
        promoName,
        promoId,
        isFixedPrice,
        isVtexPromo,
        discountType: isVtexPromo ? 'vtex_promo' : (isFixedPrice ? 'fixed_price' : 'none'),
        promotionsUpdatedAt: s.promotions_updated_at || null,
        priceUpdatedAt: s.price_updated_at || s.updated_at,
        isActive: s.is_active ?? true,
      };
    });

    const candidatesAll = await getGlobalCandidates();
    discountedSkusCountGlobal = candidatesAll.filter(
      (s) =>
        (s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)) ||
        s.promo_name !== null ||
        (s.discount_pct !== null && parseFloat(s.discount_pct) > 0)
    ).length;

    const fixedPriceSkusCountGlobal = candidatesAll.filter(
      (s) => !s.promo_name && s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)
    ).length;

    const realTotalCount =
      search || filterDiscount === 'no_discount' || filterDiscount === 'with_promo'
        ? (count || 0)
        : (totalCatalogCount || count || 0);
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
        promotionsSkusCount: totalPromosInDb || 0,
        fixedPriceSkusCount: fixedPriceSkusCountGlobal || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
