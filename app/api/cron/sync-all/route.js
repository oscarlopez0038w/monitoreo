import { NextResponse } from 'next/server';
import {
  isVtexConfigured,
  fetchVtexTransactionsBatch,
  fetchSkuInventory,
  fetchSkuDetails,
  fetchSkuPrice,
} from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Handler Unificado de Cron Job para Vercel (1 solo Cron Job compatible con plan Hobby/Pro)
export async function GET(request) {
  return handleSyncAll(request);
}

export async function POST(request) {
  return handleSyncAll(request);
}

async function handleSyncAll(request) {
  const startTime = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Acceso no autorizado' }, { status: 401 });
  }

  // 1. Sincronizar Transacciones recientes de VTEX
  let txSyncedCount = 0;
  if (isVtexConfigured()) {
    try {
      const nicNow = getNicaraguaNow();
      const rawTx = await fetchVtexTransactionsBatch({
        startDate: nicNow.todayStr,
        endDate: nicNow.todayStr,
        limit: 50,
      });

      if (Array.isArray(rawTx) && rawTx.length > 0 && isSupabaseConfigured()) {
        const nowIso = new Date().toISOString();
        const dbPayloads = rawTx.map((tx) => ({
          transaction_id: String(tx.id || tx.transactionId || tx.key || tx.orderId),
          order_id: tx.orderId || null,
          status: tx.status || 'Pending',
          start_date: tx.startDate || nowIso,
          amount: typeof tx.value === 'number' ? tx.value : (parseFloat(tx.value) || 0),
          updated_at: nowIso,
        }));

        await supabaseAdmin.from('vtex_transactions').upsert(dbPayloads, { onConflict: 'transaction_id' });
        txSyncedCount = dbPayloads.length;
      }
    } catch (e) {
      console.warn('Aviso en sync-all transacciones:', e.message);
    }
  }

  // 2. Sincronizar Inventario (Lote de 50 SKUs)
  let invSyncedCount = 0;
  if (isVtexConfigured() && isSupabaseConfigured()) {
    try {
      const { data: skus } = await supabaseAdmin
        .from('vtex_skus')
        .select('id')
        .order('inventory_updated_at', { ascending: true, nullsFirst: true })
        .limit(50);

      if (skus && skus.length > 0) {
        const nowIso = new Date().toISOString();
        const invPayloads = await Promise.all(
          skus.map(async (s) => {
            const [inv, details] = await Promise.all([fetchSkuInventory(s.id), fetchSkuDetails(s.id)]);
            if (!inv) return null;
            return {
              id: s.id,
              stock_wh1: inv.megaStock || 0,
              stock_wh2: inv.cedisStock || 0,
              total_stock: inv.totalAvailable || 0,
              is_active: details?.isActive ?? true,
              inventory_updated_at: nowIso,
              updated_at: nowIso,
            };
          })
        );
        const validInv = invPayloads.filter(Boolean);
        if (validInv.length > 0) {
          await supabaseAdmin.from('vtex_skus').upsert(validInv, { onConflict: 'id' });
          invSyncedCount = validInv.length;
        }
      }
    } catch (e) {
      console.warn('Aviso en sync-all inventario:', e.message);
    }
  }

  // 3. Sincronizar Precios (Lote de 50 SKUs)
  let priceSyncedCount = 0;
  if (isVtexConfigured() && isSupabaseConfigured()) {
    try {
      const { data: skus } = await supabaseAdmin
        .from('vtex_skus')
        .select('id')
        .order('price_updated_at', { ascending: true, nullsFirst: true })
        .limit(50);

      if (skus && skus.length > 0) {
        const nowIso = new Date().toISOString();
        const pricePayloads = await Promise.all(
          skus.map(async (s) => {
            const priceData = await fetchSkuPrice(s.id);
            if (!priceData) return null;
            return {
              id: s.id,
              list_price: priceData.listPrice,
              base_price: priceData.basePrice,
              cost_price: priceData.costPrice,
              price_updated_at: nowIso,
              updated_at: nowIso,
            };
          })
        );
        const validPrices = pricePayloads.filter(Boolean);
        if (validPrices.length > 0) {
          await supabaseAdmin.from('vtex_skus').upsert(validPrices, { onConflict: 'id' });
          priceSyncedCount = validPrices.length;
        }
      }
    } catch (e) {
      console.warn('Aviso en sync-all precios:', e.message);
    }
  }

  const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  return NextResponse.json({
    success: true,
    jobType: 'SYNC_ALL_BACKGROUND_JOB',
    summary: {
      transactionsSynced: txSyncedCount,
      inventorySynced: invSyncedCount,
      pricesSynced: priceSyncedCount,
    },
    durationSeconds: `${durationSeconds}s`,
  });
}
