'use client';

import AppLayout from '@/components/AppLayout';
import { Tag, ShieldCheck, DollarSign, Database, AlertCircle } from 'lucide-react';

export default function PreciosPage() {
  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        {/* Header Title */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            <Tag size={24} color="#a5b4fc" />
            Gestión de Precios & Listas de Precios VTEX
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Módulo para consultar y auditar precios base, precios de lista y promociones registradas en VTEX Pricing API.
          </p>
        </div>

        {/* Feature Banner */}
        <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '700px', margin: '3rem auto' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '16px',
              background: 'rgba(165, 180, 252, 0.12)',
              border: '1px solid rgba(165, 180, 252, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem auto',
            }}
          >
            <DollarSign size={30} color="#a5b4fc" />
          </div>

          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
            Módulo de Precios VTEX Habilitado
          </h3>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1.5rem' }}>
            Los precios de tus SKUs se sincronizan automáticamente con las listas de precios en VTEX Pricing API. Pronto podrás auditar discrepancias entre listas públicas y precios base directamente desde este panel.
          </p>

          <div style={{ display: 'inline-flex', gap: '0.5rem' }} className="badge badge-emerald">
            <ShieldCheck size={14} /> Módulo listo para sincronización de Pricing API
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
