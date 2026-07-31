import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, getVtexConfig } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const vtexReady = isVtexConfigured();
    const supabaseReady = isSupabaseConfigured();
    const vtexConfig = getVtexConfig();

    let totalSkusInDb = 0;
    let activeSkusInDb = 0;
    let safetySkusInDb = 0;
    let lastUpdated = null;
    let dbError = null;

    if (supabaseReady) {
      // Conteo exacto total
      const { count, error } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact' })
        .limit(1);

      if (error) {
        dbError = error.message;
      } else {
        totalSkusInDb = count || 0;
      }

      // Conteo de SKUs activos (is_active !== false)
      const { count: activeCount } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact' })
        .neq('is_active', false)
        .limit(1);

      activeSkusInDb = activeCount || 0;

      // Conteo de SKUs con Stock de Seguridad configurado (> 0)
      const { count: safetyCount } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact' })
        .gt('safety_stock', 0)
        .limit(1);

      safetySkusInDb = safetyCount || 0;

      // Obtener la fecha más reciente de actualización de inventario o registro
      const { data: latestRecord } = await supabaseAdmin
        .from('vtex_skus')
        .select('inventory_updated_at, updated_at')
        .order('inventory_updated_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      if (latestRecord) {
        lastUpdated = latestRecord.inventory_updated_at || latestRecord.updated_at;
      }
    }

    return NextResponse.json({
      success: true,
      vtex: {
        configured: vtexReady,
        account: vtexConfig.account,
        environment: vtexConfig.environment,
      },
      supabase: {
        configured: supabaseReady,
        totalSkus: totalSkusInDb,
        activeSkus: activeSkusInDb,
        safetySkus: safetySkusInDb,
        lastUpdated,
        dbError,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
