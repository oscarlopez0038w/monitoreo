import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchSkuPrice } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Handler para Vercel Cron Job (GET /api/cron/sync-prices)
export async function GET(request) {
  return handlePriceCron(request);
}

export async function POST(request) {
  return handlePriceCron(request);
}

async function handlePriceCron(request) {
  const startTime = Date.now();

  try {
    // 1. Validar seguridad del encabezado Authorization: Bearer ${CRON_SECRET} si la variable está definida
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Acceso no autorizado' }, { status: 401 });
    }

    if (!isVtexConfigured() || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Credenciales de VTEX o Supabase no están configuradas.' },
        { status: 400 }
      );
    }

    // 2. Obtener los 300 SKUs cuyos precios tengan la fecha de actualización más antigua o sean nulos
    const BATCH_LIMIT = 300;
    const { data: skusToSync, error: fetchErr } = await supabaseAdmin
      .from('vtex_skus')
      .select('id')
      .order('price_updated_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      throw new Error(`Error obteniendo SKUs para precios: ${fetchErr.message}`);
    }

    if (!skusToSync || skusToSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay SKUs registrados para sincronizar precios.',
        processedCount: 0,
      });
    }

    const skuIds = skusToSync.map((s) => s.id);
    const chunkSize = 20;
    const upsertPayloads = [];
    const nowIso = new Date().toISOString();

    // 3. Consultar precios en paralelo por bloques de 20 resolviendo el mejor precio vigente de VTEX Pricing API
    for (let i = 0; i < skuIds.length; i += chunkSize) {
      const chunk = skuIds.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (skuId) => {
        const priceData = await fetchSkuPrice(skuId);
        if (!priceData) return null;

        return {
          id: skuId,
          list_price: priceData.listPrice,
          base_price: priceData.basePrice,
          cost_price: priceData.costPrice,
          price_updated_at: nowIso,
          updated_at: nowIso,
        };
      });

      const chunkResults = await Promise.all(chunkPromises);
      for (const res of chunkResults) {
        if (res) upsertPayloads.push(res);
      }
    }

    // 4. Guardar precios actualizados en Supabase
    if (upsertPayloads.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('vtex_skus')
        .upsert(upsertPayloads, { onConflict: 'id' });

      if (upsertErr) {
        throw new Error(`Error guardando precios en Supabase: ${upsertErr.message}`);
      }
    }

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

    return NextResponse.json({
      success: true,
      jobType: 'PRICE_SYNC',
      processedCount: upsertPayloads.length,
      requestedCount: skuIds.length,
      durationSeconds: `${durationSeconds}s`,
      timestamp: nowIso,
    });
  } catch (err) {
    console.error('Error en Vercel Cron Sync Prices:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
