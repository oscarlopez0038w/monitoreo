/**
 * Servicio para consumir la API de Catálogo e Inventario de VTEX
 * Incluye protección contra Rate Limits (HTTP 429) y reintentos automáticos
 */

export const isVtexConfigured = () => {
  const appKey = process.env.VTEX_APP_KEY || '';
  const appToken = process.env.VTEX_APP_TOKEN || '';
  return (
    Boolean(appKey) &&
    !appKey.includes('tu_vtex_app_key') &&
    Boolean(appToken) &&
    !appToken.includes('tu_vtex_app_token')
  );
};

export const getVtexConfig = () => {
  const account = process.env.VTEX_ACCOUNT || 'b2csinsa';
  const environment = process.env.VTEX_ENVIRONMENT || 'vtexcommercestable';
  const appKey = process.env.VTEX_APP_KEY || '';
  const appToken = process.env.VTEX_APP_TOKEN || '';
  const pageSize = parseInt(process.env.VTEX_PAGE_SIZE || '1000', 10);

  return {
    account,
    environment,
    appKey,
    appToken,
    pageSize,
    baseUrl: `https://${account}.${environment}.com.br`,
  };
};

/**
 * Obtener página de IDs de SKU desde VTEX Catalog API
 */
export async function fetchSkuPage(page = 1, pagesize = 1000) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitids?page=${page}&pagesize=${pagesize}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  if (config.appKey && config.appToken) {
    headers['X-VTEX-API-AppKey'] = config.appKey;
    headers['X-VTEX-API-AppToken'] = config.appToken;
  }

  let retries = 3;
  let delay = 800;

  while (retries > 0) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`VTEX Error HTTP ${res.status}: ${errText || res.statusText}`);
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
      return [];
    } catch (err) {
      if (retries <= 1) throw err;
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return [];
}

/**
 * Consultar los detalles reales de un SKU en VTEX (IsActive true/false)
 * Endpoint: /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}
 */
export async function fetchSkuDetails(skuId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        return { skuId, isActive: true, hasImage: true, imageUrl: null };
      }

      const data = await res.json();
      const hasImage = Boolean(data.ImageUrl || (data.Images && data.Images.length > 0));

      return {
        skuId,
        isActive: data.IsActive === true,
        name: data.Name || data.SkuName || null,
        hasImage,
        imageUrl: data.ImageUrl || (data.Images?.[0]?.ImageUrl) || null,
      };
    } catch (err) {
      if (retries <= 1) return { skuId, isActive: true, hasImage: true, imageUrl: null };
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { skuId, isActive: true, hasImage: true, imageUrl: null };
}

/**
 * Función de Diagnóstico de Regalías Faltantes
 * Verifica el catálogo (IsActive, Foto) y la logística (Inventario) de un SKU de regalía
 */
export async function diagnoseGiftSku(giftSkuId) {
  try {
    const details = await fetchSkuDetails(giftSkuId);
    const inventory = await fetchSkuInventory(giftSkuId);

    const isActive = details.isActive;
    const hasImage = details.hasImage;
    const totalStock = inventory ? (inventory.totalStock ?? (inventory.totalQuantity - inventory.totalReserved) ?? 0) : 0;

    const reasons = [];
    if (!isActive) {
      reasons.push('Inactivo en VTEX Catalog');
    }
    if (!hasImage) {
      reasons.push('Sin foto/imagen en catálogo');
    }
    if (totalStock <= 0) {
      reasons.push('Sin inventario disponible en bodegas (0 stock)');
    }

    const reason = reasons.length > 0
      ? reasons.join(' / ')
      : 'Stock disponible en VTEX pero no agregado al carrito (posible regla comercial o restricción de política)';

    return {
      giftSkuId: String(giftSkuId),
      name: details.name || `SKU ${giftSkuId}`,
      isActive,
      hasImage,
      totalStock,
      reason,
    };
  } catch (err) {
    return {
      giftSkuId: String(giftSkuId),
      name: `SKU ${giftSkuId}`,
      isActive: false,
      hasImage: false,
      totalStock: 0,
      reason: `Error al consultar estado: ${err.message}`,
    };
  }
}

/**
 * Obtener el inventario por bodegas de un SKU individual desde VTEX Logistics API
 * Endpoint: /api/logistics/pvt/inventory/skus/{skuId}
 */
