import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail, fetchRealClientEmail } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchAllOrdersForStatus(startIso, endIso, status) {
  let allList = [];
  let page = 1;
  while (page <= 20) {
    const res = await fetchVtexOrders(startIso, endIso, status, '', page, 100).catch(() => null);
    if (!res || !res.list || res.list.length === 0) break;
    allList.push(...res.list);
    const totalPages = res.paging?.pages || 1;
    if (page >= totalPages) break;
    page++;
  }
  return allList;
}

export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase no está configurado.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const nicNow = getNicaraguaNow();
    let startDateParam = (body.startDate || nicNow.firstDayStr).trim();
    let endDateParam = (body.endDate || nicNow.todayStr).trim();

    if (startDateParam.includes('/')) {
      const parts = startDateParam.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) startDateParam = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        else startDateParam = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }

    if (endDateParam.includes('/')) {
      const parts = endDateParam.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) endDateParam = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        else endDateParam = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }

    const startIso = new Date(`${startDateParam}T00:00:00-06:00`).toISOString();
    const endIso = new Date(`${endDateParam}T23:59:59-06:00`).toISOString();

    // 1. Obtener órdenes oficiales de VTEX OMS por estados reales (excluyendo borradores/intentos de transacciones)
    const [invoicedList, handlingList, readyList, canceledList] = await Promise.all([
      fetchAllOrdersForStatus(startIso, endIso, 'invoiced'),
      fetchAllOrdersForStatus(startIso, endIso, 'handling'),
      fetchAllOrdersForStatus(startIso, endIso, 'ready-for-handling'),
      fetchAllOrdersForStatus(startIso, endIso, 'canceled'),
    ]);

    const allOfficialOrdersMap = {};
    [...invoicedList, ...handlingList, ...readyList, ...canceledList].forEach((o) => {
      if (o.orderId) allOfficialOrdersMap[o.orderId] = o;
    });

    const officialOrders = Object.values(allOfficialOrdersMap);
    const totalOrders = officialOrders.length;

    if (totalOrders === 0) {
      return NextResponse.json({
        success: true,
        processedCount: 0,
        totalOrders: 0,
        message: 'No se encontraron órdenes reales para sincronizar en el rango.',
      });
    }

    // 2. Limpiar de Supabase vtex_orders los intentos fallidos/borradores que no sean órdenes oficiales
    const officialIdsSet = new Set(Object.keys(allOfficialOrdersMap));
    const { data: dbRows } = await supabaseAdmin
      .from('vtex_orders')
      .select('order_id')
      .gte('creation_date', startIso)
      .lte('creation_date', endIso);

    const idsToDelete = (dbRows || []).map((r) => r.order_id).filter((id) => !officialIdsSet.has(id));

    if (idsToDelete.length > 0) {
      await supabaseAdmin.from('vtex_orders').delete().in('order_id', idsToDelete);
    }

    // 3. Enriquecer y sincronizar las órdenes oficiales en lotes de 20
    const BATCH_CONCURRENCY = 20;
    let totalProcessed = 0;

    for (let i = 0; i < officialOrders.length; i += BATCH_CONCURRENCY) {
      const batch = officialOrders.slice(i, i + BATCH_CONCURRENCY);
      const details = await Promise.all(
        batch.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null))
      );

      const upsertRows = await Promise.all(
        batch.map(async (o, idx) => {
          const detail = details[idx];

          const clientData = detail?.clientProfileData || {};
          const firstName = clientData.firstName || '';
          const lastName = clientData.lastName || '';
          const clientName = `${firstName} ${lastName}`.trim() || clientData.email || o.clientName || 'Cliente General';
          let clientEmail = clientData.email || null;

          if (clientEmail && clientEmail.includes('@ct.vtex.com.br') && clientData.userProfileId) {
            const real = await fetchRealClientEmail(clientData.userProfileId, clientEmail);
            if (real && !real.includes('@ct.vtex.com.br')) {
              clientEmail = real;
            }
          }

          const logInfo = detail?.shippingData?.logisticsInfo?.[0];
          const channel = logInfo?.selectedDeliveryChannel || detail?.shippingData?.selectedAddresses?.[0]?.addressType || '';
          const isPickup = channel === 'pickup-in-point' || channel === 'pickup';
          const fulfillmentType = isPickup ? 'pickup' : 'delivery';
          const pickupStore = isPickup
            ? (logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || 'Retiro en Tienda').trim()
            : '';

          const shippingVal = detail?.totals?.find((t) => t.id === 'Shipping')?.value;
          const shippingCost = shippingVal !== undefined ? shippingVal / 100 : 0;

          const addressJson = detail?.shippingData?.address || null;
          const marketingJson = detail?.marketingData || null;

          const rawItems = (detail?.items || o.items || []).map((it) => ({
            id: it.id || it.sellerSku,
            name: it.name || it.skuName,
            quantity: it.quantity || 1,
            price: it.price ? it.price / 100 : 0,
            sellingPrice: it.sellingPrice ? it.sellingPrice / 100 : (it.price ? it.price / 100 : 0),
            listPrice: it.listPrice ? it.listPrice / 100 : (it.price ? it.price / 100 : 0),
            totalPrice: (it.sellingPrice || it.price ? (it.sellingPrice || it.price) * (it.quantity || 1) : 0) / 100,
          }));

          const itemsPayload = {
            list: rawItems,
            fulfillmentType,
            pickupStore,
            shippingCost,
            address: addressJson,
            marketing: marketingJson,
            detail: detail || null,
          };

          return {
            order_id: o.orderId,
            sequence: String(o.sequence || detail?.sequence || ''),
            status: o.status || detail?.status || 'unknown',
            status_description: detail?.statusDescription || o.statusDescription || o.status || '',
            creation_date: o.creationDate || detail?.creationDate || new Date().toISOString(),
            client_name: clientName,
            client_email: clientEmail,
            total_value: o.totalValue ? o.totalValue / 100 : (detail?.value ? detail.value / 100 : 0),
            fulfillment_type: fulfillmentType,
            pickup_store: pickupStore,
            shipping_cost: shippingCost,
            address_json: addressJson,
            marketing_json: marketingJson,
            items: itemsPayload,
            detail_json: detail || null,
            updated_at: new Date().toISOString(),
          };
        })
      );

      if (upsertRows.length > 0) {
        try {
          const { error: errExt } = await supabaseAdmin
            .from('vtex_orders')
            .upsert(upsertRows, { onConflict: 'order_id' });

          if (errExt) {
            const basicRows = upsertRows.map((r) => ({
              order_id: r.order_id,
              sequence: r.sequence,
              status: r.status,
              status_description: r.status_description,
              creation_date: r.creation_date,
              client_name: r.client_name,
              client_email: r.client_email,
              total_value: r.total_value,
              items: r.items,
              updated_at: r.updated_at,
            }));
            await supabaseAdmin.from('vtex_orders').upsert(basicRows, { onConflict: 'order_id' });
          }
        } catch (upsertErr) {
          console.error('Error guardando lote de órdenes:', upsertErr);
        }
        totalProcessed += upsertRows.length;
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: totalProcessed,
      totalOrders,
      message: `¡${totalProcessed} órdenes oficiales sincronizadas exitosamente en Supabase!`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
