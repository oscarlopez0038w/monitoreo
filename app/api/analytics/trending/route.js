import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Obtener todas las órdenes de un período paginando por lotes de 100
async function fetchAllPeriodOrders(startIso, endIso) {
  let allOrders = [];
  let page = 1;
  let maxPages = 10; // Límite seguro (hasta 1,000 órdenes por consulta de tendencias)

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
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30days';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const nicNow = getNicaraguaNow();
    let startIso, endIso;
    let startDateStr, endDateStr;

    if (range === 'today') {
      startDateStr = nicNow.todayStr;
      endDateStr = nicNow.todayStr;
    } else if (range === '7days') {
      const d = new Date(nicNow.todayStr);
      d.setDate(d.getDate() - 7);
      startDateStr = d.toISOString().split('T')[0];
      endDateStr = nicNow.todayStr;
    } else if (range === 'month' || range === '30days') {
      startDateStr = nicNow.firstDayStr;
      endDateStr = nicNow.todayStr;
    } else {
      startDateStr = searchParams.get('startDate') || nicNow.firstDayStr;
      endDateStr = searchParams.get('endDate') || nicNow.todayStr;
    }

    startIso = new Date(`${startDateStr}T00:00:00-06:00`).toISOString();
    endIso = new Date(`${endDateStr}T23:59:59-06:00`).toISOString();

    // 1. Consultar órdenes del período
    const ordersList = await fetchAllPeriodOrders(startIso, endIso);
    const validOrders = ordersList.filter((o) => o.status !== 'canceled');

    // 2. Consultar detalles de órdenes en lotes concurrentes para extraer los ítems reales
    const BATCH_SIZE = 20;
    const details = [];
    for (let i = 0; i < validOrders.length; i += BATCH_SIZE) {
      const batch = validOrders.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null))
      );
      details.push(...batchResults.filter(Boolean));
    }

    const skuMap = {};
    const categoryMap = {};
    const brandMap = {};

    let grandTotalUnits = 0;
    let grandTotalRevenue = 0;

    // 3. Procesar y agregar los ítems por SKU, Categoría y Marca
    details.forEach((detail) => {
      if (!detail || !detail.items || !Array.isArray(detail.items)) return;

      detail.items.forEach((it) => {
        const skuId = String(it.id || it.skuId || it.sellerSku || 'N/A');
        const name = it.name || it.skuName || `SKU ${skuId}`;
        const qty = it.quantity || 1;

        const rawPrice = it.sellingPrice ?? it.price ?? it.value ?? 0;
        const unitPrice =
          typeof rawPrice === 'number'
            ? rawPrice > 0 && (it.sellingPrice !== undefined || it.listPrice !== undefined || rawPrice >= 100)
              ? rawPrice / 100
              : rawPrice
            : Number(rawPrice) / 100 || 0;

        const itemTotal = unitPrice * qty;

        grandTotalUnits += qty;
        grandTotalRevenue += itemTotal;

        const imageUrl =
          it.imageUrl || `https://b2csinsa.vteximg.com.br/arquivos/ids/960916-55-55/${skuId}-0.jpg`;
        const brand = it.additionalInfo?.brandName || 'SINSA';

        // Determinar nombre de categoría principal
        let categoryName = 'General';
        if (it.additionalInfo?.categories && Array.isArray(it.additionalInfo.categories) && it.additionalInfo.categories.length > 0) {
          const cats = it.additionalInfo.categories;
          categoryName = cats[cats.length - 1]?.name || cats[0]?.name || 'General';
        }

        // A) Mapeo por SKU
        if (!skuMap[skuId]) {
          skuMap[skuId] = {
            id: skuId,
            name,
            brand,
            category: categoryName,
            imageUrl,
            unitPrice,
            quantity: 0,
            revenue: 0,
            ordersCount: 0,
          };
        }
        skuMap[skuId].quantity += qty;
        skuMap[skuId].revenue += itemTotal;
        skuMap[skuId].ordersCount += 1;

        // B) Mapeo por Categoría
        if (!categoryMap[categoryName]) {
          categoryMap[categoryName] = {
            name: categoryName,
            quantity: 0,
            revenue: 0,
            skusSet: new Set(),
          };
        }
        categoryMap[categoryName].quantity += qty;
        categoryMap[categoryName].revenue += itemTotal;
        categoryMap[categoryName].skusSet.add(skuId);

        // C) Mapeo por Marca
        if (!brandMap[brand]) {
          brandMap[brand] = {
            name: brand,
            quantity: 0,
            revenue: 0,
            skusSet: new Set(),
          };
        }
        brandMap[brand].quantity += qty;
        brandMap[brand].revenue += itemTotal;
        brandMap[brand].skusSet.add(skuId);
      });
    });

    // 4. Ordenar y dar formato a los resultados
    const topSkus = Object.values(skuMap)
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, limit);

    const topCategories = Object.values(categoryMap)
      .map((c) => ({
        name: c.name,
        quantity: c.quantity,
        revenue: c.revenue,
        skusCount: c.skusSet.size,
        revenuePercentage: grandTotalRevenue > 0 ? (c.revenue / grandTotalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 30);

    const topBrands = Object.values(brandMap)
      .map((b) => ({
        name: b.name,
        quantity: b.quantity,
        revenue: b.revenue,
        skusCount: b.skusSet.size,
        revenuePercentage: grandTotalRevenue > 0 ? (b.revenue / grandTotalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 30);

    return NextResponse.json({
      success: true,
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
        range,
      },
      summary: {
        totalOrders: validOrders.length,
        totalUnits: grandTotalUnits,
        totalRevenue: grandTotalRevenue,
        distinctSkus: Object.keys(skuMap).length,
        distinctCategories: Object.keys(categoryMap).length,
        distinctBrands: Object.keys(brandMap).length,
        topProduct: topSkus[0] || null,
        topCategory: topCategories[0] || null,
        topBrand: topBrands[0] || null,
      },
      topSkus,
      topCategories,
      topBrands,
    });
  } catch (err) {
    console.error('Error en /api/analytics/trending:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