export async function fetchSkuInventory(skuId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/logistics/pvt/inventory/skus/${skuId}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        // Pausa automática ante límite de tasa
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const balance = data.balance || [];

      let wh1Total = 0;
      let wh1Reserved = 0;
      let wh1Available = 0;

      let wh2Total = 0;
      let wh2Reserved = 0;
      let wh2Available = 0;

      let totalQuantity = 0;
      let totalReserved = 0;
      let totalStock = 0;

      balance.forEach((wh, index) => {
        const total = wh.totalQuantity || 0;
        const reserved = wh.reservedQuantity || 0;
        const available = total - reserved;
        const whId = String(wh.warehouseId || '');

        if (whId === '24' || (whId !== '1041' && index === 0)) {
          wh1Total = total;
          wh1Reserved = reserved;
          wh1Available = available;
        } else if (whId === '1041' || (whId !== '24' && index === 1)) {
          wh2Total = total;
          wh2Reserved = reserved;
          wh2Available = available;
        }

        totalQuantity += total;
        totalReserved += reserved;
        totalStock += available;
      });

      return {
        skuId,
        wh1Total,
        wh1Reserved,
        stockWh1: wh1Available,
        wh2Total,
        wh2Reserved,
        stockWh2: wh2Available,
        totalQuantity,
        totalReserved,
        totalStock,
        balance,
      };
    } catch (err) {
      if (retries <= 1) return null;
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

/**
 * Obtener lista de órdenes desde VTEX OMS API (/api/oms/pvt/orders)
 */
export async function fetchVtexOrders(startDate = null, endDate = null, status = '', search = '', page = 1, perPage = 30, extraParams = '') {
  const config = getVtexConfig();

  // Construir parámetro de filtro por fecha de creación
  let dateQuery = '';
  if (startDate && endDate) {
    const isoStart = new Date(startDate).toISOString();
    const isoEnd = new Date(endDate).toISOString();
    dateQuery = `f_creationDate=creationDate:[${isoStart} TO ${isoEnd}]`;
  }

  let statusQuery = status ? `&f_status=${encodeURIComponent(status)}` : '';
  let searchQuery = search ? `&q=${encodeURIComponent(search)}` : '';
  let extraQuery = extraParams ? `&${extraParams}` : '';

  const url = `${config.baseUrl}/api/oms/pvt/orders?${dateQuery}${statusQuery}${searchQuery}${extraQuery}&page=${page}&per_page=${perPage}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 600;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`VTEX OMS Error HTTP ${res.status}: ${errText}`);
      }

      return await res.json();
    } catch (err) {
      if (retries <= 1) throw err;
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { list: [], paging: { total: 0, pages: 0 } };
}

/**
 * Obtener detalle completo de una orden específica de VTEX OMS (/api/oms/pvt/orders/{orderId})
 */
export async function fetchVtexOrderDetail(orderId) {
  if (!orderId) return null;
  const config = getVtexConfig();

  const targetIds = [orderId];
  if (!orderId.includes('-')) {
    targetIds.push(`${orderId}-01`);
  }

  for (const idToTry of targetIds) {
    const url = `${config.baseUrl}/api/oms/pvt/orders/${idToTry}`;

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': config.appKey,
      'X-VTEX-API-AppToken': config.appToken,
    };

    let retries = 3;
    let delay = 600;

    while (retries > 0) {
      try {
        const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

        if (res.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          retries--;
          continue;
        }

        if (res.status === 404) {
          break; // Probar con el siguiente ID en targetIds (ej. agregando -01)
        }

        if (!res.ok) return null;
        return await res.json();
      } catch (err) {
        if (retries <= 1) break;
        retries--;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return null;
}

/**
 * Obtener precio de un SKU desde VTEX Pricing API (/api/pricing/prices/{skuId})
 */
export async function fetchSkuPrice(skuId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/pricing/prices/${skuId}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 400;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // Función auxiliar para verificar si un precio fijo está activo HOY (sin fechas expiradas)
      const now = new Date();
      const isFixedPriceActive = (fp) => {
        if (!fp) return false;
        if (fp.dateRange) {
          if (fp.dateRange.from) {
            const fromDate = new Date(fp.dateRange.from);
            if (!isNaN(fromDate.getTime()) && now < fromDate) return false;
          }
          if (fp.dateRange.to) {
            const toDate = new Date(fp.dateRange.to);
            if (!isNaN(toDate.getTime()) && now > toDate) return false;
          }
        }
        if (fp.startDate) {
          const startDate = new Date(fp.startDate);
          if (!isNaN(startDate.getTime()) && now < startDate) return false;
        }
        if (fp.endDate) {
          const endDate = new Date(fp.endDate);
          if (!isNaN(endDate.getTime()) && now > endDate) return false;
        }
        return true;
      };

      // 1. Filtrar y priorizar precios fijos ACTIVOS en vigencia hoy (In Effect con dateRange activo sobre precios sin fecha)
      const selectBestFixedPrice = (fpList) => {
        if (!Array.isArray(fpList) || fpList.length === 0) return null;

        const activeList = fpList.filter(isFixedPriceActive);
        if (activeList.length === 0) return null;

        // 1a. Prioridad 1: Precios fijos programados que están VIGENTES hoy ("In effect" 🟢)
        const scheduledInEffect = activeList.filter((fp) => {
          if (!fp.dateRange || (!fp.dateRange.from && !fp.dateRange.to)) return false;
          return true;
        });

        if (scheduledInEffect.length > 0) {
          // Ordenar primero por el menor precio final de venta (mayor descuento al público, tal como hace VTEX Checkout)
          // y en caso de empate, por la fecha de inicio de vigencia más reciente
          scheduledInEffect.sort((a, b) => {
            const priceA = a.value !== undefined && a.value !== null ? Number(a.value) : Infinity;
            const priceB = b.value !== undefined && b.value !== null ? Number(b.value) : Infinity;
            if (priceA !== priceB) return priceA - priceB;

            const dateA = a.dateRange?.from ? new Date(a.dateRange.from).getTime() : 0;
            const dateB = b.dateRange?.from ? new Date(b.dateRange.from).getTime() : 0;
            return dateB - dateA;
          });
          const tradePolicyMatch = scheduledInEffect.find((f) => String(f.tradePolicyId) === '1');
          return tradePolicyMatch || scheduledInEffect[0];
        }

        // 1b. Prioridad 2: Precios fijos activos generales ordenados por menor precio de venta
        activeList.sort((a, b) => {
          const priceA = a.value !== undefined && a.value !== null ? Number(a.value) : Infinity;
          const priceB = b.value !== undefined && b.value !== null ? Number(b.value) : Infinity;
          return priceA - priceB;
        });

        const tradePolicyMatch = activeList.find((f) => String(f.tradePolicyId) === '1');
        return tradePolicyMatch || activeList[0];
      };

      const fixedP = selectBestFixedPrice(data.fixedPrices || []);

      // 2. Extraer Precio Base de Venta (Venta Efectiva al Público)
      const basePrice =
        fixedP?.value !== undefined && fixedP?.value !== null
          ? fixedP.value
          : data.basePrice !== undefined && data.basePrice !== null
          ? data.basePrice
          : data.value !== undefined && data.value !== null
          ? data.value
          : null;

      // 3. Extraer Precio Lista (MSRP / Precio Original)
      let listPrice =
        fixedP?.listPrice !== undefined && fixedP?.listPrice !== null
          ? fixedP.listPrice
          : data.listPrice !== undefined && data.listPrice !== null
          ? data.listPrice
          : null;

      // Si no hay listPrice explícito pero el basePrice de VTEX es mayor al precio de venta fijo, actúa como Precio de Lista (MSRP)
      if ((listPrice === null || listPrice === basePrice) && data.basePrice && basePrice && data.basePrice > basePrice) {
        listPrice = data.basePrice;
      }

      let finalBasePrice = basePrice;
      let finalListPrice = listPrice;

      // 4. Si aún no hay descuento detectado, consultar la simulación de carrito de VTEX (Rates & Benefits)
      if (finalListPrice === null || finalListPrice === finalBasePrice) {
        try {
          const sim = await simulateSkuPrice(skuId);
          if (sim && sim.sellingPrice && sim.listPrice && sim.sellingPrice < sim.listPrice) {
            finalBasePrice = sim.sellingPrice;
            finalListPrice = sim.listPrice;
          }
        } catch (simErr) {
          // Si la simulación falla, conservar los valores base de la API de precios
        }
      }

      const costPrice = data.costPrice !== undefined && data.costPrice !== null ? data.costPrice : null;

      return {
        skuId,
        listPrice: finalListPrice,
        basePrice: finalBasePrice,
        costPrice,
        rawCostPrice: data.costPrice !== undefined && data.costPrice !== null ? data.costPrice : costPrice,
        rawBasePrice: data.basePrice !== undefined && data.basePrice !== null ? data.basePrice : finalBasePrice,
        rawListPrice: data.listPrice !== undefined && data.listPrice !== null ? data.listPrice : finalListPrice,
        fixedPrices: data.fixedPrices || [],
      };
    } catch (err) {
      if (retries <= 1) return null;
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

/**
 * Simular precio de checkout para un SKU aplicando Promociones y Descuentos del módulo Rates & Benefits VTEX
 * (/api/checkout/pub/orderForms/simulation)
 */
export async function simulateSkuPrice(skuId, quantity = 1) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/checkout/pub/orderForms/simulation`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  const itemQty = Math.max(1, parseInt(quantity || '1', 10));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [{ id: String(skuId), quantity: itemQty, seller: '1' }],
        country: 'NIC',
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      return {
        skuId: String(skuId),
        quantity: itemQty,
        status: 'error',
        error: `HTTP ${res.status}`,
        hasRegalias: false,
        regalias: [],
        selectableGiftsOptions: [],
        missingGiftDiagnostics: [],
      };
    }

    const data = await res.json();
    const items = data.items || [];

    // Buscar el ítem correspondiente al SKU principal (normalmente el primer ítem o por ID)
    const mainItem = items.find((it) => String(it.id) === String(skuId)) || items[0];

    if (!mainItem) {
      return {
        skuId: String(skuId),
        quantity: itemQty,
        status: 'not_found',
        hasRegalias: false,
        regalias: [],
        selectableGiftsOptions: [],
        missingGiftDiagnostics: [],
      };
    }

    const listPrice = mainItem.listPrice ? mainItem.listPrice / 100 : (mainItem.price ? mainItem.price / 100 : 0);
    const sellingPrice = mainItem.sellingPrice !== undefined ? mainItem.sellingPrice / 100 : listPrice;
    const priceTags = mainItem.priceTags || [];
    const availability = mainItem.availability || 'available';

    // Obtener nombre del producto si no viene en mainItem
    let productName = mainItem.name || mainItem.skuName || null;
    if (!productName || productName === `SKU ${skuId}`) {
      try {
        const details = await fetchSkuDetails(skuId);
        if (details?.name) {
          productName = details.name;
        }
      } catch (err) {
        // Silencioso
      }
    }
    if (!productName) {
      productName = `SKU ${skuId}`;
    }

    // Descuentos y Promociones
    const discountAmount = listPrice > sellingPrice ? listPrice - sellingPrice : 0;
    const discountPercentage = listPrice > 0 && discountAmount > 0 ? Math.round((discountAmount / listPrice) * 100) : 0;

    // Extraer nombres de promociones aplicadas (de priceTags y ratesAndBenefitsData)
    const promoNames = new Set();
    priceTags.forEach((t) => {
      if (t.name) promoNames.add(t.name);
    });

    if (data.ratesAndBenefitsData?.rateAndBenefitsIdentifiers) {
      data.ratesAndBenefitsData.rateAndBenefitsIdentifiers.forEach((rb) => {
        if (rb.name) promoNames.add(rb.name);
      });
    }

    const appliedPromotions = Array.from(promoNames);

    // Identificar Regalías (Gift items agregados automáticamente al carrito)
    const regalias = items
      .filter((it) => {
        if (it === mainItem && !it.isGift) return false;
        return it.isGift || it.sellingPrice === 0 || String(it.id) !== String(skuId);
      })
      .map((g) => ({
        skuId: String(g.id),
        name: g.name || g.skuName || `Obsequio SKU ${g.id}`,
        quantity: g.quantity || 1,
        listPrice: g.listPrice ? g.listPrice / 100 : 0,
        sellingPrice: g.sellingPrice ? g.sellingPrice / 100 : 0,
        isGift: Boolean(g.isGift || g.sellingPrice === 0),
        imageUrl: g.imageUrl || null,
      }));

    // Si la regalía no tiene nombre completo, consultar detalles de la regalía
    for (const g of regalias) {
      if (!g.name || g.name.startsWith('Obsequio SKU')) {
        try {
          const gDetails = await fetchSkuDetails(g.skuId);
          if (gDetails?.name) g.name = gDetails.name;
        } catch (e) {}
      }
    }

    // Procesar Regalías Seleccionables (Opciones múltiples a elegir)
    const selectableGiftsOptions = [];
    if (data.selectableGifts && Array.isArray(data.selectableGifts)) {
      for (const sg of data.selectableGifts) {
        const giftList = sg.gifts || sg.selectableGifts || [];
        for (const giftItem of giftList) {
          const gId = String(giftItem.id || giftItem.skuId || giftItem.idSku || '');
          if (!gId) continue;

          let gName = giftItem.name || giftItem.description || `SKU ${gId}`;
          if (!gName || gName.startsWith('SKU')) {
            try {
              const d = await fetchSkuDetails(gId);
              if (d?.name) gName = d.name;
            } catch (e) {}
          }

          selectableGiftsOptions.push({
            skuId: gId,
            name: gName,
            quantity: giftItem.quantity || 1,
          });
        }
      }
    }

    // MOTOR DE DIAGNÓSTICO DE REGALÍAS FALTANTES
    // Analiza las promociones para detectar si se prometió una regalía pero no fue agregada al carrito por VTEX
    const missingGiftDiagnostics = [];
    const addedRegaliaSkuIds = new Set(regalias.map((r) => String(r.skuId)));

    for (const promoText of appliedPromotions) {
      // Buscar patrones de números de SKU (5 a 12 dígitos) en el texto de la promoción
      const matches = promoText.match(/\b\d{5,12}\b/g) || [];
      for (const possibleGiftSkuId of matches) {
        // Si el SKU encontrado no es el producto principal ni fue agregado a las regalías
        if (possibleGiftSkuId !== String(skuId) && !addedRegaliaSkuIds.has(possibleGiftSkuId)) {
          // Evitar diagnósticos duplicados
          if (!missingGiftDiagnostics.some((d) => d.giftSkuId === possibleGiftSkuId)) {
            const diag = await diagnoseGiftSku(possibleGiftSkuId);
            missingGiftDiagnostics.push(diag);
          }
        }
      }
    }

    return {
      skuId: String(skuId),
      quantity: itemQty,
      name: productName,
      status: availability,
      listPrice,
      sellingPrice,
      hasDiscount: discountAmount > 0,
      discountAmount,
      discountPercentage,
      priceTags: priceTags.map((t) => ({ name: t.name, identifier: t.identifier, value: (t.value || 0) / 100 })),
      appliedPromotions,
      hasRegalias: regalias.length > 0 || selectableGiftsOptions.length > 0,
      regalias,
      selectableGiftsOptions,
      missingGiftDiagnostics,
    };
  } catch (err) {
    console.error(`Error simulando carrito para SKU ${skuId}:`, err);
    return {
      skuId: String(skuId),
      quantity: Math.max(1, parseInt(quantity || '1', 10)),
      status: 'error',
      error: err.message,
      hasRegalias: false,
      regalias: [],
      selectableGiftsOptions: [],
      missingGiftDiagnostics: [],
    };
  }
}

