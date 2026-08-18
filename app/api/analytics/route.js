import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Función para obtener TODAS las órdenes de un período paginando por lotes de 100 en 100
async function fetchAllPeriodOrders(startIso, endIso) {
  let allOrders = [];
  let page = 1;
  let maxPages = 15;

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

// Función para consultar los detalles de las órdenes en lotes concurrentes y calcular analítica completa de Marketing & Social Selling
async function analyzePeriodMarketingDetails(orders) {
  let socialCount = 0;
  let socialRevenue = 0;

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
      social: { count: 0, revenue: 0 },
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

    // Guardar en Supabase las órdenes recién obtenidas
    for (let idx = 0; idx < batch.length; idx++) {
      const o = batch[idx];
      const detail = details[idx];
      if (!detail) continue;

      if (!cachedMap[o.orderId] && isSupabaseConfigured()) {
        const mData = detail.marketingData || null;
        try {
          await supabaseAdmin
            .from('vtex_orders')
            .update({
              detail_json: detail,
              marketing_json: mData,
            })
            .eq('order_id', o.orderId);
        } catch (e) {
          // Ignores update error if any
        }
      }
    }

    // Procesar métricas para cada orden
    details.forEach((detail, idx) => {
      const origOrder = batch[idx];
      if (!detail) return;
      if (detail.status === 'canceled') return;

      const valNio = detail.totalValue ? detail.totalValue / 100 : (detail.value ? detail.value / 100 : (origOrder.totalValue ? origOrder.totalValue / 100 : 0));
      const mkt = detail.marketingData || {};
      const utmi = mkt.utmiCampaign || detail.utmiCampaign || mkt.utmicampaign;
      const mTags = mkt.marketingTags || detail.marketingTags || [];
      const hasSocialTag = (Array.isArray(mTags) && mTags.includes('vtexSocialSelling')) || Boolean(utmi && String(utmi).trim().length > 0);

      // Social Selling
      if (hasSocialTag) {
        socialCount++;
        socialRevenue += valNio;
      }

      // Logística
      const delChan = detail.shippingData?.logisticsInfo?.[0]?.selectedDeliveryChannel;
      const isPickup = delChan === 'pickup-in-point' || Boolean(detail.shippingData?.logisticsInfo?.[0]?.pickupStoreInfo?.friendlyName);
      const shipCost = (detail.totals?.find((t) => t.id === 'Shipping')?.value || 0) / 100;

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
      const promoArray = detail.ratesAndBenefitsData?.rateAndBenefitsIdentifiers || [];
      promoArray.forEach((promo) => {
        const pName = (promo.name || promo.id || '').trim();
        if (pName) {
          promoMap[pName] = promoMap[pName] || { name: pName, orders: 0, revenueNio: 0 };
          promoMap[pName].orders += 1;
          promoMap[pName].revenueNio += valNio;
        }
      });
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
    social: { count: socialCount, revenue: socialRevenue },
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

    const startDateA = searchParams.get('startDateA') || searchParams.get('startA') || defaultStartA;
    const endDateA = searchParams.get('endDateA') || searchParams.get('endA') || defaultEndA;
    const startDateB = searchParams.get('startDateB') || searchParams.get('startB') || defaultStartB;
    const endDateB = searchParams.get('endDateB') || searchParams.get('endB') || defaultEndB;

    const currentStartIso = new Date(`${startDateA}T00:00:00-06:00`).toISOString();
    const currentEndIso = new Date(`${endDateA}T23:59:59-06:00`).toISOString();
    const prevStartIso = new Date(`${startDateB}T00:00:00-06:00`).toISOString();
    const prevEndIso = new Date(`${endDateB}T23:59:59-06:00`).toISOString();

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

    const currValidOrders = currOrders.filter((o) => o.status !== 'canceled');
    const currTotalRevenue = currValidOrders.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const currTotalOrders = currOrders.length;
    const currAvgTicket = currValidOrders.length > 0 ? currTotalRevenue / currValidOrders.length : 0;

    const prevValidOrders = prevOrders.filter((o) => o.status !== 'canceled');
    const prevTotalRevenue = prevValidOrders.reduce((sum, o) => sum + (o.totalValue ? o.totalValue / 100 : 0), 0);
    const prevTotalOrders = prevOrders.length;
    const prevAvgTicket = prevValidOrders.length > 0 ? prevTotalRevenue / prevValidOrders.length : 0;

    const currInvoicedCount = currInvoicedRes?.paging?.total ?? 0;
    const currHandlingCount = currHandlingRes?.paging?.total ?? 0;
    const currReadyCount = currReadyRes?.paging?.total ?? 0;
    const currCanceledCount = currCanceledRes?.paging?.total ?? 0;

    const prevInvoicedCount = prevInvoicedRes?.paging?.total ?? 0;
    const prevCanceledCount = prevCanceledRes?.paging?.total ?? 0;

    const currCancelRate = currTotalOrders > 0 ? (currCanceledCount / currTotalOrders) * 100 : 0;
    const prevCancelRate = prevTotalOrders > 0 ? (prevCanceledCount / prevTotalOrders) * 100 : 0;

    const [currAnalysis, prevAnalysis] = await Promise.all([
      analyzePeriodMarketingDetails(currValidOrders),
      analyzePeriodMarketingDetails(prevValidOrders),
    ]);

    const socialSellingOrdersCount = currAnalysis.social.count;
    const socialSellingRevenue = currAnalysis.social.revenue;
    const socialSellingPct = currValidOrders.length > 0 ? (socialSellingOrdersCount / currValidOrders.length) * 100 : 0;
    const webDirectPct = 100 - socialSellingPct;
    const webDirectRevenue = Math.max(0, currTotalRevenue - socialSellingRevenue);

    const prevSocialSellingOrdersCount = prevAnalysis.social.count;
    const prevSocialSellingRevenue = prevAnalysis.social.revenue;
    const prevSocialSellingPct = prevValidOrders.length > 0 ? (prevSocialSellingOrdersCount / prevValidOrders.length) * 100 : 0;
    const prevWebDirectPct = 100 - prevSocialSellingPct;
    const prevWebDirectRevenue = Math.max(0, prevTotalRevenue - prevSocialSellingRevenue);

    const BCN_EXCHANGE_RATE = 36.6243;

    // Generar desglose diario para el Período A
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

    const utmCampaigns = currAnalysis.marketing.utmCampaigns;
    const utmSources = currAnalysis.marketing.utmSources;
    const couponsList = currAnalysis.marketing.couponsList;
    const vtexPromotions = currAnalysis.marketing.vtexPromotions;
    const logisticsSummary = currAnalysis.marketing.logisticsSummary;

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
        canceled: currCanceledCount,
      },
      dailyBreakdown,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
