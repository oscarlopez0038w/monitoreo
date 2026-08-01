'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { getNicaraguaNow } from '@/lib/dateUtils';
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
  Filter,
} from 'lucide-react';

export default function DashboardPage() {
  const nicNow = getNicaraguaNow();

  // Período A por defecto: Mes Actual (inicio de mes hasta hoy)
  const [startDateA, setStartDateA] = useState(nicNow.firstDayStr);
  const [endDateA, setEndDateA] = useState(nicNow.todayStr);

  // Período B por defecto: Mes Anterior Completo
  let pY = nicNow.year;
  let pM = nicNow.month - 1;
  if (pM < 0) {
    pM = 11;
    pY -= 1;
  }
  const pMStr = String(pM + 1).padStart(2, '0');
  const lastDayPM = new Date(pY, pM + 1, 0).getDate();
  const defaultStartB = `${pY}-${pMStr}-01`;
  const defaultEndB = `${pY}-${pMStr}-${String(lastDayPM).padStart(2, '0')}`;

  const [startDateB, setStartDateB] = useState(defaultStartB);
  const [endDateB, setEndDateB] = useState(defaultEndB);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchAnalytics = async (sA = startDateA, eA = endDateA, sB = startDateB, eB = endDateB) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDateA: sA,
        endDateA: eA,
        startDateB: sB,
        endDateB: eB,
      });
      const res = await fetch(`/api/analytics?${params.toString()}`);
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
    fetchAnalytics(startDateA, endDateA, startDateB, endDateB);
  }, []);

  // Función para aplicar presets rápidos de fecha
  const applyPreset = (presetKey) => {
    let sA = nicNow.firstDayStr;
    let eA = nicNow.todayStr;
    let sB = defaultStartB;
    let eB = defaultEndB;

    if (presetKey === 'current_vs_prev_full') {
      sA = nicNow.firstDayStr;
      eA = nicNow.todayStr;
      sB = defaultStartB;
      eB = defaultEndB;
    } else if (presetKey === 'current_vs_prev_mtd') {
      sA = nicNow.firstDayStr;
      eA = nicNow.todayStr;
      sB = defaultStartB;
      eB = `${pY}-${pMStr}-${String(Math.min(nicNow.day, lastDayPM)).padStart(2, '0')}`;
    } else if (presetKey === 'prev_vs_two_ago') {
      // Mes Pasado vs Antepasado
      sA = defaultStartB;
      eA = defaultEndB;

      let pY2 = pY;
      let pM2 = pM - 1;
      if (pM2 < 0) {
        pM2 = 11;
        pY2 -= 1;
      }
      const pM2Str = String(pM2 + 1).padStart(2, '0');
      const lastDayPM2 = new Date(pY2, pM2 + 1, 0).getDate();
      sB = `${pY2}-${pM2Str}-01`;
      eB = `${pY2}-${pM2Str}-${String(lastDayPM2).padStart(2, '0')}`;
    }

    setStartDateA(sA);
    setEndDateA(eA);
    setStartDateB(sB);
    setEndDateB(eB);

    fetchAnalytics(sA, eA, sB, eB);
  };

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
              Comparación en tiempo real: <strong style={{ color: 'var(--accent-primary)' }}>{periods?.current?.label || 'Período A'}</strong> vs. <span style={{ color: '#38bdf8', fontWeight: 600 }}>{periods?.previous?.label || 'Período B'}</span>.
            </p>
          </div>

          <button onClick={() => fetchAnalytics()} disabled={loading} className="btn-secondary" style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar Métricas
          </button>
        </div>

        {/* Dynamic Compact Dual Date Range Picker Bar */}
        <div className="glass-card" style={{ padding: '0.85rem 1.15rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            
            {/* Row 1: Header Title & Quick Preset Pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>
                <Calendar size={15} color="var(--accent-primary)" />
                <span>Comparar Rangos de Fechas:</span>
              </div>

              {/* Botones de Presets Rápidos en formato Píldoras Compactas */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => applyPreset('current_vs_prev_full')}
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', borderRadius: '999px' }}
                >
                  ⚡ Mes Actual vs. Mes Anterior Completo
                </button>
                <button
                  onClick={() => applyPreset('current_vs_prev_mtd')}
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.3)', borderRadius: '999px' }}
                >
                  ⚡ Mes Actual vs. Mismísimos Días (MTD)
                </button>
                <button
                  onClick={() => applyPreset('prev_vs_two_ago')}
                  className="btn-secondary"
                  style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', color: '#a5b4fc', borderColor: 'rgba(165, 180, 252, 0.3)', borderRadius: '999px' }}
                >
                  ⚡ Mes Anterior vs. Antepasado
                </button>
              </div>
            </div>

            {/* Row 2: Compact Inline Date Pickers (Período A vs Período B) */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: 1 }}>
                
                {/* Período A */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(56, 189, 248, 0.08)', padding: '0.3rem 0.6rem', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', whiteSpace: 'nowrap' }}>
                    🔵 Período A:
                  </span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.45rem', minHeight: '32px' }}
                    value={startDateA}
                    onChange={(e) => setStartDateA(e.target.value)}
                  />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>a</span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.45rem', minHeight: '32px' }}
                    value={endDateA}
                    onChange={(e) => setEndDateA(e.target.value)}
                  />
                </div>

                <span style={{ color: 'var(--text-dim)', fontWeight: 700, fontSize: '0.82rem', padding: '0 0.2rem' }}>vs.</span>

                {/* Período B */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(129, 140, 248, 0.08)', padding: '0.3rem 0.6rem', borderRadius: '10px', border: '1px solid rgba(129, 140, 248, 0.25)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc', whiteSpace: 'nowrap' }}>
                    🟣 Período B:
                  </span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.45rem', minHeight: '32px' }}
                    value={startDateB}
                    onChange={(e) => setStartDateB(e.target.value)}
                  />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>a</span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.45rem', minHeight: '32px' }}
                    value={endDateB}
                    onChange={(e) => setEndDateB(e.target.value)}
                  />
                </div>

              </div>

              {/* Botón Aplicar Filtrado */}
              <button
                onClick={() => fetchAnalytics(startDateA, endDateA, startDateB, endDateB)}
                disabled={loading}
                className="btn-primary"
                style={{ padding: '0.4rem 1.15rem', fontSize: '0.8rem', minHeight: '34px', flexShrink: 0 }}
              >
                <Filter size={14} />
                {loading ? 'Consultando...' : 'Aplicar Comparación'}
              </button>

            </div>
          </div>
        </div>

        {/* Global Loading & Error Status Banners */}
        {loading && (
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 0.75rem auto' }} />
            Obteniendo analíticas y analizando 100% de órdenes del Período A y B...
          </div>
        )}

        {error && (
          <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', color: '#fb7185', marginBottom: '1.5rem', fontSize: '0.88rem' }}>
            ⚠️ <strong>Error en métricas:</strong> {error}
          </div>
        )}

        {/* Analytics Main Dashboard Grid */}
        {data && !loading && (
          <>
            {/* Top 4 Key Executive Performance Indicators (KPI Cards) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              
              {/* Ventas Totales */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <DollarSign size={14} color="#34d399" /> Ventas Totales <span style={{ fontSize: '0.68rem', color: '#34d399' }}>(excl. canceladas)</span>
                  </span>
                  {renderTrendBadge(kpis?.totalRevenue?.changePct || 0)}
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  C$ {(kpis?.totalRevenue?.current || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                  vs. C$ {(kpis?.totalRevenue?.previous || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })} <span style={{ opacity: 0.7 }}>({periods?.previous?.label || 'Período B'})</span>
                </div>
              </div>

              {/* Total de Órdenes */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ShoppingCart size={14} color="#38bdf8" /> Total de Órdenes
                  </span>
                  {renderTrendBadge(kpis?.totalOrders?.changePct || 0)}
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  {(kpis?.totalOrders?.current || 0).toLocaleString()} órdenes
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                  vs. {(kpis?.totalOrders?.previous || 0).toLocaleString()} órdenes <span style={{ opacity: 0.7 }}>({periods?.previous?.label || 'Período B'})</span>
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
                  C$ {(kpis?.avgTicket?.current || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                  vs. C$ {(kpis?.avgTicket?.previous || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })} <span style={{ opacity: 0.7 }}>({periods?.previous?.label || 'Período B'})</span>
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
                  vs. {kpis?.cancelRate?.previous || 0}% <span style={{ opacity: 0.7 }}>({periods?.previous?.label || 'Período B'})</span>
                </div>
              </div>

            </div>

            {/* Social Selling vs. Web Direct Breakdown Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              
              {/* Channel Attribution: Social Selling vs Web */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Share2 size={18} color="var(--accent-primary)" />
                    Ventas por Canal: {periods?.current?.label} vs. {periods?.previous?.label}
                  </h3>
                </div>

                {/* --- Social Selling Section --- */}
                <div style={{ marginBottom: '1.25rem', background: 'rgba(52, 211, 153, 0.04)', padding: '0.95rem 1rem', borderRadius: '12px', border: '1px solid rgba(52, 211, 153, 0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Users size={15} color="#34d399" /> Social Selling / Vendedores
                    </span>
                    {renderTrendBadge(channels?.socialSelling?.changePct || 0)}
                  </div>

                  {/* Período A */}
                  <div style={{ marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <strong style={{ color: '#34d399' }}>{periods?.current?.label}:</strong> {channels?.socialSelling?.current?.count || 0} órdenes
                      </span>
                      <span style={{ color: '#34d399', fontWeight: 700 }}>
                        {channels?.socialSelling?.current?.pct || 0}% (C$ {(channels?.socialSelling?.current?.revenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.socialSelling?.current?.pct || 0}%`, height: '100%', background: 'linear-gradient(to right, #34d399, #059669)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>

                  {/* Período B */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text-dim)' }}>
                        <strong>{periods?.previous?.label}:</strong> {channels?.socialSelling?.previous?.count || 0} órdenes
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
                        {channels?.socialSelling?.previous?.pct || 0}% (C$ {(channels?.socialSelling?.previous?.revenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.socialSelling?.previous?.pct || 0}%`, height: '100%', background: 'rgba(148, 163, 184, 0.45)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                </div>

                {/* --- Web Directa Section --- */}
                <div style={{ marginBottom: '1rem', background: 'rgba(56, 189, 248, 0.04)', padding: '0.95rem 1rem', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Globe size={15} color="#38bdf8" /> Web Directa / E-Commerce
                    </span>
                    {renderTrendBadge(channels?.webDirect?.changePct || 0)}
                  </div>

                  {/* Período A */}
                  <div style={{ marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <strong style={{ color: '#38bdf8' }}>{periods?.current?.label}:</strong> {channels?.webDirect?.current?.count || 0} órdenes
                      </span>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                        {channels?.webDirect?.current?.pct || 0}% (C$ {(channels?.webDirect?.current?.revenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.webDirect?.current?.pct || 0}%`, height: '100%', background: 'linear-gradient(to right, #38bdf8, #0284c7)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>

                  {/* Período B */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text-dim)' }}>
                        <strong>{periods?.previous?.label}:</strong> {channels?.webDirect?.previous?.count || 0} órdenes
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
                        {channels?.webDirect?.previous?.pct || 0}% (C$ {(channels?.webDirect?.previous?.revenue || 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.webDirect?.previous?.pct || 0}%`, height: '100%', background: 'rgba(148, 163, 184, 0.45)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.5', marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                  💡 <strong style={{ color: '#ffffff' }}>Atribución Estricta</strong>: Clasifica como <strong style={{ color: '#34d399' }}>Social Selling</strong> las órdenes que contienen el parámetro de código de vendedor <code style={{ color: '#34d399' }}>UTM icampaign</code>, y como <strong style={{ color: '#38bdf8' }}>Web Directa</strong> las demás.
                </p>
              </div>

              {/* Order Status Pipeline Breakdown */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Zap size={18} color="var(--accent-amber)" />
                  Embudo de Cumplimiento de Órdenes (Fulfillment) - {periods?.current?.label}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  
                  {/* Invoiced */}
                  <div style={{ background: 'rgba(52, 211, 153, 0.06)', border: '1px solid rgba(52, 211, 153, 0.25)', padding: '0.85rem 1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <CheckCircle2 size={18} color="#34d399" />
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>Facturadas (Invoiced)</span>
                    </div>
                    <strong style={{ fontSize: '1.1rem', color: '#34d399' }}>{pipeline?.invoiced || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span></strong>
                  </div>

                  {/* Ready for Handling */}
                  <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '0.85rem 1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Clock size={18} color="#38bdf8" />
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>Lista para Preparar (Ready)</span>
                    </div>
                    <strong style={{ fontSize: '1.1rem', color: '#38bdf8' }}>{pipeline?.readyForHandling || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span></strong>
                  </div>

                  {/* Handling */}
                  <div style={{ background: 'rgba(251, 191, 36, 0.06)', border: '1px solid rgba(251, 191, 36, 0.25)', padding: '0.85rem 1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Clock size={18} color="#fbbf24" />
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>En Preparación (Handling)</span>
                    </div>
                    <strong style={{ fontSize: '1.1rem', color: '#fbbf24' }}>{pipeline?.handling || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span></strong>
                  </div>

                  {/* Canceled */}
                  <div style={{ background: 'rgba(251, 113, 133, 0.06)', border: '1px solid rgba(251, 113, 133, 0.25)', padding: '0.85rem 1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <AlertTriangle size={18} color="#fb7185" />
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>Canceladas (Canceled)</span>
                    </div>
                    <strong style={{ fontSize: '1.1rem', color: '#fb7185' }}>{pipeline?.canceled || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span></strong>
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
