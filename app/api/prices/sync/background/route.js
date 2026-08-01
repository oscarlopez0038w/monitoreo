import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchSkuPrice } from '@/lib/vtex';
import {
  getBackgroundSyncState,
  startBackgroundSyncState,
  stopBackgroundSyncState,
  updateBackgroundSyncProgress,
} from '@/lib/backgroundSync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Bucle asincrónico ultra-rápido en el servidor
async function runBackgroundWorker() {
  const BATCH_SIZE = 50; // Concurrencia de 50 llamadas paralelas a VTEX Pricing API
  const BATCH_LIMIT = 500; // Tamaño del bloque por ciclo de trabajo

  let isRunning = true;

  while (isRunning) {
    const currentState = getBackgroundSyncState();
    if (currentState.stopRequested || !currentState.isRunning) {
      stopBackgroundSyncState('Sincronización finalizada o detenida.');
      break;
    }

    try {
      // 1. Obtener SKUs pendientes de precio
      const { data: unpricedSkus, error: queryErr } = await supabaseAdmin
        .from('vtex_skus')
        .select('id')
        .is('base_price', null)
        .limit(BATCH_LIMIT);

      if (queryErr || !unpricedSkus || unpricedSkus.length === 0) {
        stopBackgroundSyncState('✅ Todo el catálogo de precios ha sido completado exitosamente.');
        break;
      }

      const skuIds = unpricedSkus.map((s) => s.id);
      let updatedCount = 0;
      const nowIso = new Date().toISOString();

      // Procesar sub-lotes paralelos de 50 SKUs
      for (let i = 0; i < skuIds.length; i += BATCH_SIZE) {
        const subState = getBackgroundSyncState();
        if (subState.stopRequested) break;

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
          }
        });

        if (upsertRows.length > 0) {
          await supabaseAdmin.from('vtex_skus').upsert(upsertRows, { onConflict: 'id' });
        }
      }

      // Contar pendientes en Supabase
      const { count: remainingUnpriced } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact', head: true })
        .is('base_price', null);

      updateBackgroundSyncProgress(updatedCount, remainingUnpriced || 0);

      if (!remainingUnpriced || remainingUnpriced === 0) {
        stopBackgroundSyncState('🎉 ¡100% de SKUs sincronizados con éxito!');
        break;
      }

      // Pausa ultracorta de 100ms para máxima velocidad
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    const [{ count: totalCatalogCount }, { count: remainingUnpriced }, { count: pricedCount }] = await Promise.all([
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).is('base_price', null),
      supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
    ]);

    const total = totalCatalogCount || 82234;
    const priced = pricedCount || Math.max(0, total - (remainingUnpriced || 0));
    const progressPct = total > 0 ? parseFloat(((priced / total) * 100).toFixed(1)) : 0;

    // Auto-recuperación: Si el usuario solicitó sincronizar y pasaron más de 10s sin pings por timeout de serverless, relanzar worker
    const timeSinceLastUpdate = Date.now() - new Date(syncState.lastSyncTime || 0).getTime();
    if (syncState.isRunning && timeSinceLastUpdate > 10000 && !syncState.stopRequested) {
      runBackgroundWorker();
    }

    return NextResponse.json({
      success: true,
      syncState: {
        ...syncState,
        totalCatalog: total,
        pricedCount: priced,
        remainingUnpriced: remainingUnpriced || 0,
        progressPct,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Iniciar o detener la sincronización en segundo plano
export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
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

    const currentState = getBackgroundSyncState();
    if (currentState.isRunning && !currentState.stopRequested) {
      return NextResponse.json({
        success: true,
        message: 'La sincronización en segundo plano ya se encuentra en ejecución.',
        syncState: currentState,
      });
    }

    // 1. Obtener conteo inicial de SKUs sin precio en Supabase
    const { count: unpricedCount } = await supabaseAdmin
      .from('vtex_skus')
      .select('id', { count: 'exact', head: true })
      .is('base_price', null);

    const { count: totalCatalogCount } = await supabaseAdmin
      .from('vtex_skus')
      .select('id', { count: 'exact', head: true });

    startBackgroundSyncState(totalCatalogCount || 82234, unpricedCount || 0);

    // 2. Iniciar worker asincrónico sin bloquear la respuesta HTTP
    runBackgroundWorker();

    return NextResponse.json({
      success: true,
      message: '⚡ Sincronización ultra-rápida en segundo plano iniciada con éxito.',
      syncState: getBackgroundSyncState(),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
