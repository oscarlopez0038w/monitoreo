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

// Función para formatear fechas amigables en español (ej. "1 de Agosto 2026")
function formatFriendlyDateRange(startStr, endStr) {
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const [sY, sM, sD] = startStr.split('-').map(Number);
  const [eY, eM, eD] = endStr.split('-').map(Number);

  const startMonthName = monthNames[sM - 1] || '';
  const endMonthName = monthNames[eM - 1] || '';

  if (sY === eY && sM === eM) {
    if (sD === eD) return `${sD} de ${startMonthName} ${sY}`;
    return `${sD} al ${eD} de ${startMonthName} ${sY}`;
  }

  return `${sD} ${startMonthName} ${sY} al ${eD} ${endMonthName} ${eY}`;
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
    const nicNow = getNicaraguaNow();

    // Calcular valores por defecto en zona horaria Nicaragua (UTC-6)
    // Período A por defecto: Mes Actual (inicio del mes hasta hoy)
    const defaultStartA = nicNow.firstDayStr;
    const defaultEndA = nicNow.todayStr;

    // Período B por defecto: Mismísimos Días (MTD - Month to Date) para una carga inicial ultra-rápida y comparación justa 1:1
    let prevYearVal = nicNow.year;
    let prevMonthVal = nicNow.month - 1; // 0-indexed
    if (prevMonthVal < 0) {
      prevMonthVal = 11;
      prevYearVal -= 1;
    }

    const prevMonthLastDay = new Date(prevYearVal, prevMonthVal + 1, 0).getDate();
    const prevMonthSameDay = Math.min(nicNow.day, prevMonthLastDay);
    const defaultStartB = `${prevYearVal}-${String(prevMonthVal + 1).padStart(2, '0')}-01`;
    const defaultEndB = `${prevYearVal}-${String(prevMonthVal + 1).padStart(2, '0')}-${String(prevMonthSameDay).padStart(2, '0')}`;

    // Extraer parámetros explícitos de fecha enviados desde el cliente
    const startDateA = searchParams.get('startDateA') || searchParams.get('startA') || defaultStartA;
    const endDateA = searchParams.get('endDateA') || searchParams.get('endA') || defaultEndA;

    const startDateB = searchParams.get('startDateB') || searchParams.get('startB') || defaultStartB;
    const endDateB = searchParams.get('endDateB') || searchParams.get('endB') || defaultEndB;

    const currentStartIso = new Date(`${startDateA}T00:00:00-06:00`).toISOString();
    const currentEndIso = new Date(`${endDateA}T23:59:59-06:00`).toISOString();

    const prevStartIso = new Date(`${startDateB}T00:00:00-06:00`).toISOString();
    const prevEndIso = new Date(`${endDateB}T23:59:59-06:00`).toISOString();

    // Consultar TODAS las órdenes del Período A y del Período B en paralelo
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

    // Conteo exacto por estados (Período A)
    const currInvoicedCount = currInvoicedRes?.paging?.total ?? 0;
    const currHandlingCount = currHandlingRes?.paging?.total ?? 0;
    const currReadyCount = currReadyRes?.paging?.total ?? 0;
    const currCanceledCount = currCanceledRes?.paging?.total ?? 0;

    // Conteo exacto por estados (Período B)
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

    // Métricas del Período B
    const prevSocialSellingOrdersCount = prevSocialAnalysis.count;
    const prevSocialSellingRevenue = prevSocialAnalysis.revenue;
    const prevSocialSellingPct = prevValidOrders.length > 0 ? (prevSocialSellingOrdersCount / prevValidOrders.length) * 100 : 0;

    const prevWebDirectPct = 100 - prevSocialSellingPct;
    const prevWebDirectRevenue = Math.max(0, prevTotalRevenue - prevSocialSellingRevenue);

    const BCN_EXCHANGE_RATE = 36.6243;

    // Generar desglose diario para el Período A (Mes Actual)
    const dailyMap = {};
    const startDateObj = new Date(`${startDateA}T00:00:00-06:00`);
    const endDateObj = new Date(`${endDateA}T00:00:00-06:00`);

    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const dayNum = d.getDate();
      const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayLabel = `${String(dayNum).padStart(2, '0')} ${monthNamesShort[d.getMonth()]}`;

      dailyMap[dayStr] = {
        date: dayStr,
        dayNum,
        dayLabel,
        approvedOrders: 0,
        canceledOrders: 0,
        salesNio: 0,
        salesUsd: 0,
        refundsNio: 0,
        refundsUsd: 0,
        avgTicketNio: 0,
        avgTicketUsd: 0,
      };
    }

    currOrders.forEach((o) => {
      if (!o.creationDate) return;
      const dateObj = new Date(o.creationDate);
      const nicDate = new Date(dateObj.getTime() - 6 * 3600 * 1000);
      const dayStr = nicDate.toISOString().split('T')[0];

      if (!dailyMap[dayStr]) {
        const dayNum = nicDate.getDate();
        const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const dayLabel = `${String(dayNum).padStart(2, '0')} ${monthNamesShort[nicDate.getMonth()]}`;
        dailyMap[dayStr] = {
          date: dayStr,
          dayNum,
          dayLabel,
          approvedOrders: 0,
          canceledOrders: 0,
          salesNio: 0,
          salesUsd: 0,
          refundsNio: 0,
          refundsUsd: 0,
          avgTicketNio: 0,
          avgTicketUsd: 0,
        };
      }

      const valNio = o.totalValue ? o.totalValue / 100 : 0;
      const valUsd = valNio / BCN_EXCHANGE_RATE;

      if (o.status === 'canceled') {
        dailyMap[dayStr].canceledOrders += 1;
        dailyMap[dayStr].refundsNio += valNio;
        dailyMap[dayStr].refundsUsd += valUsd;
      } else {
        dailyMap[dayStr].approvedOrders += 1;
        dailyMap[dayStr].salesNio += valNio;
        dailyMap[dayStr].salesUsd += valUsd;
      }
    });

    const dailyBreakdown = Object.values(dailyMap)
      .map((d) => {
        const avgN = d.approvedOrders > 0 ? d.salesNio / d.approvedOrders : 0;
        const avgU = d.approvedOrders > 0 ? d.salesUsd / d.approvedOrders : 0;
        return {
          ...d,
          salesNio: parseFloat(d.salesNio.toFixed(2)),
          salesUsd: parseFloat(d.salesUsd.toFixed(2)),
          refundsNio: parseFloat(d.refundsNio.toFixed(2)),
          refundsUsd: parseFloat(d.refundsUsd.toFixed(2)),
          avgTicketNio: parseFloat(avgN.toFixed(2)),
          avgTicketUsd: parseFloat(avgU.toFixed(2)),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Función auxiliar para calcular porcentaje de cambio
    const calcChange = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    const labelA = formatFriendlyDateRange(startDateA, endDateA);
    const labelB = formatFriendlyDateRange(startDateB, endDateB);

    return NextResponse.json({
      success: true,
      bcnExchangeRate: BCN_EXCHANGE_RATE,
      periods: {
        current: {
          label: labelA,
          start: startDateA,
          end: endDateA,
          monthName: labelA,
        },
        previous: {
          label: labelB,
          start: startDateB,
          end: endDateB,
          monthName: labelB,
        },
      },
      kpis: {
        totalRevenue: {
          currentNio: parseFloat(currTotalRevenue.toFixed(2)),
          currentUsd: parseFloat((currTotalRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          previousNio: parseFloat(prevTotalRevenue.toFixed(2)),
          previousUsd: parseFloat((prevTotalRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
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
          currentNio: parseFloat(currAvgTicket.toFixed(2)),
          currentUsd: parseFloat((currAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
          previousNio: parseFloat(prevAvgTicket.toFixed(2)),
          previousUsd: parseFloat((prevAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
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
            revenueNio: parseFloat(socialSellingRevenue.toFixed(2)),
            revenueUsd: parseFloat((socialSellingRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            revenue: parseFloat(socialSellingRevenue.toFixed(2)),
          },
          previous: {
            count: prevSocialSellingOrdersCount,
            pct: parseFloat(prevSocialSellingPct.toFixed(1)),
            revenueNio: parseFloat(prevSocialSellingRevenue.toFixed(2)),
            revenueUsd: parseFloat((prevSocialSellingRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            revenue: parseFloat(prevSocialSellingRevenue.toFixed(2)),
          },
          changePct: calcChange(socialSellingRevenue, prevSocialSellingRevenue),
        },
        webDirect: {
          current: {
            count: currValidOrders.length - socialSellingOrdersCount,
            pct: parseFloat(webDirectPct.toFixed(1)),
            revenueNio: parseFloat(webDirectRevenue.toFixed(2)),
            revenueUsd: parseFloat((webDirectRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            revenue: parseFloat(webDirectRevenue.toFixed(2)),
          },
          previous: {
            count: prevValidOrders.length - prevSocialSellingOrdersCount,
            pct: parseFloat(prevWebDirectPct.toFixed(1)),
            revenueNio: parseFloat(prevWebDirectRevenue.toFixed(2)),
            revenueUsd: parseFloat((prevWebDirectRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
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
      dailyBreakdown,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