/**
 * Consultar lista de Promociones y Descuentos activos registrados en VTEX Rates & Benefits Module
 * (/api/rns/pvt/benefits/calculator/search)
 */
export async function fetchVtexPromotions() {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/rns/pvt/benefits/calculator/search`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  try {
    const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.items || []).map((promo) => ({
      id: promo.idCalculator,
      name: promo.name,
      type: promo.type,
      status: promo.status,
      beginDate: promo.beginDateUtc,
      endDate: promo.endDateUtc,
      nominalDiscountValue: promo.nominalDiscountValue,
      percentualDiscountValue: promo.percentualDiscountValue,
      isActive: promo.isActive,
    }));
  } catch (err) {
    console.error('Error obteniendo promociones desde VTEX:', err);
    return [];
  }
}

/**
 * Obtener lista de transacciones desde VTEX Payments API (/api/pvt/transactions)
 * Nota: VTEX limita a un pageSize máximo de 15 por llamada
 */
export async function fetchVtexTransactions(page = 1, pageSize = 15) {
  const config = getVtexConfig();
  const safePageSize = Math.min(Math.max(1, parseInt(pageSize || '15', 10)), 15);
  const url = `${config.baseUrl}/api/pvt/transactions?page=${page}&pageSize=${safePageSize}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`VTEX Payments Error HTTP ${res.status}: ${errText}`);
      }

      return await res.json();
    } catch (err) {
      if (retries <= 1) return { items: [], paging: { total: 0 } };
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { items: [], paging: { total: 0 } };
}

