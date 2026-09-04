import { NextResponse } from 'next/server';
import {
  fetchVtexPromotions,
  fetchVtexPromotionDetail,
  fetchCollectionSkus,
  simulateBatchSkuPrices,
  isVtexConfigured,
} from '@/lib/vtex';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120; // Hasta 2 minutos si el entorno lo permite

/**
 * Endpoint de sincronización de promociones y precios finales simulados
 * POST /api/promotions/sync
 * Body opcional:
 *   - promoId: ID de una promoción específica para sincronizar
 *   - offset: índice inicial de promociones activas a procesar
 *   - limit: cantidad de promociones a procesar en este lote (default: 20)
 */
export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase no está configurado.' },
        { status: 400 }
      );
    }

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }

    const { promoId, offset = 0, limit = 15 } = body;
    const now = new Date();

    // ----------------------------------------------------
    // MODO 1: Sincronizar una única promoción específica
    // ----------------------------------------------------
    if (promoId) {
      const detail = await fetchVtexPromotionDetail(promoId);
      if (!detail) {
        return NextResponse.json(
          { success: false, error: `No se encontró la promoción ${promoId} en VTEX Rates & Benefits.` },
          { status: 404 }
        );
      }

      const promoName = detail.name || `Promoción ${promoId}`;
      const targetSkuIds = new Set();

      // 1. Extraer SKUs directos
      if (Array.isArray(detail.skus)) {
        detail.skus.forEach((s) => {
          const id = typeof s === 'object' ? s.id : s;
          if (id) targetSkuIds.add(String(id));
        });
      }

      // 2. Extraer SKUs de colecciones vinculadas
      const collections = detail.collections || (detail.collection ? [detail.collection] : []);
      for (const col of collections) {
        const colId = typeof col === 'object' ? col.id : col;
        if (colId) {
          const colSkus = await fetchCollectionSkus(colId, 300);
          colSkus.forEach((id) => targetSkuIds.add(String(id)));
        }
      }

      const allSkus = Array.from(targetSkuIds);
      if (allSkus.length === 0) {
        return NextResponse.json({
          success: true,
          promoId,
          promoName,
          targetSkusCount: 0,
          simulatedCount: 0,
          updatedCount: 0,
          message: 'La promoción no tiene colecciones ni SKUs vinculados o activos.',
        });
      }

      // 3. Simular en lotes de hasta 50 SKUs
      const updates = [];
      const batchSize = 50;

      for (let i = 0; i < allSkus.length; i += batchSize) {
        const chunk = allSkus.slice(i, i + batchSize);
        const simulationMap = await simulateBatchSkuPrices(chunk);

        chunk.forEach((skuId) => {
          const sim = simulationMap[skuId];
          const nominalExpectedPct = detail.percentualDiscountValue || 0;

          const cleanPromoName =
            sim?.promoName && !sim.promoName.includes('@price')
              ? sim.promoName
              : promoName;

          if (sim) {
            updates.push({
              id: parseInt(skuId, 10),
              final_price: sim.sellingPrice,
              discount_pct: sim.discountPct > 0 ? sim.discountPct : nominalExpectedPct,
              promo_name: cleanPromoName,
              promo_id: promoId,
              promotions_updated_at: now.toISOString(),
            });
          } else {
            updates.push({
              id: parseInt(skuId, 10),
              discount_pct: nominalExpectedPct,
              promo_name: cleanPromoName,
              promo_id: promoId,
              promotions_updated_at: now.toISOString(),
            });
          }
        });
      }

      // 4. Guardar en Supabase vtex_skus
      if (updates.length > 0) {
        const dbBatchSize = 100;
        for (let i = 0; i < updates.length; i += dbBatchSize) {
          const subBatch = updates.slice(i, i + dbBatchSize);
          await supabaseAdmin.from('vtex_skus').upsert(subBatch, { onConflict: 'id' });
        }
      }

      return NextResponse.json({
        success: true,
        promoId,
        promoName,
        targetSkusCount: allSkus.length,
        simulatedCount: updates.length,
        updatedCount: updates.length,
        message: `Se actualizaron los precios finales y reglas de ${updates.length} SKUs para la promoción "${promoName}".`,
      });
    }

    // ----------------------------------------------------
    // MODO 2: Sincronización masiva de promociones vigentes hoy
    // ----------------------------------------------------
    const allPromos = await fetchVtexPromotions();
    const activePromos = allPromos.filter((p) => p.isCurrent);

    const totalActive = activePromos.length;
    const startIdx = Math.max(0, parseInt(offset, 10) || 0);
    const takeCount = Math.max(1, parseInt(limit, 10) || 15);
    const promosChunk = activePromos.slice(startIdx, startIdx + takeCount);
    const nextOffset = startIdx + promosChunk.length;
    const isCompleted = nextOffset >= totalActive;

    const skuPromoMap = new Map();
    const processedPromosSummary = [];

    // Resolver SKUs para cada promoción del lote
    for (const promo of promosChunk) {
      try {
        const detail = await fetchVtexPromotionDetail(promo.id);
        if (!detail) continue;

        const promoTargetSkus = new Set();

        // Extraer direct SKUs
        if (Array.isArray(detail.skus)) {
          detail.skus.forEach((s) => {
            const id = typeof s === 'object' ? s.id : s;
            if (id) promoTargetSkus.add(String(id));
          });
        }

        // Extraer colecciones
        const collections = detail.collections || (detail.collection ? [detail.collection] : []);
        for (const col of collections) {
          const colId = typeof col === 'object' ? col.id : col;
          if (colId) {
            const colSkus = await fetchCollectionSkus(colId, 250);
            colSkus.forEach((id) => promoTargetSkus.add(String(id)));
          }
        }

        const skuList = Array.from(promoTargetSkus);
        processedPromosSummary.push({
          id: promo.id,
          name: promo.name,
          skusCount: skuList.length,
          discountPct: detail.percentualDiscountValue || 0,
        });

        skuList.forEach((skuId) => {
          if (!skuPromoMap.has(skuId)) {
            skuPromoMap.set(skuId, {
              skuId,
              promoId: promo.id,
              promoName: promo.name,
              nominalDiscountPct: detail.percentualDiscountValue || 0,
            });
          }
        });
      } catch (err) {
        console.error(`Error procesando promoción ${promo.id}:`, err.message);
      }
    }

    const uniqueSkus = Array.from(skuPromoMap.values());
    const updates = [];

    // Simular precios de checkout en lotes de 50
    const simBatchSize = 50;
    for (let i = 0; i < uniqueSkus.length; i += simBatchSize) {
      const chunk = uniqueSkus.slice(i, i + simBatchSize);
      const skuIds = chunk.map((item) => item.skuId);
      const simMap = await simulateBatchSkuPrices(skuIds);

      chunk.forEach((item) => {
        const sim = simMap[item.skuId];
        const nominal = item.nominalDiscountPct || 0;

        const cleanPromoName =
          sim?.promoName && !sim.promoName.includes('@price')
            ? sim.promoName
            : item.promoName;

        if (sim && sim.sellingPrice > 0) {
          updates.push({
            id: parseInt(item.skuId, 10),
            final_price: sim.sellingPrice,
            discount_pct: sim.discountPct > 0 ? sim.discountPct : nominal,
            promo_name: cleanPromoName,
            promo_id: item.promoId,
            promotions_updated_at: now.toISOString(),
          });
        } else {
          updates.push({
            id: parseInt(item.skuId, 10),
            discount_pct: nominal,
            promo_name: cleanPromoName,
            promo_id: item.promoId,
            promotions_updated_at: now.toISOString(),
          });
        }
      });
    }

    // Upsert a Supabase vtex_skus
    if (updates.length > 0) {
      const dbBatchSize = 100;
      for (let i = 0; i < updates.length; i += dbBatchSize) {
        const subBatch = updates.slice(i, i + dbBatchSize);
        await supabaseAdmin.from('vtex_skus').upsert(subBatch, { onConflict: 'id' });
      }
    }

    return NextResponse.json({
      success: true,
      totalActivePromotions: totalActive,
      processedInBatch: promosChunk.length,
      currentOffset: startIdx,
      nextOffset,
      completed: isCompleted,
      targetSkusInBatch: uniqueSkus.length,
      updatedSkusCount: updates.length,
      promotions: processedPromosSummary,
    });
  } catch (error) {
    console.error('Error en POST /api/promotions/sync:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
