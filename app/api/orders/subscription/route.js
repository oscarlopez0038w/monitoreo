import { NextResponse } from 'next/server';
import { isVtexConfigured, getVtexConfig } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST: Registrar / Actualizar el Hook de notificaciones en VTEX OMS API
export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado en las variables de entorno.' },
        { status: 400 }
      );
    }

    const config = getVtexConfig();
    const body = await request.json().catch(() => ({}));

    // URL de producción por defecto o provista en la petición
    const targetUrl = body.url || `https://${request.headers.get('host') || 'monitoreo.vercel.app'}/api/webhooks/vtex-orders`;

    const hookPayload = {
      filter: {
        status: [
          'order-created',
          'payment-approved',
          'ready-for-handling',
          'handling',
          'invoiced',
          'canceled',
        ],
      },
      hook: {
        headers: {
          'Content-Type': 'application/json',
        },
        url: targetUrl,
      },
    };

    const url = `${config.baseUrl}/api/oms/pvt/subscriptions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-VTEX-API-AppKey': config.appKey,
        'X-VTEX-API-AppToken': config.appToken,
      },
      body: JSON.stringify(hookPayload),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { success: false, error: `Error VTEX API Hook (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      targetUrl,
      message: `🎉 ¡Hook VTEX registrado exitosamente! Las órdenes se enviarán a ${targetUrl} en tiempo real.`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET: Consultar estado de la suscripción de Hook en VTEX OMS
export async function GET() {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado.' },
        { status: 400 }
      );
    }

    const config = getVtexConfig();
    const url = `${config.baseUrl}/api/oms/pvt/subscriptions`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-VTEX-API-AppKey': config.appKey,
        'X-VTEX-API-AppToken': config.appToken,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, configured: false });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, subscription: data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
