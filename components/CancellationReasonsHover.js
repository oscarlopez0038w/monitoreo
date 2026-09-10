'use client';

import { useId, useState } from 'react';

export default function CancellationReasonsHover({ reasons = [], children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div style={{ position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column', alignSelf: 'stretch' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      {children}
      <button type="button" aria-expanded={open} aria-controls={id}
        aria-label="Ver motivos de cancelación"
        onClick={() => setOpen(!open)}
        style={{ position: 'absolute', bottom: '0.65rem', right: '0.65rem', background: 'transparent', border: 0, color: '#fb7185', cursor: 'pointer', fontSize: '0.9rem', width: '28px', height: '28px' }}>
        ⓘ
      </button>
      {open && <div id={id} role="region" aria-label="Motivos de cancelación"
        style={{ position: 'absolute', top: '100%', right: 0, width: '360px', maxWidth: 'calc(100vw - 40px)', zIndex: 100, padding: '1rem', borderRadius: '12px', background: '#111827', border: '1px solid #475569', boxShadow: '0 12px 32px #0008', color: '#e2e8f0' }}>
        <strong style={{ fontSize: '0.85rem' }}>Motivos de cancelación · Período A</strong>
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.4rem 0 0.7rem' }}>Cantidad y porcentaje sobre las órdenes canceladas.</p>
        <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
          {reasons.length === 0 ? <p style={{ fontSize: '0.8rem' }}>No hay cancelaciones en este período.</p> : reasons.map(({ reason, count, percentage }) => (
            <div key={reason} style={{ padding: '0.6rem 0', borderTop: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.78rem' }}>
                <span style={{ overflowWrap: 'anywhere' }}>{reason}</span>
                <strong style={{ whiteSpace: 'nowrap', color: '#fb7185' }}>{count} · {percentage}%</strong>
              </div>
              <div style={{ background: '#334155', height: '4px', borderRadius: '4px', marginTop: '0.4rem' }}>
                <div style={{ width: `${percentage}%`, background: '#fb7185', height: '100%', borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}
