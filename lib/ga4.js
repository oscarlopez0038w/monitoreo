/**
 * Módulo de Integración con Google Analytics 4 (GA4) Measurement Protocol
 * Envío automático de eventos de devolución ("refund") a GA4
 */

export async function sendGa4RefundEvent({
  transactionId,
  orderId,
  amount,
  currency = 'NIO',
  items = [],
  clientId,
}) {
  const measurementId = process.env.GA4_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    return {
      success: false,
      skipped: true,
      error: 'Variables GA4_MEASUREMENT_ID y GA4_API_SECRET no están configuradas en .env.local',
    };
  }

  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

  // Formatear la lista de ítems según la especificación de GA4
  const formattedItems = (items || []).map((it) => ({
    item_id: String(it.id || it.skuId || it.refId || 'SKU-UNKNOWN'),
    item_name: String(it.name || it.skuName || 'Producto SINSA'),
    price: typeof it.unitPrice === 'number' ? it.unitPrice : (parseFloat(it.price) || 0),
    quantity: parseInt(it.quantity || 1, 10),
  }));

  // Generar ID de transacción y refund_id
  const targetTxId = String(orderId || transactionId || `TX-${Date.now()}`);
  const refundId = `REFUND-${transactionId || orderId || Date.now()}`;
  const cleanClientId = clientId || `sinsa.${targetTxId}.${Math.floor(Math.random() * 1000000)}`;

  const payload = {
    client_id: cleanClientId,
    events: [
      {
        name: 'refund',
        params: {
          transaction_id: targetTxId,
          refund_id: refundId,
          currency: currency || 'NIO',
          value: typeof amount === 'number' ? amount : (parseFloat(amount) || 0),
          items: formattedItems.length > 0 ? formattedItems : [
            {
              item_id: targetTxId,
              item_name: 'Devolución de Compra Web SINSA',
              price: typeof amount === 'number' ? amount : (parseFloat(amount) || 0),
              quantity: 1,
            },
          ],
        },
      },
    ],
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok || res.status === 204) {
      console.log(`GA4 Refund Event notificado exitosamente para la orden ${targetTxId}`);
      return { success: true, payload };
    } else {
      const errText = await res.text().catch(() => '');
      console.error(`Error enviando GA4 Refund Event (${res.status}):`, errText);
      return { success: false, status: res.status, error: errText };
    }
  } catch (err) {
    console.error('Error enviando evento refund a GA4:', err.message);
    return { success: false, error: err.message };
  }
}
