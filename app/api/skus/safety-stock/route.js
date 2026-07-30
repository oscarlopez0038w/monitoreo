import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

// GET: Obtener lista de Stock de Seguridad
export async function GET(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    let query = supabaseAdmin
      .from('vtex_safety_stock')
      .select('sku_id, description, safety_stock, updated_at');

    if (search.trim()) {
      const searchNum = parseInt(search.trim(), 10);
      if (!isNaN(searchNum)) {
        query = query.eq('sku_id', searchNum);
      } else {
        query = query.ilike('description', `%${search.trim()}%`);
      }
    }

    const { data, error } = await query.order('sku_id', { ascending: true }).limit(2000);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      data: data || [],
      total: (data || []).length,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// POST: Crear o actualizar (upsert) masivamente o de a un registro
export async function POST(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let items = body.items || [];

    // Si se envía un solo elemento en el body
    if (!Array.isArray(items) || items.length === 0) {
      if (body.skuId || body.sku_id || body.sku) {
        items = [body];
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se enviaron datos para procesar.' },
        { status: 400 }
      );
    }

    // Limpiar y mapear filas a insertar/actualizar
    const rowsToUpsert = items
      .map((item) => {
        const rawSku = item.skuId ?? item.sku_id ?? item.sku ?? item.SKU;
        const skuNum = parseInt(rawSku, 10);
        if (isNaN(skuNum)) return null;

        const description = item.description ?? item.descripcion ?? item.DESCRIPCION ?? item.Description ?? null;
        const rawSafety = item.safetyStock ?? item.safety_stock ?? item.stock_seguridad ?? item.STOCK_SEGURIDAD ?? 0;
        const safetyStock = parseInt(rawSafety, 10) || 0;

        return {
          sku_id: skuNum,
          description: description ? String(description).trim() : null,
          safety_stock: Math.max(0, safetyStock),
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (rowsToUpsert.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ninguna fila contenía un SKU válido.' },
        { status: 400 }
      );
    }

    // Deduplicar por sku_id para evitar el error de Postgres "ON CONFLICT DO UPDATE command cannot affect row a second time"
    const uniqueMap = new Map();
    for (const row of rowsToUpsert) {
      uniqueMap.set(row.sku_id, row);
    }
    const uniqueRowsToUpsert = Array.from(uniqueMap.values());

    // Insertar en lotes de 1000 registros
    const BATCH_SIZE = 1000;
    let totalUpserted = 0;

    for (let i = 0; i < uniqueRowsToUpsert.length; i += BATCH_SIZE) {
      const chunk = uniqueRowsToUpsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin
        .from('vtex_safety_stock')
        .upsert(chunk, { onConflict: 'sku_id' });

      if (error) throw new Error(`Error guardando en Supabase: ${error.message}`);
      totalUpserted += chunk.length;
    }

    return NextResponse.json({
      success: true,
      processedCount: totalUpserted,
      message: `Se guardaron ${totalUpserted.toLocaleString()} registros de Stock de Seguridad correctamente.`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// DELETE: Eliminar un registro de Stock de Seguridad
export async function DELETE(request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get('skuId') || searchParams.get('sku_id');

    if (!skuId) {
      return NextResponse.json(
        { success: false, error: 'Falta el parámetro skuId' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('vtex_safety_stock')
      .delete()
      .eq('sku_id', parseInt(skuId, 10));

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      message: `Registro de Stock de Seguridad para SKU ${skuId} eliminado.`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
