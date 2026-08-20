import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BCN_EXCHANGE_RATE = 36.6243;

// Días de la semana en español (0 = Domingo en JavaScript Date)
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Convertir fecha UTC a hora y día en zona horaria Nicaragua (UTC-6)
function parseNicaraguaDate(isoString) {
  const d = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') map[p.type] = p.value;
  });

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10) - 1;
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10) % 24; // 0..23

  const localDate = new Date(year, month, day);
  const dayOfWeekIdx = localDate.getDay(); // 0 = Domingo, 1 = Lunes ... 6 = Sábado

  return {
    hour,
    dayOfWeekIdx,
    dayName: DAY_NAMES[dayOfWeekIdx],
  };
}

export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const nicNow = getNicaraguaNow();

    const startDate = searchParams.get('startDate') || searchParams.get('start') || nicNow.firstDayStr;
    const endDate = searchParams.get('endDate') || searchParams.get('end') || nicNow.todayStr;

    const startIso = new Date(`${startDate}T00:00:00-06:00`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59-06:00`).toISOString();

    // 1. Paginación de órdenes VTEX en el período elegido
    const firstRes = await fetchVtexOrders(startIso, endIso, '', '', 1, 100).catch(() => null);
    const allOrders = firstRes?.list ? [...firstRes.list] : [];
    const totalPages = Math.min(firstRes?.paging?.pages || 1, 15);

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

    // Filtrar órdenes válidas (excluir canceladas)
    const validOrders = allOrders.filter((o) => o.status !== 'canceled');

    // Inicializar mapas de análisis
    const dayOfWeekStats = DAY_NAMES.map((name, idx) => ({
      dayOfWeekIdx: idx,
      name,
      ordersCount: 0,
      revenueNio: 0,
      revenueUsd: 0,
    }));

    const hourlyStats = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`,
      shortLabel: `${String(h).padStart(2, '0')}:00`,
      ordersCount: 0,
      revenueNio: 0,
      revenueUsd: 0,
    }));

    const timeWindowStats = {
      madrugada: { key: 'madrugada', name: 'Madrugada (00:00 - 05:59)', ordersCount: 0, revenueNio: 0 },
      manana: { key: 'manana', name: 'Mañana (06:00 - 11:59)', ordersCount: 0, revenueNio: 0 },
      tarde: { key: 'tarde', name: 'Tarde (12:00 - 17:59)', ordersCount: 0, revenueNio: 0 },
      noche: { key: 'noche', name: 'Noche (18:00 - 23:59)', ordersCount: 0, revenueNio: 0 },
    };

    let totalRevenueNio = 0;

    // Procesar cada orden válida
    validOrders.forEach((o) => {
      const valNio = o.totalValue ? o.totalValue / 100 : (o.value ? o.value / 100 : 0);
      totalRevenueNio += valNio;

      const creationIso = o.creationDate || o.created_at;
      if (!creationIso) return;

      const { hour, dayOfWeekIdx } = parseNicaraguaDate(creationIso);

      // Acumular por día de la semana
      if (dayOfWeekStats[dayOfWeekIdx]) {
        dayOfWeekStats[dayOfWeekIdx].ordersCount += 1;
        dayOfWeekStats[dayOfWeekIdx].revenueNio += valNio;
      }

      // Acumular por hora del día
      if (hourlyStats[hour]) {
        hourlyStats[hour].ordersCount += 1;
        hourlyStats[hour].revenueNio += valNio;
      }

      // Acumular por franja horaria
      if (hour >= 0 && hour < 6) {
        timeWindowStats.madrugada.ordersCount += 1;
        timeWindowStats.madrugada.revenueNio += valNio;
      } else if (hour >= 6 && hour < 12) {
        timeWindowStats.manana.ordersCount += 1;
        timeWindowStats.manana.revenueNio += valNio;
      } else if (hour >= 12 && hour < 18) {
        timeWindowStats.tarde.ordersCount += 1;
        timeWindowStats.tarde.revenueNio += valNio;
      } else {
        timeWindowStats.noche.ordersCount += 1;
        timeWindowStats.noche.revenueNio += valNio;
      }
    });

    const totalRevenueUsd = parseFloat((totalRevenueNio / BCN_EXCHANGE_RATE).toFixed(2));
    const safeTotalNio = totalRevenueNio || 1;

    // Calcular porcentajes y montos en USD para Días de la Semana
    const daysResult = dayOfWeekStats.map((d) => ({
      ...d,
      revenueUsd: parseFloat((d.revenueNio / BCN_EXCHANGE_RATE).toFixed(2)),
      pctOfTotal: Math.round((d.revenueNio / safeTotalNio) * 100),
      avgTicketNio: d.ordersCount > 0 ? Math.round((d.revenueNio / d.ordersCount) * 100) / 100 : 0,
      avgTicketUsd: d.ordersCount > 0 ? Math.round(((d.revenueNio / BCN_EXCHANGE_RATE) / d.ordersCount) * 100) / 100 : 0,
    }));

    // Ordenar días para mostrar empezando por Lunes
    const daysOrderedFromMonday = [
      daysResult[1], // Lunes
      daysResult[2], // Martes
      daysResult[3], // Miércoles
      daysResult[4], // Jueves
      daysResult[5], // Viernes
      daysResult[6], // Sábado
      daysResult[0], // Domingo
    ];

    // Calcular porcentajes y USD para Horas del Día
    const hoursResult = hourlyStats.map((h) => ({
      ...h,
      revenueUsd: parseFloat((h.revenueNio / BCN_EXCHANGE_RATE).toFixed(2)),
      pctOfTotal: Math.round((h.revenueNio / safeTotalNio) * 100),
    }));

    // Calcular Franjas Horarias
    const timeWindowsResult = Object.values(timeWindowStats).map((w) => ({
      ...w,
      revenueUsd: parseFloat((w.revenueNio / BCN_EXCHANGE_RATE).toFixed(2)),
      pctOfTotal: Math.round((w.revenueNio / safeTotalNio) * 100),
    }));

    // Identificar picos e insights de patrones
    let peakRevenueDay = daysOrderedFromMonday[0];
    let peakOrdersDay = daysOrderedFromMonday[0];
    daysOrderedFromMonday.forEach((d) => {
      if (d.revenueNio > peakRevenueDay.revenueNio) peakRevenueDay = d;
      if (d.ordersCount > peakOrdersDay.ordersCount) peakOrdersDay = d;
    });

    let peakHour = hoursResult[0];
    let quietestHour = hoursResult[0];
    hoursResult.forEach((h) => {
      if (h.ordersCount > peakHour.ordersCount) peakHour = h;
      if (h.ordersCount < quietestHour.ordersCount) quietestHour = h;
    });

    let peakWindow = timeWindowsResult[0];
    timeWindowsResult.forEach((w) => {
      if (w.revenueNio > peakWindow.revenueNio) peakWindow = w;
    });

    return NextResponse.json({
      success: true,
      bcnExchangeRate: BCN_EXCHANGE_RATE,
      startDate,
      endDate,
      summary: {
        totalOrders: validOrders.length,
        totalRevenueNio: Math.round(totalRevenueNio * 100) / 100,
        totalRevenueUsd,
        avgTicketNio: validOrders.length > 0 ? Math.round((totalRevenueNio / validOrders.length) * 100) / 100 : 0,
        avgTicketUsd: validOrders.length > 0 ? Math.round((totalRevenueUsd / validOrders.length) * 100) / 100 : 0,
      },
      insights: {
        // Día con mayor facturación/ingresos
        peakRevenueDayName: peakRevenueDay?.name || 'N/A',
        peakRevenueDayRevenueNio: peakRevenueDay?.revenueNio || 0,
        peakRevenueDayRevenueUsd: peakRevenueDay?.revenueUsd || 0,
        peakRevenueDayOrders: peakRevenueDay?.ordersCount || 0,

        // Día con mayor volumen de pedidos/órdenes
        peakOrdersDayName: peakOrdersDay?.name || 'N/A',
        peakOrdersDayOrders: peakOrdersDay?.ordersCount || 0,
        peakOrdersDayRevenueNio: peakOrdersDay?.revenueNio || 0,
        peakOrdersDayRevenueUsd: peakOrdersDay?.revenueUsd || 0,

        peakHourLabel: peakHour?.label || 'N/A',
        peakHourOrders: peakHour?.ordersCount || 0,
        quietestHourLabel: quietestHour?.label || 'N/A',
        peakWindowName: peakWindow?.name || 'N/A',
        peakWindowRevenueNio: peakWindow?.revenueNio || 0,
      },
      byDayOfWeek: daysOrderedFromMonday,
      byHourOfDay: hoursResult,
      byTimeWindow: timeWindowsResult,
    });
  } catch (err) {
    console.error('Error en API /api/patrones:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
