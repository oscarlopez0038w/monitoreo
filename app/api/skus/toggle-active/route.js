import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { toggleSkuActiveStatus, isVtexConfigured } from '@/lib/vtex';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { skuId, isActive } = body;

    if (!skuId) {
      return NextResponse.json({ success: false, error: 'El parámetro skuId es requerido.' }, { status: 400 });
    }

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ success: false, error: 'El parámetro isActive debe ser booleano (true/false).' }, { status: 400 });
    }

    const skuIdNum = parseInt(skuId, 10);
    let vtexStatus = 'skipped';
    let vtexError = null;

    // 1. Ejecutar activación / desactivación directa en VTEX Catalog API usando el helper probado de Kits
    if (isVtexConfigured()) {
      try {
        await toggleSkuActiveStatus(skuIdNum, isActive);
        vtexStatus = 'success';
      } catch (vErr) {
        vtexStatus = 'failed';
        vtexError = vErr.message;
        console.error(`Error al ${isActive ? 'activar' : 'desactivar'} SKU ${skuIdNum} en VTEX:`, vErr.message);
      }
    }

    // 2. Sincronizar y actualizar estado en Supabase
    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin
          .from('vtex_skus')
          .upsert({
            id: skuIdNum,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (dbErr) {
        console.error('Error actualizando BD Supabase:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      skuId: skuIdNum,
      is_active: isActive,
      vtexStatus,
      vtexError,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
