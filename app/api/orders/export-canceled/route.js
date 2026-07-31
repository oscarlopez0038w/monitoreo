import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const safeStr = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val).replace(/"/g, '""');
    } catch (e) {
      return '';
    }
  }
  return String(val).replace(/"/g, '""');
};

export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const startDate = searchParams.get('startDate') || firstDay;
    const endDate = searchParams.get('endDate') || today;

    const startIso = new Date(`${startDate}T00:00:00-06:00`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59-06:00`).toISOString();

    // Traer todas las órdenes canceladas del rango de fecha paginando
    let canceledOrders = [];
    let page = 1;
    let maxPages = 15;

    while (page <= maxPages) {
      const res = await fetchVtexOrders(startIso, endIso, 'canceled', '', page, 100).catch(() => null);
      if (!res || !res.list || res.list.length === 0) break;
      canceledOrders.push(...res.list);
      const totalPages = res.paging?.pages || 1;
      if (page >= totalPages) break;
      page++;
    }

    // Obtener detalles de cada orden cancelada en lotes de 20 para extraer motivo y productos
    const BATCH_SIZE = 20;
    const detailedOrders = [];

    for (let i = 0; i < canceledOrders.length; i += BATCH_SIZE) {
      const batch = canceledOrders.slice(i, i + BATCH_SIZE);
      const details = await Promise.all(
        batch.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null))
      );

      details.forEach((detail, idx) => {
        const orig = batch[idx];
        const ord = detail || orig;
        if (!ord) return;

        const mData = ord.marketingData || {};
        const utmi = mData.utmiCampaign || ord.utmiCampaign || '';

        const cancelReason =
          ord.cancelReason ||
          (typeof ord.cancellationData === 'object' ? ord.cancellationData?.reason : ord.cancellationData) ||
          (typeof ord.openTextField === 'object' ? ord.openTextField?.value : ord.openTextField) ||
          'Sin motivo registrado por el sistema';

        const comments = typeof ord.openTextField === 'object' ? ord.openTextField?.value : (ord.openTextField || '');

        const skuItemsStr = (ord.items || [])
          .map((item) => `${item.id || item.sellerSku} - ${item.name || 'SKU'} (${item.quantity} unid.)`)
          .join(' | ');

        const clientName = ord.clientProfileData
          ? `${ord.clientProfileData.firstName || ''} ${ord.clientProfileData.lastName || ''}`.trim()
          : (ord.clientName || orig.clientName || 'Cliente General');

        const clientEmail = ord.clientProfileData?.email || ord.clientEmail || orig.clientEmail || '';
        
        // En la API de detalle de VTEX OMS el campo de monto total es 'value', mientras que en el listado es 'totalValue'
        const rawValue = ord.value ?? ord.totalValue ?? orig.totalValue ?? orig.value ?? 0;
        const totalValueFormatted = (rawValue / 100).toFixed(2);
        const creationDateStr = ord.creationDate || orig.creationDate;

        detailedOrders.push({
          orderId: ord.orderId || orig.orderId || '',
          creationDate: creationDateStr ? new Date(creationDateStr).toLocaleString('es-NI') : '',
          clientName,
          clientEmail,
          totalValue: totalValueFormatted,
          status: 'canceled',
          cancelReason,
          comments,
          sellerCode: utmi,
          items: skuItemsStr,
        });
      });
    }

    // Generar archivo CSV
    const headers = [
      'ID Orden',
      'Fecha Creacion',
      'Cliente',
      'Email Cliente',
      'Monto Total (C$)',
      'Estado OMS',
      'Motivo de Cancelacion',
      'Comentarios',
      'Codigo Vendedor (UTM)',
      'SKUs Comprados',
    ];

    const csvRows = [headers.join(',')];

    detailedOrders.forEach((o) => {
      const row = [
        `"${safeStr(o.orderId)}"`,
        `"${safeStr(o.creationDate)}"`,
        `"${safeStr(o.clientName)}"`,
        `"${safeStr(o.clientEmail)}"`,
        `"${safeStr(o.totalValue)}"`,
        `"${safeStr(o.status)}"`,
        `"${safeStr(o.cancelReason)}"`,
        `"${safeStr(o.comments)}"`,
        `"${safeStr(o.sellerCode)}"`,
        `"${safeStr(o.items)}"`,
      ];
      csvRows.push(row.join(','));
    });

    const csvString = '\uFEFF' + csvRows.join('\n'); // Add BOM for Excel UTF-8 support

    return new NextResponse(csvString, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reporte_ordenes_canceladas_${startDate}_al_${endDate}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
