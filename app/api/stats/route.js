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
      const { count, error } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact' });

      if (error) {
        dbError = error.message;
      } else {
        totalSkusInDb = count || 0;
      }

      // Obtener fecha del último SKU insertado/actualizado
      const { data: latestRecord } = await supabaseAdmin
        .from('vtex_skus')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (latestRecord && latestRecord.updated_at) {
        lastUpdated = latestRecord.updated_at;
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
