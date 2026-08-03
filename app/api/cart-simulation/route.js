import { NextResponse } from 'next/server';
import { isVtexConfigured, simulateSkuPrice } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/cart-simulation
 * Body: { skuIds: Array<string | number> }
 */
export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado correctamente.' }, { status: 400 });
    }

    const body = await request.json();
    let rawItems = [];

    if (Array.isArray(body.skuIds)) {
      rawItems = body.skuIds;
    } else if (Array.isArray(body.items)) {
      rawItems = body.items;
    } else if (body.skuId) {
      rawItems = [{ skuId: body.skuId, quantity: body.quantity || 1 }];
    }

    // Normalizar elementos a objetos { skuId, quantity }
    const itemsToSimulate = rawItems
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const sId = String(item.skuId || item.id || '').trim();
          const qty = parseInt(item.quantity || item.cant || '1', 10) || 1;
          return { skuId: sId, quantity: Math.max(1, qty) };
        }
        const sId = String(item || '').trim();
        return { skuId: sId, quantity: 1 };
      })
      .filter((item) => Boolean(item.skuId) && item.skuId !== 'undefined' && item.skuId !== 'null');

    if (itemsToSimulate.length === 0) {
      return NextResponse.json({ success: false, error: 'No se enviaron SKUs válidos para simular.' }, { status: 400 });
    }

    // Limitar máximo de SKUs por solicitud para evitar timeouts
    const MAX_SKUS = 1000;
    if (itemsToSimulate.length > MAX_SKUS) {
      return NextResponse.json({ success: false, error: `Máximo ${MAX_SKUS} SKUs por simulación. Se recibieron ${itemsToSimulate.length}.` }, { status: 400 });
    }

    const results = [];
    const BATCH_SIZE = 5; // Concurrencia controlada para no saturar VTEX

    for (let i = 0; i < itemsToSimulate.length; i += BATCH_SIZE) {
      const batch = itemsToSimulate.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (targetItem) => {
          try {
            return await simulateSkuPrice(targetItem.skuId, targetItem.quantity);
          } catch (err) {
            return {
              skuId: targetItem.skuId,
              quantity: targetItem.quantity,
              status: 'error',
              error: err.message,
              hasRegalias: false,
              regalias: [],
              selectableGiftsOptions: [],
              missingGiftDiagnostics: [],
            };
          }
        })
      );
      results.push(...batchResults);

      // Pequeña pausa entre lotes si hay más ítems
      if (i + BATCH_SIZE < itemsToSimulate.length) {
        await new Promise((res) => setTimeout(res, 200));
      }
    }

    return NextResponse.json({
      success: true,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error('Error en API /api/cart-simulation:', err);
    return NextResponse.json({ success: false, error: err.message || 'Error en simulación' }, { status: 500 });
  }
}