/**
 * Obtener lote multi-página de transacciones desde VTEX Payments API (para capturar todos los intentos)
 */
export async function fetchVtexTransactionsBatch(pagesCount = 3) {
  try {
    const pagePromises = [];
    for (let p = 1; p <= pagesCount; p++) {
      pagePromises.push(fetchVtexTransactions(p, 15));
    }

    const results = await Promise.all(pagePromises);
    let allItems = [];
    let totalPaging = 0;

    results.forEach((res) => {
      if (res?.items && Array.isArray(res.items)) {
        allItems = allItems.concat(res.items);
      }
      if (res?.paging?.total) {
        totalPaging = res.paging.total;
      }
    });

    return { items: allItems, paging: { total: totalPaging } };
  } catch (err) {
    console.error('Error fetching transactions batch:', err);
    return { items: [], paging: { total: 0 } };
  }
}


/**
 * Obtener arreglo de pagos de una transacción desde VTEX Payments API (/api/pvt/transactions/{transactionId}/payments)
 */
export async function fetchVtexTransactionPayments(transactionId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/pvt/transactions/${transactionId}/payments`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      if (retries <= 1) return [];
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return [];
}

/**
 * Obtener detalle de una transacción individual desde VTEX Payments API (/api/pvt/transactions/{transactionId})
 */
export async function fetchVtexTransactionDetail(transactionId) {

  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/pvt/transactions/${transactionId}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      if (retries <= 1) return null;
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

/**
 * Obtener historial de interacciones y logs del gateway para una transacción (/api/pvt/transactions/{transactionId}/interactions)
 */
export async function fetchVtexTransactionInteractions(transactionId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/pvt/transactions/${transactionId}/interactions`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      if (retries <= 1) return [];
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return [];
}

