import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchSkuPrice, fetchSkuPriceRaw } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const singleSkuId = body.skuId ? parseInt(body.skuId, 10) : null;
    const offset = body.offset !== undefined ? parseInt(body.offset, 10) : null;
    const limit = body.limit ? parseInt(body.limit, 10) : 150;

    // Caso 1: Sincronizar un SKU individual bajo demanda
    if (singleSkuId) {
      const priceData = await fetchSkuPrice(singleSkuId);
      if (!priceData) {
        return NextResponse.json(
          { success: false, error: `No se pudo obtener precio para SKU ${singleSkuId} en VTEX Pricing API.` },
          { status: 404 }
        );
      }

      const nowIso = new Date().toISOString();
      const payload = {
        id: singleSkuId,
        list_price: priceData.listPrice,
        base_price: priceData.basePrice,
        cost_price: priceData.costPrice,
        final_price: priceData.finalPrice !== undefined && priceData.finalPrice !== null
          ? priceData.finalPrice
          : priceData.basePrice,
        price_updated_at: nowIso,
        updated_at: nowIso,
      };

      // Si la simulación de checkout detectó una promo activa, guardar los datos de promo
      if (priceData.simPromoName) {
        payload.promo_name = priceData.simPromoName;
        payload.discount_pct = priceData.simDiscountPct || 0;
        payload.promotions_updated_at = nowIso;
      } else {
        // Si no hay promo de checkout, limpiar datos de promo obsoletos
        payload.promo_name = null;
        payload.promo_id = null;
        const refFinal = payload.final_price;
        const refList = payload.list_price;
        payload.discount_pct = refList && refFinal && refList > refFinal
          ? parseFloat((((refList - refFinal) / refList) * 100).toFixed(1))
          : (refList && priceData.basePrice && refList > priceData.basePrice
            ? parseFloat((((refList - priceData.basePrice) / refList) * 100).toFixed(1))
            : 0);
      }

      const { error: upsertErr } = await supabaseAdmin
        .from('vtex_skus')
        .upsert([payload], { onConflict: 'id' });

      if (upsertErr) {
        return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Precio del SKU ${singleSkuId} actualizado exitosamente desde VTEX.`,
        price: priceData,
      });
    }

    // Caso 2: Sincronización masiva por rango de offset (Ininterrumpido)
    const { count: totalCatalogCount } = await supabaseAdmin
      .from('vtex_skus')
      .select('id', { count: 'exact', head: true });

    const currentOffset = offset !== null ? offset : 0;

    const { data: skusToSync, error: queryErr } = await supabaseAdmin
      .from('vtex_skus')
      .select('id')
      .order('id', { ascending: true })
      .range(currentOffset, currentOffset + limit - 1);

    if (queryErr) {
      return NextResponse.json({ success: false, error: queryErr.message }, { status: 500 });
    }

    if (!skusToSync || skusToSync.length === 0) {
      return NextResponse.json({
        success: true,
        completed: true,
        processedCount: 0,
        nextOffset: currentOffset,
        totalCatalog: totalCatalogCount || 82234,
        message: '¡100% de SKUs sincronizados exitosamente!',
      });
    }

    const skuIds = skusToSync.map((s) => s.id);
    const BATCH_CONCURRENCY = 50; // 50 llamadas paralelas a VTEX por sub-lote
    const nowIso = new Date().toISOString();
    let updatedCount = 0;

    for (let i = 0; i < skuIds.length; i += BATCH_CONCURRENCY) {
      const batchIds = skuIds.slice(i, i + BATCH_CONCURRENCY);
      const results = await Promise.all(
        batchIds.map((id) => fetchSkuPriceRaw(id).catch(() => null))
      );

      const upsertRows = [];
      results.forEach((priceData, idx) => {
        const skuId = batchIds[idx];
        if (priceData) {
          upsertRows.push({
            id: skuId,
            list_price: priceData.listPrice,
            base_price: priceData.basePrice,
            cost_price: priceData.costPrice,
            final_price: priceData.basePrice,
            price_updated_at: nowIso,
            updated_at: nowIso,
          });
          updatedCount++;
        }
      });

      if (upsertRows.length > 0) {
        await supabaseAdmin.from('vtex_skus').upsert(upsertRows, { onConflict: 'id' });
      }
    }

    const nextOffset = currentOffset + skusToSync.length;
    const isCompleted = nextOffset >= (totalCatalogCount || 82234);

    return NextResponse.json({
      success: true,
      completed: isCompleted,
      processedCount: updatedCount,
      nextOffset,
      totalCatalog: totalCatalogCount || 82234,
      message: `Lote procesado: ${updatedCount} SKUs actualizados (${currentOffset} a ${nextOffset}).`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get('skuId');

    if (!skuId) {
      return NextResponse.json({ success: false, error: 'Se requiere el parámetro skuId.' }, { status: 400 });
    }

    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    const priceData = await fetchSkuPrice(skuId);
    if (!priceData) {
      return NextResponse.json({ success: false, error: `Precio no encontrado para SKU ${skuId} en VTEX.` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      skuId,
      costPrice: priceData.rawCostPrice !== undefined && priceData.rawCostPrice !== null ? priceData.rawCostPrice : priceData.costPrice,
      basePrice: priceData.rawBasePrice !== undefined && priceData.rawBasePrice !== null ? priceData.rawBasePrice : priceData.basePrice,
      listPrice: priceData.rawListPrice !== undefined && priceData.rawListPrice !== null ? priceData.rawListPrice : priceData.listPrice,
      fixedPrices: priceData.fixedPrices || [],
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
