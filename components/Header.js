'use client';

import { Database, Zap, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

export default function Header({ vtexStatus, supabaseStatus, onRefreshStats }) {
  return (
    <header className="glass-card" style={{ padding: '1.25rem 2rem', marginBottom: '2rem', borderRadius: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        
        {/* Brand & Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'var(--gradient-btn)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(56, 189, 248, 0.35)',
            }}
          >
            <Zap size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              VTEX SKU Extractor
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>SINSA</span> • Catalog System API Integration
            </p>
          </div>
        </div>

        {/* Integration Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          
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
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', borderRadius: '10px' }}
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