/**
 * Resolver la URL real de la imagen de un SKU desde VTEX Catálogo
 */
const skuImageCache = new Map();

export async function fetchSkuImageUrl(skuId, orderImageUrl = null) {
  if (
    orderImageUrl &&
    typeof orderImageUrl === 'string' &&
    orderImageUrl.startsWith('http') &&
    !orderImageUrl.includes('960916')
  ) {
    return orderImageUrl;
  }

  if (!skuId || skuId === 'N/A') return '/placeholder-product.svg';

  const cleanSkuId = String(skuId).trim();
  if (skuImageCache.has(cleanSkuId)) {
    return skuImageCache.get(cleanSkuId);
  }

  try {
    const config = getVtexConfig();
    const url = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${cleanSkuId}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-VTEX-API-AppKey': config.appKey,
        'X-VTEX-API-AppToken': config.appToken,
      },
    });

    if (res.ok) {
      const data = await res.json();
      const realImage = data.ImageUrl || data.Images?.[0]?.ImageUrl || null;
      if (realImage) {
        skuImageCache.set(cleanSkuId, realImage);
        return realImage;
      }
    }
  } catch (err) {
    console.error(`[VTEX SKU Image] Error al obtener imagen para SKU ${cleanSkuId}:`, err.message);
  }

  const fallback = '/placeholder-product.svg';
  skuImageCache.set(cleanSkuId, fallback);
  return fallback;
}

