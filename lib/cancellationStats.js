export function summarizeCancellationReasons(orders, details = {}) {
  const groups = new Map();
  const canceled = orders.filter((order) => order.status === 'canceled');
  for (const order of canceled) {
    const detail = details[order.orderId] || order;
    const candidates = [detail.cancelReason, detail.cancellationData?.reason,
      typeof detail.cancellationData === 'string' ? detail.cancellationData : null];
    const reason = candidates.find((value) => typeof value === 'string' && value.trim())
      ?.trim().replace(/\s+/g, ' ') || 'Sin motivo registrado';
    const key = reason.toLocaleLowerCase('es');
    const group = groups.get(key) || { reason, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    percentage: Number((group.count / canceled.length * 100).toFixed(1)),
  })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'es'));
}
