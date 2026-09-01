import { NextResponse } from 'next/server';
import {
  isVtexConfigured,
  fetchMiniSplitKitsData,
  updateSkuBasePrice,
  toggleSkuActiveStatus,
  toggleSkuDisplayOnSite,
  discoverVtexKitSkus,
  DEFAULT_MINI_SPLIT_SKUS,
} from '@/lib/vtex';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado en las variables de entorno.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const customSkusParam = searchParams.get('skus');
    const shouldScan = searchParams.get('scan') === 'true';

    let skuList = [...DEFAULT_MINI_SPLIT_SKUS];

    // Sólo escanear catálogo completo VTEX si se solicita explícitamente con ?scan=true
    if (shouldScan) {
      const discoveredSkus = await discoverVtexKitSkus().catch(() => DEFAULT_MINI_SPLIT_SKUS);
      skuList = Array.from(new Set([...skuList, ...discoveredSkus]));
    }

    // Si Supabase está configurado, consultar SKUs Kit adicionales guardados en DB
    if (isSupabaseConfigured()) {
      try {
        let { data, error } = await supabaseAdmin
          .from('vtex_kits')
          .select('kit_sku_id')
          .eq('is_active', true);

        if (error) {
          // Fallback a la tabla previa vtex_mini_splits si aún no se ha creado vtex_kits
          const fallback = await supabaseAdmin
            .from('vtex_mini_splits')
            .select('kit_sku_id')
            .eq('is_active', true);
          data = fallback.data;
          error = fallback.error;
        }

        if (!error && Array.isArray(data) && data.length > 0) {
          const dbSkuIds = data.map((d) => String(d.kit_sku_id));
          skuList = Array.from(new Set([...skuList, ...dbSkuIds]));
        }
      } catch (dbErr) {
        console.warn('[MiniSplits API] Error al consultar DB:', dbErr.message);
      }
    }

    // Si el usuario pasa un parámetro explícito `skus=...`
    if (customSkusParam) {
      const explicitList = customSkusParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (explicitList.length > 0) {
        skuList = Array.from(new Set([...skuList, ...explicitList]));
      }
    }

    const kitsData = await fetchMiniSplitKitsData(skuList);

    // Calcular estadísticas resumidas para las KPI cards
    const totalKits = kitsData.length;
    const activeKits = kitsData.filter((k) => k.isActive).length;
    const readyKits = kitsData.filter((k) => k.status === 'READY').length;
    const kitsWithAlerts = kitsData.filter((k) => k.status !== 'READY').length;
    const priceMismatches = kitsData.filter((k) => Math.abs(k.priceDifference) > 1).length;
    const zeroStockKits = kitsData.filter((k) => k.maxBuildableStock <= 0).length;
    const inactiveComponentsKits = kitsData.filter((k) => k.status === 'COMPONENT_INACTIVE').length;

    return NextResponse.json({
      success: true,
      stats: {
        totalKits,
        activeKits,
        readyKits,
        kitsWithAlerts,
        priceMismatches,
        zeroStockKits,
        inactiveComponentsKits,
      },
      kits: kitsData,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API MiniSplits GET Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno al consultar Kits Mini Split' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, skuId, description, newBasePrice, activate, displayOnSite } = body;

    // ACCIÓN 1: MODIFICAR PRECIO BASE DE SKU (KIT O COMPONENTE)
    if (action === 'update_price') {
      if (!skuId || newBasePrice === undefined || newBasePrice === null) {
        return NextResponse.json(
          { success: false, error: 'Se requieren skuId y newBasePrice para modificar el precio.' },
          { status: 400 }
        );
      }

      const cleanSkuId = String(skuId).trim();
      const numPrice = Number(newBasePrice);

      const result = await updateSkuBasePrice(cleanSkuId, numPrice);

      // Si Supabase está habilitado, actualizar la tabla vtex_skus también
      if (isSupabaseConfigured()) {
        try {
          await supabaseAdmin
            .from('vtex_skus')
            .upsert({
              id: parseInt(cleanSkuId, 10),
              base_price: numPrice,
              price_updated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        } catch (dbErr) {
          console.warn('[MiniSplits API] No se pudo actualizar DB Supabase:', dbErr.message);
        }
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        skuId: cleanSkuId,
        newBasePrice: numPrice,
      });
    }

    // ACCIÓN 2: ACTIVAR O DESACTIVAR UN SKU (KIT O COMPONENTE) EN VTEX CATALOG
    if (action === 'toggle_active') {
      if (!skuId || activate === undefined || activate === null) {
        return NextResponse.json(
          { success: false, error: 'Se requieren skuId y activate (true/false) para cambiar el estado.' },
          { status: 400 }
        );
      }

      const cleanSkuId = String(skuId).trim();
      const result = await toggleSkuActiveStatus(cleanSkuId, Boolean(activate));

      if (isSupabaseConfigured()) {
        try {
          await supabaseAdmin
            .from('vtex_skus')
            .upsert({
              id: parseInt(cleanSkuId, 10),
              is_active: Boolean(activate),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        } catch (dbErr) {}
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        skuId: cleanSkuId,
        isActive: Boolean(activate),
      });
    }

    // ACCIÓN 3: MOSTRAR U OCULTAR UN SKU EN WEBSITE VTEX
    if (action === 'toggle_display_on_site') {
      if (!skuId || displayOnSite === undefined || displayOnSite === null) {
        return NextResponse.json(
          { success: false, error: 'Se requieren skuId y displayOnSite (true/false) para cambiar la visibilidad web.' },
          { status: 400 }
        );
      }

      const cleanSkuId = String(skuId).trim();
      const result = await toggleSkuDisplayOnSite(cleanSkuId, Boolean(displayOnSite));

      if (isSupabaseConfigured()) {
        try {
          await supabaseAdmin
            .from('vtex_skus')
            .upsert({
              id: parseInt(cleanSkuId, 10),
              display_on_site: Boolean(displayOnSite),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
        } catch (dbErr) {}
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        skuId: cleanSkuId,
        productId: result.productId,
        displayOnSite: Boolean(displayOnSite),
      });
    }

    // ACCIÓN 4: REGISTRAR UN NUEVO SKU KIT EN MONITOR
    if (action === 'add') {
      if (!skuId) {
        return NextResponse.json(
          { success: false, error: 'Se requiere skuId para registrar el Kit.' },
          { status: 400 }
        );
      }

      const cleanSkuId = String(skuId).trim();

      if (isSupabaseConfigured()) {
        const kitRecord = {
          kit_sku_id: parseInt(cleanSkuId, 10),
          description: description || `Kit SKU ${cleanSkuId}`,
          is_active: true,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        let { error } = await supabaseAdmin
          .from('vtex_kits')
          .upsert(kitRecord, { onConflict: 'kit_sku_id' });

        if (error) {
          // Fallback por si la tabla anterior vtex_mini_splits aún se usa
          const fallback = await supabaseAdmin
            .from('vtex_mini_splits')
            .upsert(kitRecord, { onConflict: 'kit_sku_id' });
          if (fallback.error) {
            throw new Error(`Error Supabase: ${error.message}`);
          }
        }
      }

      // Probar y retornar los datos del Kit recién agregado
      const singleKitData = await fetchMiniSplitKitsData([cleanSkuId]);

      return NextResponse.json({
        success: true,
        message: `Kit SKU ${cleanSkuId} agregado correctamente.`,
        kit: singleKitData[0] || null,
      });
    }

    // ACCIÓN 5: IMPORTACIÓN MASIVA DESDE EXCEL / CONSOLA (DETECCION DE DUPLICADOS)
    if (action === 'import_excel' || action === 'bulk_add') {
      const { skus } = body;
      if (!Array.isArray(skus) || skus.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Se requiere una lista de SKUs válida en la propiedad "skus".' },
          { status: 400 }
        );
      }

      // Normalizar lista recibida
      const parsedItems = skus
        .map((item) => {
          if (typeof item === 'object' && item !== null) {
            const skuId = String(item.skuId || item.kit_sku_id || item.sku || item.itemid || item.id || '').trim();
            const description = item.description || item.name || `Kit SKU ${skuId}`;
            return { skuId, description };
          }
          const skuId = String(item).trim();
          return { skuId, description: `Kit SKU ${skuId}` };
        })
        .filter((item) => Boolean(item.skuId) && !isNaN(Number(item.skuId)));

      const totalInFile = parsedItems.length;
      if (totalInFile === 0) {
        return NextResponse.json(
          { success: false, error: 'No se encontraron IDs de SKU válidos en el archivo proporcionado.' },
          { status: 400 }
        );
      }

      const existingSkuSet = new Set();

      // Consultar cuáles SKUs ya están guardados en Supabase
      if (isSupabaseConfigured()) {
        try {
          let { data, error } = await supabaseAdmin.from('vtex_kits').select('kit_sku_id');
          if (error) {
            const fallback = await supabaseAdmin.from('vtex_mini_splits').select('kit_sku_id');
            data = fallback.data;
          }
          if (Array.isArray(data)) {
            data.forEach((row) => existingSkuSet.add(String(row.kit_sku_id)));
          }
        } catch (dbErr) {
          console.warn('[Import Excel] Error al consultar SKUs existentes:', dbErr.message);
        }
      }

      // Filtrar sólo los SKUs que NO existen en la base de datos
      const newItems = parsedItems.filter((item) => !existingSkuSet.has(item.skuId));
      const existingCount = totalInFile - newItems.length;

      // Desduplicar dentro del mismo archivo Excel
      const uniqueNewItemsMap = new Map();
      newItems.forEach((item) => {
        if (!uniqueNewItemsMap.has(item.skuId)) {
          uniqueNewItemsMap.set(item.skuId, item);
        }
      });
      const uniqueNewItems = Array.from(uniqueNewItemsMap.values());

      let addedCount = 0;

      if (uniqueNewItems.length > 0 && isSupabaseConfigured()) {
        const recordsToInsert = uniqueNewItems.map((item) => ({
          kit_sku_id: parseInt(item.skuId, 10),
          description: item.description,
          is_active: true,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        let { error } = await supabaseAdmin
          .from('vtex_kits')
          .upsert(recordsToInsert, { onConflict: 'kit_sku_id' });

        if (error) {
          const fallback = await supabaseAdmin
            .from('vtex_mini_splits')
            .upsert(recordsToInsert, { onConflict: 'kit_sku_id' });

          if (fallback.error) {
            throw new Error(`Error Supabase al insertar Kits: ${error.message}`);
          }
        }
        addedCount = uniqueNewItems.length;
      }

      return NextResponse.json({
        success: true,
        message: `Importación completada: ${totalInFile} en archivo, ${existingCount} ya existían (omitidos), ${addedCount} nuevos SKUs registrados.`,
        summary: {
          totalInFile,
          existingCount,
          addedCount,
          addedSkus: uniqueNewItems.map((i) => i.skuId),
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'Acción no soportada.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[API MiniSplits POST Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
