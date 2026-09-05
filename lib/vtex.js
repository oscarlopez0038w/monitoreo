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
 * Cliente HTTP unificado para VTEX con reintentos automáticos y manejo de Rate Limits (429)
 */
export async function vtexFetch(url, options = {}) {
  const config = getVtexConfig();
  const maxRetries = options.retries ?? 3;
  let delay = options.initialDelay ?? 500;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(config.appKey && config.appToken
      ? {
          'X-VTEX-API-AppKey': config.appKey,
          'X-VTEX-API-AppToken': config.appToken,
        }
      : {}),
    ...(options.headers || {}),
  };

  const fetchOptions = {
    ...options,
    headers,
    cache: 'no-store',
  };
  delete fetchOptions.retries;
  delete fetchOptions.initialDelay;

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, fetchOptions);

      if (res.status === 429) {
        attempt++;
        if (attempt > maxRetries) return res;
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      return res;
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/**
 * Obtener página de IDs de SKU desde VTEX Catalog API
 */
export async function fetchSkuPage(page = 1, pagesize = 1000) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitids?page=${page}&pagesize=${pagesize}`;

  try {
    const res = await vtexFetch(url, { initialDelay: 800 });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`VTEX Error HTTP ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    throw err;
  }
}

/**
 * Consultar los detalles reales de un SKU en VTEX (nombre, isActive, refId, etc.)
 * Endpoint: /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}
 * 
 * NOTA DE PERFORMANCE: Por defecto NO consulta la Product API (/api/catalog/pvt/product/{id})
 * para evitar llamadas N+1 duplicadas en sincronizaciones masivas.
 */
export async function fetchSkuDetails(skuId, { includeProductVisibility = false } = {}) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;

  try {
    const res = await vtexFetch(url, { initialDelay: 400 });

    if (!res.ok) {
      return {
        skuId,
        isActive: true,
        hasImage: true,
        imageUrl: null,
        name: null,
        refId: null,
        brand: null,
        category: null,
      };
    }

    const data = await res.json();
    const hasImage = Boolean(data.ImageUrl || (data.Images && data.Images.length > 0));
    let displayOnSite = data.IsVisible === true || data.DisplayOnSite === true;

    // Solo si se solicita explícitamente y existe ProductId, consultar la API de producto
    if (includeProductVisibility && data.ProductId) {
      try {
        const productUrl = `${config.baseUrl}/api/catalog/pvt/product/${data.ProductId}`;
        const productRes = await vtexFetch(productUrl);
        if (productRes.ok) {
          const productData = await productRes.json();
          if (productData.IsVisible !== undefined) {
            displayOnSite = productData.IsVisible === true;
          }
        }
      } catch (e) {}
    }

    // Extraer categoría si existe
    let categoryName = null;
    if (data.ProductCategories && typeof data.ProductCategories === 'object') {
      const catNames = Object.values(data.ProductCategories);
      if (catNames.length > 0) categoryName = catNames[catNames.length - 1];
    }

    return {
      skuId,
      isActive: data.IsActive === true,
      productId: data.ProductId ? String(data.ProductId) : null,
      displayOnSite,
      name: data.Name || data.SkuName || null,
      refId: data.RefId || null,
      brand: data.BrandName || null,
      category: categoryName,
      hasImage,
      imageUrl: data.ImageUrl || (data.Images?.[0]?.ImageUrl) || null,
    };
  } catch (err) {
    return {
      skuId,
      isActive: true,
      hasImage: true,
      imageUrl: null,
      name: null,
      refId: null,
      brand: null,
      category: null,
    };
  }
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

  try {
    const res = await vtexFetch(url, { initialDelay: 400 });

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
    return null;
  }
}

/**
 * Obtener lista de órdenes desde VTEX OMS API (/api/oms/pvt/orders)
 */
