import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Función para obtener TODAS las órdenes de un período paginando por lotes de 100 en 100
async function fetchAllPeriodOrders(startIso, endIso) {
  let allOrders = [];
  let page = 1;
  let maxPages = 15; // Límite de seguridad (hasta 1,500 órdenes por mes)

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
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    const now = new Date();
    
    // Mes actual (Julio)
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    const currentStartStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const currentEndStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    const currentStartIso = new Date(`${currentStartStr}T00:00:00-06:00`).toISOString();
    const currentEndIso = new Date(`${currentEndStr}T23:59:59-06:00`).toISOString();

    // Mes anterior (Junio) - Mismo rango de días equivalente
    const prevDate = new Date(currentYear, currentMonth - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();
    const lastDayOfPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    const targetPrevDay = Math.min(currentDay, lastDayOfPrevMonth);

    const prevStartStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const prevEndStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(targetPrevDay).padStart(2, '0')}`;

    const prevStartIso = new Date(`${prevStartStr}T00:00:00-06:00`).toISOString();
    const prevEndIso = new Date(`${prevEndStr}T23:59:59-06:00`).toISOString();

    // Consultar TODAS las órdenes del mes actual y del mes anterior en paralelo
    const [
      currOrders,
      prevOrders,
      currInvoicedRes,
      currHandlingRes,
      currReadyRes,
      currCanceledRes,
      prevInvoicedRes,
      prevCanceledRes,
    ] = await Promise.all([
      fetchAllPeriodOrders(currentStartIso, currentEndIso),
      fetchAllPeriodOrders(prevStartIso, prevEndIso),
      fetchVtexOrders(currentStartIso, currentEndIso, 'invoiced', '', 1, 1).catch(() => null),
      fetchVtexOrders(currentStartIso, currentEndIso, 'handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(currentStartIso, currentEndIso, 'ready-for-handling', '', 1, 1).catch(() => null),
      fetchVtexOrders(currentStartIso, currentEndIso, 'canceled', '', 1, 1).catch(() => null),
      fetchVtexOrders(prevStartIso, prevEndIso, 'invoiced', '', 1, 1).catch(() => null),
      fetchVtexOrders(prevStartIso, prevEndIso, 'canceled', '', 1, 1).catch(() => null),
    ]);

    // Sumar montos EXACTOS (C$) de todas las órdenes del mes actual
    const currTotalRevenue = currOrders.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const currTotalOrders = currOrders.length;
    const currAvgTicket = currTotalOrders > 0 ? currTotalRevenue / currTotalOrders : 0;

    // Sumar montos EXACTOS (C$) de todas las órdenes del mes anterior
    const prevTotalRevenue = prevOrders.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prevTotalOrders = prevOrders.length;
    const prevAvgTicket = prevTotalOrders > 0 ? prevTotalRevenue / prevTotalOrders : 0;

    // Conteo exacto por estados (Mes Actual)
    const currInvoicedCount = currInvoicedRes?.paging?.total ?? 0;
    const currHandlingCount = currHandlingRes?.paging?.total ?? 0;
    const currReadyCount = currReadyRes?.paging?.total ?? 0;
    const currCanceledCount = currCanceledRes?.paging?.total ?? 0;

    // Conteo exacto por estados (Mes Anterior)
    const prevInvoicedCount = prevInvoicedRes?.paging?.total ?? 0;
    const prevCanceledCount = prevCanceledRes?.paging?.total ?? 0;

    // Tasa de cancelación
    const currCancelRate = currTotalOrders > 0 ? (currCanceledCount / currTotalOrders) * 100 : 0;
    const prevCancelRate = prevTotalOrders > 0 ? (prevCanceledCount / prevTotalOrders) * 100 : 0;

    // Analizar Social Selling (vendedores, cupones, UTMs) en el total de órdenes reales
    let socialSellingOrdersCount = 0;
    let socialSellingRevenue = 0;

    currOrders.forEach((o) => {
      const mData = o.marketingData || {};
      const mTags = Array.isArray(mData.marketingTags)
        ? mData.marketingTags
        : Array.isArray(o.marketingTags)
        ? o.marketingTags
        : [];

      const mTagsStr = JSON.stringify(mTags).toLowerCase();
      const objStr = JSON.stringify(o).toLowerCase();

      const isSocial =
        mTagsStr.includes('vtexsocialselling') ||
        mTagsStr.includes('socialselling') ||
        objStr.includes('vtexsocialselling') ||
        objStr.includes('socialselling') ||
        Boolean(o.utmiCampaign || mData.utmiCampaign) ||
        Boolean(o.utmSource || mData.utmSource) ||
        Boolean(o.coupon || mData.coupon) ||
        Boolean(o.callCenterOperatorData);

      if (isSocial) {
        socialSellingOrdersCount++;
        socialSellingRevenue += o.totalValue ? o.totalValue / 100 : 0;
      }
    });

    const socialSellingPct = currTotalOrders > 0 ? (socialSellingOrdersCount / currTotalOrders) * 100 : 0;
    const webDirectPct = 100 - socialSellingPct;
    const webDirectRevenue = currTotalRevenue - socialSellingRevenue;

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
          current: parseFloat(currTotalRevenue.toFixed(2)),
          previous: parseFloat(prevTotalRevenue.toFixed(2)),
          changePct: calcChange(currTotalRevenue, prevTotalRevenue),
        },
        totalOrders: {
          current: currTotalOrders,
          previous: prevTotalOrders,
          changePct: calcChange(currTotalOrders, prevTotalOrders),
        },
        avgTicket: {
          current: parseFloat(currAvgTicket.toFixed(2)),
          previous: parseFloat(prevAvgTicket.toFixed(2)),
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
          revenue: parseFloat(socialSellingRevenue.toFixed(2)),
        },
        webDirect: {
          pct: parseFloat(webDirectPct.toFixed(1)),
          revenue: parseFloat(webDirectRevenue.toFixed(2)),
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
