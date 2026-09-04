import { NextResponse } from 'next/server';
import { fetchSkuInventory, fetchSkuDetails, isVtexConfigured } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    if (!isVtexConfigured() || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Credenciales incompletas en .env.local' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let targetSkuIds = body.skuIds || [];

    // Si no se envían skuIds específicos, obtenemos los SKUs pendientes de este ciclo de sincronización
    if (targetSkuIds.length === 0) {
      const limit = parseInt(body.limit || '500', 10);
      const syncStartTime = body.syncStartTime || null;

      let query = supabaseAdmin
        .from('vtex_skus')
        .select('id');

      // Filtrar solo los SKUs que no se han actualizado en la sesión activa
      if (syncStartTime) {
        query = query.or(`inventory_updated_at.is.null,inventory_updated_at.lt.${syncStartTime}`);
      }

      const { data: skusToUpdate, error } = await query
        .order('inventory_updated_at', { ascending: true, nullsFirst: true })
        .limit(limit);

      if (error) throw new Error(error.message);
      targetSkuIds = (skusToUpdate || []).map((item) => item.id);
    }

    if (targetSkuIds.length === 0) {
      return NextResponse.json({
        success: true,
        processedCount: 0,
        message: 'No hay más SKUs pendientes en este ciclo de inventario.',
      });
    }

    // Solo consultar fetchSkuDetails si es un SKU individual bajo demanda (ej. botón refrescar en la tabla)
    const isSingleSku = targetSkuIds.length === 1;
    const checkDetails = body.checkDetails === true || isSingleSku;

    // Consultar inventario en VTEX Logistics API en lotes paralelos (1 llamada por SKU en masivo)
    const results = [];
    const chunkSize = 25;

    for (let i = 0; i < targetSkuIds.length; i += chunkSize) {
      const chunk = targetSkuIds.slice(i, i + chunkSize);
      const promises = chunk.map(async (skuId) => {
        if (checkDetails) {
          const [inv, details] = await Promise.all([
            fetchSkuInventory(skuId),
            fetchSkuDetails(skuId).catch(() => null),
          ]);
          if (!inv) return null;
          return {
            ...inv,
            isActive: details ? details.isActive : undefined,
          };
        }

        // Sincronización masiva de inventario: Solo 1 llamada a Logistics API
        const inv = await fetchSkuInventory(skuId);
        return inv || null;
      });

      const chunkResults = await Promise.all(promises);

      for (const res of chunkResults) {
        if (res) {
          results.push(res);
        }
      }
    }

    // Actualizar los registros en Supabase (marcando inventory_updated_at con la fecha actual)
    const nowIso = new Date().toISOString();
    const rowsToUpdate = results.map((item) => {
      const row = {
        id: typeof item.skuId === 'number' ? item.skuId : parseInt(item.skuId, 10),
        wh1_total: item.wh1Total ?? 0,
        wh1_reserved: item.wh1Reserved ?? 0,
        stock_wh1: item.stockWh1 ?? 0,
        wh2_total: item.wh2Total ?? 0,
        wh2_reserved: item.wh2Reserved ?? 0,
        stock_wh2: item.stockWh2 ?? 0,
        total_quantity: item.totalQuantity ?? 0,
        total_reserved: item.totalReserved ?? 0,
        total_stock: item.totalStock ?? 0,
        inventory_detail: item.balance,
        inventory_updated_at: nowIso,
      };

      if (item.isActive !== undefined) {
        row.is_active = item.isActive;
      }

      return row;
    });

    if (rowsToUpdate.length > 0) {
      const DB_BATCH = 200;
      for (let i = 0; i < rowsToUpdate.length; i += DB_BATCH) {
        const batch = rowsToUpdate.slice(i, i + DB_BATCH);
        const { error: upsertError } = await supabaseAdmin
          .from('vtex_skus')
          .upsert(batch, { onConflict: 'id' });

        if (upsertError) {
          throw new Error(`Error guardando inventario en Supabase: ${upsertError.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: rowsToUpdate.length,
      updatedSkus: rowsToUpdate.map((r) => r.id),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
