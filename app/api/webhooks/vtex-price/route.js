import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { fetchSkuPrice } from '@/lib/vtex';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const rawData = await request.json().catch(() => ({}));

    // Soporte para objeto único o array de eventos enviados por VTEX Broadcaster
    const items = Array.isArray(rawData) ? rawData : [rawData];

    const results = [];

    for (const item of items) {
      const skuId =
        item?.skuId ||
        item?.itemId ||
        item?.IdSku ||
        item?.id ||
        item?.handle ||
        item?.SkuId ||
        item?.idSku;

      if (!skuId) continue;

      const numericSkuId = parseInt(skuId, 10);
      if (isNaN(numericSkuId)) continue;

      // 1. Si el webhook ya trae precios directos en la notificación
      let listPrice = item.listPrice !== undefined ? item.listPrice : null;
      let basePrice =
        item.basePrice !== undefined
          ? item.basePrice
          : item.value !== undefined
          ? item.value
          : item.price !== undefined
          ? item.price
          : null;
      let costPrice = item.costPrice !== undefined ? item.costPrice : null;

      // 2. Si no trae precios directos o requiere refresco completo, consultar VTEX Pricing API con la nueva lógica del Canal Principal
      const priceData = await fetchSkuPrice(numericSkuId);
      if (priceData) {
        listPrice = priceData.listPrice;
        basePrice = priceData.basePrice;
        costPrice = priceData.costPrice;
      }

      const nowIso = new Date().toISOString();
      const payload = {
        id: numericSkuId,
        list_price: listPrice,
        base_price: basePrice,
        cost_price: costPrice,
        price_updated_at: nowIso,
        updated_at: nowIso,
      };

      if (isSupabaseConfigured()) {
        await supabaseAdmin.from('vtex_skus').upsert([payload], { onConflict: 'id' });
      }

      results.push({ skuId: numericSkuId, basePrice, listPrice });
    }

    return NextResponse.json({
      success: true,
      message: `Webhook de VTEX procesado exitosamente para ${results.length} SKU(s).`,
      processed: results,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    status: 'Webhook de Precios VTEX activo.',
    endpoint: '/api/webhooks/vtex-price',
  });
}
