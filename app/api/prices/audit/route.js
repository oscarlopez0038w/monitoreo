import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST: Auditar y comparar Precios de Facturación Xstore vs Precio Final Web (base_price)
export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawItems = body.items || [];

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se enviaron datos de precios de Xstore para comparar.' },
        { status: 400 }
      );
    }

    // 1. Normalizar filas recibidas del Excel
    const validItems = [];
    const skuIdsToFetch = new Set();

    for (const item of rawItems) {
      const rawSku = item.skuId ?? item.sku_id ?? item.sku ?? item.SKU ?? item.id;
      const skuNum = parseInt(String(rawSku).replace(/\.0$/, '').trim(), 10);
      if (isNaN(skuNum) || skuNum <= 0) continue;

      const rawPrice = item.xstorePrice ?? item.precio_xstore ?? item.precio ?? item.price ?? 0;
      const xstorePrice = typeof rawPrice === 'number'
        ? rawPrice
        : parseFloat(String(rawPrice).replace(/,/g, '').replace(/C\$/gi, '').trim()) || 0;

      const description = item.description ?? item.descripcion ?? null;

      validItems.push({
        skuId: skuNum,
        xstorePrice: Math.max(0, xstorePrice),
        description: description ? String(description).trim() : null,
      });

      skuIdsToFetch.add(skuNum);
    }

    if (validItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se encontraron SKUs válidos en la solicitud.' },
        { status: 400 }
      );
    }

    // 2. Consultar concurrentemente en Supabase por lotes de 1000 IDs
    const skuIdList = Array.from(skuIdsToFetch);
    const BATCH_SIZE = 1000;
    const dbSkuMap = new Map();

    const chunks = [];
    for (let i = 0; i < skuIdList.length; i += BATCH_SIZE) {
      chunks.push(skuIdList.slice(i, i + BATCH_SIZE));
    }

    // Concurrencia de 6 peticiones simultáneas para maximizar throughput sin saturar conexiones
    const CONCURRENCY = 6;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const concurrentBatch = chunks.slice(i, i + CONCURRENCY);
      await Promise.all(
        concurrentBatch.map(async (chunk) => {
          const { data, error } = await supabaseAdmin
            .from('vtex_skus')
            .select('id, name, base_price, list_price, final_price, promo_name, discount_pct, is_active')
            .in('id', chunk);

          if (error) {
            console.error('Error consultando vtex_skus en comparador:', error.message);
          } else if (data) {
            for (const row of data) {
              dbSkuMap.set(row.id, row);
            }
          }
        })
      );
    }

    const comparisonMode = body.comparisonMode === 'final' ? 'final' : 'base';

    // 3. Comparar Precio Xstore Facturación vs. Precio Objetivo según modo
    const comparisonResults = [];
    let matchCount = 0;
    let mismatchCount = 0;
    let notFoundCount = 0;
    let higherWebCount = 0;
    let lowerWebCount = 0;

    for (const item of validItems) {
      const dbRow = dbSkuMap.get(item.skuId);
      const productName = item.description || dbRow?.name || 'Producto SINSA';

      if (!dbRow) {
        notFoundCount++;
        comparisonResults.push({
          skuId: item.skuId,
          description: productName,
          xstorePrice: item.xstorePrice,
          targetWebPrice: null,
          webFinalPrice: null,
          basePrice: null,
          listPrice: null,
          promoName: null,
          discountPct: null,
          diffAmount: null,
          diffPercent: null,
          status: 'NOT_FOUND',
          statusText: 'No Encontrado en Web',
          badgeColor: '#94a3b8',
        });
        continue;
      }

      // 1. Precio Regular sin Descuento (Precio de Lista / Tachado en Web)
      // En VTEX, si el producto tiene descuento, list_price guarda el precio regular original antes de rebaja (ej. C$ 7,939).
      // Si list_price no está definido, toma base_price.
      let regularPrice = null;
      if (dbRow.list_price !== null && dbRow.list_price !== undefined && Number(dbRow.list_price) > 0) {
        regularPrice = Number(dbRow.list_price);
      } else if (dbRow.base_price !== null && dbRow.base_price !== undefined) {
        regularPrice = Number(dbRow.base_price);
      } else {
        regularPrice = 0;
      }

      // 2. Precio Final de Venta Web (Con descuentos de catálogo y promociones aplicadas, ej. C$ 5,299)
      let webFinalPrice = null;
      if (dbRow.final_price !== null && dbRow.final_price !== undefined) {
        webFinalPrice = Number(dbRow.final_price);
      } else if (dbRow.base_price !== null && dbRow.base_price !== undefined) {
        webFinalPrice = Number(dbRow.base_price);
      } else {
        webFinalPrice = regularPrice;
      }

      // Porcentaje de descuento real detectado entre regular y final
      const detectedDiscountPct =
        regularPrice > webFinalPrice && regularPrice > 0
          ? Math.round(((regularPrice - webFinalPrice) / regularPrice) * 100)
          : (dbRow.discount_pct != null ? Number(dbRow.discount_pct) : 0);

      // 3. Seleccionar precio objetivo según el modo de comparación
      // En modo 'base': Compara contra el precio regular sin descuento (list_price / base regular)
      // En modo 'final': Compara contra el precio final de venta con descuento (final_price / venta web)
      const targetWebPrice = comparisonMode === 'base' ? regularPrice : webFinalPrice;

      const diffAmount = targetWebPrice - item.xstorePrice;
      const absDiff = Math.abs(diffAmount);

      // Margen de tolerancia de C$ 0.01 por decimales
      if (absDiff < 0.01) {
        matchCount++;
        comparisonResults.push({
          skuId: item.skuId,
          description: productName,
          xstorePrice: item.xstorePrice,
          targetWebPrice,
          webFinalPrice,
          basePrice: regularPrice,
          listPrice: dbRow.list_price != null ? Number(dbRow.list_price) : null,
          promoName: dbRow.promo_name || null,
          discountPct: detectedDiscountPct,
          diffAmount: 0,
          diffPercent: 0,
          status: 'MATCH',
          statusText: '🟢 Precios Coinciden',
          badgeColor: '#34d399',
        });
      } else {
        mismatchCount++;
        const diffPercent = item.xstorePrice > 0 ? (diffAmount / item.xstorePrice) * 100 : 0;

        if (diffAmount > 0) {
          higherWebCount++;
          comparisonResults.push({
            skuId: item.skuId,
            description: productName,
            xstorePrice: item.xstorePrice,
            targetWebPrice,
            webFinalPrice,
            basePrice: regularPrice,
            listPrice: dbRow.list_price != null ? Number(dbRow.list_price) : null,
            promoName: dbRow.promo_name || null,
            discountPct: detectedDiscountPct,
            diffAmount,
            diffPercent,
            status: 'MISMATCH_HIGHER',
            statusText: comparisonMode === 'base' ? '🔴 Base Web Mayor' : '🔴 Precio Web Mayor',
            badgeColor: '#f87171',
          });
        } else {
          lowerWebCount++;
          comparisonResults.push({
            skuId: item.skuId,
            description: productName,
            xstorePrice: item.xstorePrice,
            targetWebPrice,
            webFinalPrice,
            basePrice: regularPrice,
            listPrice: dbRow.list_price != null ? Number(dbRow.list_price) : null,
            promoName: dbRow.promo_name || null,
            discountPct: detectedDiscountPct,
            diffAmount,
            diffPercent,
            status: 'MISMATCH_LOWER',
            statusText: comparisonMode === 'base' ? '🟡 Base Web Menor' : '🟡 Precio Web Menor',
            badgeColor: '#fbbf24',
          });
        }
      }
    }

    const totalAudited = validItems.length;
    const matchPercentage = totalAudited > 0 ? ((matchCount / totalAudited) * 100).toFixed(1) : '0';

    return NextResponse.json({
      success: true,
      comparisonMode,
      stats: {
        totalAudited,
        matchCount,
        mismatchCount,
        notFoundCount,
        higherWebCount,
        lowerWebCount,
        matchPercentage,
      },
      results: comparisonResults,
    });
  } catch (err) {
    console.error('Error procesando comparador de precios:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
