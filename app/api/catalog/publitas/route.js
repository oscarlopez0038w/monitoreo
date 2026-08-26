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
    const format = searchParams.get('format') || 'json'; // 'json' | 'xlsx' | 'csv'
    const statusFilter = searchParams.get('status') || 'all'; // all, active, inactive
    const imageFilter = searchParams.get('hasImage') || 'all'; // all, yes, no
    const onlyDiscounts = searchParams.get('onlyDiscounts') === 'true'; // Solo los que tienen Antes / Oferta

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado' },
        { status: 400 }
      );
    }

    let targetSkuIds = [];
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

    if (!isExport && targetSkuIds.length === 0) {
      // Paginación estándar para vista previa en pantalla UI
      let query = supabaseAdmin.from('vtex_skus').select('*', { count: 'exact' });

      if (search) {
        const searchNum = parseInt(search, 10);
        if (!isNaN(searchNum)) query = query.eq('id', searchNum);
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
      // Exportación completa o Lote: Bucle de paginación por bloques de 1000 filas (100% de SKUs)
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

    // Cargar mapa de descripciones desde vtex_safety_stock en fragmentos
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

    // Procesar y mapear campos exactos para la especificación de Publitas
    const isLargeExport = isExport && skuRows.length > 300;
    const CONCURRENCY = isLargeExport ? 15 : 8;
    const publitasItems = [];

    for (let i = 0; i < (skuRows || []).length; i += CONCURRENCY) {
      const chunk = skuRows.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (row) => {
          let detail = null;
          if (!isLargeExport || skuRows.length <= 1000) {
            detail = await fetchFullProductCatalogDetail(row.id);
          }

          const fallbackDesc = safetyMap[row.id] || null;
          const title = detail?.name || detail?.productName || fallbackDesc || `SKU ${row.id}`;
          const bcnRate = 36.6243;

          // Precios (Venta base vs Lista antes)
          const basePriceNio = row.base_price ? Number(row.base_price) : 0;
          const listPriceNio = row.list_price ? Number(row.list_price) : basePriceNio;

          const basePriceUsd = basePriceNio ? Number((basePriceNio / bcnRate).toFixed(2)) : 0;
          const listPriceUsd = listPriceNio ? Number((listPriceNio / bcnRate).toFixed(2)) : basePriceUsd;

          // Porcentaje de Descuento
          let discountPct = 0;
          if (listPriceNio > basePriceNio && basePriceNio > 0) {
            discountPct = Math.round(((listPriceNio - basePriceNio) / listPriceNio) * 100);
          }

          const toHdImage = (imgUrl) => {
            if (!imgUrl || typeof imgUrl !== 'string') return imgUrl;
            return imgUrl.replace(/\/ids\/(\d+)(?:-\d+-\d+)?\//g, '/ids/$1/');
          };

          const totalStock = row.total_stock ?? row.total_quantity ?? 0;
          const availability = totalStock > 0 ? 'Disponible' : 'Agotado';
          const pdpUrl = detail?.pdpUrl || `https://www.sinsa.com.ni/${row.id}/p`;
          const imageUrl = toHdImage(detail?.imageUrl || null);
          const allImages = (detail?.allImages || (imageUrl ? [imageUrl] : [])).map(toHdImage);

          let customBadge = '';
          if (discountPct > 0) {
            customBadge = `AHORRA ${discountPct}%`;
          } else if (totalStock > 0) {
            customBadge = 'DISPONIBLE';
          }

          return {
            sku: String(row.id),
            id: row.id,
            title,
            description: detail?.description || fallbackDesc || '',
            link: pdpUrl,
            image_link: imageUrl || '',
            additional_image_link: (allImages.slice(1) || []).join(' | '),
            price: basePriceNio || 0,
            old_price: listPriceNio > basePriceNio ? listPriceNio : basePriceNio,
            price_formatted: basePriceNio ? `C$ ${basePriceNio.toLocaleString('es-NI')}` : 'Consultar',
            old_price_formatted: listPriceNio > basePriceNio ? `Antes C$ ${listPriceNio.toLocaleString('es-NI')}` : '',
            discount_percentage: discountPct > 0 ? `${discountPct}%` : '0%',
            discount_pct_num: discountPct,
            price_usd: basePriceUsd || 0,
            old_price_usd: listPriceUsd || 0,
            currency: 'NIO',
            brand: detail?.brand || 'SINSA',
            category: detail?.category || 'General',
            availability,
            stock_quantity: totalStock,
            wh1_stock: row.stock_wh1 ?? 0,
            wh2_stock: row.stock_wh2 ?? 0,
            custom_badge: customBadge,
            is_active: row.is_active !== false && detail?.isActive !== false,
          };
        })
      );
      publitasItems.push(...chunkResults);
    }

    // Filtrar por descuento si se solicitó
    let filteredItems = publitasItems;
    if (onlyDiscounts) {
      filteredItems = filteredItems.filter((item) => item.discount_pct_num > 0);
    }

    // Filtrar por imagen si se solicitó
    if (imageFilter === 'yes') {
      filteredItems = filteredItems.filter((item) => Boolean(item.image_link));
    } else if (imageFilter === 'no') {
      filteredItems = filteredItems.filter((item) => !item.image_link);
    }

    // EXPORTACIÓN A EXCEL NATIVO PUBLITAS (.xlsx)
    if (format === 'xlsx') {
      const excelRows = filteredItems.map((item) => ({
        'sku': item.sku,
        'title': item.title,
        'description': item.description,
        'link': item.link,
        'image_link': item.image_link,
        'additional_image_link': item.additional_image_link,
        'price': item.price,
        'old_price': item.old_price,
        'discount_percentage': item.discount_percentage,
        'currency': item.currency,
        'brand': item.brand,
        'category': item.category,
        'availability': item.availability,
        'stock_quantity': item.stock_quantity,
        'custom_badge': item.custom_badge,
        'status': item.is_active ? 'Activo' : 'Inactivo',
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      
      // Anchos optimizados para la plantilla de Publitas
      worksheet['!cols'] = [
        { wch: 12 }, // sku
        { wch: 42 }, // title
        { wch: 60 }, // description
        { wch: 55 }, // link
        { wch: 65 }, // image_link
        { wch: 65 }, // additional_image_link
        { wch: 14 }, // price
        { wch: 14 }, // old_price
        { wch: 15 }, // discount_percentage
        { wch: 10 }, // currency
        { wch: 22 }, // brand
        { wch: 30 }, // category
        { wch: 14 }, // availability
        { wch: 16 }, // stock_quantity
        { wch: 18 }, // custom_badge
        { wch: 12 }, // status
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Feed_Publitas_SINSA');

      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const fileName = `publitas_product_feed_${new Date().toISOString().slice(0, 10)}.xlsx`;

      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    // EXPORTACIÓN A CSV PUBLITAS (.csv)
    if (format === 'csv') {
      const csvHeader = 'sku,title,description,link,image_link,additional_image_link,price,old_price,discount_percentage,currency,brand,category,availability,stock_quantity,custom_badge';
      
      const csvRows = filteredItems.map((item) => {
        const esc = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
        return [
          item.sku,
          esc(item.title),
          esc(item.description),
          esc(item.link),
          esc(item.image_link),
          esc(item.additional_image_link),
          item.price,
          item.old_price,
          esc(item.discount_percentage),
          item.currency,
          esc(item.brand),
          esc(item.category),
          item.availability,
          item.stock_quantity,
          esc(item.custom_badge),
        ].join(',');
      });

      const csvContent = [csvHeader, ...csvRows].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="publitas_product_feed_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      items: filteredItems,
      total: totalCount || filteredItems.length,
      page,
      limit,
      totalPages: Math.ceil((totalCount || filteredItems.length) / limit),
      feedUrl: `${new URL(request.url).origin}/api/catalog/publitas?format=json`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
