'use client';

import AppLayout from '@/components/AppLayout';
import CartSimulator from '@/components/CartSimulator';
import { Gift } from 'lucide-react';

export default function SimuladorPage() {
  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        {/* Header Title */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(to right, #ffffff, #e879f9)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            <Gift size={24} color="#e879f9" />
            Simulador de Carrito & Verificación de Regalías VTEX
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Carga un archivo Excel con la lista de SKUs a probar. El simulador agregará cada SKU por separado al checkout de VTEX para validar su disponibilidad, precio final y verificar si incluye regalías u obsequios automáticos.
          </p>
        </div>

        {/* Interactive Cart Simulator Module */}
        <CartSimulator />
      </main>
    </AppLayout>
  );
}
