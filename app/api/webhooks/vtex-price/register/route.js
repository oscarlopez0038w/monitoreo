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

    // 1. Configurar Hook en VTEX Catalog Feed API
    const url = `${config.baseUrl}/api/catalog_system/pvt/changes/feed/config`;
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': config.appKey,
      'X-VTEX-API-AppToken': config.appToken,
    };

    const payload = {
      filter: {
        type: 'price',
      },
      hook: {
        url: webhookUrl,
        headers: {
          'X-Source': 'SINSA-Price-Monitoring',
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { success: false, error: `VTEX Error HTTP ${res.status}: ${errText}` },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Webhook registrado exitosamente en VTEX para notificar cambios de precios en tiempo real.`,
      webhookUrl,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Usa POST para registrar automáticamente la URL del Webhook en VTEX.',
  });
}
