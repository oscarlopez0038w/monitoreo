import { NextResponse } from 'next/server';
import { getVtexConfig, isVtexConfigured } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function registerVtexWebhook(originUrl = 'https://monitoreo-ten.vercel.app') {
  if (!isVtexConfigured()) {
    return { success: false, error: 'VTEX no está configurado con credenciales válidas.' };
  }

  const config = getVtexConfig();
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
    const text1 = await res1.text().catch(() => '');
    registrationLogs.push({ system: 'VTEX Catalog System Feed', status: res1.status, ok: res1.ok, response: text1 });
  } catch (e) {
    registrationLogs.push({ system: 'VTEX Catalog System Feed', error: e.message });
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
    const text2 = await res2.text().catch(() => '');
    registrationLogs.push({ system: 'VTEX Pricing API Feed', status: res2.status, ok: res2.ok, response: text2 });
  } catch (e) {
    registrationLogs.push({ system: 'VTEX Pricing API Feed', error: e.message });
  }

  return {
    success: true,
    message: 'Registro de Webhook ejecutado en VTEX.',
    webhookUrl,
    details: registrationLogs,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const host = request.headers.get('host') || 'monitoreo-ten.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const siteUrl = `${protocol}://${host}`;

  const result = await registerVtexWebhook(siteUrl);

  // Si se solicita vía JSON o API
  if (searchParams.get('format') === 'json') {
    return NextResponse.json(result);
  }

  // Si se abre directamente en el navegador del usuario, renderizar pantalla de respuesta limpia
  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Registro de Webhook VTEX</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 2rem; max-width: 600px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
        h2 { color: #38bdf8; margin-top: 0; display: flex; align-items: center; gap: 0.5rem; }
        .badge { background: rgba(52, 211, 153, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); padding: 0.35rem 0.75rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; display: inline-block; margin-bottom: 1rem; }
        .code { background: #090d16; padding: 0.75rem 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; color: #a5b4fc; word-break: break-all; margin-bottom: 1.5rem; }
        .log-item { background: #0f172a; padding: 0.75rem; border-radius: 8px; margin-bottom: 0.5rem; font-size: 0.82rem; border-left: 4px solid #38bdf8; }
        .btn { display: inline-block; background: #38bdf8; color: #0f172a; font-weight: 700; text-decoration: none; padding: 0.65rem 1.25rem; border-radius: 8px; margin-top: 1rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>⚡ Registro de Webhook de Precios VTEX</h2>
        <div class="badge">✓ Vinculación Ejecutada en VTEX</div>
        <p>URL del Webhook vinculada:</p>
        <div class="code">${result.webhookUrl}</div>
        <h3>Detalles de respuesta de APIs de VTEX:</h3>
        ${(result.details || [])
          .map(
            (d) => `
          <div class="log-item">
            <strong>${d.system}</strong>: HTTP ${d.status || 'Error'} ${d.ok ? '✓ Exitoso' : '⚠️ Pendiente'}
          </div>
        `
          )
          .join('')}
        <a href="/precios" class="btn">← Volver al Módulo de Precios</a>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const siteUrl = body.siteUrl || 'https://monitoreo-ten.vercel.app';
  const result = await registerVtexWebhook(siteUrl);
  return NextResponse.json(result);
}
