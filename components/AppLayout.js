'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Menu, X, Zap } from 'lucide-react';

export default function AppLayout({ children }) {
  const [stats, setStats] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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
              background: 'var(--gradient-btn)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.35)',
            }}
          >
            <Zap size={18} color="#ffffff" />
          </div>
          <div>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>SINSA VTEX</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', display: 'block', marginTop: '-2px' }}>Monitoring Platform</span>
          </div>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="btn-secondary"
          style={{ padding: '0.4rem 0.65rem', minHeight: '40px', minWidth: '40px', justifyContent: 'center' }}
          aria-label="Abrir Menú de Navegación"
        >
          {mobileOpen ? <X size={20} color="var(--accent-primary)" /> : <Menu size={20} color="#ffffff" />}
        </button>
      </header>

      {/* Main Container: Sidebar + Content */}
      <div style={{ display: 'flex', flex: 1, minWidth: 0, position: 'relative' }}>
        
        {/* Responsive Sidebar (Desktop sticky sidebar + Mobile Drawer Overlay) */}
        <Sidebar
          vtexStatus={stats?.vtex}
          supabaseStatus={stats?.supabase}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
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
