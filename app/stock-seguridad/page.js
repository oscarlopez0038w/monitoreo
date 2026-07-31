'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import SafetyStockPanel from '@/components/SafetyStockPanel';

export default function StockSeguridadPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <AppLayout>
      <main style={{ maxWidth: '1700px', margin: '0 auto', width: '100%' }}>
        {/* Módulo de Stock de Seguridad Exclusivo */}
        <SafetyStockPanel onSafetyStockUpdated={handleRefresh} />

        {/* Pie de página */}
        <footer style={{ textAlign: 'center', margin: '3rem 0 1rem 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          VTEX Catalogue Extractor • Módulo Stock de Seguridad • <strong>SINSA</strong>
        </footer>
      </main>
    </AppLayout>
  );
}
