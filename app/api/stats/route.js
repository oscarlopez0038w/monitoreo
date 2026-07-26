import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, getVtexConfig } from '@/lib/vtex';

export async function GET() {
  try {
    const vtexReady = isVtexConfigured();
    const supabaseReady = isSupabaseConfigured();
    const vtexConfig = getVtexConfig();

    let totalSkusInDb = 0;
    let lastUpdated = null;
    let dbError = null;

    if (supabaseReady) {
      // Conteo exacto en PostgREST usando .limit(1) para leer el Content-Range exacto de PostgreSQL
      const { count, error } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact' })
        .limit(1);

      if (error) {
        dbError = error.message;
      } else {
        totalSkusInDb = count || 0;
      }

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
