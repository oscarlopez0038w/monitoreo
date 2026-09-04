import { NextResponse } from 'next/server';
import { fetchVtexPromotions, fetchVtexPromotionDetail, isVtexConfigured } from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let promotionsCache = null;
let promotionsCacheTime = 0;

export async function GET() {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    const now = Date.now();
    // Cache de 3 minutos para máxima velocidad y evitar llamadas repetitivas
    if (promotionsCache && now - promotionsCacheTime < 180000) {
      let skusWithPromoInDb = 0;
      if (isSupabaseConfigured()) {
        const { count } = await supabaseAdmin
          .from('vtex_skus')
          .select('id', { count: 'exact', head: true })
          .not('promo_name', 'is', null);
        skusWithPromoInDb = count || 0;
      }

      return NextResponse.json({
        ...promotionsCache,
        skusWithPromoInDb,
      });
    }

    const promos = await fetchVtexPromotions();
    const activePromos = promos.filter((p) => p.isCurrent);

    // Enriquecer las promociones activas con su detalle de descuento en lotes concurrentes de 15
    const batchSize = 15;
    const detailMap = new Map();

    for (let i = 0; i < activePromos.length; i += batchSize) {
      const chunk = activePromos.slice(i, i + batchSize);
      const details = await Promise.all(
        chunk.map((p) => fetchVtexPromotionDetail(p.id).catch(() => null))
      );
      details.forEach((d, idx) => {
        if (d && chunk[idx]) {
          detailMap.set(chunk[idx].id, {
            percentualDiscountValue: d.percentualDiscountValue || 0,
            nominalDiscountValue: d.nominalDiscountValue || 0,
            collections: d.collections || (d.collection ? [d.collection] : []),
            skusCount: Array.isArray(d.skus) ? d.skus.length : 0,
          });
        }
      });
    }

    const enrichedPromos = promos.map((p) => {
      const detail = detailMap.get(p.id);
      if (detail) {
        return {
          ...p,
          percentualDiscountValue: detail.percentualDiscountValue || p.percentualDiscountValue || 0,
          nominalDiscountValue: detail.nominalDiscountValue || p.nominalDiscountValue || 0,
          collections: detail.collections,
        };
      }
      return p;
    });

    let skusWithPromoInDb = 0;
    if (isSupabaseConfigured()) {
      const { count } = await supabaseAdmin
        .from('vtex_skus')
        .select('id', { count: 'exact', head: true })
        .not('promo_name', 'is', null);
      skusWithPromoInDb = count || 0;
    }

    const payload = {
      success: true,
      totalPromotions: enrichedPromos.length,
      activePromotionsCount: activePromos.length,
      promotions: enrichedPromos,
    };

    promotionsCache = payload;
    promotionsCacheTime = now;

    return NextResponse.json({
      ...payload,
      skusWithPromoInDb,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
