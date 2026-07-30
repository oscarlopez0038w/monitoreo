'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import SafetyStockPanel from '@/components/SafetyStockPanel';

export default function StockSeguridadPage() {
  const [stats, setStats] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <main style={{ maxWidth: '1700px', margin: '0 auto', padding: '1.5rem 1rem', width: '100%' }}>
      {/* Encabezado Principal */}
      <Header
        vtexStatus={stats?.vtex}
        supabaseStatus={stats?.supabase}
        onRefreshStats={handleRefresh}
      />

      {/* Módulo de Stock de Seguridad Exclusivo */}
      <SafetyStockPanel onSafetyStockUpdated={handleRefresh} />

      {/* Pie de página */}
      <footer style={{ textAlign: 'center', margin: '3rem 0 1rem 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
        VTEX Catalogue Extractor • Módulo Stock de Seguridad • <strong>SINSA</strong>
      </footer>
    </main>
  );
}