/**
 * Lista predeterminada de SKUs Kit Mini Split a monitorear
 */
export const DEFAULT_MINI_SPLIT_SKUS = [
  '2025221407',
  '2025221415',
  '2025221414',
  '2025221413',
  '2025221412',
  '2025221406',
  '2025221405',
  '2025221403',
  '2025221402',
];

/**
 * Consultar detalles completos de un Kit SKU desde VTEX Catálogo API
 * Endpoint: /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}
 */
export async function fetchKitDetails(skuId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      const rawKitItems = data.KitItems || [];

      const kitItems = rawKitItems.map((item) => ({
        id: String(item.Id),
        name: item.Name || `SKU Componente ${item.Id}`,
        amount: item.Amount || 1,
        unitPrice: item.UnitPrice || null,
        refId: item.RefId || String(item.Id),
      }));

      const imageUrl = data.ImageUrl || data.Images?.[0]?.ImageUrl || null;

      return {
        skuId: String(skuId),
        name: data.Name || data.SkuName || data.ProductName || `Mini Split Kit ${skuId}`,
        isActive: data.IsActive === true,
        isKit: data.IsKit === true,
        kitItems,
        imageUrl,
      };
    } catch (err) {
      if (retries <= 1) return null;
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

/**
 * Obtener informe consolidado de Kits Mini Split con sus precios, estado de componentes e inventario por bodega
 */
export async function fetchMiniSplitKitsData(skuList = DEFAULT_MINI_SPLIT_SKUS) {
  const kitPromises = skuList.map(async (skuId) => {
    try {
      const cleanSkuId = String(skuId).trim();
      const [kitDetails, kitPrice] = await Promise.all([
        fetchKitDetails(cleanSkuId),
        fetchSkuPrice(cleanSkuId),
      ]);

      if (!kitDetails) {
        return {
          skuId: cleanSkuId,
          name: `Kit SKU ${cleanSkuId}`,
          isActive: false,
          isKit: false,
          imageUrl: null,
          kitPrice: kitPrice || { listPrice: 0, basePrice: 0, costPrice: 0 },
          components: [],
          componentsTotalPrice: 0,
          priceDifference: 0,
          maxBuildableStock: 0,
          status: 'NOT_FOUND',
          statusDescription: 'SKU no encontrado en catálogo VTEX',
        };
      }

      const componentPromises = kitDetails.kitItems.map(async (compItem) => {
        const compSkuId = compItem.id;
        const [compDetails, compPrice, compInv, compImageUrl] = await Promise.all([
          fetchSkuDetails(compSkuId),
          fetchSkuPrice(compSkuId),
          fetchSkuInventory(compSkuId),
          fetchSkuImageUrl(compSkuId, kitDetails.imageUrl),
        ]);

        const compBasePrice = compPrice?.basePrice ?? compItem.unitPrice ?? 0;
        const compListPrice = compPrice?.listPrice ?? compBasePrice;
        const compCostPrice = compPrice?.costPrice ?? 0;
        const compQty = compItem.amount || 1;

        return {
          skuId: compSkuId,
          name: compDetails?.name || compItem.name,
          quantity: compQty,
          isActive: compDetails?.isActive ?? true,
          imageUrl: compDetails?.imageUrl || compImageUrl || kitDetails.imageUrl || '/placeholder-product.svg',
          price: {
            basePrice: compBasePrice,
            listPrice: compListPrice,
            costPrice: compCostPrice,
          },
          inventory: compInv ? {
            wh1Total: compInv.wh1Total,
            wh1Reserved: compInv.wh1Reserved,
            stockWh1: compInv.stockWh1,
            wh2Total: compInv.wh2Total,
            wh2Reserved: compInv.wh2Reserved,
            stockWh2: compInv.stockWh2,
            totalQuantity: compInv.totalQuantity,
            totalReserved: compInv.totalReserved,
            totalStock: compInv.totalStock,
          } : {
            wh1Total: 0, wh1Reserved: 0, stockWh1: 0,
            wh2Total: 0, wh2Reserved: 0, stockWh2: 0,
            totalQuantity: 0, totalReserved: 0, totalStock: 0,
          },
        };
      });

      const components = await Promise.all(componentPromises);

      let componentsTotalPrice = 0;
      components.forEach((c) => {
        componentsTotalPrice += (c.price.basePrice || 0) * (c.quantity || 1);
      });

      const kitBasePrice = kitPrice?.basePrice ?? 0;
      const priceDifference = componentsTotalPrice - kitBasePrice;

      // Calcular stock máximo de kits que se pueden armar según el componente limitante
      let maxBuildableStock = 0;
      if (components.length > 0) {
        const buildablePerComp = components.map((c) =>
          Math.floor((c.inventory?.totalStock || 0) / (c.quantity || 1))
        );
        maxBuildableStock = Math.min(...buildablePerComp);
      }

      const hasInactiveComponents = components.some((c) => !c.isActive);

      let status = 'READY';
      let statusDescription = 'Listo para venta (Kit y componentes activos con stock)';

      if (!kitDetails.isActive) {
        status = 'KIT_INACTIVE';
        statusDescription = 'Kit inactivo en VTEX';
      } else if (hasInactiveComponents) {
        status = 'COMPONENT_INACTIVE';
        statusDescription = 'Alerta: Al menos un componente está inactivo en VTEX';
      } else if (maxBuildableStock <= 0) {
        status = 'NO_STOCK';
        statusDescription = 'Sin stock disponible en componentes';
      }

      return {
        skuId: cleanSkuId,
        name: kitDetails.name,
        isActive: kitDetails.isActive,
        isKit: kitDetails.isKit,
        imageUrl: kitDetails.imageUrl,
        kitPrice: {
          listPrice: kitPrice?.listPrice ?? kitBasePrice,
          basePrice: kitBasePrice,
          costPrice: kitPrice?.costPrice ?? 0,
        },
        components,
        componentsTotalPrice,
        priceDifference,
        maxBuildableStock,
        status,
        statusDescription,
      };
    } catch (err) {
      console.error(`Error procesando Kit SKU ${skuId}:`, err);
      return {
        skuId: String(skuId),
        name: `Kit SKU ${skuId}`,
        isActive: false,
        isKit: false,
        imageUrl: null,
        kitPrice: { listPrice: 0, basePrice: 0, costPrice: 0 },
        components: [],
        componentsTotalPrice: 0,
        priceDifference: 0,
        maxBuildableStock: 0,
        status: 'ERROR',
        statusDescription: `Error al procesar: ${err.message}`,
      };
    }
  });

  return await Promise.all(kitPromises);
}

/**
 * Actualizar el Precio Base de un SKU (Kit o Componente) en VTEX Pricing API
 * Endpoint: PUT /api/pricing/prices/{skuId}
 */
export async function updateSkuBasePrice(skuId, newBasePrice) {
  const cleanSkuId = String(skuId).trim();
  const numericPrice = Number(newBasePrice);

  if (isNaN(numericPrice) || numericPrice < 0) {
    throw new Error(`El precio ingresado (${newBasePrice}) es inválido.`);
  }

  const config = getVtexConfig();

  // Consultar precio actual para validar listPrice
  const currentPrice = await fetchSkuPrice(cleanSkuId);

  const url = `${config.baseUrl}/api/pricing/prices/${cleanSkuId}`;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  // Importante: SINSA requiere que el Precio de Costo (costPrice) se iguale exactamente al Precio Base (basePrice)
  // para evitar exponer márgenes o costos reales en VTEX.
  const payload = {
    basePrice: numericPrice,
    costPrice: numericPrice,
  };

  if (currentPrice?.listPrice && currentPrice.listPrice >= numericPrice) {
    payload.listPrice = Number(currentPrice.listPrice);
  }

  let retries = 3;
  let delay = 500;

  while (retries > 0) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`VTEX Pricing API Error HTTP ${res.status}: ${errText || res.statusText}`);
      }

      return {
        success: true,
        skuId: cleanSkuId,
        newBasePrice: numericPrice,
        message: `Precio base del SKU ${cleanSkuId} actualizado exitosamente a C$ ${numericPrice.toLocaleString('es-NI')}`,
      };
    } catch (err) {
      if (retries <= 1) throw err;
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('No se pudo actualizar el precio en VTEX.');
}

