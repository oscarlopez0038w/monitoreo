import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseIsoStartEnd(startDateParam, endDateParam) {
  const nicNow = getNicaraguaNow();
  let startStr = (startDateParam || nicNow.firstDayStr).trim();
  let endStr = (endDateParam || nicNow.todayStr).trim();

  if (startStr.includes('/')) {
    const parts = startStr.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) startStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      else startStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  if (endStr.includes('/')) {
    const parts = endStr.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) endStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      else endStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  const startIso = new Date(`${startStr}T00:00:00-06:00`).toISOString();
  const endIso = new Date(`${endStr}T23:59:59-06:00`).toISOString();
  return { startIso, endIso, startStr, endStr };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderIdParam = searchParams.get('orderId') || searchParams.get('id');

    // 1. Consulta por ID individual
    if (orderIdParam) {
      const cleanId = orderIdParam.trim();
      if (isSupabaseConfigured()) {
        try {
          const { data: dbRow } = await supabaseAdmin
            .from('vtex_orders')
            .select('*')
            .eq('order_id', cleanId)
            .maybeSingle();

          if (dbRow) {
            let detailObj = dbRow.detail_json;
            let itemsList = dbRow.items;
            let addressJson = dbRow.address_json;
            let marketingJson = dbRow.marketing_json;

            if (dbRow.items && !Array.isArray(dbRow.items) && typeof dbRow.items === 'object') {
              itemsList = dbRow.items.list || [];
              addressJson = dbRow.items.address || addressJson;
              marketingJson = dbRow.items.marketing || marketingJson;
              detailObj = dbRow.items.detail || detailObj;
            }

            const finalDetail = detailObj || {
              orderId: dbRow.order_id,
              sequence: dbRow.sequence,
              status: dbRow.status,
              statusDescription: dbRow.status_description,
              creationDate: dbRow.creation_date,
              clientProfileData: { firstName: dbRow.client_name, email: dbRow.client_email },
              value: Math.round((dbRow.total_value || 0) * 100),
              items: itemsList,
              shippingData: { address: addressJson },
              marketingData: marketingJson,
            };
            return NextResponse.json({ success: true, order: finalDetail, source: 'supabase' });
          }
        } catch (e) {}
      }

      if (isVtexConfigured()) {
        const orderDetail = await fetchVtexOrderDetail(cleanId);
        if (orderDetail) {
          return NextResponse.json({ success: true, order: orderDetail, source: 'vtex_api' });
        }
      }

      return NextResponse.json({ success: false, error: `Orden ${cleanId} no encontrada.` }, { status: 404 });
    }

    // 2. Consulta de lista de órdenes con filtros de fecha
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const statusParam = (searchParams.get('status') || '').trim();
    const searchParam = (searchParams.get('search') || '').trim();
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = 30;

    const { startIso, endIso, startStr, endStr } = parseIsoStartEnd(startDateParam, endDateParam);

    let useSupabase = false;
    let dbOrders = [];
    let totalDbCount = 0;
    let dbStats = null;

    if (isSupabaseConfigured()) {
      try {
        let query = supabaseAdmin
          .from('vtex_orders')
          .select('*', { count: 'exact' })
          .gte('creation_date', startIso)
          .lte('creation_date', endIso);

        if (statusParam) {
          query = query.eq('status', statusParam);
        }

        if (searchParam) {
          const cleanSearch = searchParam.trim();
          query = query.or(`order_id.ilike.%${cleanSearch}%,sequence.ilike.%${cleanSearch}%,client_name.ilike.%${cleanSearch}%,client_email.ilike.%${cleanSearch}%,items::text.ilike.%${cleanSearch}%`);
        }

        query = query.order('creation_date', { ascending: false });

        const from = (pageParam - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);

        const { data: rows, count, error } = await query;

        if (!error && rows && rows.length > 0) {
          useSupabase = true;
          totalDbCount = count || rows.length;

          // Conteos y Estadísticas globales en Supabase para el período (< 10ms)
          const { data: periodRows } = await supabaseAdmin
            .from('vtex_orders')
            .select('status, fulfillment_type, pickup_store, items')
            .gte('creation_date', startIso)
            .lte('creation_date', endIso);

          let invoicedCount = 0;
          let handlingCount = 0;
          let readyCount = 0;
          let canceledCount = 0;
          let pickupCount = 0;
          let deliveryCount = 0;
          const storeCounts = {};

          (periodRows || []).forEach((r) => {
            const st = String(r.status || '').toLowerCase();
            if (st === 'invoiced') invoicedCount++;
            if (st === 'handling') handlingCount++;
            if (st === 'ready-for-handling') readyCount++;
            if (st === 'canceled') canceledCount++;

            let fulfillmentType = r.fulfillment_type || 'delivery';
            let pickupStore = r.pickup_store || '';

            if (r.items && !Array.isArray(r.items) && typeof r.items === 'object') {
              fulfillmentType = r.items.fulfillmentType || fulfillmentType;
              pickupStore = r.items.pickupStore || pickupStore;
            }

            const isPickup = fulfillmentType === 'pickup' || (pickupStore && pickupStore.length > 0);
            if (isPickup) {
              pickupCount++;
              const sName = pickupStore || 'Retiro en Tienda';
              storeCounts[sName] = (storeCounts[sName] || 0) + 1;
            } else {
              deliveryCount++;
            }
          });

          const totalFulfillment = pickupCount + deliveryCount;
          const pickupPct = totalFulfillment > 0 ? Math.round((pickupCount / totalFulfillment) * 100) : 0;
          const deliveryPct = totalFulfillment > 0 ? 100 - pickupPct : 0;

          const pickupStores = Object.entries(storeCounts)
            .map(([store, count]) => ({
              store,
              count,
              pct: pickupCount > 0 ? Math.round((count / pickupCount) * 100) : 0,
            }))
            .sort((a, b) => b.count - a.count);

          dbStats = {
            total: periodRows?.length || totalDbCount,
            invoiced: invoicedCount,
            handling: handlingCount,
            readyForHandling: readyCount,
            canceled: canceledCount,
            pickupCount,
            deliveryCount,
            pickupPct,
            deliveryPct,
            pickupStores,
          };

          dbOrders = rows.map((r) => {
            let itemsList = [];
            let fulfillmentType = r.fulfillment_type || 'delivery';
            let pickupStore = r.pickup_store || '';

            if (r.items && !Array.isArray(r.items) && typeof r.items === 'object') {
              itemsList = r.items.list || [];
              fulfillmentType = r.items.fulfillmentType || fulfillmentType;
              pickupStore = r.items.pickupStore || pickupStore;
            } else if (Array.isArray(r.items)) {
              itemsList = r.items;
            }

            return {
              orderId: r.order_id,
              sequence: r.sequence,
              status: r.status,
              statusDescription: r.status_description || r.status,
              creationDate: r.creation_date,
              clientName: r.client_name || 'Cliente General',
              clientEmail: r.client_email,
              totalValue: Math.round((r.total_value || 0) * 100),
              fulfillmentType: fulfillmentType,
              pickupStore: pickupStore,
              itemsCount: itemsList.length || 1,
              isFromDb: true,
            };
          });
        }
      } catch (dbErr) {
        console.error('Error consultando Supabase vtex_orders:', dbErr);
      }
    }

    if (useSupabase && dbOrders.length > 0) {
      const totalPages = Math.ceil(totalDbCount / pageSize) || 1;
      return NextResponse.json({
        success: true,
        data: dbOrders,
        paging: { total: totalDbCount, pages: totalPages, currentPage: pageParam },
        stats: dbStats,
        source: 'supabase_indexed',
        startDate: startStr,
        endDate: endStr,
      });
    }

    if (isVtexConfigured()) {
      const ordersData = await fetchVtexOrders(startIso, endIso, statusParam, searchParam, pageParam, pageSize);
      const rawList = ordersData.list || [];
      const enrichedList = rawList.map((o) => ({
        ...o,
        fulfillmentType: 'delivery',
        pickupStore: '',
        itemsCount: 1,
      }));

      const stats = {
        total: ordersData.paging?.total || 0,
        invoiced: 0,
        handling: 0,
        readyForHandling: 0,
        canceled: 0,
        pickupCount: 0,
        deliveryCount: rawList.length,
        pickupPct: 0,
        deliveryPct: 100,
        pickupStores: [],
      };

      return NextResponse.json({
        success: true,
        data: enrichedList,
        paging: ordersData.paging || { total: 0, pages: 0, currentPage: pageParam },
        stats,
        source: 'vtex_live_fallback',
        startDate: startStr,
        endDate: endStr,
      });
    }

    return NextResponse.json({ success: false, error: 'No hay fuentes de datos configuradas.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
