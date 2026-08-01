import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { fetchSkuPrice } from '@/lib/vtex';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Detectar SKU ID enviado por el webhook de VTEX
    const skuId = body.skuId || body.itemId || body.IdSku || body.id;

    if (!skuId) {
      return NextResponse.json(
        { success: false, error: 'No se especificó SKU ID en la notificación de VTEX.' },
        { status: 400 }
      );
    }

    const numericSkuId = parseInt(skuId, 10);
    if (isNaN(numericSkuId)) {
      return NextResponse.json({ success: false, error: 'SKU ID inválido.' }, { status: 400 });
    }

    // 1. Si el webhook ya trae los precios directos
    let listPrice = body.listPrice !== undefined ? body.listPrice : null;
    let basePrice = body.basePrice !== undefined ? body.basePrice : (body.value !== undefined ? body.value : null);
    let costPrice = body.costPrice !== undefined ? body.costPrice : null;

    // 2. Si no trae los precios directos, consultar en caliente VTEX Pricing API
    if (listPrice === null || basePrice === null) {
      const priceData = await fetchSkuPrice(numericSkuId);
      if (priceData) {
        listPrice = priceData.listPrice;
        basePrice = priceData.basePrice;
        costPrice = priceData.costPrice;
      }
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

    return NextResponse.json({
      success: true,
      message: `Webhook de precio procesado exitosamente para SKU ${numericSkuId}.`,
      skuId: numericSkuId,
      prices: { listPrice, basePrice, costPrice },
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
