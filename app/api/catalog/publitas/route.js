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

    // Procesar y mapear campos exactos para la especificación de Publitas
    const isLargeExport = isExport && skuRows.length > 300;
    const CONCURRENCY = isLargeExport ? 35 : 15;
    const publitasItems = [];

    for (let i = 0; i < (skuRows || []).length; i += CONCURRENCY) {
      const chunk = skuRows.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (row) => {
          const shouldFetchVtexDetail = !isExport || skuRows.length <= 250 || i < 250;
          const detail = shouldFetchVtexDetail ? await fetchFullProductCatalogDetail(row.id) : null;

          const fallbackDesc = row.name || null;
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

          let customBadge = '';
          if (discountPct > 0) {
            customBadge = `AHORRA ${discountPct}%`;
          } else if (totalStock > 0) {
            customBadge = 'DISPONIBLE';
          }

          const description = detail?.rawDescription || detail?.description || fallbackDesc || title;

          return {
            sku: String(row.id),
            id: row.id,
            title,
            description,
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
        'id': String(item.id || item.sku),
        'title': item.title,
        'link': item.link,
        'image link': item.image_link,
        'Additional image link': item.additional_image_link,
        'Description': item.description,
        'availability': (item.stock_quantity > 0 || item.availability === 'Disponible' || item.availability === 'in stock') ? 'In Stock' : 'Out of Stock',
        'Price': item.old_price || item.price,
        'Sale Price': item.price,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      
      // Anchos optimizados para la plantilla exacta de Publitas
      worksheet['!cols'] = [
        { wch: 14 }, // id
        { wch: 45 }, // title
        { wch: 65 }, // link
        { wch: 65 }, // image link
        { wch: 65 }, // Additional image link
        { wch: 80 }, // Description
        { wch: 14 }, // availability
        { wch: 14 }, // Price
        { wch: 14 }, // Sale Price
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
      const csvHeader = 'id\ttitle\tlink\timage link\tAdditional image link\tDescription\tavailability\tPrice\tSale Price';
      
      const csvRows = filteredItems.map((item) => {
        const esc = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
        const avail = (item.stock_quantity > 0 || item.availability === 'Disponible' || item.availability === 'in stock') ? 'In Stock' : 'Out of Stock';
        return [
          item.id || item.sku,
          esc(item.title),
          esc(item.link),
          esc(item.image_link),
          esc(item.additional_image_link),
          esc(item.description),
          avail,
          item.old_price || item.price,
          item.price,
        ].join('\t');
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
      totalPages: Math.ceil((totalCount || filteredItems.length) / limit) || 1,
      feedUrl: `${new URL(request.url).origin}/api/catalog/publitas?format=json`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