export async function fetchVtexOrders(startDate = null, endDate = null, status = '', search = '', page = 1, perPage = 30, extraParams = '') {
  const config = getVtexConfig();

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

  try {
    const res = await vtexFetch(url, { initialDelay: 600 });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`VTEX OMS Error HTTP ${res.status}: ${errText}`);
    }

    return await res.json();
  } catch (err) {
    return { list: [], paging: { total: 0, pages: 0 } };
  }
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
    try {
      const res = await vtexFetch(url, { initialDelay: 500 });
      if (res.status === 404) continue;
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      continue;
    }
  }

  return null;
}

/**
 * Helper interno: Analiza la respuesta bruta de VTEX Pricing API y extrae precios normalizados
 */
function parseVtexPriceData(data) {
  if (!data) return null;

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

  const selectBestFixedPrice = (fpList) => {
    if (!Array.isArray(fpList) || fpList.length === 0) return null;

    const activeList = fpList.filter(isFixedPriceActive);
    if (activeList.length === 0) return null;

    const scheduledInEffect = activeList.filter((fp) => {
      if (!fp.dateRange || (!fp.dateRange.from && !fp.dateRange.to)) return false;
      return true;
    });

    if (scheduledInEffect.length > 0) {
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

    activeList.sort((a, b) => {
      const priceA = a.value !== undefined && a.value !== null ? Number(a.value) : Infinity;
      const priceB = b.value !== undefined && b.value !== null ? Number(b.value) : Infinity;
      return priceA - priceB;
    });

    const tradePolicyMatch = activeList.find((f) => String(f.tradePolicyId) === '1');
    return tradePolicyMatch || activeList[0];
  };

  const fixedP = selectBestFixedPrice(data.fixedPrices || []);

  const basePrice =
    fixedP?.value !== undefined && fixedP?.value !== null
      ? fixedP.value
      : data.basePrice !== undefined && data.basePrice !== null
      ? data.basePrice
      : data.value !== undefined && data.value !== null
      ? data.value
      : null;

  let listPrice =
    fixedP?.listPrice !== undefined && fixedP?.listPrice !== null
      ? fixedP.listPrice
      : data.listPrice !== undefined && data.listPrice !== null
      ? data.listPrice
      : null;

  if ((listPrice === null || listPrice === basePrice) && data.basePrice && basePrice && data.basePrice > basePrice) {
    listPrice = data.basePrice;
  }

  const costPrice = data.costPrice !== undefined && data.costPrice !== null ? data.costPrice : null;

  return {
    listPrice,
    basePrice,
    costPrice,
    rawCostPrice: data.costPrice !== undefined && data.costPrice !== null ? data.costPrice : costPrice,
    rawBasePrice: data.basePrice !== undefined && data.basePrice !== null ? data.basePrice : basePrice,
    rawListPrice: data.listPrice !== undefined && data.listPrice !== null ? data.listPrice : listPrice,
    fixedPrices: data.fixedPrices || [],
  };
}

/**
 * Obtener precio de un SKU desde VTEX Pricing API de forma directa (sin simulación de checkout)
 * Altamente optimizado para sincronizaciones masivas.
 * Endpoint: /api/pricing/prices/{skuId}
 */
export async function fetchSkuPriceRaw(skuId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/pricing/prices/${skuId}`;

  try {
    const res = await vtexFetch(url, { initialDelay: 400 });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const parsed = parseVtexPriceData(data);
    if (!parsed) return null;

    return {
      skuId,
      ...parsed,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Obtener precio de un SKU desde VTEX Pricing API (/api/pricing/prices/{skuId})
 * Con simulación opcional de checkout para promociones complejas de Rates & Benefits.
 */
export async function fetchSkuPrice(skuId, { simulateDiscount = true } = {}) {
  const rawPrice = await fetchSkuPriceRaw(skuId);
  if (!rawPrice) return null;

  let finalBasePrice = rawPrice.basePrice;
  let finalListPrice = rawPrice.listPrice;
  // finalPrice representa el precio real de venta / checkout
  let finalPrice = rawPrice.basePrice;
  let simPromoName = null;
  let simDiscountPct = 0;

  // Simular checkout para capturar promociones de Rates & Benefits si existen
  if (simulateDiscount) {
    try {
      const sim = await simulateSkuPrice(skuId);
      if (sim && sim.sellingPrice > 0) {
        // Filtrar nombres de promociones de Rates & Benefits (omitir etiquetas internas como @price)
        const appliedPromos = (sim.appliedPromotions || []).filter((p) => !p.includes('@price'));
        const hasRealPromo = appliedPromos.length > 0;

        if (hasRealPromo) {
          simPromoName = appliedPromos[0];
          // Solo aplicar el precio de simulación si realmente descuenta o iguala el precio base configurado
          // (evita desfases cuando VTEX checkout aún no ha indexado un nuevo fixed price o base price más bajo)
          if (finalBasePrice && sim.sellingPrice <= finalBasePrice) {
            finalPrice = sim.sellingPrice;
            if (sim.discountPercentage > 0) simDiscountPct = sim.discountPercentage;
          } else {
            // El checkout aún está indexando el precio viejo; mantener el basePrice/fixedPrice recién configurado
            finalPrice = finalBasePrice;
          }
        } else {
          // Sin promociones de Rates & Benefits en checkout:
          // El precio final de venta es SIEMPRE el basePrice / fixedPrice configurado en Pricing API.
          // Esto elimina al 100% el desfase de indexación de VTEX (5-120 seg) donde el checkout
          // sigue reportando el precio anterior tras editar un SKU.
          finalPrice = finalBasePrice;
          simPromoName = null;
          simDiscountPct = 0;
        }

        // Si la simulación detecta un listPrice mayor y no tenemos listPrice o es igual al basePrice, usarlo como referencia
        if ((!finalListPrice || finalListPrice <= finalPrice) && sim.listPrice && sim.listPrice > finalPrice) {
          finalListPrice = sim.listPrice;
        }
      }
    } catch (simErr) {
      // Conservar los valores base de Pricing API si la simulación falla
      finalPrice = rawPrice.basePrice;
    }
  }

  return {
    ...rawPrice,
    listPrice: finalListPrice,
    basePrice: finalBasePrice,
    finalPrice,
    simPromoName,
    simDiscountPct,
  };
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
 * Consultar lista de Promociones y Descuentos registrados en VTEX Rates & Benefits Module
 * (/api/rnb/pvt/benefits/calculatorconfiguration)
 */
export async function fetchVtexPromotions() {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/rnb/pvt/benefits/calculatorconfiguration`;

  try {
    const res = await vtexFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items || (Array.isArray(data) ? data : []);

    const now = new Date();

    return items.map((promo) => {
      const beginDate = promo.beginDate || promo.beginDateUtc || null;
      const endDate = promo.endDate || promo.endDateUtc || null;
      const fromDate = beginDate ? new Date(beginDate) : null;
      const toDate = endDate ? new Date(endDate) : null;

      let isExpired = false;
      let isScheduled = false;
      let isWithinDate = true;

      if (fromDate && !isNaN(fromDate.getTime()) && now < fromDate) {
        isScheduled = true;
        isWithinDate = false;
      }
      if (toDate && !isNaN(toDate.getTime()) && now > toDate) {
        isExpired = true;
        isWithinDate = false;
      }

      // En VTEX Admin:
      // Status Completed = Fecha de fin ya venció (now > endDate)
      // Status Active = isActive es true, status es 'active', y fecha vigente
      // Status Scheduled = Fecha de inicio aún no llega (now < beginDate)
      // Status Inactive / Pausada = Desactivada en VTEX o status 'inactive'
      // Status Archived = Archivada
      const isVtexActive = promo.isActive === true && promo.status === 'active' && !promo.isArchived;
      const isCurrent = isVtexActive && isWithinDate;

      let humanStatus = 'inactive';
      let humanStatusLabel = 'Pausada';

      if (promo.isArchived) {
        humanStatus = 'archived';
        humanStatusLabel = 'Archivada';
      } else if (isExpired) {
        humanStatus = 'completed';
        humanStatusLabel = 'Finalizada (Completed)';
      } else if (isScheduled) {
        humanStatus = 'scheduled';
        humanStatusLabel = 'Programada (Scheduled)';
      } else if (isCurrent) {
        humanStatus = 'active';
        humanStatusLabel = 'Vigente Hoy (Active)';
      } else if (!promo.isActive || promo.status === 'inactive') {
        humanStatus = 'inactive';
        humanStatusLabel = 'Inactiva';
      }

      return {
        id: promo.idCalculatorConfiguration || promo.idCalculator,
        name: promo.name,
        description: promo.description || '',
        type: promo.type,
        status: promo.status, // 'active' | 'inactive'
        humanStatus,
        humanStatusLabel,
        beginDate,
        endDate,
        nominalDiscountValue: promo.nominalDiscountValue || 0,
        percentualDiscountValue: promo.percentualDiscountValue || 0,
        isActive: promo.isActive === true,
        isArchived: promo.isArchived === true,
        isCurrent, // Verdadero solo si está activa en VTEX Y dentro del rango de fechas hoy
        scope: promo.scope || null,
      };
    });
  } catch (err) {
    console.error('Error obteniendo promociones desde VTEX:', err);
    return [];
  }
}

/**
 * Obtener detalle completo y reglas de una promoción específica desde VTEX Rates & Benefits
 * (/api/rnb/pvt/calculatorconfiguration/{promoId})
 */
export async function fetchVtexPromotionDetail(promoId) {
  if (!promoId) return null;
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/rnb/pvt/calculatorconfiguration/${promoId}`;

  try {
    const res = await vtexFetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`Error obteniendo detalle de promoción ${promoId}:`, err.message);
    return null;
  }
}

/**
 * Obtener todos los IDs de SKUs pertenecientes a una Colección en VTEX
 * (/api/catalog_system/pub/products/search?fq=productClusterIds:{collectionId})
 */
export async function fetchCollectionSkus(collectionId, maxProducts = 250) {
  if (!collectionId) return [];
  const config = getVtexConfig();
  const skuIds = new Set();

  try {
    const pageSize = 50;
    const maxPages = Math.ceil(maxProducts / pageSize);

    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const url = `${config.baseUrl}/api/catalog_system/pub/products/search?fq=productClusterIds:${collectionId}&_from=${from}&_to=${to}`;

      const res = await vtexFetch(url);
      if (!res.ok) break;

      const products = await res.json();
      if (!Array.isArray(products) || products.length === 0) break;

      products.forEach((prod) => {
        (prod.items || []).forEach((item) => {
          if (item.itemId) skuIds.add(String(item.itemId));
        });
      });

      if (products.length < pageSize) break;
    }
  } catch (err) {
    console.error(`Error obteniendo SKUs de colección ${collectionId}:`, err.message);
  }

  return Array.from(skuIds);
}

/**
 * Simular precio de checkout en lote para múltiples SKUs (hasta 50 por llamada)
 * aplicando Promociones de Rates & Benefits (/api/checkout/pub/orderForms/simulation)
 * Retorna un Map de skuId -> { sellingPrice, listPrice, discountAmount, discountPct, promoName }
 */
export async function simulateBatchSkuPrices(skuIds) {
  if (!Array.isArray(skuIds) || skuIds.length === 0) return {};
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/checkout/pub/orderForms/simulation`;

  const itemsPayload = skuIds.slice(0, 50).map((id) => ({
    id: String(id),
    quantity: 1,
    seller: '1',
  }));

  try {
    const res = await vtexFetch(url, {
      method: 'POST',
      body: JSON.stringify({
        items: itemsPayload,
        country: 'NIC',
      }),
      initialDelay: 400,
    });

    if (!res.ok) return {};

    const data = await res.json();
    const items = data.items || [];
    const resultMap = {};

    items.forEach((item) => {
      const skuId = String(item.id);
      const listPrice = item.listPrice ? item.listPrice / 100 : (item.price ? item.price / 100 : 0);
      const sellingPrice = item.sellingPrice !== undefined ? item.sellingPrice / 100 : listPrice;
      const discountAmount = listPrice > sellingPrice ? listPrice - sellingPrice : 0;
      const discountPct = listPrice > 0 && discountAmount > 0 ? parseFloat(((discountAmount / listPrice) * 100).toFixed(1)) : 0;

      let promoName = null;
      if (item.priceTags && item.priceTags.length > 0) {
        promoName = item.priceTags[0].name || null;
      }
      if (!promoName && data.ratesAndBenefitsData?.rateAndBenefitsIdentifiers?.length > 0) {
        promoName = data.ratesAndBenefitsData.rateAndBenefitsIdentifiers[0].name || null;
      }

      resultMap[skuId] = {
        skuId,
        listPrice,
        sellingPrice,
        discountAmount,
        discountPct,
        promoName,
      };
    });

    return resultMap;
  } catch (err) {
    console.error('Error en simulación por lote de SKUs:', err);
    return {};
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

  try {
    const res = await vtexFetch(url, { initialDelay: 500 });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`VTEX Payments Error HTTP ${res.status}: ${errText}`);
    }

    return await res.json();
  } catch (err) {
    return { items: [], paging: { total: 0 } };
  }
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

  try {
    const res = await vtexFetch(url, { initialDelay: 500 });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

/**
 * Obtener detalle de una transacción individual desde VTEX Payments API (/api/pvt/transactions/{transactionId})
 */
export async function fetchVtexTransactionDetail(transactionId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/pvt/transactions/${transactionId}`;

  try {
    const res = await vtexFetch(url, { initialDelay: 500 });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Obtener historial de interacciones y logs del gateway para una transacción (/api/pvt/transactions/{transactionId}/interactions)
 */
export async function fetchVtexTransactionInteractions(transactionId) {
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/pvt/transactions/${transactionId}/interactions`;

  try {
    const res = await vtexFetch(url, { initialDelay: 500 });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
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
    const res = await vtexFetch(url);

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

  try {
    const res = await vtexFetch(url, { initialDelay: 500 });
    if (!res.ok) return null;

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
      productId: data.ProductId ? String(data.ProductId) : null,
      name: data.Name || data.SkuName || data.ProductName || `Mini Split Kit ${skuId}`,
      isActive: data.IsActive === true,
      displayOnSite: data.IsVisible === true || data.DisplayOnSite === true,
      isKit: data.IsKit === true,
      kitItems,
      imageUrl,
    };
  } catch (err) {
    return null;
  }
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
          productId: compDetails?.productId || null,
          name: compDetails?.name || compItem.name,
          quantity: compQty,
          isActive: compDetails?.isActive ?? true,
          displayOnSite: compDetails?.displayOnSite ?? false,
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
        productId: kitDetails.productId,
        name: kitDetails.name,
        isActive: kitDetails.isActive,
        displayOnSite: kitDetails.displayOnSite,
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

  // Importante: SINSA requiere que el Precio de Costo (costPrice) se iguale exactamente al Precio Base (basePrice)
  // para evitar exponer márgenes o costos reales en VTEX.
  const payload = {
    basePrice: numericPrice,
    costPrice: numericPrice,
  };

  if (currentPrice?.listPrice && currentPrice.listPrice >= numericPrice) {
    payload.listPrice = Number(currentPrice.listPrice);
  }

  const res = await vtexFetch(url, {
    method: 'PUT',
    body: JSON.stringify(payload),
    initialDelay: 500,
  });

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
}

/**
 * Activar o desactivar un SKU (Kit o Componente) en el catálogo de VTEX
 * Endpoint: PUT /api/catalog/pvt/stockkeepingunit/{skuId}
 */
export async function toggleSkuActiveStatus(skuId, activate = true) {
  const cleanSkuId = String(skuId).trim();
  const config = getVtexConfig();

  // 1. Obtener la definición completa del SKU desde el catálogo VTEX
  const getUrl = `${config.baseUrl}/api/catalog/pvt/stockkeepingunit/${cleanSkuId}`;
  const getRes = await vtexFetch(getUrl);

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`No se pudo obtener la información del SKU ${cleanSkuId} desde VTEX Catalog (HTTP ${getRes.status}: ${errText})`);
  }

  const skuData = await getRes.json();
  skuData.IsActive = Boolean(activate);
  skuData.ActivateIfPossible = Boolean(activate);

  // 2. Actualizar el estado IsActive / ActivateIfPossible en VTEX Catalog API
  const putRes = await vtexFetch(getUrl, {
    method: 'PUT',
    body: JSON.stringify(skuData),
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
 * Mostrar u ocultar el producto padre de un SKU en el sitio web VTEX.
 * El switch "Mostrar en el sitio web" del Admin corresponde a Product.IsVisible.
 * Endpoint: PUT /api/catalog/pvt/product/{productId}
 */
export async function toggleSkuDisplayOnSite(skuId, displayOnSite = true) {
  const cleanSkuId = String(skuId).trim();
  const config = getVtexConfig();

  const skuLookupUrl = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${cleanSkuId}`;
  const skuLookupRes = await vtexFetch(skuLookupUrl);

  if (!skuLookupRes.ok) {
    const errText = await skuLookupRes.text();
    throw new Error(`No se pudo obtener el ProductId del SKU ${cleanSkuId} desde VTEX (HTTP ${skuLookupRes.status}: ${errText})`);
  }

  const skuLookupData = await skuLookupRes.json();
  const productId = skuLookupData.ProductId || skuLookupData.IdProduct;

  if (!productId) {
    throw new Error(`VTEX no devolvió ProductId para el SKU ${cleanSkuId}.`);
  }

  const url = `${config.baseUrl}/api/catalog/pvt/product/${productId}`;
  const getRes = await vtexFetch(url);

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`No se pudo obtener el producto ${productId} del SKU ${cleanSkuId} desde VTEX Catalog (HTTP ${getRes.status}: ${errText})`);
  }

  const productData = await getRes.json();
  productData.IsVisible = Boolean(displayOnSite);

  const putRes = await vtexFetch(url, {
    method: 'PUT',
    body: JSON.stringify(productData),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Error al ${displayOnSite ? 'mostrar' : 'ocultar'} el producto ${productId} del SKU ${cleanSkuId} en el sitio web VTEX (HTTP ${putRes.status}: ${errText})`);
  }

  return {
    success: true,
    skuId: cleanSkuId,
    productId: String(productId),
    displayOnSite: Boolean(displayOnSite),
    message: `Producto ${productId} del SKU ${cleanSkuId} ${displayOnSite ? 'visible' : 'oculto'} en el sitio web VTEX.`,
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

/**
 * Consultar el correo real no enmascarado del cliente desde VTEX Profile System / MasterData CL
 */
export async function fetchRealClientEmail(userProfileId, maskedEmail = '') {
  if (!maskedEmail || !maskedEmail.includes('@ct.vtex.com.br')) {
    return maskedEmail || '';
  }

  if (!isVtexConfigured()) return '';

  const config = getVtexConfig();
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  // 1. Intentar por Profile System API con userProfileId
  if (userProfileId) {
    try {
      const url = `${config.baseUrl}/api/profile-system/pvt/profiles/${userProfileId}/personalData`;
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.email && !data.email.includes('@ct.vtex.com.br')) {
          return data.email;
        }
      }
    } catch (e) {}
  }

  // 2. Intentar por MasterData CL por userProfileId
  if (userProfileId) {
    try {
      const mdUrl = `${config.baseUrl}/api/dataentities/CL/search?_fields=email&userProfileId=${userProfileId}`;
      const resMd = await fetch(mdUrl, { method: 'GET', headers, cache: 'no-store' });
      if (resMd.ok) {
        const dataMd = await resMd.json();
        if (Array.isArray(dataMd) && dataMd.length > 0 && dataMd[0].email && !dataMd[0].email.includes('@ct.vtex.com.br')) {
          return dataMd[0].email;
        }
      }
    } catch (e) {}
  }

  return '';
}

/**
 * Obtener detalles completos de producto/SKU para exportación multimedia y publicidad
 * Endpoint: /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}
 */
const skuCatalogDetailCache = new Map();

export async function fetchFullProductCatalogDetail(skuId) {
  if (!skuId) return null;
  const cachedKey = String(skuId);
  if (skuCatalogDetailCache.has(cachedKey)) {
    return skuCatalogDetailCache.get(cachedKey);
  }

  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': config.appKey,
    'X-VTEX-API-AppToken': config.appToken,
  };

  try {
    const res = await fetch(url, { 
      method: 'GET', 
      headers, 
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });

    // Helper para garantizar imágenes HD master sin restricciones de miniatura
    const toHdImage = (imgUrl) => {
      if (!imgUrl || typeof imgUrl !== 'string') return imgUrl;
      return imgUrl.replace(/\/ids\/(\d+)(?:-\d+-\d+)?\//g, '/ids/$1/');
    };

    if (!res.ok) {
      const pdpUrl = `https://www.sinsa.com.ni/${skuId}/p`;
      return {
        skuId: String(skuId),
        productId: null,
        name: `SKU ${skuId}`,
        productName: `SKU ${skuId}`,
        description: '',
        rawDescription: '',
        pdpUrl,
        imageUrl: null,
        allImages: [],
        brand: '',
        category: '',
        isActive: true,
        refId: '',
      };
    }

    const data = await res.json();

    // Construcción de la URL del PDP con slug SEO y dominio completo www.sinsa.com.ni
    let pdpUrl = `https://www.sinsa.com.ni/${skuId}/p`;
    if (data.DetailUrl && !data.DetailUrl.endsWith(`/${skuId}/p`)) {
      const cleanPath = data.DetailUrl.startsWith('/') ? data.DetailUrl : `/${data.DetailUrl}`;
      pdpUrl = `https://www.sinsa.com.ni${cleanPath}`;
    } else {
      const prodTitle = (data.ProductName || data.Name || data.SkuName || '')
        .replace(/^&/, '')
        .replace(/^\*/, '')
        .trim();
      const slug = prodTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (slug) {
        pdpUrl = `https://www.sinsa.com.ni/${slug}-${skuId}/p`;
      }
    }

    // Imagen principal HD Master
    const rawImageUrl = data.ImageUrl || (data.Images && data.Images[0] ? data.Images[0].ImageUrl : null);
    const imageUrl = toHdImage(rawImageUrl);

    // Galería completa de imágenes HD Master
    const allImages = Array.isArray(data.Images)
      ? data.Images.map((img) => toHdImage(img.ImageUrl)).filter(Boolean)
      : (imageUrl ? [imageUrl] : []);

    // Descripción con HTML completo de VTEX
    const rawDescription = data.ProductDescription || data.Description || '';
    const cleanDescription = rawDescription
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Categoría
    let categoryPath = '';
    if (data.ProductCategories && typeof data.ProductCategories === 'object') {
      categoryPath = Object.values(data.ProductCategories).join(' > ');
    }

    const result = {
      skuId: String(data.Id || skuId),
      productId: data.ProductId ? String(data.ProductId) : null,
      name: data.Name || data.SkuName || data.ProductName || `SKU ${skuId}`,
      productName: data.ProductName || data.Name || `SKU ${skuId}`,
      description: rawDescription || cleanDescription,
      cleanDescription,
      rawDescription,
      pdpUrl,
      imageUrl,
      allImages,
      brand: data.BrandName || '',
      category: categoryPath,
      isActive: data.IsActive !== false,
      refId: data.RefId || '',
    };

    skuCatalogDetailCache.set(cachedKey, result);
    return result;
  } catch (err) {
    const pdpUrl = `https://www.sinsa.com.ni/${skuId}/p`;
    return {
      skuId: String(skuId),
      productId: null,
      name: `SKU ${skuId}`,
      productName: `SKU ${skuId}`,
      description: '',
      rawDescription: '',
      pdpUrl,
      imageUrl: null,
      allImages: [],
      brand: '',
      category: '',
      isActive: true,
      refId: '',
    };
  }
}







