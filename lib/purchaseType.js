export function extractTasaCeroInfo(orderDetail) {
  const payments = orderDetail?.paymentData?.transactions?.flatMap((tx) => tx.payments || []) || [];
  const searchableText = JSON.stringify(orderDetail?.paymentData || {}).toLowerCase();
  const installments = payments
    .map((payment) => Number(payment?.installments || payment?.installment || 0))
    .find((value) => Number.isFinite(value) && value > 1);
  const hasTasaCero =
    /\btasa\s*0\b/.test(searchableText) ||
    /\btasa\s*cero\b/.test(searchableText) ||
    /\bcero\s*inter[eé]s\b/.test(searchableText) ||
    /\b0\s*%\b/.test(searchableText) ||
    searchableText.includes('sin intereses') ||
    searchableText.includes('tasa0') ||
    searchableText.includes('0 interes') ||
    searchableText.includes('0 interés');

  if (!hasTasaCero && !installments) {
    return { isTasaCero: false, plazo: null };
  }

  return {
    isTasaCero: true,
    plazo: installments || null,
  };
}

