'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import GlobalSyncBanner from '@/components/GlobalSyncBanner';
import { Menu, X, Zap } from 'lucide-react';

export default function AppLayout({ children }) {
  const [stats, setStats] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newTxCount, setNewTxCount] = useState(0);
  const pathname = usePathname();

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

  const checkNewTransactions = async () => {
    try {
      const res = await fetch('/api/transactions?limit=15');
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const latestTx = data.data[0];
        const latestKey = String(latestTx.key || latestTx.transactionId || '');
        const savedKey = typeof window !== 'undefined' ? localStorage.getItem('vtex_last_seen_tx_key') : null;

        if (!savedKey) {
          // Inicialización en la primera carga: guardar clave actual como vista
          if (typeof window !== 'undefined') {
            localStorage.setItem('vtex_last_seen_tx_key', latestKey);
          }
          setNewTxCount(0);
        } else if (savedKey !== latestKey) {
          // Contar transacciones nuevas en el lote
          let unreadIndex = data.data.findIndex(
            (tx) => String(tx.key || tx.transactionId || '') === savedKey
          );
          let count = unreadIndex === -1 ? data.data.length : unreadIndex;

          if (pathname === '/transacciones') {
            if (typeof window !== 'undefined') {
              localStorage.setItem('vtex_last_seen_tx_key', latestKey);
            }
            setNewTxCount(0);
          } else {
            setNewTxCount(count);
          }
        } else {
          if (pathname === '/transacciones') {
            setNewTxCount(0);
          }
        }
      }
    } catch (err) {
      console.error('Error verificando notificaciones de transacciones:', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    checkNewTransactions();
    // Polling cada 20 segundos para detectar nuevas transacciones que caigan en VTEX
    const interval = setInterval(checkNewTransactions, 20000);
    return () => clearInterval(interval);
  }, [pathname]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      
      {/* Mobile Top Navigation Header Bar (Visible on Mobile <= 768px) */}
      <header
        style={{
          display: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'rgba(11, 15, 25, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky',
          top: 0,
          zIndex: 60,
        }}
        className="mobile-header"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #38bdf8, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={18} color="#ffffff" />
          </div>
          <div>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', display: 'block', lineHeight: '1.1' }}>
              SINSA OMS
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Monitoreo Ejecutivo
            </span>
          </div>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            color: '#ffffff',
            padding: '0.45rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            minWidth: '44px',
            minHeight: '44px',
          }}
          aria-label="Abrir menú"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Main Body Container */}
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        
        {/* Responsive Sidebar (Desktop sticky sidebar + Mobile Drawer Overlay) */}
        <Sidebar
          vtexStatus={stats?.vtex}
          supabaseStatus={stats?.supabase}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          newTxCount={newTxCount}
        />

        {/* Main Content Area */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: '1.25rem 1.25rem 2.5rem 1.25rem',
            width: '100%',
          }}
          className="app-main-content"
        >
          {children}
        </div>
      </div>

      {/* Global Background Pricing Sync Floating Banner */}
      <GlobalSyncBanner />

      <style jsx global>{`
        @media (max-width: 768px) {
          .mobile-header {
            display: flex !important;
          }
          .app-main-content {
            padding: 1rem 0.85rem 2rem 0.85rem !important;
          }
        }
      `}</style>
    </div>
  );
}
