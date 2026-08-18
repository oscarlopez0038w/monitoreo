import { NextResponse } from 'next/server';
import { getVtexConfig, isVtexConfigured } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      skuId,
      costPrice,
      basePrice,
      listPrice,
      hasFixedPrice,
      fixedPriceValue,
      fixedPriceListPrice,
      minQuantity,
      dateFrom,
      dateTo,
    } = body;

    if (!skuId) {
      return NextResponse.json({ success: false, error: 'El parámetro skuId es requerido.' }, { status: 400 });
    }

    const cleanSkuId = String(skuId).trim();
    const costP = costPrice !== null && costPrice !== undefined && costPrice !== '' ? Number(costPrice) : 0;
    const baseP = basePrice !== null && basePrice !== undefined && basePrice !== '' ? Number(basePrice) : 0;
    const listP = listPrice !== null && listPrice !== undefined && listPrice !== '' ? Number(listPrice) : null;

    if (isNaN(costP) || costP < 0) {
      return NextResponse.json({ success: false, error: 'El Precio de Costo (Cost Price) no es válido.' }, { status: 400 });
    }

    if (isNaN(baseP) || baseP < 0) {
      return NextResponse.json({ success: false, error: 'El Precio Base de Venta (Base Price) no es válido.' }, { status: 400 });
    }

    // Construir arreglo de Precios Fijos (Fixed Prices)
    const fixedPrices = [];
    if (hasFixedPrice && fixedPriceValue !== null && fixedPriceValue !== undefined && fixedPriceValue !== '') {
      const fVal = Number(fixedPriceValue);
      const fList = fixedPriceListPrice !== null && fixedPriceListPrice !== undefined && fixedPriceListPrice !== '' ? Number(fixedPriceListPrice) : null;
      const fMinQty = minQuantity !== null && minQuantity !== undefined && minQuantity !== '' ? Math.max(1, Number(minQuantity)) : 1;

      if (!isNaN(fVal) && fVal >= 0) {
        const fpObj = {
          tradePolicyId: '1',
          value: fVal,
          listPrice: fList && !isNaN(fList) ? fList : null,
          minQuantity: fMinQty,
        };

        if (dateFrom && dateTo) {
          try {
            const isoFrom = new Date(dateFrom).toISOString();
            const isoTo = new Date(dateTo).toISOString();
            fpObj.dateRange = { from: isoFrom, to: isoTo };
          } catch (dErr) {}
        }

        fixedPrices.push(fpObj);
      }
    }

    // 1. Enviar actualización a VTEX Pricing API
    let vtexSuccess = false;
    let vtexError = null;

    if (isVtexConfigured()) {
      try {
        const config = getVtexConfig();
        const url = `${config.baseUrl}/api/pricing/prices/${cleanSkuId}`;
        const headers = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': config.appKey,
          'X-VTEX-API-AppToken': config.appToken,
        };

        const vtexPayload = {
          costPrice: costP,
          basePrice: baseP,
          listPrice: listP,
          fixedPrices,
        };

        const resVtex = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(vtexPayload),
          cache: 'no-store',
        });

        if (resVtex.ok) {
          vtexSuccess = true;
          // Si el usuario desmarcó el precio fijo, invocar explícitamente el DELETE de fixed price en VTEX
          if (!hasFixedPrice) {
            try {
              const delUrl = `${config.baseUrl}/api/pricing/prices/${cleanSkuId}/fixed/1`;
              await fetch(delUrl, { method: 'DELETE', headers, cache: 'no-store' });
            } catch (delErr) {}
          }
        } else {
          const errTxt = await resVtex.text();
          vtexError = `VTEX Pricing Error HTTP ${resVtex.status}: ${errTxt || resVtex.statusText}`;
        }
      } catch (vErr) {
        vtexError = vErr.message;
      }
    }

    // 2. Actualizar precios en Supabase (vtex_skus)
    let dbUpdated = false;
    if (isSupabaseConfigured()) {
      try {
        const skuIdNum = parseInt(cleanSkuId, 10);
        await supabaseAdmin
          .from('vtex_skus')
          .upsert(
            {
              id: skuIdNum,
              cost_price: costP,
              base_price: baseP,
              list_price: listP,
              price_updated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        dbUpdated = true;
      } catch (dbErr) {
        console.error('Error actualizando Supabase:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      skuId: cleanSkuId,
      costPrice: costP,
      basePrice: baseP,
      listPrice: listP,
      fixedPrices,
      vtexSuccess,
      vtexError,
      dbUpdated,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
