import { NextResponse } from 'next/server';
import { getVtexConfig, isVtexConfigured, fetchSkuPrice } from '@/lib/vtex';
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
    let finalUpdatedPrice = null;

    if (isSupabaseConfigured()) {
      try {
        const skuIdNum = parseInt(cleanSkuId, 10);
        const fValNum = hasFixedPrice && fixedPriceValue !== null && fixedPriceValue !== undefined && fixedPriceValue !== '' ? Number(fixedPriceValue) : null;
        const fListNum = hasFixedPrice && fixedPriceListPrice !== null && fixedPriceListPrice !== undefined && fixedPriceListPrice !== '' ? Number(fixedPriceListPrice) : null;
        
        const fallbackBasePrice = fValNum !== null && !isNaN(fValNum) ? fValNum : baseP;
        const fallbackListPrice = fListNum !== null && !isNaN(fListNum) ? fListNum : (listP || (fValNum !== null ? baseP : null));
        const fallbackFinalPrice = fallbackBasePrice;
        let fallbackDiscountPct = 0;
        if (fallbackListPrice && fallbackFinalPrice && fallbackListPrice > fallbackFinalPrice) {
          fallbackDiscountPct = parseFloat((((fallbackListPrice - fallbackFinalPrice) / fallbackListPrice) * 100).toFixed(1));
        }

        // Consultar VTEX para obtener el estado completo y verificado
        let priceData = null;
        try {
          priceData = await fetchSkuPrice(cleanSkuId);
        } catch (fetchErr) {
          console.warn('No se pudo simular inmediatamente tras actualizar precio:', fetchErr.message);
        }

        const nowIso = new Date().toISOString();
        const upsertRow = {
          id: skuIdNum,
          cost_price: priceData?.costPrice !== undefined && priceData?.costPrice !== null ? priceData.costPrice : costP,
          base_price: priceData?.basePrice !== undefined && priceData?.basePrice !== null ? priceData.basePrice : fallbackBasePrice,
          list_price: priceData?.listPrice !== undefined && priceData?.listPrice !== null ? priceData.listPrice : fallbackListPrice,
          final_price: priceData?.finalPrice !== undefined && priceData?.finalPrice !== null ? priceData.finalPrice : fallbackFinalPrice,
          price_updated_at: nowIso,
          updated_at: nowIso,
        };

        if (priceData?.simPromoName) {
          upsertRow.promo_name = priceData.simPromoName;
          upsertRow.discount_pct = priceData.simDiscountPct || 0;
          upsertRow.promotions_updated_at = nowIso;
        } else {
          upsertRow.promo_name = null;
          upsertRow.promo_id = null;
          const refFinal = upsertRow.final_price;
          const refList = upsertRow.list_price;
          upsertRow.discount_pct = refList && refFinal && refList > refFinal
            ? parseFloat((((refList - refFinal) / refList) * 100).toFixed(1))
            : fallbackDiscountPct;
        }

        await supabaseAdmin
          .from('vtex_skus')
          .upsert(upsertRow, { onConflict: 'id' });

        dbUpdated = true;
        finalUpdatedPrice = {
          costPrice: upsertRow.cost_price,
          basePrice: upsertRow.base_price,
          listPrice: upsertRow.list_price,
          finalPrice: upsertRow.final_price,
          discountPct: upsertRow.discount_pct,
          promoName: upsertRow.promo_name,
          promoId: upsertRow.promo_id,
          isFixedPrice: Boolean(hasFixedPrice && fValNum !== null),
          priceUpdatedAt: nowIso,
        };
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
      price: finalUpdatedPrice,
      vtexSuccess,
      vtexError,
      dbUpdated,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
