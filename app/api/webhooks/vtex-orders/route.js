import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { fetchVtexOrderDetail, fetchRealClientEmail } from '@/lib/vtex';
import { sendGa4RefundEvent } from '@/lib/ga4';

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

    // Extraer datos del cliente
    const clientData = orderDetail.clientProfileData || {};
    const firstName = clientData.firstName || '';
    const lastName = clientData.lastName || '';
    const clientName = `${firstName} ${lastName}`.trim() || clientData.email || 'Cliente General';
    let clientEmail = clientData.email || null;

    if (clientEmail && clientEmail.includes('@ct.vtex.com.br') && clientData.userProfileId) {
      const real = await fetchRealClientEmail(clientData.userProfileId, clientEmail);
      if (real && !real.includes('@ct.vtex.com.br')) {
        clientEmail = real;
      }
    }

    // Extracción de datos de envío y entrega
    const logInfo = orderDetail.shippingData?.logisticsInfo?.[0];
    const channel = logInfo?.selectedDeliveryChannel || orderDetail.shippingData?.selectedAddresses?.[0]?.addressType || '';
    const isPickup = channel === 'pickup-in-point' || channel === 'pickup';
    const fulfillmentType = isPickup ? 'pickup' : 'delivery';
    const pickupStore = isPickup
      ? (logInfo?.pickupStoreInfo?.friendlyName || logInfo?.deliveryCompany || 'Retiro en Tienda')
      : '';

    const shippingVal = orderDetail.totals?.find((t) => t.id === 'Shipping')?.value;
    const shippingCost = shippingVal !== undefined ? shippingVal / 100 : 0;

    const addressJson = orderDetail.shippingData?.address || null;
    const marketingJson = orderDetail.marketingData || null;

    // Arreglo de ítems mapeados
    const items = (orderDetail.items || []).map((it) => ({
      id: it.id || it.sellerSku,
      name: it.name || it.skuName,
      quantity: it.quantity || 1,
      price: it.price ? it.price / 100 : 0,
      sellingPrice: it.sellingPrice ? it.sellingPrice / 100 : (it.price ? it.price / 100 : 0),
      listPrice: it.listPrice ? it.listPrice / 100 : (it.price ? it.price / 100 : 0),
      totalPrice: (it.sellingPrice || it.price ? (it.sellingPrice || it.price) * (it.quantity || 1) : 0) / 100,
    }));

    const statusClean = String(orderDetail.status || body.State || 'unknown').toLowerCase();
    const isCanceled = statusClean === 'canceled' || statusClean === 'cancel';

    // Verificar si la orden pasó por aprobación de pago previamente en VTEX OMS
    const statusHistory = orderDetail.statusHistory || [];
    const hasApprovedHistory = statusHistory.some((h) => {
      const st = String(typeof h === 'string' ? h : (h.status || '')).toLowerCase();
      return (
        st === 'payment-approved' ||
        st === 'ready-for-handling' ||
        st === 'handling' ||
        st === 'invoiced' ||
        st.includes('approved') ||
        st.includes('handling')
      );
    });

    const hasBeenApproved = Boolean(
      orderDetail.authorizedDate ||
      orderDetail.invoicedDate ||
      orderDetail.approvedBy ||
      hasApprovedHistory ||
      orderDetail.paymentData?.transactions?.[0]?.payments?.[0]?.connectorResponses?.authId
    );

    // OPCIÓN B: Si la orden está cancelada y NUNCA pasó por aprobación de pago (fallo de tarjeta en Checkout)
    if (isCanceled && !hasBeenApproved) {
      let existsInDb = false;
      if (isSupabaseConfigured()) {
        try {
          const { data: existingRow } = await supabaseAdmin
            .from('vtex_orders')
            .select('order_id')
            .eq('order_id', orderDetail.orderId || orderId)
            .maybeSingle();
          if (existingRow) {
            existsInDb = true;
          }
        } catch (e) {}
      }

      // Omitir solo si NO existe en Supabase. Si ya existía (ej. en estado pendiente), continuar para actualizar su estado a 'canceled'
      if (!existsInDb) {
        return NextResponse.json({
          success: true,
          ignored: true,
          orderId: orderDetail.orderId || orderId,
          message: `Orden ${orderDetail.orderId || orderId} omitida por ser un intento fallido de pago en Checkout.`,
        });
      }
    }

    let ga4RefundSent = false;
    let ga4RefundSentAt = null;

    // Verificar en Supabase si ya se notificó el refund a GA4 para esta orden
    if (isSupabaseConfigured()) {
      try {
        const { data: existingRow } = await supabaseAdmin
          .from('vtex_orders')
          .select('ga4_refund_sent, ga4_refund_sent_at')
          .eq('order_id', orderDetail.orderId || orderId)
          .maybeSingle();

        if (existingRow?.ga4_refund_sent) {
          ga4RefundSent = true;
          ga4RefundSentAt = existingRow.ga4_refund_sent_at;
        }
      } catch (e) {}
    }

    // 2. Notificar evento refund a GA4 SOLAMENTE si la orden estuvo aprobada previamente y fue cancelada/devuelta
    if (isCanceled && hasBeenApproved && !ga4RefundSent) {
      const ga4Res = await sendGa4RefundEvent({
        orderId: orderDetail.orderId || orderId,
        amount: orderDetail.value ? orderDetail.value / 100 : 0,
        currency: 'NIO',
        items: items,
      });

      if (ga4Res.success) {
        ga4RefundSent = true;
        ga4RefundSentAt = new Date().toISOString();
      }
    }

    const orderRow = {
      order_id: orderDetail.orderId || orderId,
      sequence: String(orderDetail.sequence || ''),
      status: orderDetail.status || body.State || 'unknown',
      status_description: isCanceled && !hasBeenApproved
        ? 'Intento de pago fallido en Checkout (no aprobada)'
        : (orderDetail.statusDescription || orderDetail.status || ''),
      creation_date: orderDetail.creationDate || new Date().toISOString(),
      client_name: clientName,
      client_email: clientEmail,
      total_value: orderDetail.value ? orderDetail.value / 100 : 0,
      fulfillment_type: fulfillmentType,
      pickup_store: pickupStore,
      shipping_cost: shippingCost,
      address_json: addressJson,
      marketing_json: marketingJson,
      items: items,
      detail_json: orderDetail,
      ga4_refund_sent: ga4RefundSent,
      ga4_refund_sent_at: ga4RefundSentAt,
      updated_at: new Date().toISOString(),
    };

    // 3. Guardar/Actualizar (upsert) en Supabase para gatillar Supabase Realtime WebSocket
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabaseAdmin
          .from('vtex_orders')
          .upsert(orderRow, { onConflict: 'order_id' });

        if (error) {
          // Fallback seguro por si la tabla vtex_orders aún no tiene las columnas adicionales en SQL
          const basicRow = {
            order_id: orderRow.order_id,
            sequence: orderRow.sequence,
            status: orderRow.status,
            status_description: orderRow.status_description,
            creation_date: orderRow.creation_date,
            client_name: orderRow.client_name,
            client_email: orderRow.client_email,
            total_value: orderRow.total_value,
            items: orderRow.items,
            updated_at: orderRow.updated_at,
          };
          await supabaseAdmin.from('vtex_orders').upsert(basicRow, { onConflict: 'order_id' });
        }
      } catch (errDb) {
        console.error('Error al guardar orden webhook en Supabase:', errDb);
      }
    }

    return NextResponse.json({
      success: true,
      orderId: orderRow.order_id,
      status: orderRow.status,
      ga4RefundSent: orderRow.ga4_refund_sent,
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
