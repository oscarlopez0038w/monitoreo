'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function AppLayout({ children }) {
  const [stats, setStats] = useState(null);

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
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Persistent Left Sidebar */}
      <Sidebar vtexStatus={stats?.vtex} supabaseStatus={stats?.supabase} />

      {/* Main Content View Container */}
      <div style={{ flex: 1, minWidth: 0, padding: '1.5rem 1.5rem 2.5rem 1.5rem' }}>
        {children}
      </div>
    </div>
  );
}
