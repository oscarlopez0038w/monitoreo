'use client';

import { useState } from 'react';

const colors = { 'Social Selling': '#34d399', 'Orgánico': '#38bdf8', 'Facturadas': '#34d399', 'Lista para preparar': '#38bdf8', 'En preparación': '#fbbf24', 'Canceladas': '#fb7185', 'Otros estados': '#a78bfa', 'Contado': '#38bdf8', 'Tasa 0': '#fbbf24', 'Sin datos de pago': '#94a3b8' };

function Pie({ title, rows, metric, formatValue }) {
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  let offset = 0;
  return <div className="glass-card" style={{ padding: '1.25rem', minWidth: 0 }}>
    <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>{title}</h3>
    <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${metric === 'count' ? 'por cantidad' : 'por monto'}`} style={{ width: '100%', height: '210px' }}>
      {total <= 0 ? <circle cx="100" cy="100" r="85" fill="#334155" /> : rows.map(row => {
        const fraction = row[metric] / total;
        const start = offset * Math.PI * 2 - Math.PI / 2;
        offset += fraction;
        const end = offset * Math.PI * 2 - Math.PI / 2;
        const label = `${row.label}: ${formatValue(row[metric])} (${(fraction * 100).toFixed(1)}%)`;
        if (fraction <= 0) return null;
        return fraction >= 1 ? <circle key={row.label} cx="100" cy="100" r="85" fill={colors[row.label]}><title>{label}</title></circle> :
          <path key={row.label} fill={colors[row.label]} stroke="#111827" strokeWidth="2" d={`M100,100 L${100 + 85 * Math.cos(start)},${100 + 85 * Math.sin(start)} A85,85 0 ${fraction > 0.5 ? 1 : 0},1 ${100 + 85 * Math.cos(end)},${100 + 85 * Math.sin(end)} Z`}><title>{label}</title></path>;
      })}
    </svg>
    <p style={{ textAlign: 'center', fontWeight: 700, margin: '0.4rem 0 1rem' }}>Total: {formatValue(total)}</p>
    {rows.map(row => <div key={row.label} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', padding: '0.45rem 0', fontSize: '0.78rem', borderTop: '1px solid #ffffff12' }}>
      <span><span style={{ color: colors[row.label] }}>●</span> {row.label}</span>
      <span style={{ textAlign: 'right' }}>{formatValue(row[metric])} <strong style={{ color: colors[row.label] }}>· {total > 0 ? (row[metric] / total * 100).toFixed(1) : '0.0'}%</strong></span>
    </div>)}
    {total <= 0 && <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sin {metric === 'count' ? 'órdenes' : 'monto'} en este período.</p>}
  </div>;
}

export default function OrderDistributionCharts({ distribution, periodLabel, formatCurrency, exchangeRate }) {
  const [metric, setMetric] = useState('count');
  const formatValue = value => metric === 'count' ? `${value.toLocaleString('es-NI')} órdenes` : formatCurrency(value, value / exchangeRate);
  return <section style={{ marginBottom: '1.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      <div><h3 style={{ fontSize: '1rem' }}>Distribución de órdenes · {periodLabel}</h3>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.3rem' }}>Porcentajes sobre el total del período A, incluidas las canceladas. Monto bruto de las órdenes.</p></div>
      <div role="group" aria-label="Medida de los gráficos" style={{ display: 'flex', gap: '0.4rem' }}>
        {[['count', 'Por órdenes'], ['amount', 'Por monto']].map(([value, label]) => <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)} style={{ padding: '0.55rem 0.85rem', borderRadius: '8px', border: `1px solid ${metric === value ? '#38bdf8' : '#334155'}`, background: metric === value ? '#0c4a6e' : '#111827', color: '#e2e8f0', cursor: 'pointer' }}>{label}</button>)}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
      {[['channel', 'Canal de venta'], ['status', 'Estado de las órdenes'], ['purchase', 'Contado vs. Tasa 0']].map(([key, title]) => <Pie key={key} title={title} rows={distribution?.[key] || []} metric={metric} formatValue={formatValue} />)}
    </div>
  </section>;
}
