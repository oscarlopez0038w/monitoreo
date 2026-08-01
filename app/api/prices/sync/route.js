import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchSkuPrice } from '@/lib/vtex';

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
    const limit = body.limit ? parseInt(body.limit, 10) : 500;
    const forceAll = body.forceAll === true;

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
        price_updated_at: nowIso,
        updated_at: nowIso,
      };

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

    // Caso 2: Sincronización masiva por lotes
    // Priorizar los SKUs que aún no tienen precio (base_price IS NULL) para avanzar secuencialmente en el catálogo
    let skusToSync = [];
    
    if (!forceAll) {
      const { data: unpricedSkus } = await supabaseAdmin
        .from('vtex_skus')
        .select('id')
        .is('base_price', null)
        .limit(limit);

      if (unpricedSkus && unpricedSkus.length > 0) {
        skusToSync = unpricedSkus;
      }
    }

    // Si todos ya tienen precio o si forceAll es true, tomar los SKUs con fecha de sincronización más antigua
    if (skusToSync.length === 0) {
      const { data: oldestSkus } = await supabaseAdmin
        .from('vtex_skus')
        .select('id')
        .order('price_updated_at', { ascending: true, nullsFirst: true })
        .limit(limit);

      skusToSync = oldestSkus || [];
    }

    if (skusToSync.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No hay SKUs pendientes para actualizar.',
      }, { status: 400 });
    }

    const skuIds = skusToSync.map((s) => s.id);
    let updatedCount = 0;
    let failedCount = 0;
    const BATCH_SIZE = 25;
    const nowIso = new Date().toISOString();

    for (let i = 0; i < skuIds.length; i += BATCH_SIZE) {
      const batchIds = skuIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batchIds.map((skuId) => fetchSkuPrice(skuId).catch(() => null))
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
            price_updated_at: nowIso,
            updated_at: nowIso,
          });
          updatedCount++;
        } else {
          failedCount++;
        }
      });

      if (upsertRows.length > 0) {
        await supabaseAdmin.from('vtex_skus').upsert(upsertRows, { onConflict: 'id' });
      }
    }

    // Contar cuántos SKUs faltan por sincronizar
    const { count: remainingUnpriced } = await supabaseAdmin
      .from('vtex_skus')
      .select('id', { count: 'exact', head: true })
      .is('base_price', null);

    return NextResponse.json({
      success: true,
      updatedCount,
      failedCount,
      totalProcessed: skuIds.length,
      remainingUnpriced: remainingUnpriced || 0,
      message: `Lote sincronizado: ${updatedCount} precios guardados. Quedan ${remainingUnpriced || 0} SKUs pendientes.`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
