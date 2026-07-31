'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Receipt,
  Users,
  Share2,
  Globe,
  RefreshCw,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
} from 'lucide-react';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics');
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || 'Error cargando analíticas');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const renderTrendBadge = (changePct, isInverse = false) => {
    const isPositive = isInverse ? changePct < 0 : changePct >= 0;
    const IconComponent = changePct >= 0 ? TrendingUp : TrendingDown;
    const badgeClass = isPositive ? 'badge-emerald' : 'badge-rose';
    const sign = changePct > 0 ? '+' : '';

    return (
      <span
        className={`badge ${badgeClass}`}
        style={{
          padding: '0.25rem 0.6rem',
          fontSize: '0.78rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          fontWeight: 700,
        }}
      >
        <IconComponent size={14} />
        {sign}{changePct}%
      </span>
    );
  };

  const kpis = data?.kpis;
  const periods = data?.periods;
  const channels = data?.channels;
  const pipeline = data?.pipeline;

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        
        {/* Title Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              <TrendingUp size={24} color="#38bdf8" />
              Dashboard Ejecutivo de Ventas & Analytics Comparativo
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Comparación en tiempo real: <strong style={{ color: 'var(--accent-primary)' }}>{periods?.current?.label || 'Mes Actual'}</strong> vs. <span style={{ color: 'var(--text-dim)' }}>{periods?.previous?.label || 'Mes Anterior'}</span>.
            </p>
          </div>

          <button onClick={fetchAnalytics} disabled={loading} className="btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar Métricas
          </button>
        </div>

        {loading && !data ? (
          <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--accent-primary)' }} />
            <p style={{ fontWeight: 600, color: '#ffffff' }}>Calculando analíticas comparativas de VTEX OMS...</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Comparando mes actual contra el mismo período del mes anterior.</p>
          </div>
        ) : error ? (
          <div className="glass-card" style={{ padding: '2rem', border: '1px solid rgba(248, 113, 113, 0.4)', background: 'rgba(248, 113, 113, 0.08)', color: '#f87171' }}>
            <AlertTriangle size={24} style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontWeight: 600 }}>Error consultando métricas: {error}</p>
          </div>
        ) : (
          <>
            {/* 4 Main Executive KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              
              {/* Ventas Totales */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <DollarSign size={14} color="#34d399" /> Ventas Totales
                  </span>
                  {renderTrendBadge(kpis?.totalRevenue?.changePct || 0)}
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  C$ {(kpis?.totalRevenue?.current || 0).toLocaleString('es-NI')}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                  vs. C$ {(kpis?.totalRevenue?.previous || 0).toLocaleString('es-NI')} <span style={{ opacity: 0.7 }}>(Mes anterior)</span>
                </div>
              </div>

              {/* Total Órdenes */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ShoppingCart size={14} color="#38bdf8" /> Total de Órdenes
                  </span>
                  {renderTrendBadge(kpis?.totalOrders?.changePct || 0)}
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  {(kpis?.totalOrders?.current || 0).toLocaleString('es-NI')} órdenes
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                  vs. {(kpis?.totalOrders?.previous || 0).toLocaleString('es-NI')} órdenes <span style={{ opacity: 0.7 }}>(Mes anterior)</span>
                </div>
              </div>

              {/* Ticket Promedio */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Receipt size={14} color="#a5b4fc" /> Ticket Promedio
                  </span>
                  {renderTrendBadge(kpis?.avgTicket?.changePct || 0)}
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  C$ {(kpis?.avgTicket?.current || 0).toLocaleString('es-NI')}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                  vs. C$ {(kpis?.avgTicket?.previous || 0).toLocaleString('es-NI')} <span style={{ opacity: 0.7 }}>(Mes anterior)</span>
                </div>
              </div>

              {/* Tasa de Cancelación */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AlertTriangle size={14} color="#fb7185" /> Tasa Cancelación
                  </span>
                  {renderTrendBadge(kpis?.cancelRate?.changePct || 0, true)}
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  {kpis?.cancelRate?.current || 0}%
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                  vs. {kpis?.cancelRate?.previous || 0}% <span style={{ opacity: 0.7 }}>(Mes anterior)</span>
                </div>
              </div>

            </div>

            {/* Social Selling vs. Web Direct Breakdown Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              
              {/* Channel Attribution: Social Selling vs Web */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Share2 size={18} color="var(--accent-primary)" />
                  Ventas por Canal: Social Selling vs. Web Directa
                </h3>

                {/* Social Selling Progress Bar */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Users size={14} color="#34d399" /> Social Selling / Vendedores
                    </span>
                    <span style={{ color: '#34d399', fontWeight: 700 }}>
                      {channels?.socialSelling?.pct || 0}% (C$ {(channels?.socialSelling?.revenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })})
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '10px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${channels?.socialSelling?.pct || 0}%`, height: '100%', background: 'linear-gradient(to right, #34d399, #059669)', borderRadius: '5px', transition: 'width 0.6s ease' }} />
                  </div>
                </div>

                {/* Web Direct Progress Bar */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Globe size={14} color="#38bdf8" /> Web Directa / E-Commerce
                    </span>
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                      {channels?.webDirect?.pct || 0}% (C$ {(channels?.webDirect?.revenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })})
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '10px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${channels?.webDirect?.pct || 0}%`, height: '100%', background: 'linear-gradient(to right, #38bdf8, #0284c7)', borderRadius: '5px', transition: 'width 0.6s ease' }} />
                  </div>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.5', marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                  💡 <strong style={{ color: '#ffffff' }}>Atribución de Canal</strong>: Identifica las ventas provenientes de vendedores y campañas de Social Selling (UTMs, cupones y vendedores) frente al tráfico directo de la tienda.
                </p>
              </div>

              {/* Status & Fulfillment Pipeline */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Zap size={18} color="var(--accent-amber)" />
                  Embudo de Cumplimiento de Órdenes (Fulfillment)
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* Facturadas */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={16} color="#34d399" />
                      <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>Facturadas (Invoiced)</span>
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>
                      {pipeline?.invoiced || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span>
                    </span>
                  </div>

                  {/* Lista para Preparar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={16} color="#38bdf8" />
                      <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>Lista para Preparar (Ready)</span>
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>
                      {pipeline?.readyForHandling || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span>
                    </span>
                  </div>

                  {/* En Preparación */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={16} color="#fbbf24" />
                      <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>En Preparación (Handling)</span>
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fbbf24' }}>
                      {pipeline?.handling || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span>
                    </span>
                  </div>

                  {/* Canceladas */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.85rem', background: 'rgba(248, 113, 113, 0.08)', border: '1px solid rgba(248, 113, 113, 0.25)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertTriangle size={16} color="#fb7185" />
                      <span style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 600 }}>Canceladas (Canceled)</span>
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fb7185' }}>
                      {pipeline?.canceled || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span>
                    </span>
                  </div>

                </div>
              </div>

            </div>

          </>
        )}

      </main>
    </AppLayout>
  );
}
