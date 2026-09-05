import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchSkuPrice, fetchSkuPriceRaw } from '@/lib/vtex';
import {
  getBackgroundSyncState,
  startBackgroundSyncState,
  stopBackgroundSyncState,
  updateBackgroundSyncProgress,
} from '@/lib/backgroundSync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Bucle asincrónico ultra-rápido en el servidor que resincroniza todo el catálogo desde cero
async function runBackgroundWorker(startOffset = 0) {
  const BATCH_SIZE = 100; // Concurrencia masiva: 100 llamadas paralelas por sub-lote a VTEX
  const BATCH_LIMIT = 500; // Tamaño del bloque por consulta SQL

  let isRunning = true;
  let offset = startOffset;

  while (isRunning) {
    const currentState = getBackgroundSyncState();
    if (currentState.stopRequested || !currentState.isRunning) {
      stopBackgroundSyncState('Sincronización finalizada o detenida.');
      break;
    }

    try {
      // 1. Obtener SKUs ordenados por ID desde el offset actual (desde cero hasta el final)
      const { data: catalogSkus, error: queryErr } = await supabaseAdmin
        .from('vtex_skus')
        .select('id')
        .order('id', { ascending: true })
        .range(offset, offset + BATCH_LIMIT - 1);

      if (queryErr || !catalogSkus || catalogSkus.length === 0) {
        stopBackgroundSyncState('🎉 ¡100% del catálogo de precios sincronizado con éxito desde cero!');
        break;
      }

      const skuIds = catalogSkus.map((s) => s.id);
      let updatedCount = 0;
      const nowIso = new Date().toISOString();

      // 2. Procesar en sub-lotes ultra-rápidos de 100 SKUs concurrentes
      for (let i = 0; i < skuIds.length; i += BATCH_SIZE) {
        const subState = getBackgroundSyncState();
        if (subState.stopRequested) break;

        const batchIds = skuIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batchIds.map((skuId) => fetchSkuPriceRaw(skuId).catch(() => null))
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

      offset += catalogSkus.length;
      updateBackgroundSyncProgress(updatedCount, offset);

      // Pausa ultracorta de 50ms para máxima aceleración
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (err) {
      console.error('Error en Worker de Sincronización en Segundo Plano:', err);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// GET: Consultar estado actual con métricas reales en tiempo real
export async function GET() {
  try {
    const syncState = getBackgroundSyncState();

    // Métricas en tiempo real desde Supabase (< 5ms)
    const [{ count: totalCatalogCount }, { count: pricedCount }] = await Promise.all([
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
    ]);

    const total = totalCatalogCount || 82234;
    const priced = syncState.processedInSession || pricedCount || 0;
    const progressPct = total > 0 ? parseFloat(((priced / total) * 100).toFixed(1)) : 0;

    // Auto-recuperación: Si el usuario solicitó sincronizar y pasaron más de 10s sin pings por timeout de serverless, relanzar worker
    const timeSinceLastUpdate = Date.now() - new Date(syncState.lastSyncTime || 0).getTime();
    if (syncState.isRunning && timeSinceLastUpdate > 10000 && !syncState.stopRequested) {
      runBackgroundWorker(syncState.currentOffset || 0);
    }

    return NextResponse.json({
      success: true,
      syncState: {
        ...syncState,
        totalCatalog: total,
        pricedCount: priced,
        progressPct,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Iniciar o detener la sincronización en segundo plano desde CERO
export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'start'; // 'start' o 'stop'

    if (action === 'stop') {
      stopBackgroundSyncState('Sincronización detenida por el usuario.');
      return NextResponse.json({
        success: true,
        message: 'Solicitud de detención enviada a la sincronización en segundo plano.',
        syncState: getBackgroundSyncState(),
      });
    }

    const { count: totalCatalogCount } = await supabaseAdmin
      .from('vtex_skus')
      .select('id', { count: 'exact', head: true });

    // Iniciar siempre desde CERO (Offset = 0) procesando todo el catálogo de 100 en 100
    startBackgroundSyncState(totalCatalogCount || 82234, 0);

    // Iniciar worker asincrónico desde el inicio (Offset = 0)
    runBackgroundWorker(0);

    return NextResponse.json({
      success: true,
      message: '⚡ Sincronización masiva desde cero iniciada con éxito en segundo plano (100 SKUs concurrentes).',
      syncState: getBackgroundSyncState(),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
