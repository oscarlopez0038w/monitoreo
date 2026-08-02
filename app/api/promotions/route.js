import { NextResponse } from 'next/server';
import { isVtexConfigured, fetchVtexPromotions, simulateSkuPrice } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: Consultar todas las promociones regulares y descuentos de VTEX Rates & Benefits
export async function GET(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json({ success: false, error: 'VTEX no está configurado.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get('skuId');

    // Si se pasa un skuId, simular el carrito y devolver promociones aplicadas a ese SKU
    if (skuId) {
      const simulation = await simulateSkuPrice(skuId);
      return NextResponse.json({
        success: true,
        simulation,
      });
    }

    // Si no se pasa skuId, devolver el catálogo de promociones activas
    const promotions = await fetchVtexPromotions();
    return NextResponse.json({
      success: true,
      promotions,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
