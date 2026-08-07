import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexTransactionsBatch, fetchVtexTransactionDetail, fetchVtexTransactionInteractions, fetchVtexOrders } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Handler para Vercel Cron Job (GET /api/cron/sync-transactions - Cada 60s)
export async function GET(request) {
  return handleTransactionsCron(request);
}

export async function POST(request) {
  return handleTransactionsCron(request);
}

async function handleTransactionsCron(request) {
  const startTime = Date.now();

  try {
    // 1. Validar seguridad del encabezado Authorization: Bearer ${CRON_SECRET} si la variable está definida
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Acceso no autorizado' }, { status: 401 });
    }

    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    // 2. Obtener la fecha de hoy en Nicaragua
    const nicNow = getNicaraguaNow();
    const todayStr = nicNow.todayStr;

    // 3. Consultar lote de transacciones recientes desde la API de VTEX Payment System / PCI Gateway
    const rawTransactions = await fetchVtexTransactionsBatch({
      startDate: todayStr,
      endDate: todayStr,
      limit: 100,
    });

    let approvedCount = 0;
    let canceledCount = 0;
    let totalApprovedAmount = 0;
    let totalCanceledAmount = 0;
    const dbPayloads = [];

    if (Array.isArray(rawTransactions)) {
      const nowIso = new Date().toISOString();

      rawTransactions.forEach((tx) => {
        const value = typeof tx.value === 'number' ? tx.value : (parseFloat(tx.value) || 0);
        const status = (tx.status || '').toLowerCase();
        const isApproved = status === 'approved' || status === 'completed' || status === 'finished';
        const isCanceled = status === 'canceled' || status === 'refused' || status === 'payment-denied';

        if (isApproved) {
          approvedCount++;
          totalApprovedAmount += value;
        } else if (isCanceled) {
          canceledCount++;
          totalCanceledAmount += value;
        }

        const txId = String(tx.id || tx.transactionId || tx.key || '');
        if (txId) {
          dbPayloads.push({
            transaction_id: txId,
            order_id: tx.orderId || null,
            status: tx.status || 'Pending',
            start_date: tx.startDate || nowIso,
            amount: value,
            created_at: nowIso,
            updated_at: nowIso,
          });
        }
      });

      // 4. Si Supabase está configurado, guardar/actualizar en vtex_transactions para lecturas a <10ms
      if (isSupabaseConfigured() && dbPayloads.length > 0) {
        try {
          await supabaseAdmin
            .from('vtex_transactions')
            .upsert(dbPayloads, { onConflict: 'transaction_id' });
        } catch (dbErr) {
          console.warn('Aviso: vtex_transactions no existe aún en Supabase o falló upsert:', dbErr.message);
        }
      }
    }

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

    return NextResponse.json({
      success: true,
      jobType: 'TRANSACTIONS_SYNC_60S',
      dateAudited: todayStr,
      totalValidated: Array.isArray(rawTransactions) ? rawTransactions.length : 0,
      approvedCount,
      canceledCount,
      totalApprovedAmount: Math.round(totalApprovedAmount * 100) / 100,
      totalCanceledAmount: Math.round(totalCanceledAmount * 100) / 100,
      durationSeconds: `${durationSeconds}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error en Vercel Cron Sync Transactions:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
