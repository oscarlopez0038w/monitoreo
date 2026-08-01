import { NextResponse } from 'next/server';
import { getVtexConfig, isVtexConfigured } from '@/lib/vtex';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!isVtexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'VTEX no está configurado con credenciales válidas.' },
        { status: 400 }
      );
    }

    const config = getVtexConfig();
    const body = await request.json().catch(() => ({}));
    const originUrl = body.siteUrl || 'https://monitoreo-ten.vercel.app';
    const webhookUrl = `${originUrl.replace(/\/$/, '')}/api/webhooks/vtex-price`;

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': config.appKey,
      'X-VTEX-API-AppToken': config.appToken,
    };

    const registrationLogs = [];

    // 1. Registrar en VTEX Catalog Changes Feed Hook (/api/catalog_system/pvt/changes/feed/config)
    try {
      const catalogUrl = `${config.baseUrl}/api/catalog_system/pvt/changes/feed/config`;
      const res1 = await fetch(catalogUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: { type: 'price' },
          hook: { url: webhookUrl, headers: { 'X-Source': 'SINSA-Price-Monitoring' } },
        }),
      });
      registrationLogs.push({ system: 'Catalog System Feed', status: res1.status, ok: res1.ok });
    } catch (e) {
      registrationLogs.push({ system: 'Catalog System Feed', error: e.message });
    }

    // 2. Registrar en VTEX Pricing Feed Hook (/api/pricing/pvt/feed/config)
    try {
      const pricingUrl = `${config.baseUrl}/api/pricing/pvt/feed/config`;
      const res2 = await fetch(pricingUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: { status: ['price_changed'] },
          hook: { url: webhookUrl, headers: { 'X-Source': 'SINSA-Price-Monitoring' } },
        }),
      });
      registrationLogs.push({ system: 'Pricing API Feed', status: res2.status, ok: res2.ok });
    } catch (e) {
      registrationLogs.push({ system: 'Pricing API Feed', error: e.message });
    }

    return NextResponse.json({
      success: true,
      message: `Intento de registro de Webhook de VTEX completado.`,
      webhookUrl,
      details: registrationLogs,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Usa POST para registrar automáticamente la URL del Webhook en los sistemas de VTEX.',
  });
}
