import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchVtexOrders } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Memory Cache para respuestas históricas (10 minutos TTL)
const HISTORICAL_CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(key) {
  const item = HISTORICAL_CACHE.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    HISTORICAL_CACHE.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data) {
  const now = Date.now();
  for (const [k, item] of HISTORICAL_CACHE.entries()) {
    if (now - item.timestamp > CACHE_TTL_MS) {
      HISTORICAL_CACHE.delete(k);
    }
  }
  HISTORICAL_CACHE.set(key, { timestamp: now, data });
}

function isSocialOrder(marketingJson) {
  if (!marketingJson || typeof marketingJson !== 'object') return false;
  const sellerCode = marketingJson.utmiCampaign || marketingJson.utmi_campaign || marketingJson.utmiPart || '';
  const tags = marketingJson.marketingTags || [];
  return Boolean(
    (sellerCode && String(sellerCode).trim()) ||
    (Array.isArray(tags) && tags.includes('vtexSocialSelling'))
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const nicNow = getNicaraguaNow();
    const targetYear = parseInt(searchParams.get('year') || String(nicNow.year), 10);
    const refresh = searchParams.get('refresh') === 'true' || searchParams.get('nocache') === 'true';

    const cacheKey = `historical_v2_${targetYear}`;
    if (!refresh) {
      const cached = getCached(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const startIso = `${targetYear}-01-01T00:00:00-06:00`;
    const endIso = targetYear === nicNow.year
      ? `${nicNow.todayStr}T23:59:59-06:00`
      : `${targetYear}-12-31T23:59:59-06:00`;

    const BCN_EXCHANGE_RATE = 36.6243;
    let allOrders = [];

    // 1. Obtener órdenes de Supabase vtex_orders (ultra rápido paginado con Promise.all)
    if (isSupabaseConfigured()) {
      try {
        const PAGE_SIZE = 1000;
        const firstRes = await supabaseAdmin
          .from('vtex_orders')
          .select('order_id, creation_date, total_value, status, marketing_json', { count: 'exact' })
          .gte('creation_date', new Date(startIso).toISOString())
          .lte('creation_date', new Date(endIso).toISOString())
          .range(0, PAGE_SIZE - 1);

        const totalCount = firstRes.count || 0;
        if (firstRes.data && firstRes.data.length > 0) {
          allOrders.push(...firstRes.data);

          if (totalCount > PAGE_SIZE) {
            const promises = [];
            for (let from = PAGE_SIZE; from < totalCount; from += PAGE_SIZE) {
              promises.push(
                supabaseAdmin
                  .from('vtex_orders')
                  .select('order_id, creation_date, total_value, status, marketing_json')
                  .gte('creation_date', new Date(startIso).toISOString())
                  .lte('creation_date', new Date(endIso).toISOString())
                  .range(from, from + PAGE_SIZE - 1)
              );
            }
            const results = await Promise.all(promises);
            results.forEach((r) => {
              if (r.data) allOrders.push(...r.data);
            });
          }
        }
      } catch (err) {
        console.error('Error fetching historical orders from Supabase:', err);
      }
    }

    // 2. Fallback a VTEX OMS si Supabase no está disponible o no devolvió órdenes
    if (allOrders.length === 0 && isVtexConfigured()) {
      try {
        const firstRes = await fetchVtexOrders(
          new Date(startIso).toISOString(),
          new Date(endIso).toISOString(),
          '',
          '',
          1,
          100
        ).catch(() => null);

        if (firstRes && Array.isArray(firstRes.list)) {
          allOrders.push(...firstRes.list);
          const totalPages = Math.min(firstRes.paging?.pages || 1, 30);
          if (totalPages > 1) {
            const pagePromises = [];
            for (let p = 2; p <= totalPages; p++) {
              pagePromises.push(
                fetchVtexOrders(
                  new Date(startIso).toISOString(),
                  new Date(endIso).toISOString(),
                  '',
                  '',
                  p,
                  100
                ).catch(() => null)
              );
            }
            const additionalPages = await Promise.all(pagePromises);
            additionalPages.forEach((res) => {
              if (res && Array.isArray(res.list)) allOrders.push(...res.list);
            });
          }
        }
      } catch (err) {
        console.error('Error fetching historical orders from VTEX API fallback:', err);
      }
    }

    // Meses del año
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthShorts = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const maxMonthIndex = targetYear === nicNow.year ? nicNow.month : 11;

    const monthlyMap = {};
    for (let m = 0; m <= maxMonthIndex; m++) {
      const mStr = String(m + 1).padStart(2, '0');
      monthlyMap[mStr] = {
        monthNum: m + 1,
        monthName: monthNames[m],
        monthShort: monthShorts[m],
        year: targetYear,
        totalOrders: 0,
        approvedOrders: 0,
        canceledOrders: 0,
        webOrders: 0,
        socialOrders: 0,
        grossSalesNio: 0,
        grossSalesUsd: 0,
        salesNio: 0, // Ventas netas
        salesUsd: 0,
        webSalesNio: 0,
        webSalesUsd: 0,
        socialSalesNio: 0,
        socialSalesUsd: 0,
        refundsNio: 0,
        refundsUsd: 0,
        avgTicketNio: 0,
        avgTicketUsd: 0,
      };
    }

    // Días desde 01-01 hasta hoy
    const dailyMap = {};
    const startDateObj = new Date(`${targetYear}-01-01T00:00:00-06:00`);
    const endDateObj = targetYear === nicNow.year
      ? new Date(`${nicNow.todayStr}T00:00:00-06:00`)
      : new Date(`${targetYear}-12-31T00:00:00-06:00`);

    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const dayNum = d.getDate();
      const monthNum = d.getMonth() + 1;
      const dayLabel = `${String(dayNum).padStart(2, '0')} ${monthShorts[d.getMonth()]}`;

      dailyMap[dayStr] = {
        date: dayStr,
        dayNum,
        monthNum,
        dayLabel,
        totalOrders: 0,
        approvedOrders: 0,
        canceledOrders: 0,
        webOrders: 0,
        socialOrders: 0,
        grossSalesNio: 0,
        grossSalesUsd: 0,
        salesNio: 0,
        salesUsd: 0,
        webSalesNio: 0,
        webSalesUsd: 0,
        socialSalesNio: 0,
        socialSalesUsd: 0,
        refundsNio: 0,
        refundsUsd: 0,
        avgTicketNio: 0,
        avgTicketUsd: 0,
      };
    }

    let ytdTotalOrders = 0;
    let ytdApprovedOrders = 0;
    let ytdWebApprovedOrders = 0;
    let ytdSocialApprovedOrders = 0;
    let ytdCanceledOrders = 0;
    let ytdGrossSalesNio = 0;
    let ytdSalesNio = 0;
    let ytdWebSalesNio = 0;
    let ytdSocialSalesNio = 0;
    let ytdRefundsNio = 0;

    // Procesar cada orden
    allOrders.forEach((o) => {
      const rawDate = o.creation_date || o.creationDate;
      if (!rawDate) return;

      const dateObj = new Date(rawDate);
      const nicDate = new Date(dateObj.getTime() - 6 * 3600 * 1000);
      const dayStr = nicDate.toISOString().split('T')[0];
      const mStr = String(nicDate.getMonth() + 1).padStart(2, '0');

      const isCanceled = o.status === 'canceled' || o.status === 'cancel';
      const rawVal = o.total_value !== undefined ? o.total_value : (o.totalValue ? o.totalValue / 100 : 0);
      const valNio = Number(rawVal) || 0;
      const valUsd = valNio / BCN_EXCHANGE_RATE;
      const isSocial = isSocialOrder(o.marketing_json || o.marketingData);

      ytdTotalOrders++;
      ytdGrossSalesNio += valNio;

      if (isCanceled) {
        ytdCanceledOrders++;
        ytdRefundsNio += valNio;
      } else {
        ytdApprovedOrders++;
        ytdSalesNio += valNio;
        if (isSocial) {
          ytdSocialApprovedOrders++;
          ytdSocialSalesNio += valNio;
        } else {
          ytdWebApprovedOrders++;
          ytdWebSalesNio += valNio;
        }
      }

      // Acumular en Mes
      if (monthlyMap[mStr]) {
        const mObj = monthlyMap[mStr];
        mObj.totalOrders++;
        mObj.grossSalesNio += valNio;
        mObj.grossSalesUsd += valUsd;

        if (isCanceled) {
          mObj.canceledOrders++;
          mObj.refundsNio += valNio;
          mObj.refundsUsd += valUsd;
        } else {
          mObj.approvedOrders++;
          mObj.salesNio += valNio;
          mObj.salesUsd += valUsd;

          if (isSocial) {
            mObj.socialOrders++;
            mObj.socialSalesNio += valNio;
            mObj.socialSalesUsd += valUsd;
          } else {
            mObj.webOrders++;
            mObj.webSalesNio += valNio;
            mObj.webSalesUsd += valUsd;
          }
        }
      }

      // Acumular en Día
      if (dailyMap[dayStr]) {
        const dObj = dailyMap[dayStr];
        dObj.totalOrders++;
        dObj.grossSalesNio += valNio;
        dObj.grossSalesUsd += valUsd;

        if (isCanceled) {
          dObj.canceledOrders++;
          dObj.refundsNio += valNio;
          dObj.refundsUsd += valUsd;
        } else {
          dObj.approvedOrders++;
          dObj.salesNio += valNio;
          dObj.salesUsd += valUsd;

          if (isSocial) {
            dObj.socialOrders++;
            dObj.socialSalesNio += valNio;
            dObj.socialSalesUsd += valUsd;
          } else {
            dObj.webOrders++;
            dObj.webSalesNio += valNio;
            dObj.webSalesUsd += valUsd;
          }
        }
      }
    });

    // Finalizar cálculos de promedios en Meses
    const monthlyBreakdown = Object.values(monthlyMap).map((m) => {
      const avgNio = m.approvedOrders > 0 ? m.salesNio / m.approvedOrders : 0;
      return {
        ...m,
        grossSalesNio: parseFloat(m.grossSalesNio.toFixed(2)),
        grossSalesUsd: parseFloat(m.grossSalesUsd.toFixed(2)),
        salesNio: parseFloat(m.salesNio.toFixed(2)),
        salesUsd: parseFloat(m.salesUsd.toFixed(2)),
        webSalesNio: parseFloat(m.webSalesNio.toFixed(2)),
        webSalesUsd: parseFloat(m.webSalesUsd.toFixed(2)),
        socialSalesNio: parseFloat(m.socialSalesNio.toFixed(2)),
        socialSalesUsd: parseFloat(m.socialSalesUsd.toFixed(2)),
        refundsNio: parseFloat(m.refundsNio.toFixed(2)),
        refundsUsd: parseFloat(m.refundsUsd.toFixed(2)),
        avgTicketNio: parseFloat(avgNio.toFixed(2)),
        avgTicketUsd: parseFloat((avgNio / BCN_EXCHANGE_RATE).toFixed(2)),
      };
    });

    // Finalizar cálculos de promedios en Días
    const dailyBreakdown = Object.values(dailyMap).map((d) => {
      const avgNio = d.approvedOrders > 0 ? d.salesNio / d.approvedOrders : 0;
      return {
        ...d,
        grossSalesNio: parseFloat(d.grossSalesNio.toFixed(2)),
        grossSalesUsd: parseFloat(d.grossSalesUsd.toFixed(2)),
        salesNio: parseFloat(d.salesNio.toFixed(2)),
        salesUsd: parseFloat(d.salesUsd.toFixed(2)),
        webSalesNio: parseFloat(d.webSalesNio.toFixed(2)),
        webSalesUsd: parseFloat(d.webSalesUsd.toFixed(2)),
        socialSalesNio: parseFloat(d.socialSalesNio.toFixed(2)),
        socialSalesUsd: parseFloat(d.socialSalesUsd.toFixed(2)),
        refundsNio: parseFloat(d.refundsNio.toFixed(2)),
        refundsUsd: parseFloat(d.refundsUsd.toFixed(2)),
        avgTicketNio: parseFloat(avgNio.toFixed(2)),
        avgTicketUsd: parseFloat((avgNio / BCN_EXCHANGE_RATE).toFixed(2)),
      };
    });

    // Hallar mes pico y día pico
    let topMonth = null;
    monthlyBreakdown.forEach((m) => {
      if (!topMonth || m.salesNio > topMonth.salesNio) topMonth = m;
    });

    let topDay = null;
    dailyBreakdown.forEach((d) => {
      if (!topDay || d.salesNio > topDay.salesNio) topDay = d;
    });

    const responsePayload = {
      success: true,
      year: targetYear,
      bcnExchangeRate: BCN_EXCHANGE_RATE,
      ytdSummary: {
        totalOrders: ytdTotalOrders,
        approvedOrders: ytdApprovedOrders,
        webApprovedOrders: ytdWebApprovedOrders,
        socialApprovedOrders: ytdSocialApprovedOrders,
        canceledOrders: ytdCanceledOrders,
        cancelRate: ytdTotalOrders > 0 ? parseFloat(((ytdCanceledOrders / ytdTotalOrders) * 100).toFixed(1)) : 0,
        grossSalesNio: parseFloat(ytdGrossSalesNio.toFixed(2)),
        grossSalesUsd: parseFloat((ytdGrossSalesNio / BCN_EXCHANGE_RATE).toFixed(2)),
        salesNio: parseFloat(ytdSalesNio.toFixed(2)),
        salesUsd: parseFloat((ytdSalesNio / BCN_EXCHANGE_RATE).toFixed(2)),
        webSalesNio: parseFloat(ytdWebSalesNio.toFixed(2)),
        webSalesUsd: parseFloat((ytdWebSalesNio / BCN_EXCHANGE_RATE).toFixed(2)),
        socialSalesNio: parseFloat(ytdSocialSalesNio.toFixed(2)),
        socialSalesUsd: parseFloat((ytdSocialSalesNio / BCN_EXCHANGE_RATE).toFixed(2)),
        refundsNio: parseFloat(ytdRefundsNio.toFixed(2)),
        refundsUsd: parseFloat((ytdRefundsNio / BCN_EXCHANGE_RATE).toFixed(2)),
        avgTicketNio: ytdApprovedOrders > 0 ? parseFloat((ytdSalesNio / ytdApprovedOrders).toFixed(2)) : 0,
        avgTicketUsd: ytdApprovedOrders > 0 ? parseFloat((ytdSalesNio / ytdApprovedOrders / BCN_EXCHANGE_RATE).toFixed(2)) : 0,
        webAvgTicketNio: ytdWebApprovedOrders > 0 ? parseFloat((ytdWebSalesNio / ytdWebApprovedOrders).toFixed(2)) : 0,
        webAvgTicketUsd: ytdWebApprovedOrders > 0 ? parseFloat((ytdWebSalesNio / ytdWebApprovedOrders / BCN_EXCHANGE_RATE).toFixed(2)) : 0,
        topMonth: topMonth ? { monthName: topMonth.monthName, salesNio: topMonth.salesNio, salesUsd: topMonth.salesUsd } : null,
        topDay: topDay ? { date: topDay.date, dayLabel: topDay.dayLabel, salesNio: topDay.salesNio, salesUsd: topDay.salesUsd } : null,
      },
      monthlyBreakdown,
      dailyBreakdown,
    };

    setCached(cacheKey, responsePayload);
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('Error en /api/analytics/historical:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error calculando analíticas históricas' },
      { status: 500 }
    );
  }
}
