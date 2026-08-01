import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const [ordersData, invoicedRes, handlingRes, readyRes, canceledRes] = await Promise.all([
      fetchVtexOrders(startIso, endIso, statusParam, searchParam, pageParam, 30),
      fetchVtexOrders(startIso, endIso, 'invoiced', '', 1, 1).catch(() => null),
      fetchVtexOrders(startIso, endIso, 'handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(startIso, endIso, 'ready-for-handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(startIso, endIso, 'canceled', '', 1, 1).catch(() => null),
    ]);

    const stats = {
      total: ordersData.paging?.total || 0,
      invoiced: invoicedRes?.paging?.total ?? 0,
      handling: handlingRes?.paging?.total ?? 0,
      readyForHandling: readyRes?.paging?.total ?? 0,
      canceled: canceledRes?.paging?.total ?? 0,
    };

    return NextResponse.json({
      success: true,
      data: ordersData.list || [],
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
