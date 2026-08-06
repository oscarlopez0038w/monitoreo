import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Obtener TODAS las órdenes del período paginando para analizar el 100% de Pickup vs Delivery
async function fetchAllPeriodOrders(startIso, endIso) {
  let allOrders = [];
  let page = 1;
  let maxPages = 20;

  while (page <= maxPages) {
    const res = await fetchVtexOrders(startIso, endIso, '', '', page, 100).catch(() => null);
    if (!res || !res.list || res.list.length === 0) break;

    allOrders.push(...res.list);
    const totalPages = res.paging?.pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allOrders;
}

export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado en las variables de entorno.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderIdParam = searchParams.get('orderId') || searchParams.get('id');

    // Si se consulta una orden individual por ID
    if (orderIdParam) {
      const orderDetail = await fetchVtexOrderDetail(orderIdParam.trim());
      if (!orderDetail) {
        return NextResponse.json(
          { success: false, error: `Orden ${orderIdParam} no encontrada en VTEX OMS.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, order: orderDetail });
    }

    // Filtros de fecha en Zona Horaria Nicaragua (America/Managua UTC-6)
    const nicNow = getNicaraguaNow();
    
    const startDateParam = searchParams.get('startDate') || nicNow.firstDayStr;
    const endDateParam = searchParams.get('endDate') || nicNow.todayStr;
    const statusParam = searchParams.get('status') || '';
    const searchParam = searchParams.get('search') || '';
    const pageParam = parseInt(searchParams.get('page') || '1', 10);

    const startIso = new Date(`${startDateParam}T00:00:00-06:00`).toISOString();
    const endIso = new Date(`${endDateParam}T23:59:59-06:00`).toISOString();

    const [ordersData, allPeriodOrders, invoicedRes, handlingRes, readyRes, canceledRes] = await Promise.all([
      fetchVtexOrders(startIso, endIso, statusParam, searchParam, pageParam, 30),
      fetchAllPeriodOrders(startIso, endIso).catch(() => []),
      fetchVtexOrders(startIso, endIso, 'invoiced', '', 1, 1).catch(() => null),
      fetchVtexOrders(startIso, endIso, 'handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(startIso, endIso, 'ready-for-handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(startIso, endIso, 'canceled', '', 1, 1).catch(() => null),
    ]);

    // Analizar el 100% de órdenes del período para Pickup vs. Delivery
    const targetOrdersForStats = allPeriodOrders.length > 0 ? allPeriodOrders : (ordersData.list || []);
    
    // Mapeo de detalles en lotes concurrentes rápidos
    const detailMap = {};
    const BATCH_SIZE = 25;

    for (let i = 0; i < targetOrdersForStats.length; i += BATCH_SIZE) {
      const batch = targetOrdersForStats.slice(i, i + BATCH_SIZE);
      const details = await Promise.all(
        batch.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null))
      );
      batch.forEach((o, idx) => {
        if (details[idx]) {
          detailMap[o.orderId] = details[idx];
        }
      });
    }

    let pickupCount = 0;
    let deliveryCount = 0;
    const storeCounts = {};

    targetOrdersForStats.forEach((o) => {
      const detail = detailMap[o.orderId];
      const logInfo = detail?.shippingData?.logisticsInfo?.[0];
      const channel = logInfo?.selectedDeliveryChannel || detail?.shippingData?.selectedAddresses?.[0]?.addressType || '';
      const isPickup = channel === 'pickup-in-point' || channel === 'pickup';
      if (isPickup) {
        pickupCount++;
        const rawStoreName = logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || 'Tienda Principal';
        const storeName = String(rawStoreName).trim();
        storeCounts[storeName] = (storeCounts[storeName] || 0) + 1;
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

    // Enriquecer la lista de la página actual para la tabla
    const rawList = ordersData.list || [];
    const enrichedList = rawList.map((o) => {
      const detail = detailMap[o.orderId];
      const logInfo = detail?.shippingData?.logisticsInfo?.[0];
      const channel = logInfo?.selectedDeliveryChannel || detail?.shippingData?.selectedAddresses?.[0]?.addressType || '';
      const isPickup = channel === 'pickup-in-point' || channel === 'pickup';
      const pickupStore = isPickup
        ? (logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || 'Retiro en Tienda')
        : '';

      return {
        ...o,
        fulfillmentType: isPickup ? 'pickup' : 'delivery',
        pickupStore,
        itemsCount: detail?.items?.length || o.itemsCount || 1,
      };
    });

    const stats = {
      total: ordersData.paging?.total || 0,
      invoiced: invoicedRes?.paging?.total ?? 0,
      handling: handlingRes?.paging?.total ?? 0,
      readyForHandling: readyRes?.paging?.total ?? 0,
      canceled: canceledRes?.paging?.total ?? 0,
      pickupCount,
      deliveryCount,
      pickupPct,
      deliveryPct,
      pickupStores,
    };

    return NextResponse.json({
      success: true,
      data: enrichedList,
      paging: ordersData.paging || { total: 0, pages: 0, currentPage: pageParam },
      stats,
      startDate: startDateParam,
      endDate: endDateParam,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
