import { NextResponse } from 'next/server';
import { fetchSkuPage, fetchSkuDetails, isVtexConfigured } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Las credenciales de VTEX (VTEX_APP_KEY y VTEX_APP_TOKEN) no están configuradas en .env.local',
        },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Supabase no está configurado correctamente en .env.local',
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const page = parseInt(body.page || '1', 10);
    const pageSize = parseInt(body.pageSize || '1000', 10);
    const includeDetails = body.includeDetails !== false; // Por defecto extrae nombres y metadatos

    // 1. Obtener los IDs de SKU de la página desde VTEX Catalog API
    const skuIds = await fetchSkuPage(page, pageSize);

    if (!skuIds || skuIds.length === 0) {
      return NextResponse.json({
        success: true,
        page,
        fetchedSkus: 0,
        insertedCount: 0,
        isFinished: true,
        message: 'No hay más SKUs por extraer en VTEX.',
      });
    }

    // 2. Extraer detalles de catálogo (nombre, refId, brand, category, isActive real)
    const detailsMap = new Map();
    if (includeDetails) {
      const CHUNK_SIZE = 25;
      for (let i = 0; i < skuIds.length; i += CHUNK_SIZE) {
        const chunk = skuIds.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunk.map((id) => fetchSkuDetails(id).catch(() => null))
        );
        chunkResults.forEach((det, idx) => {
          if (det) {
            detailsMap.set(String(chunk[idx]), det);
          }
        });
      }
    }

    // 3. Preparar filas para upsert en Supabase
    const nowIso = new Date().toISOString();
    const rowsToUpsert = skuIds.map((id) => {
      const numId = typeof id === 'number' ? id : parseInt(id, 10);
      const det = detailsMap.get(String(numId));

      const row = {
        id: numId,
        is_active: det ? det.isActive : true,
        updated_at: nowIso,
      };

      if (det) {
        row.name = det.name || null;
        row.ref_id = det.refId || null;
        row.brand = det.brand || null;
        row.category = det.category || null;
        row.catalog_updated_at = nowIso;
      }

      return row;
    });

    // 4. Upsert en lotes controlados a Supabase con reintento
    const DB_BATCH = 50;
    for (let i = 0; i < rowsToUpsert.length; i += DB_BATCH) {
      const batch = rowsToUpsert.slice(i, i + DB_BATCH);
      let success = false;
      let attempts = 0;
      while (!success && attempts < 3) {
        attempts++;
        const { error: upsertError } = await supabaseAdmin
          .from('vtex_skus')
          .upsert(batch, { onConflict: 'id' });

        if (!upsertError) {
          success = true;
        } else {
          if (attempts >= 3) {
            throw new Error(`Error insertando en Supabase: ${upsertError.message}`);
          }
          await new Promise((r) => setTimeout(r, 500 * attempts));
        }
      }
    }

    const isFinished = skuIds.length < pageSize;

    return NextResponse.json({
      success: true,
      page,
      fetchedSkus: skuIds.length,
      insertedCount: rowsToUpsert.length,
      enrichedWithDetails: includeDetails,
      isFinished,
      sampleSkuIds: skuIds.slice(0, 5),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
