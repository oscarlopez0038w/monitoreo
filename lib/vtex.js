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

      let wh1Quantity = 0;
      let wh2Quantity = 0;
      let totalQuantity = 0;

      balance.forEach((wh, index) => {
        const available = Math.max(0, (wh.totalQuantity || 0) - (wh.reservedQuantity || 0));
        if (index === 0) {
          wh1Quantity = available;
        } else if (index === 1) {
          wh2Quantity = available;
        }
        totalQuantity += available;
      });

      return {
        skuId,
        stockWh1: wh1Quantity,
        stockWh2: wh2Quantity,
        totalStock: totalQuantity,
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
