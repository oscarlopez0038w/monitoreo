import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Memory Cache para respuestas analíticas (60s TTL)
const ANALYTICS_CACHE = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getCachedAnalytics(key) {
  const item = ANALYTICS_CACHE.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    ANALYTICS_CACHE.delete(key);
    return null;
  }
  return item.data;
}

function setCachedAnalytics(key, data) {
  if (ANALYTICS_CACHE.size > 100) {
    ANALYTICS_CACHE.clear();
  }
  ANALYTICS_CACHE.set(key, { timestamp: Date.now(), data });
}

// Función optimizada para obtener TODAS las órdenes de un período paginando en paralelo (Promise.all)
async function fetchAllPeriodOrders(startIso, endIso) {
  const firstRes = await fetchVtexOrders(startIso, endIso, '', '', 1, 100).catch(() => null);
  if (!firstRes || !firstRes.list || firstRes.list.length === 0) return [];

  const allOrders = [...firstRes.list];
  const totalPages = Math.min(firstRes.paging?.pages || 1, 15);

  if (totalPages > 1) {
    const pagePromises = [];
    for (let p = 2; p <= totalPages; p++) {
      pagePromises.push(fetchVtexOrders(startIso, endIso, '', '', p, 100).catch(() => null));
    }
    const additionalPages = await Promise.all(pagePromises);
    additionalPages.forEach((res) => {
      if (res && Array.isArray(res.list)) {
        allOrders.push(...res.list);
      }
    });
  }

  return allOrders;
}

