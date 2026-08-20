'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import * as XLSX from 'xlsx';
import {
  Clock,
  Calendar,
  TrendingUp,
  BarChart2,
  Award,
  RefreshCw,
  FileSpreadsheet,
  Zap,
  Sun,
  Moon,
  Sunset,
  Sunrise,
  DollarSign,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { getNicaraguaNow } from '@/lib/dateUtils';

export default function PatronesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('USD'); // 'USD' o 'NIO'
  const [exporting, setExporting] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);

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

  // Cargar analítica de patrones desde API /api/patrones
  const fetchPatrones = useCallback(async () => {
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

      const res = await fetch(`/api/patrones?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Error cargando analítica de patrones:', err);
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, getPeriodDates]);

  useEffect(() => {
    fetchPatrones();
  }, [fetchPatrones]);

  // Formateador de moneda
  const formatCurrency = (nioVal, usdVal) => {
    const rate = data?.bcnExchangeRate || 36.6243;
    if (currency === 'USD') {
      const val = usdVal !== undefined && usdVal !== null ? usdVal : (nioVal || 0) / rate;
      return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `C$ ${(nioVal || 0).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NIO`;
  };

  // Exportación a Excel
  const handleExportExcel = () => {
    if (!data) return;
    setExporting(true);
    try {
      const rate = data.bcnExchangeRate || 36.6243;

      // 1. Pestaña Días de la Semana
      const daysData = (data.byDayOfWeek || []).map((d) => ({
        'Día de la Semana': d.name,
        'Órdenes Completadas': d.ordersCount,
        '% del Total de Ventas': `${d.pctOfTotal}%`,
        'Ingresos (C$ NIO)': d.revenueNio,
        'Ingresos ($ USD)': d.revenueUsd,
        'Ticket Promedio (C$ NIO)': d.avgTicketNio,
        'Ticket Promedio ($ USD)': d.avgTicketUsd,
      }));

      // 2. Pestaña Distribución Horaria (24h)
      const hoursData = (data.byHourOfDay || []).map((h) => ({
        'Rango Horario': h.label,
        'Órdenes Completadas': h.ordersCount,
        '% del Total de Ventas': `${h.pctOfTotal}%`,
        'Ingresos (C$ NIO)': h.revenueNio,
        'Ingresos ($ USD)': h.revenueUsd,
      }));

      // 3. Pestaña Franjas Horarias
      const windowsData = (data.byTimeWindow || []).map((w) => ({
        'Franja Horaria': w.name,
        'Órdenes Completadas': w.ordersCount,
        '% del Total de Ventas': `${w.pctOfTotal}%`,
        'Ingresos (C$ NIO)': w.revenueNio,
        'Ingresos ($ USD)': w.revenueUsd,
      }));

      const wb = XLSX.utils.book_new();
      const wsDays = XLSX.utils.json_to_sheet(daysData);
      const wsHours = XLSX.utils.json_to_sheet(hoursData);
      const wsWindows = XLSX.utils.json_to_sheet(windowsData);

      const colWidths = [{ wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 24 }];
      wsDays['!cols'] = colWidths;
      wsHours['!cols'] = colWidths;
      wsWindows['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, wsDays, 'Por Día de Semana');
      XLSX.utils.book_append_sheet(wb, wsHours, 'Distribución 24 Horas');
      XLSX.utils.book_append_sheet(wb, wsWindows, 'Franjas Horarias');

      XLSX.writeFile(wb, `Patrones_de_Venta_SINSA_${data.startDate}_al_${data.endDate}.xlsx`);
    } catch (err) {
      console.error('Error exportando Excel de patrones:', err);
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;
  const insights = data?.insights;

  // Encontrar máximos para escala de gráficas e indicadores
  const maxOrdersInHour = data?.byHourOfDay ? Math.max(...data.byHourOfDay.map((h) => h.ordersCount), 1) : 1;
  const maxRevenueInDay = data?.byDayOfWeek ? Math.max(...data.byDayOfWeek.map((d) => d.revenueNio), 1) : 1;
  const maxOrdersInDay = data?.byDayOfWeek ? Math.max(...data.byDayOfWeek.map((d) => d.ordersCount), 1) : 1;

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        
        {/* HEADER DEL MÓDULO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
              <Clock size={26} color="#38bdf8" />
              Análisis de Patrones de Compra & Horarios Pico
            </h1>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Identifica los días y franjas horarias con mayor volumen de pedidos e ingresos en VTEX E-Commerce.
            </p>
          </div>

          {/* CONTROLES */}
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
              onClick={fetchPatrones}
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
              Exportar a Excel
            </button>

          </div>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={32} className="animate-spin" color="#38bdf8" style={{ margin: '0 auto 1rem auto' }} />
            <h3 style={{ fontSize: '1.1rem', color: '#ffffff', fontWeight: 600 }}>Analizando patrones de compra por hora y día...</h3>
            <p style={{ fontSize: '0.85rem' }}>Procesando registros de órdenes en zona horaria Nicaragua (UTC-6).</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* INSIGHT CARDS EJECUTIVAS (5 CARDS RESUMEN) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
              
              {/* Card 1: Día con Mayor Facturación/Ingresos */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #34d399' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Award size={15} color="#34d399" /> Día con Mayor Facturación
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
                  💰 {insights?.peakRevenueDayName || 'N/A'}
                </div>
                <span style={{ fontSize: '0.76rem', color: '#34d399', fontWeight: 600 }}>
                  Ventas: {formatCurrency(insights?.peakRevenueDayRevenueNio, insights?.peakRevenueDayRevenueUsd)} ({insights?.peakRevenueDayOrders || 0} órdenes)
                </span>
              </div>

              {/* Card 2: Día con Mayor Volumen de Pedidos */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #38bdf8' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShoppingCart size={15} color="#38bdf8" /> Día con Más Pedidos
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
                  📦 {insights?.peakOrdersDayName || 'N/A'}
                </div>
                <span style={{ fontSize: '0.76rem', color: '#38bdf8', fontWeight: 600 }}>
                  Volumen: {insights?.peakOrdersDayOrders || 0} órdenes ({formatCurrency(insights?.peakOrdersDayRevenueNio, insights?.peakOrdersDayRevenueUsd)})
                </span>
              </div>

              {/* Card 3: Hora Pico de Mayor Tráfico */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #f59e0b' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={15} color="#f59e0b" /> Hora Pico de Compras
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
                  ⚡ {insights?.peakHourLabel || 'N/A'}
                </div>
                <span style={{ fontSize: '0.76rem', color: '#fbbf24', fontWeight: 600 }}>
                  Máximo horario: {insights?.peakHourOrders || 0} órdenes registradas
                </span>
              </div>

              {/* Card 4: Franja Horaria Principal */}
              <div className="glass-card" style={{ padding: '1.15rem', borderLeft: '4px solid #c084fc' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sun size={15} color="#c084fc" /> Franja Horaria Favorita
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
                  🌅 {insights?.peakWindowName || 'N/A'}
                </div>
                <span style={{ fontSize: '0.76rem', color: '#c084fc', fontWeight: 600 }}>
                  Mayor concentración de compras del día
                </span>
              </div>

            </div>

            {/* GRÁFICA VISUAL 24 HORAS (DISTRIBUCIÓN HORARIA DE COMPRAS) */}
            <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.98))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <BarChart2 size={20} color="#38bdf8" />
                    Distribución de Compras por Hora del Día (00:00 - 23:59 Hora Nicaragua)
                  </h3>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Pasa el cursor sobre cualquier barra horaria para inspeccionar el volumen exacto de órdenes e ingresos.
                  </span>
                </div>

                {selectedHour !== null && data?.byHourOfDay?.[selectedHour] && (
                  <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>
                    Hora {data.byHourOfDay[selectedHour].label}: {data.byHourOfDay[selectedHour].ordersCount} órdenes ({formatCurrency(data.byHourOfDay[selectedHour].revenueNio, data.byHourOfDay[selectedHour].revenueUsd)})
                  </div>
                )}
              </div>

              {/* Barras de 24 Horas */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '220px', padding: '1rem 0.5rem 0 0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                {(data?.byHourOfDay || []).map((h) => {
                  const isPeak = h.ordersCount === maxOrdersInHour && maxOrdersInHour > 0;
                  const heightPct = Math.max(6, Math.round((h.ordersCount / maxOrdersInHour) * 100));

                  return (
                    <div
                      key={h.hour}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={() => setSelectedHour(h.hour)}
                      onMouseLeave={() => setSelectedHour(null)}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: `${heightPct}%`,
                          background: isPeak
                            ? 'linear-gradient(180deg, #f59e0b, #ef4444)'
                            : selectedHour === h.hour
                            ? 'linear-gradient(180deg, #38bdf8, #2563eb)'
                            : 'linear-gradient(180deg, rgba(56, 189, 248, 0.7), rgba(37, 99, 235, 0.3))',
                          borderRadius: '4px 4px 0 0',
                          transition: 'all 0.2s ease',
                          position: 'relative',
                        }}
                      >
                        {h.ordersCount > 0 && (
                          <div style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.68rem', fontWeight: 700, color: isPeak ? '#fbbf24' : '#ffffff' }}>
                            {h.ordersCount}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Etiquetas de Eje X (Horas) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', padding: '0 0.2rem' }}>
                {(data?.byHourOfDay || []).map((h) => (
                  <div
                    key={h.hour}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontSize: '0.66rem',
                      color: h.hour % 3 === 0 ? '#ffffff' : 'var(--text-dim)',
                      fontWeight: h.hour % 3 === 0 ? 700 : 400,
                    }}
                  >
                    {h.hour % 3 === 0 ? `${String(h.hour).padStart(2, '0')}:00` : ''}
                  </div>
                ))}
              </div>
            </div>

            {/* SECCIÓN INFERIOR: POR DÍAS DE LA SEMANA Y FRANJAS HORARIAS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
              
              {/* TABLA DÍAS DE LA SEMANA */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#34d399', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={18} color="#34d399" />
                  Rendimiento por Día de la Semana
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(data?.byDayOfWeek || []).map((d, idx) => {
                    const isPeakRevenue = d.revenueNio === maxRevenueInDay && maxRevenueInDay > 0;
                    const isPeakOrders = d.ordersCount === maxOrdersInDay && maxOrdersInDay > 0;
                    const isAbsLider = isPeakRevenue && isPeakOrders;

                    let badgeLabel = null;
                    let badgeBg = 'transparent';
                    let badgeBorder = 'transparent';
                    let badgeColor = '#ffffff';

                    if (isAbsLider) {
                      badgeLabel = '👑 Líder Absoluto (Facturación & Pedidos)';
                      badgeBg = 'rgba(245, 158, 11, 0.15)';
                      badgeBorder = 'rgba(245, 158, 11, 0.4)';
                      badgeColor = '#fbbf24';
                    } else if (isPeakRevenue) {
                      badgeLabel = '💰 Mayor Facturación';
                      badgeBg = 'rgba(52, 211, 153, 0.15)';
                      badgeBorder = 'rgba(52, 211, 153, 0.4)';
                      badgeColor = '#34d399';
                    } else if (isPeakOrders) {
                      badgeLabel = '📦 Mayor Nº de Pedidos';
                      badgeBg = 'rgba(56, 189, 248, 0.15)';
                      badgeBorder = 'rgba(56, 189, 248, 0.4)';
                      badgeColor = '#38bdf8';
                    }

                    return (
                      <div
                        key={idx}
                        style={{
                          background: isAbsLider
                            ? 'rgba(245, 158, 11, 0.08)'
                            : isPeakRevenue
                            ? 'rgba(52, 211, 153, 0.08)'
                            : isPeakOrders
                            ? 'rgba(56, 189, 248, 0.08)'
                            : 'rgba(255, 255, 255, 0.03)',
                          border: isAbsLider
                            ? '1px solid rgba(245, 158, 11, 0.4)'
                            : isPeakRevenue
                            ? '1px solid rgba(52, 211, 153, 0.4)'
                            : isPeakOrders
                            ? '1px solid rgba(56, 189, 248, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: '10px',
                          padding: '0.75rem 0.9rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isAbsLider ? '#fbbf24' : isPeakRevenue ? '#34d399' : isPeakOrders ? '#38bdf8' : '#ffffff' }}>
                              {d.name}
                            </span>

                            {badgeLabel && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: badgeColor, backgroundColor: badgeBg, border: `1px solid ${badgeBorder}`, padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                {badgeLabel}
                              </span>
                            )}

                            <span style={{ fontSize: '0.72rem', color: isPeakOrders ? '#38bdf8' : 'var(--text-muted)', fontWeight: isPeakOrders ? 700 : 400, background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                              {d.ordersCount} órdenes
                            </span>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isPeakRevenue ? '#34d399' : '#ffffff', fontFamily: 'var(--font-mono)' }}>
                              {formatCurrency(d.revenueNio, d.revenueUsd)}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Ticket Prom: {formatCurrency(d.avgTicketNio, d.avgTicketUsd)}
                            </span>
                          </div>
                        </div>

                        {/* Barra de Proporción */}
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.max(3, d.pctOfTotal))}%`, height: '100%', background: isAbsLider ? '#fbbf24' : isPeakRevenue ? '#34d399' : isPeakOrders ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)', borderRadius: '2px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ANÁLISIS DE FRANJAS HORARIAS (MADRUGADA, MAÑANA, TARDE, NOCHE) */}
              <div className="glass-card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fbbf24', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sun size={18} color="#fbbf24" />
                  Ventas por Franja Horaria del Día
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {(data?.byTimeWindow || []).map((w, idx) => {
                    let icon = <Sun size={18} color="#fbbf24" />;
                    if (w.key === 'madrugada') icon = <Moon size={18} color="#c084fc" />;
                    if (w.key === 'manana') icon = <Sunrise size={18} color="#38bdf8" />;
                    if (w.key === 'tarde') icon = <Sun size={18} color="#fbbf24" />;
                    if (w.key === 'noche') icon = <Sunset size={18} color="#f43f5e" />;

                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: '12px',
                          padding: '0.85rem 1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {icon}
                          </div>
                          <div>
                            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff', display: 'block' }}>
                              {w.name}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {w.ordersCount} órdenes completadas ({w.pctOfTotal}% de ventas)
                            </span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                            {formatCurrency(w.revenueNio, w.revenueUsd)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>
    </AppLayout>
  );
}
