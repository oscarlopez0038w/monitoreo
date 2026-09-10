import { extractTasaCeroInfo } from './purchaseType.js';

export function summarizeOrderDistribution(orders, details = {}, socialIds = new Set()) {
  const channel = new Map();
  const status = new Map();
  const purchase = new Map();
  const add = (map, label, amount) => {
    const item = map.get(label) || { label, count: 0, amount: 0 };
    item.count++;
    item.amount += amount;
    map.set(label, item);
  };
  const labels = { invoiced: 'Facturadas', 'ready-for-handling': 'Lista para preparar', handling: 'En preparación', canceled: 'Canceladas' };
  for (const order of orders) {
    const detail = details[order.orderId];
    const amount = Number(order.totalValue ?? detail?.value ?? 0) / 100;
    add(channel, socialIds.has(order.orderId) ? 'Social Selling' : 'Orgánico', amount);
    add(status, labels[order.status] || 'Otros estados', amount);
    const payment = detail?.paymentData || order.paymentData;
    add(purchase, !payment ? 'Sin datos de pago' : extractTasaCeroInfo({ paymentData: payment }).isTasaCero ? 'Tasa 0' : 'Contado', amount);
  }
  return { channel: [...channel.values()], status: [...status.values()], purchase: [...purchase.values()] };
}
