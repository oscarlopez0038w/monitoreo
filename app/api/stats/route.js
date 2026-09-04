import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { isVtexConfigured, getVtexConfig } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let STATS_CACHE = null;
let STATS_CACHE_TIME = 0;
const STATS_TTL_MS = 30 * 1000; // 30s TTL

export async function GET() {
  try {
    if (STATS_CACHE && Date.now() - STATS_CACHE_TIME < STATS_TTL_MS) {
      return NextResponse.json(STATS_CACHE);
    }

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
        .select('id', { count: 'exact', head: true })
        .gt('safety_stock', 0);

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

    const responsePayload = {
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
    };

    STATS_CACHE = responsePayload;
    STATS_CACHE_TIME = Date.now();

    return NextResponse.json(responsePayload);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