/**
 * Activar o desactivar un SKU (Kit o Componente) en el catálogo de VTEX
 * Endpoint: PUT /api/catalog/pvt/stockkeepingunit/{skuId}
 */
export async function toggleSkuActiveStatus(skuId, activate = true) {
  const cleanSkuId = String(skuId).trim();
  const config = getVtexConfig();

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  // 1. Obtener la definición completa del SKU desde el catálogo VTEX
  const getUrl = `${config.baseUrl}/api/catalog/pvt/stockkeepingunit/${cleanSkuId}`;
  const getRes = await fetch(getUrl, { headers, cache: 'no-store' });

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`No se pudo obtener la información del SKU ${cleanSkuId} desde VTEX Catalog (HTTP ${getRes.status}: ${errText})`);
  }

  const skuData = await getRes.json();

  skuData.IsActive = Boolean(activate);
  skuData.ActivateIfPossible = Boolean(activate);

  // 2. Actualizar el estado IsActive / ActivateIfPossible en VTEX Catalog API
  const putRes = await fetch(getUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(skuData),
    cache: 'no-store',
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Error al ${activate ? 'activar' : 'desactivar'} el SKU ${cleanSkuId} en VTEX (HTTP ${putRes.status}: ${errText})`);
  }

  return {
    success: true,
    skuId: cleanSkuId,
    isActive: Boolean(activate),
    message: `SKU ${cleanSkuId} ${activate ? 'activado' : 'desactivado'} exitosamente en el catálogo de VTEX.`,
  };
}

/**
 * Descubrir automáticamente todos los SKUs tipo Kit desde el catálogo de VTEX (de cualquier categoría)
 */
export async function discoverVtexKitSkus() {
  const config = getVtexConfig();
  const skuCandidates = new Set(DEFAULT_MINI_SPLIT_SKUS);

  // 1. Intentar consultar todos los SKU IDs desde el API de catálogo privado VTEX
  try {
    for (let page = 1; page <= 5; page++) {
      const skuListUrl = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitids?page=${page}&pagesize=1000`;
      const res = await fetch(skuListUrl, {
        headers: {
          'Accept': 'application/json',
          'X-VTEX-API-AppKey': config.appKey,
          'X-VTEX-API-AppToken': config.appToken,
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const skuIds = await res.json();
        if (Array.isArray(skuIds) && skuIds.length > 0) {
          skuIds.forEach((id) => skuCandidates.add(String(id)));
        } else {
          break;
        }
      } else {
        break;
      }
    }
  } catch (e) {
    // Continuar con búsquedas si falla el listado masivo
  }

  // 2. Búsqueda por términos universales de Kits (cualquier categoría + climatización)
  const searchTerms = [
    '',
    'KIT', 'COMBO', 'JUEGO', 'PAQUETE', 'SET', 'PACK',
    'MINI SPLIT', 'SPLIT', 'EVAPORADOR', 'CONDENSADOR', 'SEER', 'INVERTER'
  ];

  for (const term of searchTerms) {
    try {
      const ftParam = term ? `ft=${encodeURIComponent(term)}&` : '';
      const searchUrl = `${config.baseUrl}/api/catalog_system/pub/products/search?${ftParam}_from=0&_to=49`;
      const res = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'X-VTEX-API-AppKey': config.appKey,
          'X-VTEX-API-AppToken': config.appToken,
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const products = await res.json();
        if (Array.isArray(products)) {
          products.forEach((prod) => {
            (prod.items || []).forEach((item) => {
              if (item.itemId) skuCandidates.add(String(item.itemId));
            });
          });
        }
      }
    } catch (e) {
      // Silencioso
    }
  }

  // 3. Filtrar candidatos verificando cuáles son realmente un Kit en VTEX
  const candidatesList = Array.from(skuCandidates);
  const kitCheckPromises = candidatesList.map(async (skuId) => {
    try {
      const details = await fetchKitDetails(skuId);
      if (details && (details.isKit || (details.kitItems && details.kitItems.length > 0))) {
        return skuId;
      }
    } catch (e) {}
    return null;
  });

  const results = await Promise.all(kitCheckPromises);
  const validKitSkus = results.filter(Boolean);

  return validKitSkus.length > 0 ? validKitSkus : DEFAULT_MINI_SPLIT_SKUS;
}









