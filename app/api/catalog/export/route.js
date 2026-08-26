import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { fetchFullProductCatalogDetail } from '@/lib/vtex';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = (searchParams.get('search') || '').trim();
    const batchInput = (searchParams.get('batchSkus') || '').trim();
    const format = searchParams.get('format') || 'json';
    const statusFilter = searchParams.get('status') || 'all'; // all, active, inactive
    const imageFilter = searchParams.get('hasImage') || 'all'; // all, yes, no
    const onlyDiscounts = searchParams.get('onlyDiscounts') === 'true';

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado' },
        { status: 400 }
      );
    }

    let targetSkuIds = [];

    // Si se pasa una lista por lote
    if (batchInput) {
      targetSkuIds = batchInput
        .split(/[\s,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map((s) => parseInt(s, 10));
    }

    const isExport = format === 'xlsx' || format === 'csv';
    let skuRows = [];
    let totalCount = 0;

    if (!isExport) {
      // Paginación directa ultra rápida en SQL para vista previa UI en pantalla (<200ms)
      let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

      if (targetSkuIds.length > 0) {
        query = query.in('id', targetSkuIds);
      } else if (search) {
        const searchNum = parseInt(search, 10);
        if (!isNaN(searchNum)) query = query.eq('id', searchNum);
      }

      if (onlyDiscounts) {
        query = query.gt('list_price', 0);
      }

      if (statusFilter === 'active') query = query.eq('is_active', true);
      else if (statusFilter === 'inactive') query = query.eq('is_active', false);

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, count, error } = await query
        .order('id', { ascending: true })
        .range(from, to);

      if (error) throw new Error(error.message);
      skuRows = data || [];
      totalCount = count || skuRows.length;
    } else {
      // Exportación completa a Excel: Bucle de paginación por bloques de 1000 filas (100% de SKUs)
      const PAGE_SIZE = 1000;
      let p = 0;
      let hasMore = true;

      while (hasMore) {
        const from = p * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

        if (targetSkuIds.length > 0) {
          query = query.in('id', targetSkuIds);
        } else if (search) {
          const searchNum = parseInt(search, 10);
          if (!isNaN(searchNum)) query = query.eq('id', searchNum);
        }

        if (onlyDiscounts) {
          query = query.gt('list_price', 0);
        }

        if (statusFilter === 'active') query = query.eq('is_active', true);
        else if (statusFilter === 'inactive') query = query.eq('is_active', false);

        const { data, count, error } = await query
          .order('id', { ascending: true })
          .range(from, to);

        if (error) throw new Error(error.message);

        if (count !== null && count !== undefined) totalCount = count;

        if (data && data.length > 0) {
          skuRows = skuRows.concat(data);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            p++;
          }
        } else {
          hasMore = false;
        }
      }
    }

    // Cargar mapa completo de descripciones desde vtex_safety_stock en fragmentos
    let safetyMap = {};
    const skuIds = (skuRows || []).map((r) => r.id);

    if (skuIds.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < skuIds.length; i += CHUNK_SIZE) {
        const chunkIds = skuIds.slice(i, i + CHUNK_SIZE);
        const { data: safetyRows } = await supabaseAdmin
          .from('vtex_safety_stock')
          .select('sku_id, description')
          .in('sku_id', chunkIds);

        if (safetyRows) {
          safetyRows.forEach((s) => {
            safetyMap[s.sku_id] = s.description;
          });
        }
      }
    }

    // Enriquecer productos llamando a VTEX Catalog API (en paralelo con concurrencia optimizada)
    const isLargeCatalogExport = isExport && skuRows.length > 300;
    const CONCURRENCY = isLargeCatalogExport ? 35 : 15;
    const enrichedProducts = [];

    for (let i = 0; i < (skuRows || []).length; i += CONCURRENCY) {
      const chunk = skuRows.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (row) => {
          const shouldFetchVtexDetail = !isExport || skuRows.length <= 250 || i < 250;
          const detail = shouldFetchVtexDetail ? await fetchFullProductCatalogDetail(row.id) : null;

          const fallbackDesc = safetyMap[row.id] || null;
          const title = detail?.name || detail?.productName || fallbackDesc || `SKU ${row.id}`;
          const bcnRate = 36.6243;
          const basePriceNio = row.base_price ? Number(row.base_price) : 0;
          const basePriceUsd = basePriceNio ? Number((basePriceNio / bcnRate).toFixed(2)) : 0;
          const totalStock = row.total_stock ?? row.total_quantity ?? 0;

          const toHdImage = (imgUrl) => {
            if (!imgUrl || typeof imgUrl !== 'string') return imgUrl;
            return imgUrl.replace(/\/ids\/(\d+)(?:-\d+-\d+)?\//g, '/ids/$1/');
          };

          let pdpUrl = detail?.pdpUrl;
          if (!pdpUrl || pdpUrl.endsWith(`/${row.id}/p`)) {
            const cleanTitle = (title || '')
              .replace(/^&/, '')
              .replace(/^\*/, '')
              .trim();
            const slug = cleanTitle
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
            if (slug) {
              pdpUrl = `https://www.sinsa.com.ni/${slug}-${row.id}/p`;
            } else {
              pdpUrl = `https://www.sinsa.com.ni/${row.id}/p`;
            }
          }

          const imageUrl = toHdImage(detail?.imageUrl || null);
          const allImages = (detail?.allImages || (imageUrl ? [imageUrl] : [])).map(toHdImage);

          const listPriceNio = row.list_price ? Number(row.list_price) : (row.base_price ? Number(row.base_price) : 0);
          const listPriceUsd = listPriceNio ? Number((listPriceNio / bcnRate).toFixed(2)) : 0;
          const description = detail?.rawDescription || detail?.description || fallbackDesc || title;

          return {
            id: row.id,
            skuId: String(row.id),
            title,
            productName: detail?.productName || title,
            brand: detail?.brand || 'SINSA',
            category: detail?.category || '',
            pdpUrl,
            imageUrl,
            allImages,
            imageCount: allImages.length,
            description,
            refId: detail?.refId || '',
            isActive: row.is_active !== false && detail?.isActive !== false,
            basePriceNio,
            basePriceUsd,
            listPriceNio,
            listPriceUsd,
            price: basePriceNio,
            old_price: listPriceNio,
            totalStock,
            wh1Stock: row.stock_wh1 ?? 0,
            wh2Stock: row.stock_wh2 ?? 0,
            updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
          };
        })
      );
      enrichedProducts.push(...chunkResults);
    }

    // Filtrar por disponibilidad de imagen si se solicitó
    let filteredProducts = enrichedProducts;
    if (imageFilter === 'yes') {
      filteredProducts = filteredProducts.filter((p) => Boolean(p.imageUrl));
    } else if (imageFilter === 'no') {
      filteredProducts = filteredProducts.filter((p) => !p.imageUrl);
    }

    // Exportación en Excel (XLSX) para TODOS los SKUs
    if (format === 'xlsx') {
      const excelRows = filteredProducts.map((p) => ({
        'SKU ID': p.id,
        'Título / Nombre Producto': p.title,
        'URL Ficha (PDP)': p.pdpUrl,
        'URL Imagen Principal': p.imageUrl || 'SIN IMAGEN',
        'Cantidad Imágenes': p.imageCount,
        'Galería de Imágenes': (p.allImages || []).join(' | '),
        'Descripción Producto': p.description,
        'Marca': p.brand,
        'Categoría': p.category,
        'Estado VTEX': p.isActive ? 'ACTIVO' : 'INACTIVO',
        'Stock Total Disponible': p.totalStock,
        'Stock Mega': p.wh1Stock,
        'Stock CEDIS': p.wh2Stock,
        'Precio C$ (NIO)': p.basePriceNio || 0,
        'Precio $ (USD)': p.basePriceUsd || 0,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      
      worksheet['!cols'] = [
        { wch: 12 }, // SKU ID
        { wch: 40 }, // Título
        { wch: 50 }, // URL PDP
        { wch: 60 }, // URL Imagen
        { wch: 16 }, // Cantidad Imágenes
        { wch: 70 }, // Galería
        { wch: 60 }, // Descripción
        { wch: 20 }, // Marca
        { wch: 30 }, // Categoría
        { wch: 14 }, // Estado
        { wch: 20 }, // Stock Total
        { wch: 14 }, // Stock Mega
        { wch: 14 }, // Stock CEDIS
        { wch: 16 }, // Precio NIO
        { wch: 16 }, // Precio USD
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Catálogo_Publicidad_PDPs');

      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const fileName = `catalogo_publicidad_pdps_${new Date().toISOString().slice(0, 10)}.xlsx`;

      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    // Exportación CSV para TODOS los SKUs
    if (format === 'csv') {
      const csvRows = filteredProducts.map((p) => {
        const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
        return [
          p.id,
          escapeCsv(p.title),
          escapeCsv(p.pdpUrl),
          escapeCsv(p.imageUrl || ''),
          p.imageCount,
          escapeCsv((p.allImages || []).join(' | ')),
          escapeCsv(p.description),
          escapeCsv(p.brand),
          escapeCsv(p.category),
          p.isActive ? 'ACTIVO' : 'INACTIVO',
          p.totalStock,
          p.basePriceNio || 0,
          p.basePriceUsd || 0,
        ].join(',');
      });

      const csvHeader = 'SKU_ID,Titulo_Producto,URL_PDP,URL_Imagen_Principal,Cant_Imagenes,Galeria_Imagenes,Descripcion_Producto,Marca,Categoria,Estado,Stock_Total,Precio_NIO,Precio_USD';
      const csvContent = [csvHeader, ...csvRows].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="catalogo_publicidad_pdps_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      products: filteredProducts,
      total: totalCount || filteredProducts.length,
      page,
      limit,
      totalPages: Math.ceil((totalCount || filteredProducts.length) / limit) || 1,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
