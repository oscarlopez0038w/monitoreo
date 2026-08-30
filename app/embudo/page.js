'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import * as XLSX from 'xlsx';
import {
  Filter,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  TrendingUp,
  CreditCard,
  Building2,
  Truck,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Zap,
  Eye,
  ShoppingCart,
  MousePointerClick,
  ChevronDown,
  BarChart3,
  Globe,
  Megaphone,
  Tag,
  Search,
  Layers,
} from 'lucide-react';
import { getNicaraguaNow } from '@/lib/dateUtils';

export default function EmbudoPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customSessionsInput, setCustomSessionsInput] = useState('');
  const [currency, setCurrency] = useState('USD'); // 'USD' o 'NIO'
  const [exporting, setExporting] = useState(false);
  
  // Búsqueda en tablas de atribución
  const [searchSource, setSearchSource] = useState('');
  const [searchCampaign, setSearchCampaign] = useState('');

  // Calcular fechas del rango
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
    } else if (pKey === 'last_90_days') {
      const d90 = new Date(nicNow.year, nicNow.month, nicNow.day - 89);
      sA = `${d90.getFullYear()}-${String(d90.getMonth() + 1).padStart(2, '0')}-${String(d90.getDate()).padStart(2, '0')}`;
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

  // Cargar analítica del embudo desde API /api/embudo
  const fetchEmbudo = useCallback(async () => {
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
      params.set('startDate', sA);
      params.set('endDate', eA);
      if (customSessionsInput) {
        params.set('sessions', customSessionsInput);
      }

      const res = await fetch(`/api/embudo?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Error cargando embudo de ventas 360:', err);
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, customSessionsInput, getPeriodDates]);

  useEffect(() => {
    fetchEmbudo();
  }, [fetchEmbudo]);

  // Formateador de moneda
  const formatCurrency = (nioVal, usdVal) => {
    const rate = data?.bcnExchangeRate || 36.6243;
    if (currency === 'USD') {
      const val = usdVal !== undefined && usdVal !== null ? usdVal : (nioVal || 0) / rate;
      return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `C$ ${(nioVal || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NIO`;
  };

  // Exportar Excel Completo Multi-Hoja
  const handleExportExcel = () => {
    if (!data) return;
    setExporting(true);
    try {
      // 1. Sheet Embudo 360º
      const stepsData = (data.funnelSteps || []).map((s) => ({
        'Etapa del Embudo': s.name,
        'Descripción': s.description,
        'Órdenes / Eventos': s.count,
        '% Conversión Global': `${s.pctOfTotal}%`,
        '% Conversión del Paso Previo': `${s.pctOfPrevious}%`,
        'Abandono (% Fuga)': `${s.dropOffPct}%`,
        'Monto Aprobado (C$ NIO)': s.revenueNio || 0,
        'Monto Aprobado ($ USD)': s.revenueUsd || 0,
      }));

      // 2. Sheet Resumen KPIs E-Commerce
      const kpisSummaryData = [
        { 'Métrica': 'Sesiones Web (Tráfico)', 'Valor': data.analyticsKpis?.estimatedSessions || 0, 'Notas': data.isRealGa4Data ? 'Datos Reales GA4 Data API' : 'Estimación / Entrada Manual' },
        { 'Métrica': 'Compras Confirmadas', 'Valor': data.analyticsKpis?.purchases || 0, 'Notas': 'Órdenes VTEX OMS' },
        { 'Métrica': 'Tasa Conversión Global', 'Valor': `${data.analyticsKpis?.overallConversionRate || 0}%`, 'Notas': 'Compras / Sesiones' },
        { 'Métrica': 'Ticket Promedio (AOV $ USD)', 'Valor': `$ ${data.analyticsKpis?.averageOrderValueUsd || 0}`, 'Notas': 'Monto Aprobado por Orden' },
        { 'Métrica': 'Ticket Promedio (AOV C$ NIO)', 'Valor': `C$ ${data.analyticsKpis?.averageOrderValueNio || 0}`, 'Notas': 'Monto Aprobado por Orden' },
        { 'Métrica': 'Tasa Checkout -> Pago', 'Valor': `${data.analyticsKpis?.checkoutToPaymentRate || 0}%`, 'Notas': 'Autorizaciones Exitosas en Pasarela' },
        { 'Métrica': 'Carritos Abandonados', 'Valor': data.analyticsKpis?.abandonedCartsCount || 0, 'Notas': 'Add to Cart sin compra' },
        { 'Métrica': 'Valor Perdido por Abandono ($ USD)', 'Valor': `$ ${data.analyticsKpis?.abandonedCartRevenueUsd || 0}`, 'Notas': 'Oportunidad Recuperable' },
        { 'Métrica': 'Propiedad GA4 Configurada', 'Valor': data.ga4PropertyConfigured ? 'Sí (Conectada)' : 'No configurada', 'Notas': data.ga4PropertyConfigured ? 'Vincular .env.local GA4_PROPERTY_ID' : 'Pendiente' },
      ];

      // 3. Sheet Fuentes de Tráfico (UTM Sources)
      const sourcesData = (data.attribution?.sources || []).map((src) => ({
        'Fuente / Canal de Tráfico': src.source,
        'Órdenes Generadas': src.count,
        'Participación (%)': `${src.conversionRate}%`,
        'Ventas Atribuidas (C$ NIO)': src.revenueNio,
        'Ventas Atribuidas ($ USD)': src.revenueUsd,
      }));

      // 4. Sheet Campañas de Marketing (UTM Campaigns)
      const campaignsData = (data.attribution?.campaigns || []).map((cmp) => ({
        'Campaña de Marketing': cmp.campaign,
        'Órdenes Generadas': cmp.count,
        'Participación (%)': `${cmp.pctOfTotal}%`,
        'Ventas Atribuidas (C$ NIO)': cmp.revenueNio,
        'Ventas Atribuidas ($ USD)': cmp.revenueUsd,
      }));

      // 5. Sheet Banners & Promociones
      const promoData = (data.attribution?.promotions || []).map((p) => ({
        'Banner / Promoción': p.name,
        'Tipo': p.type,
        'Órdenes Beneficiadas': p.count,
        'Ventas Atribuidas (C$ NIO)': p.revenueNio,
        'Ventas Atribuidas ($ USD)': p.revenueUsd,
      }));

      const wb = XLSX.utils.book_new();
      const wsSteps = XLSX.utils.json_to_sheet(stepsData);
      const wsKpis = XLSX.utils.json_to_sheet(kpisSummaryData);
      const wsSources = XLSX.utils.json_to_sheet(sourcesData);
      const wsCampaigns = XLSX.utils.json_to_sheet(campaignsData);
      const wsPromo = XLSX.utils.json_to_sheet(promoData);

      const colWidths = [{ wch: 35 }, { wch: 35 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 22 }];
      wsSteps['!cols'] = colWidths;
      wsKpis['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 35 }];
      wsSources['!cols'] = colWidths;
      wsCampaigns['!cols'] = colWidths;
      wsPromo['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, wsSteps, 'Embudo 360');
      XLSX.utils.book_append_sheet(wb, wsKpis, 'Resumen KPIs');
      XLSX.utils.book_append_sheet(wb, wsSources, 'Fuentes de Tráfico');
      XLSX.utils.book_append_sheet(wb, wsCampaigns, 'Campañas Marketing');
      XLSX.utils.book_append_sheet(wb, wsPromo, 'Banners & Promociones');

      XLSX.writeFile(wb, `Embudo_360_Atribucion_SINSA_${data.startDate}_al_${data.endDate}.xlsx`);
    } catch (err) {
      console.error('Error exportando Excel del embudo 360:', err);
    } finally {
      setExporting(false);
    }
  };

  const kpis = data?.analyticsKpis;
  const attribution = data?.attribution;

  // Filtrar Fuentes y Campañas por búsqueda
  const filteredSources = (attribution?.sources || []).filter((s) =>
    s.source.toLowerCase().includes(searchSource.toLowerCase())
  );

  const filteredCampaigns = (attribution?.campaigns || []).filter((c) =>
    c.campaign.toLowerCase().includes(searchCampaign.toLowerCase())
  );

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        
        {/* HEADER DEL MÓDULO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
              <Filter size={26} color="#38bdf8" />
              Embudo 360º de Ventas, Tráfico, Banners & Atribución E-Commerce
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0 }}>
                Mide la conversión desde el tráfico web, fuentes de origen, campañas, banners y PDPs hasta la facturación OMS.
              </p>
              {data?.isRealGa4Data && (
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.35)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                  ⚡ Datos GA4 Data API En Vivo
                </span>
              )}
            </div>
          </div>

          {/* CONTROLES Y FILTROS */}
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
                <option value="last_90_days" style={{ background: '#0f172a' }}>Últimos 90 Días</option>
                <option value="last_month" style={{ background: '#0f172a' }}>Mes Anterior</option>
              </select>
            </div>

            {/* Inserción opcional de Sesiones Reales de Google Analytics */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.25rem 0.6rem' }}>
              <BarChart3 size={14} color="#38bdf8" />
              <input
                type="number"
                placeholder="Sesiones GA4..."
                value={customSessionsInput}
                onChange={(e) => setCustomSessionsInput(e.target.value)}
                style={{
                  width: '110px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
                title="Si tienes el número exacto de sesiones de Google Analytics 4 para este período, ingrésalo aquí"
              />
            </div>

            {/* Switcher Moneda */}
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

            {/* Refrescar */}
            <button
              onClick={fetchEmbudo}
              disabled={loading}
              className="btn-secondary"
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', minHeight: '36px' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Exportar */}
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
              }}
            >
              <FileSpreadsheet size={16} />
              Exportar Excel Multi-Hoja
            </button>

          </div>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={32} className="animate-spin" color="#38bdf8" style={{ margin: '0 auto 1rem auto' }} />
            <h3 style={{ fontSize: '1.1rem', color: '#ffffff', fontWeight: 600 }}>Construyendo el embudo 360º de ventas, banners y tráfico...</h3>
            <p style={{ fontSize: '0.85rem' }}>Calculando conversiones, campañas UTMs e interacciones de catálogo en tiempo real.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* CARDS RESUMEN EJECUTIVO (6 CARDS) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
              
              {/* Card 1: Tasa de Conversión Global */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #34d399' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={15} color="#34d399" /> Conversión Global E-Commerce
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                  {kpis?.overallConversionRate || 0}%
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {kpis?.purchases || 0} compras de {kpis?.estimatedSessions?.toLocaleString()} sesiones
                </span>
              </div>

              {/* Card 2: Ticket Promedio (AOV) */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #38bdf8' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShoppingBag size={15} color="#38bdf8" /> Ticket Promedio (AOV)
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(kpis?.averageOrderValueNio, kpis?.averageOrderValueUsd)}
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Promedio acreditado por compra
                </span>
              </div>

              {/* Card 3: Ingresos Perdidos por Abandono */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #f87171' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShoppingCart size={15} color="#f87171" /> Oportunidad Abandono Carrito
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(kpis?.abandonedCartRevenueNio, kpis?.abandonedCartRevenueUsd)}
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {kpis?.abandonedCartsCount?.toLocaleString() || 0} carritos no concretados ({kpis?.cartAbandonmentRate || 0}% fuga)
                </span>
              </div>

              {/* Card 4: Efectividad Checkout a Pago */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #fbbf24' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CreditCard size={15} color="#fbbf24" /> Tasa Checkout a Pago
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                  {kpis?.checkoutToPaymentRate || 0}%
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {kpis?.purchases || 0} compras de {kpis?.beginCheckouts?.toLocaleString()} inicios de checkout
                </span>
              </div>

              {/* Card 5: Top Campaña de Marketing */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #a855f7' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Megaphone size={15} color="#a855f7" /> Top Campaña Marketing
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {attribution?.campaigns?.[0]?.campaign || 'Orgánico / Sin Campaña'}
                </div>
                <span style={{ fontSize: '0.76rem', color: '#a855f7', fontWeight: 600 }}>
                  {attribution?.campaigns?.[0]?.count || 0} órdenes ({formatCurrency(attribution?.campaigns?.[0]?.revenueNio, attribution?.campaigns?.[0]?.revenueUsd)})
                </span>
              </div>

              {/* Card 6: Total de Facturación Aprobada */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #c084fc' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={15} color="#c084fc" /> Facturación Aprobada
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(kpis?.approvedRevenueNio, kpis?.approvedRevenueUsd)}
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {kpis?.purchases || 0} órdenes cobradas en VTEX
                </span>
              </div>

            </div>

            {/* VISUALIZADOR DEL EMBUDO COMPLETO DE 6 ETAPAS */}
            <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.98))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                  <Filter size={22} color="#38bdf8" />
                  Embudo de Conversión de 6 Etapas (Journey del Comprador)
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1rem' }}>
                {(data?.funnelSteps || []).map((step, idx) => {
                  const isLast = idx === (data.funnelSteps.length - 1);

                  let stepColor = '#38bdf8';
                  let icon = <MousePointerClick size={18} color={stepColor} />;
                  if (step.code === 'traffic') { stepColor = '#38bdf8'; icon = <Globe size={18} color={stepColor} />; }
                  if (step.code === 'pdp_views') { stepColor = '#c084fc'; icon = <Eye size={18} color={stepColor} />; }
                  if (step.code === 'add_to_cart') { stepColor = '#fbbf24'; icon = <ShoppingCart size={18} color={stepColor} />; }
                  if (step.code === 'begin_checkout') { stepColor = '#f59e0b'; icon = <CreditCard size={18} color={stepColor} />; }
                  if (step.code === 'payment_approval') { stepColor = '#34d399'; icon = <ShieldCheck size={18} color={stepColor} />; }
                  if (step.code === 'invoiced') { stepColor = '#10b981'; icon = <CheckCircle2 size={18} color={stepColor} />; }

                  const barPercentage = Math.min(Math.max(step.pctOfTotal, 2), 100);

                  return (
                    <div key={step.step} style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      <div
                        style={{
                          background: isLast ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.7)',
                          border: isLast ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          padding: '0.95rem 1.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '240px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.05)', border: `1px solid ${stepColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {icon}
                          </div>
                          <div>
                            <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                              {step.name}
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {step.description}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                              {step.count?.toLocaleString()}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {step.revenueNio ? formatCurrency(step.revenueNio, step.revenueUsd) : 'Eventos / Usuarios'}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right', minWidth: '100px' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: stepColor }}>
                              {step.pctOfTotal}%
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                              del Tráfico Total
                            </span>
                          </div>

                          {!isLast && step.dropOffPct > 0 && (
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.35rem 0.65rem', textAlign: 'center', minWidth: '110px' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f87171' }}>
                                -{step.dropOffPct}% Abandono
                              </div>
                              <span style={{ fontSize: '0.68rem', color: '#fca5a5' }}>
                                {step.dropOffCount?.toLocaleString()} no avanzan
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* BARRA DE PROGRESO DE LA ETAPA */}
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${barPercentage}%`,
                            background: `linear-gradient(90deg, ${stepColor}, #2563eb)`,
                            borderRadius: '3px',
                            transition: 'width 0.5s ease',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECCIÓN DE ATRIBUCIÓN Y DETALLES */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
              
              {/* TABLA: FUENTES DE TRÁFICO (UTM SOURCES) */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Globe size={18} color="#38bdf8" />
                    Atribución por Fuente / Canal (UTM Source)
                  </h3>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Buscar canal..."
                      value={searchSource}
                      onChange={(e) => setSearchSource(e.target.value)}
                      style={{ padding: '0.25rem 0.5rem 0.25rem 1.8rem', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#ffffff', fontSize: '0.75rem', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.5rem' }}>Canal de Tráfico</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Órdenes</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Ventas Atribuidas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSources.length > 0 ? (
                        filteredSources.map((src, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '0.55rem', fontWeight: 700, color: '#ffffff' }}>
                              {src.source}
                            </td>
                            <td style={{ padding: '0.55rem', textAlign: 'center', color: '#38bdf8', fontWeight: 700 }}>
                              {src.count}
                            </td>
                            <td style={{ padding: '0.55rem', textAlign: 'right', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                              {formatCurrency(src.revenueNio, src.revenueUsd)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                            No se encontraron canales de tráfico.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLA: CAMPAÑAS DE MARKETING (UTM CAMPAIGNS) */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Megaphone size={18} color="#fbbf24" />
                    Atribución por Campaña (UTM Campaign)
                  </h3>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Buscar campaña..."
                      value={searchCampaign}
                      onChange={(e) => setSearchCampaign(e.target.value)}
                      style={{ padding: '0.25rem 0.5rem 0.25rem 1.8rem', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#ffffff', fontSize: '0.75rem', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.5rem' }}>Nombre de Campaña</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Órdenes</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Ventas Atribuidas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCampaigns.length > 0 ? (
                        filteredCampaigns.map((cmp, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '0.55rem', fontWeight: 700, color: '#ffffff' }}>
                              {cmp.campaign}
                            </td>
                            <td style={{ padding: '0.55rem', textAlign: 'center', color: '#fbbf24', fontWeight: 700 }}>
                              {cmp.count}
                            </td>
                            <td style={{ padding: '0.55rem', textAlign: 'right', fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                              {formatCurrency(cmp.revenueNio, cmp.revenueUsd)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                            No se encontraron campañas de marketing.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* BANNERS, CATEGORÍAS Y AUDITORÍA GA4 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
              
              {/* BANNERS Y PROMOCIONES */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Tag size={18} color="#c084fc" />
                  Rendimiento de Banners & Promociones
                </h3>
                {attribution?.promotions?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {attribution.promotions.map((p, idx) => (
                      <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff' }}>{p.name}</div>
                          <span style={{ fontSize: '0.7rem', color: '#c084fc' }}>{p.type}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8' }}>{p.count} órdenes</div>
                          <div style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {formatCurrency(p.revenueNio, p.revenueUsd)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '1rem 0' }}>
                    No se registran promociones o cupones activos.
                  </div>
                )}
              </div>

              {/* AUDITORÍA DE PARAMETRIZACIÓN GA4 E-COMMERCE */}
              <div className="glass-card" style={{ padding: '1.25rem', borderLeft: '4px solid #34d399' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={18} color="#34d399" />
                    Auditoría & Conexión GA4 E-Commerce
                  </h3>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {data?.ga4PropertyConfigured && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.4)', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                        ✓ GA4 Propiedad Conectada
                      </span>
                    )}
                    {data?.ga4MeasurementId && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.4)', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                        ✓ Measurement ID ({data.ga4MeasurementId})
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Verifica la salud de los eventos e-commerce capturados en el DataLayer de VTEX y las llaves en `.env.local`.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {(data?.ga4AuditChecklist || []).map((chk, idx) => (
                    <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>
                          ⚡ Evento: <code style={{ color: '#38bdf8' }}>{chk.eventName}</code>
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#34d399', background: 'rgba(52, 211, 153, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                          ✓ Parámetros Requeridos
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                        {chk.description}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                        Campos: {chk.requiredParameters.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>
    </AppLayout>
  );
}
