import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    const now = new Date();
    
    // Mes actual
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    const currentStartStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const currentEndStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    const currentStartIso = new Date(`${currentStartStr}T00:00:00-06:00`).toISOString();
    const currentEndIso = new Date(`${currentEndStr}T23:59:59-06:00`).toISOString();

    // Mes anterior (mismo número de días para comparación justa)
    const prevDate = new Date(currentYear, currentMonth - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();
    const lastDayOfPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    const targetPrevDay = Math.min(currentDay, lastDayOfPrevMonth);

    const prevStartStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const prevEndStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(targetPrevDay).padStart(2, '0')}`;

    const prevStartIso = new Date(`${prevStartStr}T00:00:00-06:00`).toISOString();
    const prevEndIso = new Date(`${prevEndStr}T23:59:59-06:00`).toISOString();

    // Consultar órdenes de ambos períodos en paralelo
    const [
      currAllRes,
      currInvoicedRes,
      currHandlingRes,
      currReadyRes,
      currCanceledRes,
      prevAllRes,
      prevInvoicedRes,
      prevCanceledRes,
    ] = await Promise.all([
      fetchVtexOrders(currentStartIso, currentEndIso, '', '', 1, 100).catch(() => null),
      fetchVtexOrders(currentStartIso, currentEndIso, 'invoiced', '', 1, 1).catch(() => null),
      fetchVtexOrders(currentStartIso, currentEndIso, 'handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(currentStartIso, currentEndIso, 'ready-for-handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(currentStartIso, currentEndIso, 'canceled', '', 1, 1).catch(() => null),
      fetchVtexOrders(prevStartIso, prevEndIso, '', '', 1, 100).catch(() => null),
      fetchVtexOrders(prevStartIso, prevEndIso, 'invoiced', '', 1, 1).catch(() => null),
      fetchVtexOrders(prevStartIso, prevEndIso, 'canceled', '', 1, 1).catch(() => null),
    ]);

    // Extraer muestras de listas
    const currList = currAllRes?.list || [];
    const prevList = prevAllRes?.list || [];

    // Totales de órdenes
    const currTotalOrders = currAllRes?.paging?.total || 0;
    const prevTotalOrders = prevAllRes?.paging?.total || 0;

    // Sumar montos (C$) de muestra
    const currSampleRevenue = currList.reduce((acc, o) => acc + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prevSampleRevenue = prevList.reduce((acc, o) => acc + (o.totalValue ? o.totalValue / 100 : 0), 0);

    const currSampleCount = currList.length || 1;
    const prevSampleCount = prevList.length || 1;

    // Estimación / promedio de ticket
    const currAvgTicket = currSampleRevenue / currSampleCount;
    const prevAvgTicket = prevSampleRevenue / prevSampleCount;

    const currEstimatedTotalRevenue = Math.round(currAvgTicket * currTotalOrders);
    const prevEstimatedTotalRevenue = Math.round(prevAvgTicket * prevTotalOrders);

    // Conteo por estados (Mes Actual)
    const currInvoicedCount = currInvoicedRes?.paging?.total ?? 0;
    const currHandlingCount = currHandlingRes?.paging?.total ?? 0;
    const currReadyCount = currReadyRes?.paging?.total ?? 0;
    const currCanceledCount = currCanceledRes?.paging?.total ?? 0;

    // Conteo por estados (Mes Anterior)
    const prevInvoicedCount = prevInvoicedRes?.paging?.total ?? 0;
    const prevCanceledCount = prevCanceledRes?.paging?.total ?? 0;

    // Tasa de cancelación
    const currCancelRate = currTotalOrders > 0 ? (currCanceledCount / currTotalOrders) * 100 : 0;
    const prevCancelRate = prevTotalOrders > 0 ? (prevCanceledCount / prevTotalOrders) * 100 : 0;

    // Analizar Social Selling (vendedores, cupones, UTMs) en la muestra
    let socialSellingOrdersCount = 0;
    let socialSellingRevenue = 0;

    currList.forEach((o) => {
      const isSocial =
        Boolean(o.utmiCampaign) ||
        Boolean(o.utmSource) ||
        Boolean(o.coupon) ||
        String(o.hostname || '').includes('vendedor') ||
        String(o.origin || '').includes('social');

      if (isSocial) {
        socialSellingOrdersCount++;
        socialSellingRevenue += o.totalValue ? o.totalValue / 100 : 0;
      }
    });

    const socialSellingPct = currSampleCount > 0 ? (socialSellingOrdersCount / currSampleCount) * 100 : 25; // fallback estimado
    const webDirectPct = 100 - socialSellingPct;

    // Función auxiliar para calcular porcentaje de cambio
    const calcChange = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    return NextResponse.json({
      success: true,
      periods: {
        current: { label: `1 al ${currentDay} de ${new Date().toLocaleString('es-NI', { month: 'long' })}`, start: currentStartStr, end: currentEndStr },
        previous: { label: `1 al ${targetPrevDay} del mes anterior`, start: prevStartStr, end: prevEndStr },
      },
      kpis: {
        totalRevenue: {
          current: currEstimatedTotalRevenue,
          previous: prevEstimatedTotalRevenue,
          changePct: calcChange(currEstimatedTotalRevenue, prevEstimatedTotalRevenue),
        },
        totalOrders: {
          current: currTotalOrders,
          previous: prevTotalOrders,
          changePct: calcChange(currTotalOrders, prevTotalOrders),
        },
        avgTicket: {
          current: Math.round(currAvgTicket),
          previous: Math.round(prevAvgTicket),
          changePct: calcChange(currAvgTicket, prevAvgTicket),
        },
        invoicedOrders: {
          current: currInvoicedCount,
          previous: prevInvoicedCount,
          changePct: calcChange(currInvoicedCount, prevInvoicedCount),
        },
        cancelRate: {
          current: parseFloat(currCancelRate.toFixed(1)),
          previous: parseFloat(prevCancelRate.toFixed(1)),
          changePct: calcChange(currCancelRate, prevCancelRate),
        },
      },
      channels: {
        socialSelling: {
          pct: parseFloat(socialSellingPct.toFixed(1)),
          estimatedRevenue: Math.round(currEstimatedTotalRevenue * (socialSellingPct / 100)),
        },
        webDirect: {
          pct: parseFloat(webDirectPct.toFixed(1)),
          estimatedRevenue: Math.round(currEstimatedTotalRevenue * (webDirectPct / 100)),
        },
      },
      pipeline: {
        invoiced: currInvoicedCount,
        readyForHandling: currReadyCount,
        handling: currHandlingCount,
        canceled: currCanceledCount,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