// Función para consultar los detalles de las órdenes en lotes concurrentes y calcular analítica completa de Marketing & Social Selling
async function analyzePeriodMarketingDetails(orders) {
  let grossSocialCount = 0;
  let grossSocialRevenue = 0;
  let canceledSocialCount = 0;
  let canceledSocialRevenue = 0;
  let netSocialCount = 0;
  let netSocialRevenue = 0;

  let grossWebCount = 0;
  let grossWebRevenue = 0;
  let canceledWebCount = 0;
  let canceledWebRevenue = 0;
  let netWebCount = 0;
  let netWebRevenue = 0;

  const campMap = {};
  const sourceMap = {};
  const couponMap = {};
  const promoMap = {};
  const logisticsSummary = {
    pickupCount: 0,
    pickupRevenue: 0,
    deliveryCount: 0,
    deliveryRevenue: 0,
    freeFreightCount: 0,
  };

  if (!orders || orders.length === 0) {
    return {
      social: { grossCount: 0, grossRevenue: 0, canceledCount: 0, canceledRevenue: 0, netCount: 0, netRevenue: 0 },
      web: { grossCount: 0, grossRevenue: 0, canceledCount: 0, canceledRevenue: 0, netCount: 0, netRevenue: 0 },
      marketing: { utmCampaigns: [], utmSources: [], couponsList: [], vtexPromotions: [], logisticsSummary },
    };
  }

  const orderIds = orders.map((o) => o.orderId);

  // 1. Consultar caché en Supabase por order_id
  const cachedMap = {};
  if (isSupabaseConfigured()) {
    try {
      const { data: dbRows } = await supabaseAdmin
        .from('vtex_orders')
        .select('order_id, detail_json, marketing_json, fulfillment_type, pickup_store, shipping_cost, total_value')
        .in('order_id', orderIds);

      (dbRows || []).forEach((r) => {
        if (r.order_id && r.detail_json) {
          cachedMap[r.order_id] = r;
        }
      });
    } catch (e) {
      console.error('Error al leer caché Supabase vtex_orders:', e);
    }
  }

  // 2. Para las órdenes que no están en caché, obtener detalle en directo de VTEX OMS API
  const BATCH_SIZE = 25;
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);

    const details = await Promise.all(
      batch.map((o) => {
        const cached = cachedMap[o.orderId];
        if (cached && cached.detail_json) {
          return Promise.resolve(cached.detail_json);
        }
        return fetchVtexOrderDetail(o.orderId).catch(() => null);
      })
    );

    // Guardar en Supabase las órdenes recién obtenidas (segundo plano no bloqueante)
    if (isSupabaseConfigured()) {
      const updatePromises = [];
      for (let idx = 0; idx < batch.length; idx++) {
        const o = batch[idx];
        const detail = details[idx];
        if (!detail) continue;

        if (!cachedMap[o.orderId]) {
          const mData = detail.marketingData || null;
          updatePromises.push(
            (async () => {
              try {
                await supabaseAdmin
                  .from('vtex_orders')
                  .update({
                    detail_json: detail,
                    marketing_json: mData,
                  })
                  .eq('order_id', o.orderId);
              } catch (e) {}
            })()
          );
        }
      }
      if (updatePromises.length > 0) {
        Promise.all(updatePromises).catch(() => null);
      }
    }

    // Procesar métricas para cada orden
    details.forEach((detail, idx) => {
      const origOrder = batch[idx];
      const ordObj = detail || origOrder;
      if (!ordObj) return;

      const st = detail?.status || origOrder?.status;
      const isCanceled = st === 'canceled';

      const valNio = detail?.totalValue ? detail.totalValue / 100 : (detail?.value ? detail.value / 100 : (origOrder?.totalValue ? origOrder.totalValue / 100 : 0));
      const mkt = detail?.marketingData || {};
      const utmi = mkt.utmiCampaign || detail?.utmiCampaign || mkt.utmicampaign;
      const mTags = mkt.marketingTags || detail?.marketingTags || [];
      const hasSocialTag = (Array.isArray(mTags) && mTags.includes('vtexSocialSelling')) || Boolean(utmi && String(utmi).trim().length > 0);

      if (hasSocialTag) {
        grossSocialCount++;
        grossSocialRevenue += valNio;
        if (isCanceled) {
          canceledSocialCount++;
          canceledSocialRevenue += valNio;
        } else {
          netSocialCount++;
          netSocialRevenue += valNio;
        }
      } else {
        grossWebCount++;
        grossWebRevenue += valNio;
        if (isCanceled) {
          canceledWebCount++;
          canceledWebRevenue += valNio;
        } else {
          netWebCount++;
          netWebRevenue += valNio;
        }
      }

      if (!isCanceled) {
        // Logística
        const delChan = detail?.shippingData?.logisticsInfo?.[0]?.selectedDeliveryChannel;
        const isPickup = delChan === 'pickup-in-point' || Boolean(detail?.shippingData?.logisticsInfo?.[0]?.pickupStoreInfo?.friendlyName);
        const shipCost = (detail?.totals?.find((t) => t.id === 'Shipping')?.value || 0) / 100;

        if (isPickup) {
          logisticsSummary.pickupCount++;
          logisticsSummary.pickupRevenue += valNio;
        } else {
          logisticsSummary.deliveryCount++;
          logisticsSummary.deliveryRevenue += valNio;
        }

        if (shipCost === 0) {
          logisticsSummary.freeFreightCount++;
        }

        // UTM Campaign
        const camp = mkt.utmCampaign || mkt.utm_campaign;
        const cKey = (camp && String(camp).trim().length > 0) ? String(camp).trim() : 'Sin Campaña Específica (Orgánico / Directo)';
        campMap[cKey] = campMap[cKey] || { name: cKey, orders: 0, revenueNio: 0 };
        campMap[cKey].orders += 1;
        campMap[cKey].revenueNio += valNio;

        // UTM Source / Canal
        const src = hasSocialTag ? 'Vendedor Interno (Social Selling)' : (mkt.utmSource || mkt.utm_source || 'Orgánico / Directo');
        const srcKey = String(src).trim();
        sourceMap[srcKey] = sourceMap[srcKey] || { name: srcKey, orders: 0, revenueNio: 0 };
        sourceMap[srcKey].orders += 1;
        sourceMap[srcKey].revenueNio += valNio;

        // Cupón
        const cpn = mkt.coupon;
        if (cpn && String(cpn).trim().length > 0) {
          const cpnKey = String(cpn).trim();
          couponMap[cpnKey] = couponMap[cpnKey] || { code: cpnKey, orders: 0, revenueNio: 0 };
          couponMap[cpnKey].orders += 1;
          couponMap[cpnKey].revenueNio += valNio;
        }

        // Promociones & Alianzas VTEX
        const promoArray = detail?.ratesAndBenefitsData?.rateAndBenefitsIdentifiers || [];
        promoArray.forEach((promo) => {
          const pName = (promo.name || promo.id || '').trim();
          if (pName) {
            promoMap[pName] = promoMap[pName] || { name: pName, orders: 0, revenueNio: 0 };
            promoMap[pName].orders += 1;
            promoMap[pName].revenueNio += valNio;
          }
        });
      }
    });
  }

  const BCN_EXCHANGE_RATE = 36.6243;

  const utmCampaigns = Object.values(campMap).map((c) => ({
    ...c,
    revenueUsd: parseFloat((c.revenueNio / BCN_EXCHANGE_RATE).toFixed(2)),
  })).sort((a, b) => b.revenueNio - a.revenueNio);

  const utmSources = Object.values(sourceMap).map((s) => ({
    ...s,
    revenueUsd: parseFloat((s.revenueNio / BCN_EXCHANGE_RATE).toFixed(2)),
  })).sort((a, b) => b.revenueNio - a.revenueNio);

  const couponsList = Object.values(couponMap).map((cp) => ({
    ...cp,
    revenueUsd: parseFloat((cp.revenueNio / BCN_EXCHANGE_RATE).toFixed(2)),
  })).sort((a, b) => b.revenueNio - a.revenueNio);

  const vtexPromotions = Object.values(promoMap).map((pr) => ({
    ...pr,
    revenueUsd: parseFloat((pr.revenueNio / BCN_EXCHANGE_RATE).toFixed(2)),
  })).sort((a, b) => b.revenueNio - a.revenueNio);

  return {
    social: {
      grossCount: grossSocialCount,
      grossRevenue: grossSocialRevenue,
      canceledCount: canceledSocialCount,
      canceledRevenue: canceledSocialRevenue,
      netCount: netSocialCount,
      netRevenue: netSocialRevenue,
    },
    web: {
      grossCount: grossWebCount,
      grossRevenue: grossWebRevenue,
      canceledCount: canceledWebCount,
      canceledRevenue: canceledWebRevenue,
      netCount: netWebCount,
      netRevenue: netWebRevenue,
    },
    marketing: {
      utmCampaigns,
      utmSources,
      couponsList,
      vtexPromotions,
      logisticsSummary: {
        pickupCount: logisticsSummary.pickupCount,
        pickupRevenueNio: logisticsSummary.pickupRevenue,
        pickupRevenueUsd: parseFloat((logisticsSummary.pickupRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
        deliveryCount: logisticsSummary.deliveryCount,
        deliveryRevenueNio: logisticsSummary.deliveryRevenue,
        deliveryRevenueUsd: parseFloat((logisticsSummary.deliveryRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
        freeFreightCount: logisticsSummary.freeFreightCount,
      },
    },
  };
}

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
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const nicNow = getNicaraguaNow();

    const defaultStartA = nicNow.firstDayStr;
    const defaultEndA = nicNow.todayStr;

    let prevYearVal = nicNow.year;
    let prevMonthVal = nicNow.month - 1;
    if (prevMonthVal < 0) {
      prevMonthVal = 11;
      prevYearVal -= 1;
    }

    const prevMonthLastDay = new Date(prevYearVal, prevMonthVal + 1, 0).getDate();
    const prevMonthSameDay = Math.min(nicNow.day, prevMonthLastDay);
    const defaultStartB = `${prevYearVal}-${String(prevMonthVal + 1).padStart(2, '0')}-01`;
    const defaultEndB = `${prevYearVal}-${String(prevMonthVal + 1).padStart(2, '0')}-${String(prevMonthSameDay).padStart(2, '0')}`;

    let prev2YearVal = nicNow.year;
    let prev2MonthVal = nicNow.month - 2;
    if (prev2MonthVal < 0) {
      prev2MonthVal += 12;
      prev2YearVal -= 1;
    }

    const prev2MonthLastDay = new Date(prev2YearVal, prev2MonthVal + 1, 0).getDate();
    const prev2MonthSameDay = Math.min(nicNow.day, prev2MonthLastDay);
    const defaultStartC = `${prev2YearVal}-${String(prev2MonthVal + 1).padStart(2, '0')}-01`;
    const defaultEndC = `${prev2YearVal}-${String(prev2MonthVal + 1).padStart(2, '0')}-${String(prev2MonthSameDay).padStart(2, '0')}`;

    const startDateA = searchParams.get('startDateA') || searchParams.get('startA') || searchParams.get('startDate') || searchParams.get('start') || defaultStartA;
    const endDateA = searchParams.get('endDateA') || searchParams.get('endA') || searchParams.get('endDate') || searchParams.get('end') || defaultEndA;
    const startDateB = searchParams.get('startDateB') || searchParams.get('startB') || defaultStartB;
    const endDateB = searchParams.get('endDateB') || searchParams.get('endB') || defaultEndB;
    const startDateC = searchParams.get('startDateC') || searchParams.get('startC') || searchParams.get('startDate2') || searchParams.get('start2') || defaultStartC;
    const endDateC = searchParams.get('endDateC') || searchParams.get('endC') || searchParams.get('endDate2') || searchParams.get('end2') || defaultEndC;

    // Verificar memoria caché (60s TTL)
    const cacheKey = `${startDateA}_${endDateA}_${startDateB}_${endDateB}_${startDateC}_${endDateC}`;
    const cachedData = getCachedAnalytics(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    const currentStartIso = new Date(`${startDateA}T00:00:00-06:00`).toISOString();
    const currentEndIso = new Date(`${endDateA}T23:59:59-06:00`).toISOString();
    const prevStartIso = new Date(`${startDateB}T00:00:00-06:00`).toISOString();
    const prevEndIso = new Date(`${endDateB}T23:59:59-06:00`).toISOString();
    const prev2StartIso = new Date(`${startDateC}T00:00:00-06:00`).toISOString();
    const prev2EndIso = new Date(`${endDateC}T23:59:59-06:00`).toISOString();

    const startDateObj = new Date(`${startDateA}T00:00:00-06:00`);
    const endDateObj = new Date(`${endDateA}T00:00:00-06:00`);

    const diffTime = Math.abs(endDateObj - startDateObj);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    let chartStartDateObj = new Date(startDateObj);
    let chartStartBObj = new Date(`${startDateB}T00:00:00-06:00`);
    let chartStartCObj = new Date(`${startDateC}T00:00:00-06:00`);

    if (diffDays < 3) {
      const extraPrevDays = 3 - diffDays;
      chartStartDateObj.setDate(chartStartDateObj.getDate() - extraPrevDays);
      chartStartBObj.setDate(chartStartBObj.getDate() - extraPrevDays);
      chartStartCObj.setDate(chartStartCObj.getDate() - extraPrevDays);
    }

    const chartStartIsoA = chartStartDateObj.toISOString();
    const chartStartIsoB = chartStartBObj.toISOString();
    const chartStartIsoC = chartStartCObj.toISOString();

    // Obtener órdenes de los períodos en paralelo (incluye los 2 días anteriores para A, B y C cuando el filtro es 1 día)
    const [chartOrders, prevOrders, prev2Orders] = await Promise.all([
      fetchAllPeriodOrders(chartStartIsoA, currentEndIso),
      fetchAllPeriodOrders(chartStartIsoB, prevEndIso),
      fetchAllPeriodOrders(chartStartIsoC, prev2EndIso),
    ]);

    // Filtrar órdenes exactas del Período A para métricas KPI y análisis
    const currOrders = chartOrders.filter((o) => {
      if (!o.creationDate) return false;
      const d = new Date(o.creationDate).getTime();
      return d >= new Date(currentStartIso).getTime() && d <= new Date(currentEndIso).getTime();
    });

    // Filtrar órdenes exactas del Período B para métricas KPI y análisis
    const prevOrdersExact = prevOrders.filter((o) => {
      if (!o.creationDate) return false;
      const d = new Date(o.creationDate).getTime();
      return d >= new Date(prevStartIso).getTime() && d <= new Date(prevEndIso).getTime();
    });

    // Filtrar órdenes exactas del Período C para métricas KPI y análisis
    const prev2OrdersExact = prev2Orders.filter((o) => {
      if (!o.creationDate) return false;
      const d = new Date(o.creationDate).getTime();
      return d >= new Date(prev2StartIso).getTime() && d <= new Date(prev2EndIso).getTime();
    });

    const currGrossRevenue = currOrders.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const currCanceledRevenue = currOrders.filter((o) => o.status === 'canceled').reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const currNetRevenue = currGrossRevenue - currCanceledRevenue;

    const currTotalOrders = currOrders.length;
    const currCanceledCount = currOrders.filter((o) => o.status === 'canceled').length;
    const currValidCount = currTotalOrders - currCanceledCount;

    const currGrossAvgTicket = currTotalOrders > 0 ? currGrossRevenue / currTotalOrders : 0;
    const currNetAvgTicket = currValidCount > 0 ? currNetRevenue / currValidCount : 0;

    const prevGrossRevenue = prevOrdersExact.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prevCanceledRevenue = prevOrdersExact.filter((o) => o.status === 'canceled').reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prevNetRevenue = prevGrossRevenue - prevCanceledRevenue;

    const prevTotalOrders = prevOrdersExact.length;
    const prevCanceledCount = prevOrdersExact.filter((o) => o.status === 'canceled').length;
    const prevValidCount = prevTotalOrders - prevCanceledCount;

    const prevGrossAvgTicket = prevTotalOrders > 0 ? prevGrossRevenue / prevTotalOrders : 0;
    const prevNetAvgTicket = prevValidCount > 0 ? prevNetRevenue / prevValidCount : 0;

    const prev2GrossRevenue = prev2OrdersExact.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prev2CanceledRevenue = prev2OrdersExact.filter((o) => o.status === 'canceled').reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prev2NetRevenue = prev2GrossRevenue - prev2CanceledRevenue;

    const prev2TotalOrders = prev2OrdersExact.length;
    const prev2CanceledCount = prev2OrdersExact.filter((o) => o.status === 'canceled').length;
    const prev2ValidCount = prev2TotalOrders - prev2CanceledCount;

    const prev2GrossAvgTicket = prev2TotalOrders > 0 ? prev2GrossRevenue / prev2TotalOrders : 0;
    const prev2NetAvgTicket = prev2ValidCount > 0 ? prev2NetRevenue / prev2ValidCount : 0;

    // Calcular estados en memoria sin peticiones externas redundantes a VTEX
    let currInvoicedCount = 0;
    let currHandlingCount = 0;
    let currReadyCount = 0;
    let currCanceledCountMap = 0;
    let currOtherCount = 0;

    currOrders.forEach((o) => {
      const st = o.status;
      if (st === 'invoiced') currInvoicedCount++;
      else if (st === 'handling') currHandlingCount++;
      else if (st === 'ready-for-handling') currReadyCount++;
      else if (st === 'canceled') currCanceledCountMap++;
      else currOtherCount++;
    });

    let prevInvoicedCount = 0;
    let prevCanceledCountMap = 0;

    prevOrdersExact.forEach((o) => {
      const st = o.status;
      if (st === 'invoiced') prevInvoicedCount++;
      else if (st === 'canceled') prevCanceledCountMap++;
    });

    let prev2InvoicedCount = 0;
    prev2OrdersExact.forEach((o) => {
      if (o.status === 'invoiced') prev2InvoicedCount++;
    });

    const currCancelRate = currTotalOrders > 0 ? (currCanceledCount / currTotalOrders) * 100 : 0;
    const prevCancelRate = prevTotalOrders > 0 ? (prevCanceledCount / prevTotalOrders) * 100 : 0;
    const prev2CancelRate = prev2TotalOrders > 0 ? (prev2CanceledCount / prev2TotalOrders) * 100 : 0;

    const [currAnalysis, prevAnalysis, prev2Analysis] = await Promise.all([
      analyzePeriodMarketingDetails(currOrders),
      analyzePeriodMarketingDetails(prevOrdersExact),
      analyzePeriodMarketingDetails(prev2OrdersExact),
    ]);

    const BCN_EXCHANGE_RATE = 36.6243;

    // Generar desglose diario para la gráfica (garantiza mínimo 3 días de tendencia)
    const dailyMap = {};

    for (let d = new Date(chartStartDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const dayNum = d.getDate();
      const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayLabel = `${String(dayNum).padStart(2, '0')} ${monthNamesShort[d.getMonth()]}`;

      dailyMap[dayStr] = {
        date: dayStr,
        dayNum,
        dayLabel,
        totalOrders: 0,
        approvedOrders: 0,
        canceledOrders: 0,
        grossSalesNio: 0,
        grossSalesUsd: 0,
        salesNio: 0,
        salesUsd: 0,
        refundsNio: 0,
        refundsUsd: 0,
        avgTicketNio: 0,
        avgTicketUsd: 0,
        grossAvgTicketNio: 0,
        grossAvgTicketUsd: 0,
      };
    }

    chartOrders.forEach((o) => {
      if (!o.creationDate) return;
      const dateObj = new Date(o.creationDate);
      const nicDate = new Date(dateObj.getTime() - 6 * 3600 * 1000);
      const dayStr = nicDate.toISOString().split('T')[0];

      if (dailyMap[dayStr]) {
        const valNio = o.totalValue ? o.totalValue / 100 : 0;
        const valUsd = valNio / BCN_EXCHANGE_RATE;

        dailyMap[dayStr].totalOrders += 1;
        dailyMap[dayStr].grossSalesNio += valNio;
        dailyMap[dayStr].grossSalesUsd += valUsd;

        if (o.status === 'canceled') {
          dailyMap[dayStr].canceledOrders += 1;
          dailyMap[dayStr].refundsNio += valNio;
          dailyMap[dayStr].refundsUsd += valUsd;
        } else {
          dailyMap[dayStr].approvedOrders += 1;
          dailyMap[dayStr].salesNio += valNio;
          dailyMap[dayStr].salesUsd += valUsd;
        }
      }
    });

    // Desglose diario para Período B
    const dailyMapB = {};
    const endBObj = new Date(`${endDateB}T00:00:00-06:00`);
    for (let d = new Date(chartStartBObj); d <= endBObj; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const dayNum = d.getDate();
      const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayLabel = `${String(dayNum).padStart(2, '0')} ${monthNamesShort[d.getMonth()]}`;
      dailyMapB[dayStr] = { date: dayStr, dayNum, dayLabel, salesNio: 0, salesUsd: 0, approvedOrders: 0 };
    }
    prevOrders.forEach((o) => {
      if (!o.creationDate) return;
      const dateObj = new Date(o.creationDate);
      const nicDate = new Date(dateObj.getTime() - 6 * 3600 * 1000);
      const dayStr = nicDate.toISOString().split('T')[0];
      if (dailyMapB[dayStr] && o.status !== 'canceled') {
        const valNio = o.totalValue ? o.totalValue / 100 : 0;
        const valUsd = valNio / BCN_EXCHANGE_RATE;
        dailyMapB[dayStr].approvedOrders += 1;
        dailyMapB[dayStr].salesNio += valNio;
        dailyMapB[dayStr].salesUsd += valUsd;
      }
    });

    // Desglose diario para Período C
    const dailyMapC = {};
    const endCObj = new Date(`${endDateC}T00:00:00-06:00`);
    for (let d = new Date(chartStartCObj); d <= endCObj; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const dayNum = d.getDate();
      const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayLabel = `${String(dayNum).padStart(2, '0')} ${monthNamesShort[d.getMonth()]}`;
      dailyMapC[dayStr] = { date: dayStr, dayNum, dayLabel, salesNio: 0, salesUsd: 0, approvedOrders: 0 };
    }
    prev2Orders.forEach((o) => {
      if (!o.creationDate) return;
      const dateObj = new Date(o.creationDate);
      const nicDate = new Date(dateObj.getTime() - 6 * 3600 * 1000);
      const dayStr = nicDate.toISOString().split('T')[0];
      if (dailyMapC[dayStr] && o.status !== 'canceled') {
        const valNio = o.totalValue ? o.totalValue / 100 : 0;
        const valUsd = valNio / BCN_EXCHANGE_RATE;
        dailyMapC[dayStr].approvedOrders += 1;
        dailyMapC[dayStr].salesNio += valNio;
        dailyMapC[dayStr].salesUsd += valUsd;
      }
    });

    const listA = Object.values(dailyMap).sort((a, b) => (a.date > b.date ? 1 : -1));
    const listB = Object.values(dailyMapB).sort((a, b) => (a.date > b.date ? 1 : -1));
    const listC = Object.values(dailyMapC).sort((a, b) => (a.date > b.date ? 1 : -1));

    const dailyBreakdown = listA.map((dA, idx) => {
      const dB = listB[idx] || { salesNio: 0, salesUsd: 0, approvedOrders: 0, dayLabel: '' };
      const dC = listC[idx] || { salesNio: 0, salesUsd: 0, approvedOrders: 0, dayLabel: '' };
      const avgN = dA.approvedOrders > 0 ? dA.salesNio / dA.approvedOrders : 0;
      const avgU = dA.approvedOrders > 0 ? dA.salesUsd / dA.approvedOrders : 0;
      const grossAvgN = dA.totalOrders > 0 ? dA.grossSalesNio / dA.totalOrders : 0;
      const grossAvgU = dA.totalOrders > 0 ? dA.grossSalesUsd / dA.totalOrders : 0;
      return {
        ...dA,
        grossSalesNio: parseFloat(dA.grossSalesNio.toFixed(2)),
        grossSalesUsd: parseFloat(dA.grossSalesUsd.toFixed(2)),
        salesNio: parseFloat(dA.salesNio.toFixed(2)),
        salesUsd: parseFloat(dA.salesUsd.toFixed(2)),
        refundsNio: parseFloat(dA.refundsNio.toFixed(2)),
        refundsUsd: parseFloat(dA.refundsUsd.toFixed(2)),
        avgTicketNio: parseFloat(avgN.toFixed(2)),
        avgTicketUsd: parseFloat(avgU.toFixed(2)),
        grossAvgTicketNio: parseFloat(grossAvgN.toFixed(2)),
        grossAvgTicketUsd: parseFloat(grossAvgU.toFixed(2)),
        salesNioB: parseFloat((dB.salesNio || 0).toFixed(2)),
        salesUsdB: parseFloat((dB.salesUsd || 0).toFixed(2)),
        dayLabelB: dB.dayLabel || '',
        salesNioC: parseFloat((dC.salesNio || 0).toFixed(2)),
        salesUsdC: parseFloat((dC.salesUsd || 0).toFixed(2)),
        dayLabelC: dC.dayLabel || '',
      };
    });

    const utmCampaigns = currAnalysis.marketing.utmCampaigns;
    const utmSources = currAnalysis.marketing.utmSources;
    const couponsList = currAnalysis.marketing.couponsList;
    const vtexPromotions = currAnalysis.marketing.vtexPromotions;
    const logisticsSummary = currAnalysis.marketing.logisticsSummary;

    const calcChange = (currentVal, previousVal) => {
      if (!previousVal || previousVal === 0) return currentVal > 0 ? 100 : 0;
      const diff = currentVal - previousVal;
      const pct = (diff / previousVal) * 100;
      return parseFloat(pct.toFixed(1));
    };

    const labelA = formatFriendlyDateRange(startDateA, endDateA);
    const labelB = formatFriendlyDateRange(startDateB, endDateB);
    const labelC = formatFriendlyDateRange(startDateC, endDateC);

    const responsePayload = {
      success: true,
      bcnExchangeRate: BCN_EXCHANGE_RATE,
      periods: {
        current: {
          start: startDateA,
          end: endDateA,
          label: labelA,
          monthName: labelA,
        },
        previous: {
          start: startDateB,
          end: endDateB,
          label: labelB,
          monthName: labelB,
        },
        previous2: {
          start: startDateC,
          end: endDateC,
          label: labelC,
          monthName: labelC,
        },
      },
      kpis: {
        grossRevenue: {
          currentNio: parseFloat(currGrossRevenue.toFixed(2)),
          currentUsd: parseFloat((currGrossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          previousNio: parseFloat(prevGrossRevenue.toFixed(2)),
          previousUsd: parseFloat((prevGrossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          previous2Nio: parseFloat(prev2GrossRevenue.toFixed(2)),
          previous2Usd: parseFloat((prev2GrossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          changePct: calcChange(currGrossRevenue, prevGrossRevenue),
        },
        canceledRevenue: {
          currentNio: parseFloat(currCanceledRevenue.toFixed(2)),
          currentUsd: parseFloat((currCanceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          previousNio: parseFloat(prevCanceledRevenue.toFixed(2)),
          previousUsd: parseFloat((prevCanceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          previous2Nio: parseFloat(prev2CanceledRevenue.toFixed(2)),
          previous2Usd: parseFloat((prev2CanceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          changePct: calcChange(currCanceledRevenue, prevCanceledRevenue),
        },
        totalRevenue: {
          currentNio: parseFloat(currNetRevenue.toFixed(2)),
          currentUsd: parseFloat((currNetRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          previousNio: parseFloat(prevNetRevenue.toFixed(2)),
          previousUsd: parseFloat((prevNetRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          previous2Nio: parseFloat(prev2NetRevenue.toFixed(2)),
          previous2Usd: parseFloat((prev2NetRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
          current: parseFloat(currNetRevenue.toFixed(2)),
          previous: parseFloat(prevNetRevenue.toFixed(2)),
          previous2: parseFloat(prev2NetRevenue.toFixed(2)),
          changePct: calcChange(currNetRevenue, prevNetRevenue),
        },
        totalOrders: {
          current: currTotalOrders,
          previous: prevTotalOrders,
          previous2: prev2TotalOrders,
          validCurrent: currValidCount,
          validPrevious: prevValidCount,
          validPrevious2: prev2ValidCount,
          canceledCurrent: currCanceledCount,
          canceledPrevious: prevCanceledCount,
          canceledPrevious2: prev2CanceledCount,
          changePct: calcChange(currTotalOrders, prevTotalOrders),
        },
        grossAvgTicket: {
          currentNio: parseFloat(currGrossAvgTicket.toFixed(2)),
          currentUsd: parseFloat((currGrossAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
          previousNio: parseFloat(prevGrossAvgTicket.toFixed(2)),
          previousUsd: parseFloat((prevGrossAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
          previous2Nio: parseFloat(prev2GrossAvgTicket.toFixed(2)),
          previous2Usd: parseFloat((prev2GrossAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
          changePct: calcChange(currGrossAvgTicket, prevGrossAvgTicket),
        },
        avgTicket: {
          currentNio: parseFloat(currNetAvgTicket.toFixed(2)),
          currentUsd: parseFloat((currNetAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
          previousNio: parseFloat(prevNetAvgTicket.toFixed(2)),
          previousUsd: parseFloat((prevNetAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
          previous2Nio: parseFloat(prev2NetAvgTicket.toFixed(2)),
          previous2Usd: parseFloat((prev2NetAvgTicket / BCN_EXCHANGE_RATE).toFixed(2)),
          current: parseFloat(currNetAvgTicket.toFixed(2)),
          previous: parseFloat(prevNetAvgTicket.toFixed(2)),
          previous2: parseFloat(prev2NetAvgTicket.toFixed(2)),
          changePct: calcChange(currNetAvgTicket, prevNetAvgTicket),
        },
        invoicedOrders: {
          current: currInvoicedCount,
          previous: prevInvoicedCount,
          previous2: prev2InvoicedCount,
          changePct: calcChange(currInvoicedCount, prevInvoicedCount),
        },
        cancelRate: {
          current: parseFloat(currCancelRate.toFixed(1)),
          previous: parseFloat(prevCancelRate.toFixed(1)),
          previous2: parseFloat(prev2CancelRate.toFixed(1)),
          changePct: calcChange(currCancelRate, prevCancelRate),
        },
      },
      channels: {
        socialSelling: {
          current: {
            grossCount: currAnalysis.social.grossCount,
            grossRevenueNio: parseFloat(currAnalysis.social.grossRevenue.toFixed(2)),
            grossRevenueUsd: parseFloat((currAnalysis.social.grossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            canceledCount: currAnalysis.social.canceledCount,
            canceledRevenueNio: parseFloat(currAnalysis.social.canceledRevenue.toFixed(2)),
            canceledRevenueUsd: parseFloat((currAnalysis.social.canceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            netCount: currAnalysis.social.netCount,
            netRevenueNio: parseFloat(currAnalysis.social.netRevenue.toFixed(2)),
            netRevenueUsd: parseFloat((currAnalysis.social.netRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            pct: currNetRevenue > 0 ? parseFloat(((currAnalysis.social.netRevenue / currNetRevenue) * 100).toFixed(1)) : 0,
          },
          previous: {
            grossCount: prevAnalysis.social.grossCount,
            grossRevenueNio: parseFloat(prevAnalysis.social.grossRevenue.toFixed(2)),
            grossRevenueUsd: parseFloat((prevAnalysis.social.grossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            canceledCount: prevAnalysis.social.canceledCount,
            canceledRevenueNio: parseFloat(prevAnalysis.social.canceledRevenue.toFixed(2)),
            canceledRevenueUsd: parseFloat((prevAnalysis.social.canceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            netCount: prevAnalysis.social.netCount,
            netRevenueNio: parseFloat(prevAnalysis.social.netRevenue.toFixed(2)),
            netRevenueUsd: parseFloat((prevAnalysis.social.netRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            pct: prevNetRevenue > 0 ? parseFloat(((prevAnalysis.social.netRevenue / prevNetRevenue) * 100).toFixed(1)) : 0,
          },
          previous2: {
            grossCount: prev2Analysis.social.grossCount,
            grossRevenueNio: parseFloat(prev2Analysis.social.grossRevenue.toFixed(2)),
            grossRevenueUsd: parseFloat((prev2Analysis.social.grossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            canceledCount: prev2Analysis.social.canceledCount,
            canceledRevenueNio: parseFloat(prev2Analysis.social.canceledRevenue.toFixed(2)),
            canceledRevenueUsd: parseFloat((prev2Analysis.social.canceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            netCount: prev2Analysis.social.netCount,
            netRevenueNio: parseFloat(prev2Analysis.social.netRevenue.toFixed(2)),
            netRevenueUsd: parseFloat((prev2Analysis.social.netRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            pct: prev2NetRevenue > 0 ? parseFloat(((prev2Analysis.social.netRevenue / prev2NetRevenue) * 100).toFixed(1)) : 0,
          },
          changePct: calcChange(currAnalysis.social.netRevenue, prevAnalysis.social.netRevenue),
        },
        webDirect: {
          current: {
            grossCount: currAnalysis.web.grossCount,
            grossRevenueNio: parseFloat(currAnalysis.web.grossRevenue.toFixed(2)),
            grossRevenueUsd: parseFloat((currAnalysis.web.grossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            canceledCount: currAnalysis.web.canceledCount,
            canceledRevenueNio: parseFloat(currAnalysis.web.canceledRevenue.toFixed(2)),
            canceledRevenueUsd: parseFloat((currAnalysis.web.canceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            netCount: currAnalysis.web.netCount,
            netRevenueNio: parseFloat(currAnalysis.web.netRevenue.toFixed(2)),
            netRevenueUsd: parseFloat((currAnalysis.web.netRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            pct: currNetRevenue > 0 ? parseFloat(((currAnalysis.web.netRevenue / currNetRevenue) * 100).toFixed(1)) : 0,
          },
          previous: {
            grossCount: prevAnalysis.web.grossCount,
            grossRevenueNio: parseFloat(prevAnalysis.web.grossRevenue.toFixed(2)),
            grossRevenueUsd: parseFloat((prevAnalysis.web.grossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            canceledCount: prevAnalysis.web.canceledCount,
            canceledRevenueNio: parseFloat(prevAnalysis.web.canceledRevenue.toFixed(2)),
            canceledRevenueUsd: parseFloat((prevAnalysis.web.canceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            netCount: prevAnalysis.web.netCount,
            netRevenueNio: parseFloat(prevAnalysis.web.netRevenue.toFixed(2)),
            netRevenueUsd: parseFloat((prevAnalysis.web.netRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            pct: prevNetRevenue > 0 ? parseFloat(((prevAnalysis.web.netRevenue / prevNetRevenue) * 100).toFixed(1)) : 0,
          },
          previous2: {
            grossCount: prev2Analysis.web.grossCount,
            grossRevenueNio: parseFloat(prev2Analysis.web.grossRevenue.toFixed(2)),
            grossRevenueUsd: parseFloat((prev2Analysis.web.grossRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            canceledCount: prev2Analysis.web.canceledCount,
            canceledRevenueNio: parseFloat(prev2Analysis.web.canceledRevenue.toFixed(2)),
            canceledRevenueUsd: parseFloat((prev2Analysis.web.canceledRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            netCount: prev2Analysis.web.netCount,
            netRevenueNio: parseFloat(prev2Analysis.web.netRevenue.toFixed(2)),
            netRevenueUsd: parseFloat((prev2Analysis.web.netRevenue / BCN_EXCHANGE_RATE).toFixed(2)),
            pct: prev2NetRevenue > 0 ? parseFloat(((prev2Analysis.web.netRevenue / prev2NetRevenue) * 100).toFixed(1)) : 0,
          },
          changePct: calcChange(currAnalysis.web.netRevenue, prevAnalysis.web.netRevenue),
        },
      },
      marketingAnalytics: {
        utmCampaigns,
        utmSources,
        coupons: couponsList,
        promotions: vtexPromotions,
        logistics: logisticsSummary,
      },
      pipeline: {
        invoiced: currInvoicedCount,
        readyForHandling: currReadyCount,
        handling: currHandlingCount,
        canceled: currCanceledCountMap,
        otherInProcess: currOtherCount,
      },
      dailyBreakdown,
    };

    setCachedAnalytics(cacheKey, responsePayload);
    return NextResponse.json(responsePayload);
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
