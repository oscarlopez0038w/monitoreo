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

// Bucle asincrónico que se ejecuta en el servidor en segundo plano
async function runBackgroundWorker() {
  const BATCH_SIZE = 25; // Tamaño del sub-lote concurrente de VTEX
  const BATCH_LIMIT = 500; // Tamaño del bloque por ciclo de trabajo

  let isRunning = true;

  while (isRunning) {
    const currentState = getBackgroundSyncState();
    if (currentState.stopRequested || !currentState.isRunning) {
      stopBackgroundSyncState('Sincronización finalizada o detenida.');
      break;
    }

    try {
      // 1. Obtener SKUs que aún no tienen precio
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

      // Procesar en sub-lotes pequeños concurrentes con reintentos
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

      // Contar pendientes
      const { count: remainingUnpriced } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact', head: true })
        .is('base_price', null);

      updateBackgroundSyncProgress(updatedCount, remainingUnpriced || 0);

      if (!remainingUnpriced || remainingUnpriced === 0) {
        stopBackgroundSyncState('🎉 ¡100% de SKUs sincronizados con éxito!');
        break;
      }

      // Pausa corta entre bloques para evitar aceleración de tasa
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (err) {
      console.error('Error en Worker de Sincronización en Segundo Plano:', err);
      // Pausa en caso de error y reintento
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

// GET: Consultar estado actual de la sincronización en segundo plano
export async function GET() {
  try {
    const syncState = getBackgroundSyncState();

    let totalCount = 0;
    let pricedCount = 0;

    if (isSupabaseConfigured()) {
      const [{ count: total }, { count: priced }] = await Promise.all([
        supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
      ]);

      totalCount = total || 0;
      pricedCount = priced || 0;
    }

    const progressPct = totalCount > 0 ? parseFloat(((pricedCount / totalCount) * 100).toFixed(1)) : 0;

    return NextResponse.json({
      success: true,
      syncState,
      stats: {
        totalCount,
        pricedCount,
        progressPct,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Iniciar o Detener el proceso en segundo plano
export async function POST(request) {
  try {
    if (!isVtexConfigured() || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX o Supabase no están configurados.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'start'; // 'start' o 'stop'

    if (action === 'stop') {
      stopBackgroundSyncState('Sincronización en segundo plano detenida por el usuario.');
      return NextResponse.json({
        success: true,
        message: 'Solicitud de parada enviada al servidor.',
      });
    }

    const currentStatus = getBackgroundSyncState();
    if (currentStatus.isRunning) {
      return NextResponse.json({
        success: true,
        message: 'La sincronización ya está en ejecución en el servidor.',
        syncState: currentStatus,
      });
    }

    // Iniciar trabajador asincrónico sin bloquear la respuesta HTTP
    startBackgroundSyncState();
    runBackgroundWorker().catch((err) => console.error('Error fatal en worker:', err));

    return NextResponse.json({
      success: true,
      message: '⚡ Sincronización en segundo plano iniciada exitosamente en el servidor.',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
