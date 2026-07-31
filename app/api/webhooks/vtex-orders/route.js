import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { fetchVtexOrderDetail } from '@/lib/vtex';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST: Recepción de notificaciones Webhook de VTEX OMS en tiempo real
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    // VTEX envía notificaciones con llaves OrderId, orderId o id
    const orderId = body.OrderId || body.orderId || body.Id || body.id;

    // Si es un ping de prueba o validación de VTEX Hook sin OrderId
    if (!orderId) {
      return NextResponse.json({ success: true, message: 'Ping de validación Webhook recibido.' });
    }

    // 1. Consultar el detalle completo de la orden en VTEX OMS
    const orderDetail = await fetchVtexOrderDetail(orderId);

    if (!orderDetail) {
      return NextResponse.json({ success: false, error: `No se obtuvo información de la orden ${orderId}` });
    }

    // Extract client name & email safely
    const clientData = orderDetail.clientProfileData || {};
    const firstName = clientData.firstName || '';
    const lastName = clientData.lastName || '';
    const clientName = `${firstName} ${lastName}`.trim() || clientData.email || 'Cliente General';
    const clientEmail = clientData.email || null;

    // Items array mapping
    const items = (orderDetail.items || []).map((it) => ({
      id: it.id || it.sellerSku,
      name: it.name || it.skuName,
      quantity: it.quantity || 1,
      price: it.price ? it.price / 100 : 0,
      totalPrice: it.price && it.quantity ? (it.price * it.quantity) / 100 : 0,
    }));

    const orderRow = {
      order_id: orderDetail.orderId || orderId,
      sequence: String(orderDetail.sequence || ''),
      status: orderDetail.status || body.State || 'unknown',
      status_description: orderDetail.statusDescription || orderDetail.status || '',
      creation_date: orderDetail.creationDate || new Date().toISOString(),
      client_name: clientName,
      client_email: clientEmail,
      total_value: orderDetail.value ? orderDetail.value / 100 : 0,
      items: items,
      updated_at: new Date().toISOString(),
    };

    // 2. Guardar/Actualizar (upsert) en Supabase para gatillar Supabase Realtime WebSocket
    if (isSupabaseConfigured()) {
      const { error } = await supabaseAdmin
        .from('vtex_orders')
        .upsert(orderRow, { onConflict: 'order_id' });

      if (error) {
        console.error('Error al guardar orden webhook en Supabase:', error);
      }
    }

    return NextResponse.json({
      success: true,
      orderId: orderRow.order_id,
      status: orderRow.status,
      message: `Orden ${orderRow.order_id} procesada en tiempo real.`,
    });
  } catch (err) {
    console.error('Error procesando webhook VTEX OMS:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET: Verificación de salud del endpoint Webhook
export async function GET() {
  return NextResponse.json({
    status: 'online',
    endpoint: '/api/webhooks/vtex-orders',
    description: 'Receptor de notificaciones de órdenes VTEX OMS en tiempo real',
  });
}
