'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import * as XLSX from 'xlsx';
import {
  Megaphone,
  Tag,
  Globe,
  Gift,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Calendar,
  DollarSign,
  TrendingUp,
  Award,
  Filter,
  BarChart3,
} from 'lucide-react';

import { getNicaraguaNow } from '@/lib/dateUtils';

export default function MarketingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('USD'); // 'USD' o 'NIO'
  const [exporting, setExporting] = useState(false);

  // Filtros de búsqueda individual por columna
  const [campaignSearch, setCampaignSearch] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [promoSearch, setPromoSearch] = useState('');

  // Calcular fechas según período seleccionado
  const getPeriodDates = useCallback((pKey) => {
    const nicNow = getNicaraguaNow();
    let sA = nicNow.firstDayStr;
    let eA = nicNow.todayStr;

    if (pKey === 'today') {
      sA = nicNow.todayStr;
      eA = nicNow.todayStr;
    } else if (pKey === 'yesterday') {
      const y = new Date(nicNow.year, nicNow.month, nicNow.day - 1);
      const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      sA = yStr;
      eA = yStr;
    } else if (pKey === 'last_7_days') {
      const d7 = new Date(nicNow.year, nicNow.month, nicNow.day - 6);
      sA = `${d7.getFullYear()}-${String(d7.getMonth() + 1).padStart(2, '0')}-${String(d7.getDate()).padStart(2, '0')}`;
      eA = nicNow.todayStr;
    } else if (pKey === 'last_30_days') {
      const d30 = new Date(nicNow.year, nicNow.month, nicNow.day - 29);
      sA = `${d30.getFullYear()}-${String(d30.getMonth() + 1).padStart(2, '0')}-${String(d30.getDate()).padStart(2, '0')}`;
      eA = nicNow.todayStr;
    } else if (pKey === 'last_month') {
      let pY = nicNow.year;
      let pM = nicNow.month - 1;
      if (pM < 0) {
        pM = 11;
        pY -= 1;
      }
      const lastDayPM = new Date(pY, pM + 1, 0).getDate();
      const pMStr = String(pM + 1).padStart(2, '0');
      sA = `${pY}-${pMStr}-01`;
      eA = `${pY}-${pMStr}-${String(lastDayPM).padStart(2, '0')}`;
    }

    return { sA, eA };
  }, []);

  // Cargar datos desde API /api/analytics
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      let sA = startDate;
      let eA = endDate;
      if (period !== 'custom' || !sA || !eA) {
        const dates = getPeriodDates(period);
        sA = dates.sA;
        eA = dates.eA;
      }

      const params = new URLSearchParams();
      params.set('startDateA', sA);
      params.set('endDateA', eA);

      const res = await fetch(`/api/analytics?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Error cargando analíticas de marketing:', err);
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, getPeriodDates]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Formateador de Moneda
  const formatCurrency = (nioVal, usdVal) => {
    const rate = data?.bcnExchangeRate || 36.6243;
    if (currency === 'USD') {
      const val = usdVal !== undefined && usdVal !== null ? usdVal : (nioVal || 0) / rate;
      return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `C$ ${(nioVal || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NIO`;
  };

  // Exportar reporte de marketing a Excel (.xlsx)
  const handleExportExcel = () => {
    if (!data?.marketingAnalytics) return;
    setExporting(true);
    try {
      const rate = data?.bcnExchangeRate || 36.6243;
      const totalNio = data?.kpis?.totalRevenue?.currentNio || 1;

      // 1. Sheet Campañas UTM
      const campaignsData = (data.marketingAnalytics.utmCampaigns || []).map((c) => ({
        'Campaña (utm_campaign)': c.name,
        'Órdenes Completadas': c.orders,
        '% del Total de Ventas': `${Math.round((c.revenueNio / totalNio) * 100)}%`,
        'Ingresos (C$ NIO)': Math.round(c.revenueNio * 100) / 100,
        'Ingresos ($ USD)': Math.round((c.revenueUsd || c.revenueNio / rate) * 100) / 100,
      }));

      // 2. Sheet Fuentes / Canales
      const sourcesData = (data.marketingAnalytics.utmSources || []).map((s) => ({
        'Fuente / Canal (utm_source)': s.name,
        'Órdenes Completadas': s.orders,
        '% del Total de Ventas': `${Math.round((s.revenueNio / totalNio) * 100)}%`,
        'Ingresos (C$ NIO)': Math.round(s.revenueNio * 100) / 100,
        'Ingresos ($ USD)': Math.round((s.revenueUsd || s.revenueNio / rate) * 100) / 100,
      }));

      // 3. Sheet Promociones VTEX
      const promotionsData = (data.marketingAnalytics.promotions || []).map((p) => ({
        'Promoción / Beneficio VTEX': p.name,
        'Órdenes Beneficiadas': p.orders,
        '% del Total de Ventas': `${Math.round((p.revenueNio / totalNio) * 100)}%`,
        'Ingresos (C$ NIO)': Math.round(p.revenueNio * 100) / 100,
        'Ingresos ($ USD)': Math.round((p.revenueUsd || p.revenueNio / rate) * 100) / 100,
      }));

      const wb = XLSX.utils.book_new();

      const wsCampaigns = XLSX.utils.json_to_sheet(campaignsData);
      const wsSources = XLSX.utils.json_to_sheet(sourcesData);
      const wsPromotions = XLSX.utils.json_to_sheet(promotionsData);

      const colWidths = [{ wch: 45 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
      wsCampaigns['!cols'] = colWidths;
      wsSources['!cols'] = colWidths;
      wsPromotions['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, wsCampaigns, 'Campañas UTM');
      XLSX.utils.book_append_sheet(wb, wsSources, 'Canales de Origen');
      XLSX.utils.book_append_sheet(wb, wsPromotions, 'Promociones VTEX');

      const fileName = `Reporte_Marketing_SINSA_${data?.periods?.current?.startDateStr || 'Ventas'}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Error exportando Excel de marketing:', err);
    } finally {
      setExporting(false);
    }
  };

  const marketing = data?.marketingAnalytics;
  const kpis = data?.kpis;
  const periods = data?.periods;
  const totalNio = kpis?.totalRevenue?.currentNio || 1;

  // Filtrado dinámico por búsqueda
  const filteredCampaigns = (marketing?.utmCampaigns || []).filter((c) =>
    c.name.toLowerCase().includes(campaignSearch.toLowerCase())
  );
  const filteredSources = (marketing?.utmSources || []).filter((s) =>
    s.name.toLowerCase().includes(sourceSearch.toLowerCase())
  );
  const filteredPromos = (marketing?.promotions || []).filter((p) =>
    p.name.toLowerCase().includes(promoSearch.toLowerCase())
  );

  // Cálculos resumidos
  const totalAttributedRevenueNio = (marketing?.utmCampaigns || [])
    .filter((c) => c.name !== 'Sin Campaña Específica (Orgánico / Directo)')
    .reduce((sum, c) => sum + c.revenueNio, 0);

  const totalAttributedRevenueUsd = (marketing?.utmCampaigns || [])
    .filter((c) => c.name !== 'Sin Campaña Específica (Orgánico / Directo)')
    .reduce((sum, c) => sum + (c.revenueUsd || c.revenueNio / (data?.bcnExchangeRate || 36.6243)), 0);

  const totalAttributedOrders = (marketing?.utmCampaigns || [])
    .filter((c) => c.name !== 'Sin Campaña Específica (Orgánico / Directo)')
    .reduce((sum, c) => sum + c.orders, 0);

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        
        {/* HEADER PRINCIPAL DE MÓDULO MARKETING */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
              <Megaphone size={26} color="#a5b4fc" />
              Reporte de Campañas de Marketing (UTMs) & Canales de Venta
            </h1>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Atribución de ventas por campañas (`utm_campaign`), fuentes de origen (`utm_source`) y promociones VTEX en tiempo real.
            </p>
          </div>

          {/* CONTROLES DE FILTRO Y EXPORTACIÓN */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            
            {/* Selector de Período */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.25rem 0.5rem' }}>
              <Calendar size={15} color="var(--text-dim)" style={{ marginRight: '0.4rem' }} />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '0.82rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
              >
                <option value="current_month" style={{ background: '#0f172a' }}>Mes Actual (MTD)</option>
                <option value="today" style={{ background: '#0f172a' }}>Hoy</option>
                <option value="yesterday" style={{ background: '#0f172a' }}>Ayer</option>
                <option value="last_7_days" style={{ background: '#0f172a' }}>Últimos 7 Días</option>
                <option value="last_30_days" style={{ background: '#0f172a' }}>Últimos 30 Días</option>
                <option value="last_month" style={{ background: '#0f172a' }}>Mes Anterior</option>
              </select>
            </div>

            {/* Switcher Moneda USD / NIO */}
            <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.2rem' }}>
              <button
                onClick={() => setCurrency('USD')}
                style={{
                  padding: '0.3rem 0.65rem',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: currency === 'USD' ? 'linear-gradient(135deg, #38bdf8, #2563eb)' : 'transparent',
                  color: currency === 'USD' ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                $ USD
              </button>
              <button
                onClick={() => setCurrency('NIO')}
                style={{
                  padding: '0.3rem 0.65rem',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: currency === 'NIO' ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent',
                  color: currency === 'NIO' ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                C$ NIO
              </button>
            </div>

            {/* Botón Refrescar */}
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="btn-secondary"
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', minHeight: '36px' }}
              title="Refrescar datos de atribución"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Exportar Excel */}
            <button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.95rem',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 700,
                backgroundColor: '#059669',
                color: '#ffffff',
                border: '1px solid #10b981',
                cursor: exporting ? 'wait' : 'pointer',
                boxShadow: '0 4px 15px rgba(5, 150, 105, 0.25)',
              }}
            >
              <FileSpreadsheet size={16} />
              {exporting ? 'Generando...' : 'Exportar Excel (.xlsx)'}
            </button>

          </div>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={32} className="animate-spin" color="#a5b4fc" style={{ margin: '0 auto 1rem auto' }} />
            <h3 style={{ fontSize: '1.1rem', color: '#ffffff', fontWeight: 600 }}>Cargando reporte de atribución de campañas y marketing...</h3>
            <p style={{ fontSize: '0.85rem' }}>Procesando órdenes y parámetros UTMs en tiempo real desde VTEX OMS.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* CARDS RESUMEN DE ATRIBUCIÓN DE MARKETING */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              
              {/* Card 1: Ingresos Atribuidos */}
              <div className="glass-card" style={{ padding: '1.1rem' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={14} color="#a5b4fc" /> Ventas Atribuidas a Campañas
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(totalAttributedRevenueNio, totalAttributedRevenueUsd)}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 600 }}>
                  Con etiqueta de campaña `utm_campaign`
                </span>
              </div>

              {/* Card 2: Órdenes Atribuidas */}
              <div className="glass-card" style={{ padding: '1.1rem' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <BarChart3 size={14} color="#38bdf8" /> Órdenes Atribuidas a UTMs
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                  {totalAttributedOrders.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>órdenes</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Generadas por tráfico pagado o campañas
                </span>
              </div>

              {/* Card 3: Campañas Activas */}
              <div className="glass-card" style={{ padding: '1.1rem' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Tag size={14} color="#fbbf24" /> Campañas UTM Rastreadas
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                  {(marketing?.utmCampaigns?.length || 0).toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>campañas</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Registradas en órdenes del período
                </span>
              </div>

              {/* Card 4: Canales de Origen */}
              <div className="glass-card" style={{ padding: '1.1rem' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Globe size={14} color="#c084fc" /> Canales y Fuentes Distintas
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                  {(marketing?.utmSources?.length || 0).toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>fuentes</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Google, Directo, Social, Email, etc.
                </span>
              </div>

            </div>

            {/* TABLAS DETALLADAS DE MARKETING (3 COLUMNAS PRINCIPALES) */}
            <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.98))', border: '1px solid rgba(165, 180, 252, 0.3)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Award size={20} color="#a5b4fc" />
                  Desglose Detallado de Rendimiento de Marketing - {periods?.current?.label}
                </h2>
                <span style={{ fontSize: '0.76rem', color: '#a5b4fc', background: 'rgba(165, 180, 252, 0.1)', padding: '0.25rem 0.65rem', borderRadius: '6px', border: '1px solid rgba(165, 180, 252, 0.25)', fontWeight: 600 }}>
                  🎯 Atribución Directa VTEX OMS
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
                
                {/* SUB-CARD A: Top Campañas de Marketing (`utm_campaign`) */}
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '1.15rem', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', height: '520px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a5b4fc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Tag size={15} color="#a5b4fc" />
                      Top Campañas (`utm_campaign`)
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {filteredCampaigns.length} de {marketing?.utmCampaigns?.length || 0}
                    </span>
                  </div>

                  {/* Input Filtro de Campaña */}
                  <div style={{ position: 'relative', marginBottom: '0.85rem', flexShrink: 0 }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Filtrar campañas..."
                      value={campaignSearch}
                      onChange={(e) => setCampaignSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem 0.4rem 2rem',
                        fontSize: '0.78rem',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {filteredCampaigns.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', flex: 1, paddingRight: '0.3rem' }}>
                      {filteredCampaigns.map((camp, idx) => {
                        const pctOfTotal = Math.round((camp.revenueNio / totalNio) * 100);

                        return (
                          <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                              <div>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', display: 'block' }}>
                                  🎯 {camp.name}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {camp.orders} órdenes completadas ({pctOfTotal}% del total)
                                </span>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                                  {formatCurrency(camp.revenueNio, camp.revenueUsd)}
                                </div>
                              </div>
                            </div>

                            {/* Progress bar de cuota de ventas */}
                            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.4rem' }}>
                              <div style={{ width: `${Math.min(100, Math.max(2, pctOfTotal))}%`, height: '100%', background: '#34d399', borderRadius: '2px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '1.5rem 0', textAlign: 'center' }}>
                      No se encontraron campañas coincidentes.
                    </div>
                  )}
                </div>

                {/* SUB-CARD B: Fuentes y Canales (`utm_source`) */}
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '1.15rem', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', height: '520px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Globe size={15} color="#38bdf8" />
                      Fuentes de Origen (`utm_source`)
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {filteredSources.length} de {marketing?.utmSources?.length || 0}
                    </span>
                  </div>

                  {/* Input Filtro de Fuente */}
                  <div style={{ position: 'relative', marginBottom: '0.85rem', flexShrink: 0 }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Filtrar fuentes..."
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem 0.4rem 2rem',
                        fontSize: '0.78rem',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {filteredSources.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', flex: 1, paddingRight: '0.3rem' }}>
                      {filteredSources.map((src, idx) => {
                        const pctOfTotal = Math.round((src.revenueNio / totalNio) * 100);

                        return (
                          <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                              <div>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', display: 'block' }}>
                                  📡 {src.name}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {src.orders} órdenes ({pctOfTotal}% de ventas)
                                </span>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                                  {formatCurrency(src.revenueNio, src.revenueUsd)}
                                </div>
                              </div>
                            </div>

                            {/* Progress bar de cuota de ventas */}
                            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.4rem' }}>
                              <div style={{ width: `${Math.min(100, Math.max(2, pctOfTotal))}%`, height: '100%', background: '#38bdf8', borderRadius: '2px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '1.5rem 0', textAlign: 'center' }}>
                      No se encontraron fuentes coincidentes.
                    </div>
                  )}
                </div>

                {/* SUB-CARD C: Promociones & Alianzas VTEX */}
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '1.15rem', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', height: '520px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Gift size={15} color="#fbbf24" />
                      Promociones y Alianzas VTEX
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {filteredPromos.length} de {marketing?.promotions?.length || 0}
                    </span>
                  </div>

                  {/* Input Filtro de Promociones */}
                  <div style={{ position: 'relative', marginBottom: '0.85rem', flexShrink: 0 }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Filtrar promociones..."
                      value={promoSearch}
                      onChange={(e) => setPromoSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem 0.4rem 2rem',
                        fontSize: '0.78rem',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {filteredPromos.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', flex: 1, paddingRight: '0.3rem' }}>
                      {filteredPromos.map((promo, idx) => {
                        const pctOfTotal = Math.round((promo.revenueNio / totalNio) * 100);

                        return (
                          <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                              <div>
                                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', display: 'block' }}>
                                  🎁 {promo.name}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  {promo.orders} órdenes beneficiadas ({pctOfTotal}% de ventas)
                                </span>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                                  {formatCurrency(promo.revenueNio, promo.revenueUsd)}
                                </div>
                              </div>
                            </div>

                            {/* Progress bar de cuota de ventas */}
                            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.4rem' }}>
                              <div style={{ width: `${Math.min(100, Math.max(2, pctOfTotal))}%`, height: '100%', background: '#fbbf24', borderRadius: '2px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '1.5rem 0', textAlign: 'center' }}>
                      No se encontraron promociones coincidentes.
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        )}

      </main>
    </AppLayout>
  );
}
