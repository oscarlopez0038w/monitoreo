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

    // 2. Obtener descripciones desde vtex_safety_stock para complementar nombres
    const { data: safetyRows } = await supabaseAdmin
      .from('vtex_safety_stock')
      .select('sku_id, description');

    const descMap = new Map();
    if (safetyRows) {
      safetyRows.forEach((r) => {
        if (r.sku_id && r.description) {
          descMap.set(r.sku_id, r.description);
        }
      });
    }

    // 3. Consultar por lotes de 1000 en Supabase los registros existentes de vtex_skus
    const skuIdList = Array.from(skuIdsToFetch);
    const BATCH_SIZE = 1000;
    const dbSkuMap = new Map();

    for (let i = 0; i < skuIdList.length; i += BATCH_SIZE) {
      const chunk = skuIdList.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabaseAdmin
        .from('vtex_skus')
        .select('id, base_price, list_price, is_active')
        .in('id', chunk);

      if (error) {
        console.error('Error consultando vtex_skus en comparador:', error.message);
      } else if (data) {
        for (const row of data) {
          dbSkuMap.set(row.id, row);
        }
      }
    }

    // 4. Comparar Precio Xstore Facturación vs. Precio Final Web (base_price)
    const comparisonResults = [];
    let matchCount = 0;
    let mismatchCount = 0;
    let notFoundCount = 0;
    let higherWebCount = 0;
    let lowerWebCount = 0;

    for (const item of validItems) {
      const dbRow = dbSkuMap.get(item.skuId);
      const productName = item.description || descMap.get(item.skuId) || 'Producto SINSA';

      if (!dbRow) {
        notFoundCount++;
        comparisonResults.push({
          skuId: item.skuId,
          description: productName,
          xstorePrice: item.xstorePrice,
          webFinalPrice: null,
          diffAmount: null,
          diffPercent: null,
          status: 'NOT_FOUND',
          statusText: 'No Encontrado en Web',
          badgeColor: '#94a3b8',
        });
        continue;
      }

      const webFinalPrice = dbRow.base_price != null ? Number(dbRow.base_price) : 0;
      const diffAmount = webFinalPrice - item.xstorePrice;
      const absDiff = Math.abs(diffAmount);

      // Margen de tolerancia de C$ 0.01 por decimales
      if (absDiff < 0.01) {
        matchCount++;
        comparisonResults.push({
          skuId: item.skuId,
          description: productName,
          xstorePrice: item.xstorePrice,
          webFinalPrice,
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
            webFinalPrice,
            diffAmount,
            diffPercent,
            status: 'MISMATCH_HIGHER',
            statusText: '🔴 Precio Web Mayor',
            badgeColor: '#f87171',
          });
        } else {
          lowerWebCount++;
          comparisonResults.push({
            skuId: item.skuId,
            description: productName,
            xstorePrice: item.xstorePrice,
            webFinalPrice,
            diffAmount,
            diffPercent,
            status: 'MISMATCH_LOWER',
            statusText: '🟡 Precio Web Menor',
            badgeColor: '#fbbf24',
          });
        }
      }
    }

    const totalAudited = validItems.length;
    const matchPercentage = totalAudited > 0 ? ((matchCount / totalAudited) * 100).toFixed(1) : '0';

    return NextResponse.json({
      success: true,
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
