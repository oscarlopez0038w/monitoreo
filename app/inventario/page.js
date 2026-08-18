'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import SyncPanel from '@/components/SyncPanel';
import SkuTable from '@/components/SkuTable';

export default function InventarioPage() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchStats = async (isSilent = false) => {
    if (!isSilent && !stats) setLoadingStats(true);
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    } finally {
      if (!isSilent) setLoadingStats(false);
    }
  };

  useEffect(() => {
    const isSilent = Boolean(stats);
    fetchStats(isSilent);
  }, [refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <AppLayout>
      <main style={{ maxWidth: '1700px', margin: '0 auto', width: '100%' }}>
        {/* Control de Sincronización y Registro en Vivo */}
        <SyncPanel
          onSyncCompleted={handleRefresh}
          vtexReady={stats?.vtex?.configured}
          supabaseReady={stats?.supabase?.configured}
          initialTotalSkus={stats?.supabase?.totalSkus || 0}
          activeSkus={stats?.supabase?.activeSkus || 0}
          lastUpdated={stats?.supabase?.lastUpdated}
        />

        {/* Explorador y Tabla de SKUs */}
        <SkuTable onRefreshNeeded={handleRefresh} refreshTrigger={refreshTrigger} />

        {/* Pie de página minimalista */}
        <footer style={{ textAlign: 'center', margin: '3rem 0 1rem 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          VTEX Catalogue Extractor • Desarrollado para <strong>SINSA</strong> • Integración Supabase & API Rest
        </footer>
      </main>
    </AppLayout>
  );
}
