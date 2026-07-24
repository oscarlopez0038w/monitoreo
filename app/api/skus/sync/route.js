import { NextResponse } from 'next/server';
import { fetchSkuPage, isVtexConfigured } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

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

    // 1. Obtener los IDs de SKU de la página desde VTEX
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

    // 2. Preparar los objetos a insertar en Supabase (id, is_active y timestamps)
    const rowsToUpsert = skuIds.map((id) => ({
      id: typeof id === 'number' ? id : parseInt(id, 10),
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    // 3. Upsert masivo en Supabase
    const { error: upsertError } = await supabaseAdmin
      .from('vtex_skus')
      .upsert(rowsToUpsert, { onConflict: 'id' });

    if (upsertError) {
      throw new Error(`Error insertando en Supabase: ${upsertError.message}`);
    }

    const isFinished = skuIds.length < pageSize;

    return NextResponse.json({
      success: true,
      page,
      fetchedSkus: skuIds.length,
      insertedCount: rowsToUpsert.length,
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
