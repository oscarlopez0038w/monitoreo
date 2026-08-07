'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PricesTable from '@/components/PricesTable';
import PriceComparator from '@/components/PriceComparator';
import { Tag, Scale, Layers } from 'lucide-react';

export default function PreciosPage() {
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'comparator'

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        {/* Header Title & Tab Switcher */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 0.25rem 0' }}>
              <Tag size={24} color="#a5b4fc" />
              Gestión de Precios & Auditoría Xstore
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Consulta precios de lista y base, o compara el archivo de facturación Xstore contra la tienda Web.
            </p>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.3rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setActiveTab('catalog')}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: '9px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'catalog' ? 'var(--gradient-btn)' : 'transparent',
                color: activeTab === 'catalog' ? '#ffffff' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.2s ease',
              }}
            >
              <Layers size={16} /> Catálogo de Precios
            </button>

            <button
              onClick={() => setActiveTab('comparator')}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: '9px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeTab === 'comparator' ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'transparent',
                color: activeTab === 'comparator' ? '#ffffff' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.2s ease',
                boxShadow: activeTab === 'comparator' ? '0 4px 15px rgba(168, 85, 247, 0.3)' : 'none',
              }}
            >
              <Scale size={16} /> ⚖️ Comparador Xstore vs Web
            </button>
          </div>
        </div>

        {/* Tab 1: Catálogo de Precios Original e Intacto */}
        {activeTab === 'catalog' && <PricesTable />}

        {/* Tab 2: Comparador Independiente de Precios Xstore vs Web */}
        {activeTab === 'comparator' && <PriceComparator />}

        {/* Pie de Página */}
        <footer style={{ textAlign: 'center', margin: '3rem 0 1rem 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          VTEX Catalogue Extractor • Módulo de Precios & Auditoría Xstore • <strong>SINSA</strong>
        </footer>
      </main>
    </AppLayout>
  );
}
