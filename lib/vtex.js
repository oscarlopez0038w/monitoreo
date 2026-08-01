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
        // Exceso de llamadas -> Esperar e reintentar
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
        continue;
      }

      if (!res.ok) {
        return { skuId, isActive: true };
      }

      const data = await res.json();
      return {
        skuId,
        isActive: data.IsActive === true,
        name: data.Name || data.SkuName || null,
      };
    } catch (err) {
      if (retries <= 1) return { skuId, isActive: true };
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { skuId, isActive: true };
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
  const config = getVtexConfig();
  const url = `${config.baseUrl}/api/oms/pvt/orders/${orderId}`;

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

      // 1. Obtener Fixed Price (Canal Principal / Trade Policy 1)
      const fixedP = data.fixedPrices?.find((f) => String(f.tradePolicyId) === '1') || data.fixedPrices?.[0];

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

      const costPrice = data.costPrice !== undefined && data.costPrice !== null ? data.costPrice : null;

      return {
        skuId,
        listPrice,
        basePrice,
        costPrice,
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

