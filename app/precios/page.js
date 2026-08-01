'use client';

import AppLayout from '@/components/AppLayout';
import PricesTable from '@/components/PricesTable';
import { Tag } from 'lucide-react';

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
            Consulta, audita y sincroniza los precios de lista (MSRP), precios base de venta y promociones con respuesta ultrarrápida desde Supabase y VTEX Pricing API.
          </p>
        </div>

        {/* High Performance Interactive Prices Table & KPI Summary */}
        <PricesTable />
      </main>
    </AppLayout>
  );
}
