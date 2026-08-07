import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchSkuInventory, fetchSkuDetails } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Handler para Vercel Cron Job (GET /api/cron/sync-inventory)
export async function GET(request) {
  return handleInventoryCron(request);
}

export async function POST(request) {
  return handleInventoryCron(request);
}

async function handleInventoryCron(request) {
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

    // 2. Obtener los 300 SKUs cuyos inventarios tengan la fecha de actualización más antigua o sean nulos
    const BATCH_LIMIT = 300;
    const { data: skusToSync, error: fetchErr } = await supabaseAdmin
      .from('vtex_skus')
      .select('id')
      .order('inventory_updated_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT);

    if (fetchErr) {
      throw new Error(`Error obteniendo SKUs para inventario: ${fetchErr.message}`);
    }

    if (!skusToSync || skusToSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay SKUs registrados para sincronizar inventario.',
        processedCount: 0,
      });
    }

    const skuIds = skusToSync.map((s) => s.id);
    const chunkSize = 20;
    const upsertPayloads = [];
    const nowIso = new Date().toISOString();

    // 3. Consultar inventarios en paralelo por bloques de 20
    for (let i = 0; i < skuIds.length; i += chunkSize) {
      const chunk = skuIds.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (skuId) => {
        const [inv, details] = await Promise.all([
          fetchSkuInventory(skuId),
          fetchSkuDetails(skuId),
        ]);

        if (!inv) return null;

        return {
          id: skuId,
          stock_wh1: inv.megaStock || 0,
          stock_wh2: inv.cedisStock || 0,
          total_stock: inv.totalAvailable || 0,
          is_active: details?.isActive ?? true,
          inventory_updated_at: nowIso,
          updated_at: nowIso,
        };
      });

      const chunkResults = await Promise.all(chunkPromises);
      for (const res of chunkResults) {
        if (res) upsertPayloads.push(res);
      }
    }

    // 4. Guardar inventarios actualizados en Supabase
    if (upsertPayloads.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('vtex_skus')
        .upsert(upsertPayloads, { onConflict: 'id' });

      if (upsertErr) {
        throw new Error(`Error guardando inventarios en Supabase: ${upsertErr.message}`);
      }
    }

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

    return NextResponse.json({
      success: true,
      jobType: 'INVENTORY_SYNC',
      processedCount: upsertPayloads.length,
      requestedCount: skuIds.length,
      durationSeconds: `${durationSeconds}s`,
      timestamp: nowIso,
    });
  } catch (err) {
    console.error('Error en Vercel Cron Sync Inventory:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
