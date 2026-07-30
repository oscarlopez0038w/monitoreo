'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Zap, ShieldCheck, AlertCircle, RefreshCw, Layers, ShieldAlert } from 'lucide-react';

export default function Header({ vtexStatus, supabaseStatus, onRefreshStats }) {
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isSafetyStock = pathname === '/stock-seguridad';

  return (
    <header className="glass-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem', borderRadius: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Brand & Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--gradient-btn)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(56, 189, 248, 0.35)',
                flexShrink: 0,
              }}
            >
              <Zap size={22} color="#ffffff" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                VTEX SKU Extractor
              </h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>SINSA</span> • Catalog System API Integration
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav style={{ display: 'flex', gap: '0.4rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.25rem', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginLeft: '0.5rem' }}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.84rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                background: isHome ? 'var(--gradient-btn)' : 'transparent',
                color: isHome ? '#ffffff' : 'var(--text-muted)',
                boxShadow: isHome ? '0 2px 10px rgba(56, 189, 248, 0.3)' : 'none',
              }}
            >
              <Layers size={15} />
              Inventario & SKUs
            </Link>
            <Link
              href="/stock-seguridad"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.84rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                background: isSafetyStock ? 'var(--gradient-btn)' : 'transparent',
                color: isSafetyStock ? '#ffffff' : 'var(--text-muted)',
                boxShadow: isSafetyStock ? '0 2px 10px rgba(56, 189, 248, 0.3)' : 'none',
              }}
            >
              <ShieldAlert size={15} color={isSafetyStock ? '#ffffff' : 'var(--accent-amber)'} />
              Stock de Seguridad
            </Link>
          </nav>
        </div>

        {/* Integration Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          
          {/* Active SKUs Stat Badge */}
          {typeof supabaseStatus?.activeSkus === 'number' && (
            <div className="badge badge-emerald" style={{ background: 'rgba(52, 211, 153, 0.15)', padding: '0.35rem 0.85rem', fontSize: '0.82rem', border: '1px solid rgba(52, 211, 153, 0.35)' }}>
              <ShieldCheck size={14} color="#34d399" />
              <span>SKUs Activos: <strong style={{ color: '#ffffff', fontWeight: 700 }}>{supabaseStatus.activeSkus.toLocaleString('es-NI')}</strong></span>
            </div>
          )}

          {/* VTEX Status */}
          <div className={`badge ${vtexStatus?.configured ? 'badge-emerald' : 'badge-amber'}`}>
            {vtexStatus?.configured ? <ShieldCheck size={14} /> : <AlertCircle size={14} />}
            VTEX: {vtexStatus?.configured ? 'Conectado' : 'Pendiente .env.local'}
          </div>

          {/* Supabase Status */}
          <div className={`badge ${supabaseStatus?.configured ? 'badge-emerald' : 'badge-amber'}`}>
            <Database size={14} />
            Supabase: {supabaseStatus?.configured ? 'Conectado' : 'Sin Configurar'}
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefreshStats}
            className="btn-secondary"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', borderRadius: '10px' }}
            title="Recargar estado"
          >
            <RefreshCw size={14} />
            Actualizar
          </button>
        </div>

      </div>
    </header>
  );
}
