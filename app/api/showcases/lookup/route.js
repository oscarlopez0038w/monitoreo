import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { fetchSkuDetails, getVtexConfig } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    const body = await request.json();
    let skuList = [];

    if (Array.isArray(body.skuIds)) {
      skuList = body.skuIds;
    } else if (typeof body.rawText === 'string') {
      // Extraer números de la cadena ingresada (separados por comas, espacios, saltos de línea)
      const matches = body.rawText.match(/\d+/g) || [];
      skuList = matches.map((m) => parseInt(m, 10));
    }

    // Filtrar números únicos y válidos
    const uniqueSkuIds = Array.from(new Set(skuList.filter((id) => Number.isInteger(id) && id > 0)));

    if (uniqueSkuIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se detectaron SKU IDs válidos en la solicitud.' },
        { status: 400 }
      );
    }

    // 1. Consultar base de datos local Supabase por lotes de 1000 para evitar límites de URL
    let dbSkus = [];
    let dbSafety = [];

    if (isSupabaseConfigured()) {
      const batchSize = 1000;
      const skuBatches = [];

      for (let i = 0; i < uniqueSkuIds.length; i += batchSize) {
        const chunk = uniqueSkuIds.slice(i, i + batchSize);
        skuBatches.push(supabaseAdmin.from('vtex_skus').select('*').in('id', chunk));
      }

      const skuResults = await Promise.all(skuBatches);
      dbSkus = skuResults.flatMap((r) => r.data || []);
    }

    const skuMap = new Map();
    dbSkus.forEach((s) => skuMap.set(s.id, s));

    // 2. Para SKUs que requieran información adicional (categoría o fotos), consultar VTEX API en lotes controlados
    const config = getVtexConfig();
    const hasVtexCreds = Boolean(config.appKey && config.appToken);

    const enrichedItems = [];
    const chunkSize = 50;

    for (let i = 0; i < uniqueSkuIds.length; i += chunkSize) {
      const chunk = uniqueSkuIds.slice(i, i + chunkSize);

      const chunkResults = await Promise.all(
        chunk.map(async (skuId) => {
          const localSku = skuMap.get(skuId) || {};

          let description = localSku.name || localSku.description || `SKU ${skuId}`;
          let category = localSku.category || 'General';
          let brand = localSku.brand || 'SINSA';
          let safetyStock = localSku.safety_stock ?? 0;
          let imageUrl = null;
          let isActive = localSku.is_active ?? true;

          // Intentar obtener detalles extendidos desde VTEX Catalog System si tenemos credenciales
          if (hasVtexCreds) {
            try {
              const vtexDetail = await fetchSkuDetails(skuId);
              if (vtexDetail) {
                if (vtexDetail.name) description = vtexDetail.name;
                if (vtexDetail.imageUrl) imageUrl = vtexDetail.imageUrl;
                if (vtexDetail.isActive !== undefined) isActive = vtexDetail.isActive;
              }

              // Consultar VTEX Search API para categoría y marca exactas si es necesario
              const searchUrl = `${config.baseUrl}/api/catalog_system/pub/products/search?fq=skuId:${skuId}`;
              const searchRes = await fetch(searchUrl, {
                headers: {
                  'X-VTEX-API-AppKey': config.appKey,
                  'X-VTEX-API-AppToken': config.appToken,
                  'Accept': 'application/json',
                },
                cache: 'no-store',
              });

              if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (Array.isArray(searchData) && searchData.length > 0) {
                  const prod = searchData[0];
                  if (prod.categories && prod.categories.length > 0) {
                    // Formato VTEX categories: ["/Iluminación/Lámparas/"]
                    const catParts = prod.categories[0].split('/').filter(Boolean);
                    category = catParts[catParts.length - 1] || catParts[0] || 'General';
                  }
                  if (prod.brand) brand = prod.brand;
                  if (!imageUrl && prod.items?.[0]?.images?.[0]?.imageUrl) {
                    imageUrl = prod.items[0].images[0].imageUrl;
                  }
                }
              }
            } catch (e) {
              // Ignorar fallos individuales de VTEX
            }
          }

          // Precios y Descuentos
          const listPrice = localSku.list_price !== null && localSku.list_price !== undefined ? parseFloat(localSku.list_price) : null;
          const basePrice = localSku.base_price !== null && localSku.base_price !== undefined ? parseFloat(localSku.base_price) : null;
          const costPrice = localSku.cost_price !== null && localSku.cost_price !== undefined ? parseFloat(localSku.cost_price) : null;
          const stock = localSku.total_stock ?? localSku.stock_wh1 ?? 0;

          let discountAmount = 0;
          let discountPct = 0;
          if (listPrice && basePrice && listPrice > basePrice) {
            discountAmount = parseFloat((listPrice - basePrice).toFixed(2));
            discountPct = parseFloat((((listPrice - basePrice) / listPrice) * 100).toFixed(1));
          }

          // Puntuación de Atractivo Comercial (0 - 100)
          // Si no hay stock disponible (stock <= 0), la puntuación es 0 (no se puede vender en la web)
          let attractivenessScore = 0;
          if (stock > 0) {
            if (discountPct > 0) attractivenessScore += Math.min(60, discountPct * 1.2);
            attractivenessScore += Math.min(20, Math.log2(stock + 1) * 3);
            if (basePrice && basePrice > 0) attractivenessScore += 20;
            attractivenessScore = Math.min(100, Math.round(attractivenessScore));
          }

          return {
            id: skuId,
            skuId,
            description,
            category,
            brand,
            listPrice,
            basePrice,
            costPrice,
            discountAmount,
            discountPct,
            hasDiscount: discountPct > 0,
            stock,
            isActive,
            imageUrl,
            attractivenessScore,
            priceUpdatedAt: localSku.price_updated_at || localSku.updated_at || null,
          };
        })
      );

      enrichedItems.push(...chunkResults);
    }

    // Calcular resumen de métricas del grupo analizado
    const itemsWithDiscount = enrichedItems.filter((i) => i.discountPct > 0);
    const avgDiscountPct = itemsWithDiscount.length > 0
      ? parseFloat((itemsWithDiscount.reduce((acc, curr) => acc + curr.discountPct, 0) / itemsWithDiscount.length).toFixed(1))
      : 0;

    const maxDiscountPct = enrichedItems.reduce((max, i) => Math.max(max, i.discountPct), 0);

    const categoriesCountMap = {};
    enrichedItems.forEach((item) => {
      categoriesCountMap[item.category] = (categoriesCountMap[item.category] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      count: enrichedItems.length,
      metrics: {
        totalSkus: enrichedItems.length,
        withDiscountCount: itemsWithDiscount.length,
        avgDiscountPct,
        maxDiscountPct,
        totalStockSum: enrichedItems.reduce((sum, i) => sum + i.stock, 0),
        categoriesBreakdown: categoriesCountMap,
      },
      items: enrichedItems,
    });
  } catch (err) {
    console.error('Error en /api/showcases/lookup:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
