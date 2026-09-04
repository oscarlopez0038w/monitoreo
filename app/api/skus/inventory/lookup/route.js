import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { fetchSkuInventory, fetchSkuDetails, isVtexConfigured } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/skus/inventory/lookup
 * Consulta masiva del inventario desglosado por tienda/bodega para una lista de SKUs
 * Entrada: { skuIds: number[], liveVtex?: boolean }
 */
export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rawSkuIds = Array.isArray(body.skuIds) ? body.skuIds : [];
    const liveVtex = body.liveVtex === true;

    // Normalizar y deduplicar SKUs
    const skuIds = Array.from(
      new Set(
        rawSkuIds
          .map((id) => parseInt(String(id).trim(), 10))
          .filter((id) => !isNaN(id) && id > 0)
      )
    );

    if (skuIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se enviaron SKUs válidos para consultar.',
      }, { status: 400 });
    }

    if (skuIds.length > 2000) {
      return NextResponse.json({
        success: false,
        error: 'El límite máximo por consulta es de 2,000 SKUs.',
      }, { status: 400 });
    }

    // 1. Consultar SKUs en Supabase vtex_skus en lotes de 1000
    const localSkusMap = new Map();
    const batchSize = 1000;

    for (let i = 0; i < skuIds.length; i += batchSize) {
      const slice = skuIds.slice(i, i + batchSize);
      const { data: rows, error } = await supabaseAdmin
        .from('vtex_skus')
        .select('id, name, ref_id, is_active, stock_wh1, wh1_total, wh1_reserved, stock_wh2, wh2_total, wh2_reserved, total_stock, total_quantity, total_reserved, inventory_detail, inventory_updated_at')
        .in('id', slice);

      if (!error && rows) {
        rows.forEach((r) => localSkusMap.set(r.id, r));
      }
    }

    // 2. Si se solicitó liveVtex = true O si hay SKUs faltantes en la BD, consultar VTEX Logistics API
    const skusToFetchFromVtex = liveVtex
      ? skuIds
      : skuIds.filter((id) => !localSkusMap.has(id));

    if (skusToFetchFromVtex.length > 0 && isVtexConfigured()) {
      const CONCURRENCY = 25;
      const vtexUpdates = [];

      for (let i = 0; i < skusToFetchFromVtex.length; i += CONCURRENCY) {
        const chunk = skusToFetchFromVtex.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map(async (skuId) => {
            try {
              const [inv, details] = await Promise.all([
                fetchSkuInventory(skuId),
                localSkusMap.has(skuId) ? null : fetchSkuDetails(skuId).catch(() => null),
              ]);
              return { skuId, inv, details };
            } catch (e) {
              return { skuId, inv: null, details: null };
            }
          })
        );

        results.forEach(({ skuId, inv, details }) => {
          if (inv) {
            const isExistingInDb = localSkusMap.has(skuId);
            const existing = localSkusMap.get(skuId) || {};
            const updatedItem = {
              id: skuId,
              name: details?.name || existing.name || (isExistingInDb ? `SKU #${skuId}` : 'No registrado en catálogo'),
              ref_id: details?.refId || existing.ref_id || null,
              is_active: details ? details.isActive : (existing.is_active ?? true),
              stock_wh1: inv.stockWh1 ?? 0,
              wh1_total: inv.wh1Total ?? 0,
              wh1_reserved: inv.wh1Reserved ?? 0,
              stock_wh2: inv.stockWh2 ?? 0,
              wh2_total: inv.wh2Total ?? 0,
              wh2_reserved: inv.wh2Reserved ?? 0,
              total_stock: inv.totalStock ?? 0,
              total_quantity: inv.totalQuantity ?? 0,
              total_reserved: inv.totalReserved ?? 0,
              inventory_detail: inv.balance || [],
              inventory_updated_at: new Date().toISOString(),
            };

            localSkusMap.set(skuId, updatedItem);
            // Solo actualizar en Supabase si el SKU ya existe en la base de datos y se solicitó liveVtex
            // para NO ensuciar la tabla vtex_skus con SKUs de prueba o fuera de catálogo
            if (isExistingInDb && liveVtex) {
              vtexUpdates.push(updatedItem);
            }
          }
        });
      }

      // Guardar en segundo plano los datos actualizados de VTEX en Supabase
      if (vtexUpdates.length > 0) {
        try {
          await supabaseAdmin.from('vtex_skus').upsert(vtexUpdates, { onConflict: 'id' });
        } catch (dbErr) {
          console.error('Error guardando inventarios actualizados en Supabase:', dbErr);
        }
      }
    }

    // 3. Formatear y construir la respuesta conservando el orden de los SKUs ingresados
    let totalAvailableSum = 0;
    let totalReservedSum = 0;
    let megaSum = 0;
    let cedisSum = 0;
    let withStockCount = 0;
    let outOfStockCount = 0;
    let notFoundCount = 0;

    const formattedList = skuIds.map((skuId) => {
      const item = localSkusMap.get(skuId);

      if (!item) {
        notFoundCount++;
        return {
          id: skuId,
          name: 'No encontrado en catálogo',
          refId: null,
          isActive: false,
          stockMega: 0,
          wh1Total: 0,
          wh1Reserved: 0,
          stockCedis: 0,
          wh2Total: 0,
          wh2Reserved: 0,
          totalStock: 0,
          totalQuantity: 0,
          totalReserved: 0,
          inventoryDetail: [],
          status: 'No encontrado',
          inventoryUpdatedAt: null,
        };
      }

      const stockMega = item.stock_wh1 ?? 0;
      const stockCedis = item.stock_wh2 ?? 0;
      const totalStock = item.total_stock ?? 0;
      const totalReserved = item.total_reserved ?? 0;
      const totalQuantity = item.total_quantity ?? 0;

      totalAvailableSum += totalStock;
      totalReservedSum += totalReserved;
      megaSum += stockMega;
      cedisSum += stockCedis;

      if (totalStock > 0) {
        withStockCount++;
      } else {
        outOfStockCount++;
      }

      return {
        id: item.id,
        name: item.name || `SKU #${item.id}`,
        refId: item.ref_id || null,
        isActive: item.is_active ?? true,
        stockMega,
        wh1Total: item.wh1_total ?? 0,
        wh1Reserved: item.wh1_reserved ?? 0,
        stockCedis,
        wh2Total: item.wh2_total ?? 0,
        wh2Reserved: item.wh2_reserved ?? 0,
        totalStock,
        totalQuantity,
        totalReserved,
        inventoryDetail: item.inventory_detail || [],
        status: totalStock > 0 ? 'Con Stock' : 'Agotado',
        inventoryUpdatedAt: item.inventory_updated_at || null,
      };
    });

    return NextResponse.json({
      success: true,
      totalRequested: skuIds.length,
      foundCount: skuIds.length - notFoundCount,
      notFoundCount,
      summary: {
        totalAvailable: totalAvailableSum,
        totalReserved: totalReservedSum,
        stockMega: megaSum,
        stockCedis: cedisSum,
        withStockCount,
        outOfStockCount,
      },
      skus: formattedList,
    });
  } catch (err) {
    console.error('Error en POST /api/skus/inventory/lookup:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
