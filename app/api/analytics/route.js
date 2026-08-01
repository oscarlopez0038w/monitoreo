import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

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

// Función para consultar los detalles de las órdenes en lotes concurrentes y determinar Social Selling con 100% de precisión
async function analyzeSocialSellingOrders(orders) {
  let socialCount = 0;
  let socialRevenue = 0;

  const BATCH_SIZE = 25;
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);
    const details = await Promise.all(
      batch.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null))
    );

    details.forEach((detail, idx) => {
      const origOrder = batch[idx];
      if (!detail) return;

      // Excluir canceladas si aplica
      if (detail.status === 'canceled') return;

      const mData = detail.marketingData || {};
      const utmi = mData.utmiCampaign || detail.utmiCampaign || mData.utmicampaign;

      // Regla explícita del negocio: Si trae el UTM icampaign (código de vendedor) es Social Selling, de lo contrario es Orgánica
      const isSocial = Boolean(utmi && String(utmi).trim().length > 0);

      if (isSocial) {
        socialCount++;
        const val = detail.totalValue ? detail.totalValue / 100 : (origOrder.totalValue ? origOrder.totalValue / 100 : 0);
        socialRevenue += val;
      }
    });
  }

  return { count: socialCount, revenue: socialRevenue };
}

export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const compareMode = searchParams.get('compareMode') || 'previous_month';
    const customYear = searchParams.get('compareYear');
    const customMonth = searchParams.get('compareMonth');

    const nicNow = getNicaraguaNow();
    
    // Mes actual en Zona Horaria Nicaragua (UTC-6)
    const currentYear = nicNow.year;
    const currentMonth = nicNow.month;
    const currentDay = nicNow.day;

    const currentStartStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const currentEndStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    const currentStartIso = new Date(`${currentStartStr}T00:00:00-06:00`).toISOString();
    const currentEndIso = new Date(`${currentEndStr}T23:59:59-06:00`).toISOString();

    // Determinar período de comparación
    let prevYear = currentYear;
    let prevMonth = currentMonth - 1;

    if (compareMode === 'same_month_last_year') {
      prevYear = currentYear - 1;
      prevMonth = currentMonth;
    } else if (compareMode === 'custom' && customYear && customMonth) {
      prevYear = parseInt(customYear);
      prevMonth = parseInt(customMonth) - 1;
    }

    // Ajuste de desbordamiento de año
    const prevDateObj = new Date(prevYear, prevMonth, 1);
    prevYear = prevDateObj.getFullYear();
    prevMonth = prevDateObj.getMonth();

    const lastDayOfPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    const targetPrevDay = Math.min(currentDay, lastDayOfPrevMonth);

    const prevStartStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const prevEndStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(targetPrevDay).padStart(2, '0')}`;

    const prevStartIso = new Date(`${prevStartStr}T00:00:00-06:00`).toISOString();
    const prevEndIso = new Date(`${prevEndStr}T23:59:59-06:00`).toISOString();

    // Consultar TODAS las órdenes del mes actual y del período de comparación en paralelo
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

    // EXCLUIR ÓRDENES CANCELADAS de la sumatoria de Ventas Totales
    const currValidOrders = currOrders.filter((o) => o.status !== 'canceled');
    const currTotalRevenue = currValidOrders.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const currTotalOrders = currOrders.length;
    const currAvgTicket = currValidOrders.length > 0 ? currTotalRevenue / currValidOrders.length : 0;

    const prevValidOrders = prevOrders.filter((o) => o.status !== 'canceled');
    const prevTotalRevenue = prevValidOrders.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prevTotalOrders = prevOrders.length;
    const prevAvgTicket = prevValidOrders.length > 0 ? prevTotalRevenue / prevValidOrders.length : 0;

    // Conteo exacto por estados (Mes Actual)
    const currInvoicedCount = currInvoicedRes?.paging?.total ?? 0;
    const currHandlingCount = currHandlingRes?.paging?.total ?? 0;
    const currReadyCount = currReadyRes?.paging?.total ?? 0;
    const currCanceledCount = currCanceledRes?.paging?.total ?? 0;

    // Conteo exacto por estados (Mes Anterior / Comparativo)
    const prevInvoicedCount = prevInvoicedRes?.paging?.total ?? 0;
    const prevCanceledCount = prevCanceledRes?.paging?.total ?? 0;

    // Tasa de cancelación
    const currCancelRate = currTotalOrders > 0 ? (currCanceledCount / currTotalOrders) * 100 : 0;
    const prevCancelRate = prevTotalOrders > 0 ? (prevCanceledCount / prevTotalOrders) * 100 : 0;

    // Análisis 100% preciso de Social Selling inspeccionando los detalles de las órdenes de AMBOS períodos
    const [currSocialAnalysis, prevSocialAnalysis] = await Promise.all([
      analyzeSocialSellingOrders(currValidOrders),
      analyzeSocialSellingOrders(prevValidOrders),
    ]);

    const socialSellingOrdersCount = currSocialAnalysis.count;
    const socialSellingRevenue = currSocialAnalysis.revenue;
    const socialSellingPct = currValidOrders.length > 0 ? (socialSellingOrdersCount / currValidOrders.length) * 100 : 0;

    const webDirectPct = 100 - socialSellingPct;
    const webDirectRevenue = Math.max(0, currTotalRevenue - socialSellingRevenue);

    // Métricas del período comparativo
    const prevSocialSellingOrdersCount = prevSocialAnalysis.count;
    const prevSocialSellingRevenue = prevSocialAnalysis.revenue;
    const prevSocialSellingPct = prevValidOrders.length > 0 ? (prevSocialSellingOrdersCount / prevValidOrders.length) * 100 : 0;

    const prevWebDirectPct = 100 - prevSocialSellingPct;
    const prevWebDirectRevenue = Math.max(0, prevTotalRevenue - prevSocialSellingRevenue);

    // Función auxiliar para calcular porcentaje de cambio
    const calcChange = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const prevMonthLabel = `${monthNames[prevMonth]} ${prevYear}`;

    return NextResponse.json({
      success: true,
      compareMode,
      periods: {
        current: { label: `1 al ${currentDay} de ${monthNames[currentMonth]} ${currentYear}`, start: currentStartStr, end: currentEndStr },
        previous: { label: `1 al ${targetPrevDay} de ${prevMonthLabel}`, start: prevStartStr, end: prevEndStr, monthName: prevMonthLabel },
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
          current: {
            count: socialSellingOrdersCount,
            pct: parseFloat(socialSellingPct.toFixed(1)),
            revenue: parseFloat(socialSellingRevenue.toFixed(2)),
          },
          previous: {
            count: prevSocialSellingOrdersCount,
            pct: parseFloat(prevSocialSellingPct.toFixed(1)),
            revenue: parseFloat(prevSocialSellingRevenue.toFixed(2)),
          },
          changePct: calcChange(socialSellingRevenue, prevSocialSellingRevenue),
        },
        webDirect: {
          current: {
            count: currValidOrders.length - socialSellingOrdersCount,
            pct: parseFloat(webDirectPct.toFixed(1)),
            revenue: parseFloat(webDirectRevenue.toFixed(2)),
          },
          previous: {
            count: prevValidOrders.length - prevSocialSellingOrdersCount,
            pct: parseFloat(prevWebDirectPct.toFixed(1)),
            revenue: parseFloat(prevWebDirectRevenue.toFixed(2)),
          },
          changePct: calcChange(webDirectRevenue, prevWebDirectRevenue),
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
