'use client';

import AppLayout from '@/components/AppLayout';
import PromotionsPanel from '@/components/PromotionsPanel';
import { Gift } from 'lucide-react';

export default function PromocionesPage() {
  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(to right, #ffffff, #f472b6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: '0 0 0.25rem 0',
            }}
          >
            <Gift size={24} color="#ec4899" />
            Promociones & Precios Finales VTEX
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Auditoría de campañas y promociones Rates & Benefits, resolución de colecciones y cálculo de precio final de checkout.
          </p>
        </div>

        {/* Promotions Panel */}
        <PromotionsPanel />

        {/* Footer */}
        <footer style={{ textAlign: 'center', margin: '3rem 0 1rem 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          VTEX Catalogue Extractor • Módulo de Promociones Rates & Benefits • <strong>SINSA</strong>
        </footer>
      </main>
    </AppLayout>
  );
}
