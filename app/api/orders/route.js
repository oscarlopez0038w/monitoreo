import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, fetchVtexOrders, fetchVtexOrderDetail, fetchRealClientEmail } from '@/lib/vtex';
import { getNicaraguaNow } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function cleanEmailDisplay(email) {
  if (!email || typeof email !== 'string') return 'N/A';
  const trimmed = email.trim();
  if (!trimmed || trimmed === 'N/A') return 'N/A';
  if (trimmed.includes('@ct.vtex.com.br')) {
    return 'Enmascarado por VTEX';
  }
  return trimmed;
}

function normalizeStoreName(rawName) {
  if (!rawName) return 'Retiro en Tienda';
  let s = String(rawName).trim();
  s = s.replace(/^Retiro\s+en\s+tienda\s*/i, '');
  s = s.replace(/^Tienda\s*/i, '');

  const lower = s.toLowerCase();
  if (lower.includes('carretera a masaya') || lower.includes('masaya road')) return 'Carretera a Masaya';
  if (lower.includes('periodista')) return 'El Periodista';
  if (lower.includes('radial') || lower.includes('la radial')) return 'La Radial';
  if (lower.includes('chinandega')) return 'Chinandega';
  if (lower.includes('esteli') || lower.includes('estelí')) return 'Estelí';
  if (lower.includes('home center')) return 'Home Center';
  if (lower.includes('jinotepe')) return 'Jinotepe';
  if (lower.includes('juigalpa')) return 'Juigalpa';
  if (lower.includes('leon') || lower.includes('león')) return 'León';
  if (lower.includes('masaya') && !lower.includes('carretera')) return 'Masaya';
  if (lower.includes('matagalpa')) return 'Matagalpa';
  if (lower.includes('rivas')) return 'Rivas';
  if (lower.includes('norte') || lower.includes('sinsa norte')) return 'Sinsa Norte';

  return s
    .split(/\s+/)
    .map((w) => {
      const l = w.toLowerCase();
      if (l === 'a' || l === 'de' || l === 'en' || l === 'la') return l;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractTasaCeroInfo(orderDetail) {
  const payments = orderDetail?.paymentData?.transactions?.flatMap((tx) => tx.payments || []) || [];
  const searchableText = JSON.stringify(orderDetail?.paymentData || {}).toLowerCase();
  const installments = payments
    .map((payment) => Number(payment?.installments || payment?.installment || 0))
    .find((value) => Number.isFinite(value) && value > 1);
  const hasTasaCero =
    /\btasa\s*0\b/.test(searchableText) ||
    /\btasa\s*cero\b/.test(searchableText) ||
    /\bcero\s*inter[eé]s\b/.test(searchableText) ||
    /\b0\s*%\b/.test(searchableText) ||
    searchableText.includes('sin intereses') ||
    searchableText.includes('tasa0') ||
    searchableText.includes('0 interes') ||
    searchableText.includes('0 interés');

  if (!hasTasaCero && !installments) {
    return { isTasaCero: false, plazo: null };
  }

  return {
    isTasaCero: true,
    plazo: installments || null,
  };
}

function extractInvoiceTicket(orderDetail) {
  if (!orderDetail || typeof orderDetail !== 'object') return '';

  const directCandidates = [
    orderDetail.invoiceNumber,
    orderDetail.invoice,
    orderDetail.invoiceId,
    orderDetail.fiscalDocument,
    orderDetail.fiscalDocumentNumber,
    orderDetail.packageAttachment?.packages?.[0]?.invoiceNumber,
    orderDetail.packageAttachment?.packages?.[0]?.invoiceKey,
    orderDetail.packageAttachment?.packages?.[0]?.invoiceUrl,
    orderDetail.invoiceData?.invoiceNumber,
    orderDetail.invoiceData?.number,
    orderDetail.invoices?.[0]?.invoiceNumber,
    orderDetail.invoices?.[0]?.number,
  ];

  const direct = directCandidates
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .find(Boolean);

  if (direct) return direct;

  const packages = orderDetail.packageAttachment?.packages;
  if (Array.isArray(packages)) {
    const fromPackage = packages
      .flatMap((pkg) => [pkg?.invoiceNumber, pkg?.invoiceKey, pkg?.invoiceUrl, pkg?.trackingNumber])
      .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
      .find(Boolean);
    if (fromPackage) return fromPackage;
  }

  const searchableText = JSON.stringify({
    packageAttachment: orderDetail.packageAttachment,
    invoiceData: orderDetail.invoiceData,
    invoices: orderDetail.invoices,
    changesAttachment: orderDetail.changesAttachment,
  });
  const match = searchableText.match(/factura\s*#?\s*([A-Za-z0-9-]+)/i);
  return match?.[1] || '';
}

function extractSellerCode(orderDetail) {
  const marketing = orderDetail?.marketingData || orderDetail?.marketing_json || {};
  return (
    marketing?.utmiCampaign ||
    marketing?.utmi_campaign ||
    orderDetail?.utmiCampaign ||
    orderDetail?.utmi_campaign ||
    ''
  );
}

function isSocialSellingOrder(orderDetail) {
  const marketing = orderDetail?.marketingData || orderDetail?.marketing_json || {};
  const tags = orderDetail?.marketingTags || marketing?.marketingTags || [];
  const sellerCode = extractSellerCode(orderDetail);
  return (
    Boolean(sellerCode && String(sellerCode).trim()) ||
    (Array.isArray(tags) && tags.includes('vtexSocialSelling'))
  );
}

function matchesSaleType(orderLike, saleType) {
  if (!saleType) return true;
  const isSocial = isSocialSellingOrder(orderLike);
  if (saleType === 'social') return isSocial;
  if (saleType === 'organic') return !isSocial;
  return true;
}

function parseIsoStartEnd(startDateParam, endDateParam) {
  const nicNow = getNicaraguaNow();
  let startStr = (startDateParam || nicNow.firstDayStr).trim();
  let endStr = (endDateParam || nicNow.todayStr).trim();

  if (startStr.includes('/')) {
    const parts = startStr.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) startStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      else startStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  if (endStr.includes('/')) {
    const parts = endStr.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) endStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      else endStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  const startIso = new Date(`${startStr}T00:00:00-06:00`).toISOString();
  const endIso = new Date(`${endStr}T23:59:59-06:00`).toISOString();
  return { startIso, endIso, startStr, endStr };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderIdParam = searchParams.get('orderId') || searchParams.get('id');

    // 1. Consulta por ID individual
    if (orderIdParam) {
      const cleanId = orderIdParam.trim();
      if (isSupabaseConfigured()) {
        try {
          const { data: dbRow } = await supabaseAdmin
            .from('vtex_orders')
            .select('*')
            .eq('order_id', cleanId)
            .maybeSingle();

          if (dbRow) {
            let detailObj = dbRow.detail_json;
            let itemsList = dbRow.items;
            let addressJson = dbRow.address_json;
            let marketingJson = dbRow.marketing_json;

            if (dbRow.items && !Array.isArray(dbRow.items) && typeof dbRow.items === 'object') {
              itemsList = dbRow.items.list || [];
              addressJson = dbRow.items.address || addressJson;
              marketingJson = dbRow.items.marketing || marketingJson;
              detailObj = dbRow.items.detail || detailObj;
            }

            const finalDetail = detailObj || {
              orderId: dbRow.order_id,
              sequence: dbRow.sequence,
              status: dbRow.status,
              statusDescription: dbRow.status_description,
              creationDate: dbRow.creation_date,
              clientProfileData: { firstName: dbRow.client_name, email: dbRow.client_email },
              value: Math.round((dbRow.total_value || 0) * 100),
              items: itemsList,
              shippingData: { address: addressJson },
              marketingData: marketingJson,
            };
            return NextResponse.json({ success: true, order: finalDetail, source: 'supabase' });
          }
        } catch (e) {}
      }

      if (isVtexConfigured()) {
        const orderDetail = await fetchVtexOrderDetail(cleanId);
        if (orderDetail) {
          return NextResponse.json({ success: true, order: orderDetail, source: 'vtex_api' });
        }
      }

      return NextResponse.json({ success: false, error: `Orden ${cleanId} no encontrada.` }, { status: 404 });
    }

    // 2. Consulta de lista de órdenes con filtros de fecha
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const statusParam = (searchParams.get('status') || '').trim();
    const saleTypeParam = (searchParams.get('saleType') || '').trim();
    const searchParam = (searchParams.get('search') || '').trim();
    const sortByParam = (searchParams.get('sortBy') || 'date_desc').trim();
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const isExport = searchParams.get('export') === 'true';
    const pageSize = isExport ? 5000 : 30;

    const { startIso, endIso, startStr, endStr } = parseIsoStartEnd(startDateParam, endDateParam);

    let useSupabase = false;
    let dbOrders = [];
    let totalDbCount = 0;
    let dbStats = null;

    if (isSupabaseConfigured()) {
      try {
        let query = supabaseAdmin
          .from('vtex_orders')
          .select('*', { count: 'exact' })
          .gte('creation_date', startIso)
          .lte('creation_date', endIso);

        if (statusParam) {
          query = query.eq('status', statusParam);
        }

        if (searchParam) {
          const cleanSearch = searchParam.trim();
          query = query.or(`order_id.ilike.%${cleanSearch}%,sequence.ilike.%${cleanSearch}%,client_name.ilike.%${cleanSearch}%,client_email.ilike.%${cleanSearch}%,pickup_store.ilike.%${cleanSearch}%`);
        }

        if (sortByParam === 'amount_desc') {
          query = query.order('total_value', { ascending: false });
        } else if (sortByParam === 'amount_asc') {
          query = query.order('total_value', { ascending: true });
        } else if (sortByParam === 'date_asc') {
          query = query.order('creation_date', { ascending: true });
        } else {
          query = query.order('creation_date', { ascending: false });
        }

        if (!isExport && !saleTypeParam) {
          const from = (pageParam - 1) * pageSize;
          const to = from + pageSize - 1;
          query = query.range(from, to);
        }

        const { data: rows, count, error } = await query;

        if (error) {
          console.error('Error consultando Supabase vtex_orders query:', error);
        }

        if (!error && rows && rows.length > 0) {
          useSupabase = true;
          totalDbCount = count || rows.length;

          // Verificar si VTEX OMS tiene más órdenes que Supabase para este rango (evita conteos incompletos)
          if (isVtexConfigured() && !statusParam && !searchParam) {
            const vtexCheck = await fetchVtexOrders(startIso, endIso, '', '', 1, 1).catch(() => null);
            const vtexTotal = vtexCheck?.paging?.total || 0;
            if (vtexTotal > totalDbCount) {
              console.log(`Aviso: Supabase (${totalDbCount}) tiene menos órdenes que VTEX (${vtexTotal}). Usando VTEX OMS para obtener el 100% completo.`);
              useSupabase = false;
            }
          }
        }

        if (useSupabase) {
          // Conteos y Estadísticas globales en Supabase para el período (< 10ms)
          const { data: periodRows } = await supabaseAdmin
            .from('vtex_orders')
            .select('status, fulfillment_type, pickup_store, items, detail_json, marketing_json, total_value')
            .gte('creation_date', startIso)
            .lte('creation_date', endIso);

          let invoicedCount = 0;
          let handlingCount = 0;
          let readyCount = 0;
          let canceledCount = 0;
          let pickupCount = 0;
          let deliveryCount = 0;
          let invoicedRevenue = 0;
          let socialSellingRevenue = 0;
          let socialSellingCount = 0;
          let organicRevenue = 0;
          let organicCount = 0;
          const storeCounts = {};

          (periodRows || []).forEach((r) => {
            const orderForMarketing = { ...(r.detail_json || {}), marketingData: r.marketing_json || r.detail_json?.marketingData };
            if (!matchesSaleType(orderForMarketing, saleTypeParam)) return;

            const st = String(r.status || '').toLowerCase();
            if (st === 'invoiced') {
              const value = Number(r.total_value || 0);
              const isSocial = isSocialSellingOrder(orderForMarketing);
              invoicedCount++;
              invoicedRevenue += value;
              if (isSocial) {
                socialSellingCount++;
                socialSellingRevenue += value;
              } else {
                organicCount++;
                organicRevenue += value;
              }
            }
            if (st === 'handling') handlingCount++;
            if (st === 'ready-for-handling') readyCount++;
            if (st === 'canceled') canceledCount++;

            let fulfillmentType = r.fulfillment_type || 'delivery';
            let pickupStore = r.pickup_store || '';

            if (r.detail_json?.shippingData) {
              const logInfo = r.detail_json.shippingData.logisticsInfo?.[0];
              const channel = logInfo?.selectedDeliveryChannel || r.detail_json.shippingData.selectedAddresses?.[0]?.addressType || '';
              const isPickupFromDetail = channel === 'pickup-in-point' || channel === 'pickup' || Boolean(logInfo?.pickupStoreInfo?.friendlyName);
              if (isPickupFromDetail) {
                fulfillmentType = 'pickup';
                pickupStore = logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || pickupStore || 'Retiro en Tienda';
              }
            }

            if (r.items && !Array.isArray(r.items) && typeof r.items === 'object') {
              fulfillmentType = r.items.fulfillmentType || fulfillmentType;
              pickupStore = r.items.pickupStore || pickupStore;
            }

            const isPickup = fulfillmentType === 'pickup' || (pickupStore && pickupStore.trim().length > 0);
            if (isPickup) {
              pickupCount++;
              const sName = normalizeStoreName(pickupStore);
              storeCounts[sName] = (storeCounts[sName] || 0) + 1;
            } else {
              deliveryCount++;
            }
          });

          const totalFulfillment = pickupCount + deliveryCount;
          const pickupPct = totalFulfillment > 0 ? Math.round((pickupCount / totalFulfillment) * 100) : 0;
          const deliveryPct = totalFulfillment > 0 ? 100 - pickupPct : 0;

          const pickupStores = Object.entries(storeCounts)
            .map(([store, count]) => ({
              store,
              count,
              pct: pickupCount > 0 ? Math.round((count / pickupCount) * 100) : 0,
            }))
            .sort((a, b) => b.count - a.count);

          dbStats = {
            total: saleTypeParam
              ? (periodRows || []).filter((r) => matchesSaleType({ ...(r.detail_json || {}), marketingData: r.marketing_json || r.detail_json?.marketingData }, saleTypeParam)).length
              : (periodRows?.length || totalDbCount),
            invoiced: invoicedCount,
            handling: handlingCount,
            readyForHandling: readyCount,
            canceled: canceledCount,
            pickupCount,
            deliveryCount,
            pickupPct,
            deliveryPct,
            pickupStores,
            invoicedRevenue,
            socialSellingRevenue,
            socialSellingCount,
            organicRevenue,
            organicCount,
          };

          dbOrders = rows.map((r) => {
            let itemsList = [];
            let fulfillmentType = r.fulfillment_type || 'delivery';
            let pickupStore = r.pickup_store || '';

            if (r.detail_json?.shippingData) {
              const logInfo = r.detail_json.shippingData.logisticsInfo?.[0];
              const channel = logInfo?.selectedDeliveryChannel || r.detail_json.shippingData.selectedAddresses?.[0]?.addressType || '';
              const isPickupFromDetail = channel === 'pickup-in-point' || channel === 'pickup' || Boolean(logInfo?.pickupStoreInfo?.friendlyName);
              if (isPickupFromDetail) {
                fulfillmentType = 'pickup';
                pickupStore = logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || pickupStore || 'Retiro en Tienda';
              }
            }

            if (r.items && !Array.isArray(r.items) && typeof r.items === 'object') {
              itemsList = r.items.list || [];
              fulfillmentType = r.items.fulfillmentType || fulfillmentType;
              pickupStore = r.items.pickupStore || pickupStore;
            } else if (Array.isArray(r.items)) {
              itemsList = r.items;
            }

            if (pickupStore && pickupStore.trim().length > 0) {
              fulfillmentType = 'pickup';
            }

            let cancelReason = null;
            let comments = null;
            if (r.detail_json) {
              const d = r.detail_json;
              cancelReason =
                d.cancelReason ||
                (typeof d.cancellationData === 'object' ? d.cancellationData?.reason : d.cancellationData) ||
                (typeof d.openTextField === 'object' ? d.openTextField?.value : d.openTextField) ||
                null;
              comments = typeof d.openTextField === 'object' ? d.openTextField?.value : (d.openTextField || null);
            }
            if (r.status === 'canceled' && !cancelReason) {
              cancelReason = 'Sin motivo registrado por el sistema';
            }

            const orderForMarketing = { ...(r.detail_json || {}), marketingData: r.marketing_json || r.detail_json?.marketingData };
            const isSocialSale = isSocialSellingOrder(orderForMarketing);

            return {
              orderId: r.order_id,
              sequence: r.sequence,
              status: r.status,
              statusDescription: r.status_description || r.status,
              creationDate: r.creation_date,
              clientName: r.client_name || 'Cliente General',
              clientEmail: cleanEmailDisplay(r.client_email),
              totalValue: Math.round((r.total_value || 0) * 100),
              fulfillmentType: fulfillmentType,
              pickupStore: pickupStore,
              itemsCount: itemsList.length || 1,
              cancelReason: cancelReason,
              comments: comments,
              invoiceTicket: extractInvoiceTicket(r.detail_json),
              tasaCero: extractTasaCeroInfo(r.detail_json),
              sellerCode: extractSellerCode(orderForMarketing),
              saleType: isSocialSale ? 'social' : 'organic',
              isFromDb: true,
            };
          });

          if (saleTypeParam) {
            dbOrders = dbOrders.filter((o) => o.saleType === saleTypeParam);
            totalDbCount = dbOrders.length;
            if (!isExport) {
              const from = (pageParam - 1) * pageSize;
              dbOrders = dbOrders.slice(from, from + pageSize);
            }
          }

          if (isExport && isVtexConfigured()) {
            const missingCanceled = dbOrders.filter(
              (o) => o.status === 'canceled' && (!o.cancelReason || o.cancelReason === 'Sin motivo registrado por el sistema')
            );
            if (missingCanceled.length > 0) {
              const BATCH_SIZE = 15;
              for (let i = 0; i < missingCanceled.length; i += BATCH_SIZE) {
                const batch = missingCanceled.slice(i, i + BATCH_SIZE);
                const details = await Promise.all(
                  batch.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null))
                );
                details.forEach((d, idx) => {
                  if (d) {
                    const target = batch[idx];
                    const reason =
                      d.cancelReason ||
                      (typeof d.cancellationData === 'object' ? d.cancellationData?.reason : d.cancellationData) ||
                      (typeof d.openTextField === 'object' ? d.openTextField?.value : d.openTextField) ||
                      'Sin motivo registrado por el sistema';
                    target.cancelReason = reason;
                    if (d.openTextField) {
                      target.comments = typeof d.openTextField === 'object' ? d.openTextField?.value : d.openTextField;
                    }
                    target.invoiceTicket = extractInvoiceTicket(d);
                  }
                });
              }
            }
          }
        }
      } catch (dbErr) {
        console.error('Error consultando Supabase vtex_orders:', dbErr);
      }
    }

    if (useSupabase && dbOrders.length > 0) {
      const totalPages = isExport ? 1 : (Math.ceil(totalDbCount / pageSize) || 1);
      return NextResponse.json({
        success: true,
        data: dbOrders,
        paging: { total: totalDbCount, pages: totalPages, currentPage: pageParam },
        stats: dbStats,
        source: 'supabase_indexed',
        startDate: startStr,
        endDate: endStr,
      });
    }

    if (isVtexConfigured()) {
      let rawList = [];
      let statsRawList = [];
      let pagingInfo = { total: 0, pages: 1, currentPage: pageParam };

      if (isExport) {
        let p = 1;
        let maxP = 50;
        while (p <= maxP) {
          const resData = await fetchVtexOrders(startIso, endIso, statusParam, searchParam, p, 100).catch(() => null);
          if (!resData || !resData.list || resData.list.length === 0) break;
          rawList.push(...resData.list);
          const totalPages = resData.paging?.pages || 1;
          if (p >= totalPages) break;
          p++;
        }
        pagingInfo = { total: rawList.length, pages: 1, currentPage: 1 };
        statsRawList = rawList;
      } else {
        const ordersData = await fetchVtexOrders(startIso, endIso, statusParam, searchParam, pageParam, pageSize);
        rawList = ordersData.list || [];
        pagingInfo = ordersData.paging || { total: 0, pages: 0, currentPage: pageParam };

        let p = 1;
        let maxP = 50;
        while (p <= maxP) {
          const resData = await fetchVtexOrders(startIso, endIso, statusParam, searchParam, p, 100).catch(() => null);
          if (!resData || !resData.list || resData.list.length === 0) break;
          statsRawList.push(...resData.list);
          const totalPages = resData.paging?.pages || 1;
          if (p >= totalPages) break;
          p++;
        }
        if (statsRawList.length === 0) {
          statsRawList = rawList;
        }
      }

      // Enriquecer la lista de órdenes leyendo sus detalles para determinar con precisión el tipo de entrega (Pickup vs Delivery)
      let details = await Promise.all(
        rawList.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null))
      );
      let statsDetails = statsRawList === rawList
        ? details
        : await Promise.all(statsRawList.map((o) => fetchVtexOrderDetail(o.orderId).catch(() => null)));

      if (saleTypeParam) {
        const filteredStats = statsRawList
          .map((order, idx) => ({ order, detail: statsDetails[idx] }))
          .filter(({ order, detail }) => matchesSaleType(detail || order, saleTypeParam));

        statsRawList = filteredStats.map(({ order }) => order);
        statsDetails = filteredStats.map(({ detail }) => detail);

        if (isExport) {
          rawList = statsRawList;
          details = statsDetails;
          pagingInfo = { total: rawList.length, pages: 1, currentPage: 1 };
        } else {
          const from = (pageParam - 1) * pageSize;
          rawList = statsRawList.slice(from, from + pageSize);
          details = statsDetails.slice(from, from + pageSize);
          pagingInfo = {
            total: statsRawList.length,
            pages: Math.ceil(statsRawList.length / pageSize) || 1,
            currentPage: pageParam,
          };
        }
      }

      let pickupCount = 0;
      let deliveryCount = 0;
      let invoicedRevenue = 0;
      let socialSellingRevenue = 0;
      let socialSellingCount = 0;
      let organicRevenue = 0;
      let organicCount = 0;
      const storeCounts = {};

      statsRawList.forEach((o, idx) => {
        const d = statsDetails[idx];
        let fulfillmentType = 'delivery';
        let pickupStore = '';

        if (d?.shippingData) {
          const logInfo = d.shippingData.logisticsInfo?.[0];
          const channel = logInfo?.selectedDeliveryChannel || d.shippingData.selectedAddresses?.[0]?.addressType || '';
          const isPickup = channel === 'pickup-in-point' || channel === 'pickup' || Boolean(logInfo?.pickupStoreInfo?.friendlyName);
          if (isPickup) {
            fulfillmentType = 'pickup';
            pickupStore = logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || 'Retiro en Tienda';
          }
        }

        if (fulfillmentType === 'pickup') {
          pickupCount++;
          const sName = normalizeStoreName(pickupStore);
          storeCounts[sName] = (storeCounts[sName] || 0) + 1;
        } else {
          deliveryCount++;
        }

        const orderValue = Number(o.totalValue || d?.value || 0) / 100;
        const socialSelling = isSocialSellingOrder(d || o);

        if (String(o.status || '').toLowerCase() === 'invoiced') {
          invoicedRevenue += orderValue;
          if (socialSelling) {
            socialSellingCount++;
            socialSellingRevenue += orderValue;
          } else {
            organicCount++;
            organicRevenue += orderValue;
          }
        }
      });

      const enrichedList = rawList.map((o, idx) => {
        const d = details[idx];
        let fulfillmentType = 'delivery';
        let pickupStore = '';

        if (d?.shippingData) {
          const logInfo = d.shippingData.logisticsInfo?.[0];
          const channel = logInfo?.selectedDeliveryChannel || d.shippingData.selectedAddresses?.[0]?.addressType || '';
          const isPickup = channel === 'pickup-in-point' || channel === 'pickup' || Boolean(logInfo?.pickupStoreInfo?.friendlyName);
          if (isPickup) {
            fulfillmentType = 'pickup';
            pickupStore = logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || 'Retiro en Tienda';
          }
        }

        const cancelReason = d ? (
          d.cancelReason ||
          (typeof d.cancellationData === 'object' ? d.cancellationData?.reason : d.cancellationData) ||
          (typeof d.openTextField === 'object' ? d.openTextField?.value : d.openTextField) ||
          (o.status === 'canceled' ? 'Sin motivo registrado por el sistema' : null)
        ) : (o.status === 'canceled' ? 'Sin motivo registrado por el sistema' : null);

        const comments = d ? (typeof d.openTextField === 'object' ? d.openTextField?.value : (d.openTextField || null)) : null;
        const isSocialSale = isSocialSellingOrder(d || o);

        return {
          ...o,
          clientName: d?.clientProfileData ? `${d.clientProfileData.firstName || ''} ${d.clientProfileData.lastName || ''}`.trim() : (o.clientName || 'Cliente General'),
          clientEmail: cleanEmailDisplay(d?.clientProfileData?.email || o.clientEmail),
          fulfillmentType,
          pickupStore,
          itemsCount: d?.items?.length || 1,
          cancelReason,
          comments,
          invoiceTicket: extractInvoiceTicket(d),
          tasaCero: extractTasaCeroInfo(d),
          sellerCode: extractSellerCode(d || o),
          saleType: isSocialSale ? 'social' : 'organic',
        };
      });

      const totalFulfillment = pickupCount + deliveryCount;
      const pickupPct = totalFulfillment > 0 ? Math.round((pickupCount / totalFulfillment) * 100) : 0;
      const deliveryPct = totalFulfillment > 0 ? 100 - pickupPct : 0;

      const pickupStores = Object.entries(storeCounts)
        .map(([store, count]) => ({
          store,
          count,
          pct: pickupCount > 0 ? Math.round((count / pickupCount) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const stats = {
        total: pagingInfo.total || 0,
        invoiced: statsRawList.filter((o) => String(o.status || '').toLowerCase() === 'invoiced').length,
        handling: statsRawList.filter((o) => String(o.status || '').toLowerCase() === 'handling').length,
        readyForHandling: statsRawList.filter((o) => String(o.status || '').toLowerCase() === 'ready-for-handling').length,
        canceled: statsRawList.filter((o) => String(o.status || '').toLowerCase() === 'canceled').length,
        pickupCount,
        deliveryCount,
        pickupPct,
        deliveryPct,
        pickupStores,
        invoicedRevenue,
        socialSellingRevenue,
        socialSellingCount,
        organicRevenue,
        organicCount,
      };

      return NextResponse.json({
        success: true,
        data: enrichedList,
        paging: pagingInfo,
        stats,
        source: 'vtex_live_fallback',
        startDate: startStr,
        endDate: endStr,
      });
    }

    return NextResponse.json({ success: false, error: 'No hay fuentes de datos configuradas.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
