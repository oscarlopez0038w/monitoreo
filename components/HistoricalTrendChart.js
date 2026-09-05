'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Calendar,
  DollarSign,
  ShoppingCart,
  Users,
  Globe,
  RefreshCw,
  Trophy,
} from 'lucide-react';

// Generador de curvas Bezier suaves para SVG
function buildSvgPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 2;
    const cp1y = p0.y;
    const cp2x = p0.x + (p1.x - p0.x) / 2;
    const cp2y = p1.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export default function HistoricalTrendChart({ formatCurrency, currencyMode = 'usd', bcnRate = 36.6243 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [includeSocialSelling, setIncludeSocialSelling] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const fetchHistoricalData = async (forceRefresh = false, yearToFetch = selectedYear) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/analytics/historical?year=${yearToFetch}${forceRefresh ? '&refresh=true' : ''}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error al obtener datos históricos');
      }
      setData(json);
    } catch (err) {
      console.error('Error fetching historical analytics:', err);
      setError(err.message || 'No se pudo cargar el histórico de ventas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoricalData(false, selectedYear);
  }, []);

  if (loading && !data) {
    return (
      <div
        className="glass-card"
        style={{
          padding: '1.25rem',
          marginBottom: '1.5rem',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '260px',
          color: 'var(--text-muted)',
          gap: '0.6rem',
        }}
      >
        <RefreshCw size={24} className="animate-spin" color="#34d399" />
        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#ffffff' }}>
          Cargando histórico mensual de ventas {selectedYear} ({selectedYear === 2026 ? 'YTD' : 'Anual'})...
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          Consolidando datos mensuales desde el 01 de Enero.
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="glass-card"
        style={{
          padding: '1.2rem',
          marginBottom: '1.5rem',
          borderRadius: '14px',
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          color: '#fb7185',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <strong>Error al cargar histórico anual:</strong> {error}
        </div>
        <button
          onClick={() => fetchHistoricalData(true)}
          className="btn-secondary"
          style={{ padding: '0.3rem 0.75rem', fontSize: '0.76rem' }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const items = data?.monthlyBreakdown || [];
  if (!items || items.length === 0) return null;

  // Helpers según inclusión de Social Selling
  const getVal = (item) => (includeSocialSelling ? (item?.salesNio || 0) : (item?.webSalesNio ?? item?.salesNio ?? 0));
  const getValUsd = (item) => (includeSocialSelling ? (item?.salesUsd || 0) : (item?.webSalesUsd ?? item?.salesUsd ?? 0));

  // Dimensiones del SVG (Vista Mensual)
  const svgWidth = 1000;
  const svgHeight = 220;
  const paddingLeft = 55;
  const paddingRight = 45;
  const paddingTop = 26;
  const paddingBottom = 30;

  const chartW = svgWidth - paddingLeft - paddingRight;
  const chartH = svgHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(...items.map((i) => Math.max(getVal(i), i.refundsNio || 0)), 1000);

  // Puntos para curva de ventas
  const points = items.map((item, idx) => {
    const x = paddingLeft + (idx / (items.length - 1 || 1)) * chartW;
    const y = paddingTop + chartH - (getVal(item) / maxVal) * chartH;
    return { x, y, item, index: idx };
  });

  const pathSales = buildSvgPath(points);
  const areaSales = points.length > 0
    ? `${pathSales} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`
    : '';

  // Hallar índice de mayor y menor venta
  let maxValIdx = 0;
  let minValIdx = 0;
  items.forEach((it, idx) => {
    if (getVal(it) > getVal(items[maxValIdx])) maxValIdx = idx;
    if (getVal(it) < getVal(items[minValIdx]) && getVal(it) > 0) minValIdx = idx;
  });

  const activeItem = hoveredIdx !== null ? items[hoveredIdx] : null;
  const activePt = hoveredIdx !== null ? points[hoveredIdx] : null;
  const xPct = activePt ? (activePt.x / svgWidth) * 100 : 0;
  const isRightSide = xPct > 55;

  const ytd = data?.ytdSummary;
  const currentNetSalesNio = includeSocialSelling ? (ytd?.salesNio || 0) : (ytd?.webSalesNio || 0);
  const currentNetSalesUsd = includeSocialSelling ? (ytd?.salesUsd || 0) : (ytd?.webSalesUsd || 0);

  // Órdenes aprobadas según filtro (Web vs Total)
  const currentApprovedOrders = items.reduce(
    (sum, m) => sum + (includeSocialSelling ? (m?.approvedOrders || 0) : (m?.webOrders || 0)),
    0
  );

  // Ticket promedio según filtro
  const currentAvgTicketNio = currentApprovedOrders > 0 ? (currentNetSalesNio / currentApprovedOrders) : 0;
  const currentAvgTicketUsd = currentApprovedOrders > 0 ? (currentNetSalesUsd / currentApprovedOrders) : 0;

  // Mes récord según filtro (coincide exactamente con el mes del trofeo 🏆 en la curva)
  const topItem = items[maxValIdx] || null;

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '1.15rem',
        position: 'relative',
        marginBottom: '1.5rem',
        overflow: 'visible',
      }}
    >
      {/* 1. Header con Título, Selector de Año, Checkbox y Botón Refrescar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
          <div>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0 }}>
              <Calendar size={18} color="#34d399" />
              Histórico Mensual de Ventas ({data?.year === 2026 ? `YTD ${data?.year} - Enero a la fecha` : `Año ${data?.year || selectedYear} Completo`})
              {!includeSocialSelling && (
                <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, background: 'rgba(56, 189, 248, 0.15)', padding: '0.12rem 0.45rem', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                  🌐 Solo Web Orgánico
                </span>
              )}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.76rem', color: '#94a3b8' }}>
              Consolidado mensual de ventas de cada mes del año {data?.year || selectedYear}. Pasa el cursor sobre los meses para ver el desglose detallado.
            </p>
          </div>

          {/* Controles: Selector de Año + Checkbox Social Selling + Refrescar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>

            {/* Selector de Año (Pills: 2026, 2025, 2024) */}
            <div
              style={{
                display: 'inline-flex',
                background: 'rgba(15, 23, 42, 0.9)',
                borderRadius: '8px',
                padding: '0.18rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              {[2026, 2025, 2024].map((yr) => (
                <button
                  key={yr}
                  onClick={() => {
                    if (selectedYear !== yr) {
                      setSelectedYear(yr);
                      setHoveredIdx(null);
                      fetchHistoricalData(false, yr);
                    }
                  }}
                  style={{
                    padding: '0.24rem 0.62rem',
                    fontSize: '0.73rem',
                    fontWeight: selectedYear === yr ? 700 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: selectedYear === yr ? '#10b981' : 'transparent',
                    color: selectedYear === yr ? '#0f172a' : '#94a3b8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {yr}
                </button>
              ))}
            </div>

            {/* Checkbox para alternar inclusión de Social Selling */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                cursor: 'pointer',
                fontSize: '0.76rem',
                fontWeight: 700,
                padding: '0.3rem 0.7rem',
                borderRadius: '8px',
                background: includeSocialSelling ? 'rgba(52, 211, 153, 0.12)' : 'rgba(56, 189, 248, 0.14)',
                border: includeSocialSelling ? '1px solid rgba(52, 211, 153, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)',
                color: includeSocialSelling ? '#34d399' : '#38bdf8',
                userSelect: 'none',
                transition: 'all 0.2s ease',
              }}
              title={includeSocialSelling ? 'Desmarcar para que el histórico muestre únicamente ventas web orgánicas' : 'Marcar para incluir ventas de Social Selling en el histórico'}
            >
              <input
                type="checkbox"
                checked={includeSocialSelling}
                onChange={(e) => setIncludeSocialSelling(e.target.checked)}
                style={{ accentColor: '#10b981', cursor: 'pointer', width: '14px', height: '14px' }}
              />
              <span>{includeSocialSelling ? '✓ Incluir Social Selling' : '🌐 Solo Ventas Web'}</span>
            </label>

            {/* Botón Refrescar */}
            <button
              onClick={() => fetchHistoricalData(true)}
              disabled={loading}
              title="Actualizar datos históricos de VTEX / Supabase"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#94a3b8',
                borderRadius: '8px',
                padding: '0.32rem 0.55rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.74rem',
                fontWeight: 600,
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* 2. Resumen Ejecutivo (4 Mini-Tarjetas Alineadas y Reactivas al Filtro) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
            paddingTop: '0.2rem',
          }}
        >
          {/* Card 1: Ventas Netas */}
          <div
            style={{
              background: 'rgba(52, 211, 153, 0.05)',
              border: '1px solid rgba(52, 211, 153, 0.2)',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
            }}
          >
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <DollarSign size={13} color="#34d399" /> Ventas Netas ({data?.year})
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', marginTop: '0.2rem' }}>
              {formatCurrency(currentNetSalesNio, currentNetSalesUsd)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
              {includeSocialSelling ? 'Web + Social Selling' : 'Solo Web Orgánica'}
            </div>
          </div>

          {/* Card 2: Total Órdenes Aprobadas */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
            }}
          >
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <ShoppingCart size={13} color="#38bdf8" /> Órdenes Aprobadas ({data?.year})
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginTop: '0.2rem' }}>
              {currentApprovedOrders.toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#94a3b8' }}>órdenes</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
              {includeSocialSelling
                ? <>Tasa cancelación: <strong style={{ color: '#fb7185' }}>{ytd?.cancelRate || 0}%</strong> ({ytd?.canceledOrders || 0} canceladas)</>
                : <>Solo pedidos aprobados en tienda web</>
              }
            </div>
          </div>

          {/* Card 3: Ticket Promedio */}
          <div
            style={{
              background: 'rgba(165, 180, 252, 0.05)',
              border: '1px solid rgba(165, 180, 252, 0.2)',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
            }}
          >
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <TrendingUp size={13} color="#a5b4fc" /> Ticket Promedio ({data?.year})
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a5b4fc', marginTop: '0.2rem' }}>
              {formatCurrency(currentAvgTicketNio, currentAvgTicketUsd)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
              {includeSocialSelling ? `Promedio ponderado año ${data?.year}` : `Promedio pedidos web ${data?.year}`}
            </div>
          </div>

          {/* Card 4: Mes Pico */}
          <div
            style={{
              background: 'rgba(251, 191, 36, 0.05)',
              border: '1px solid rgba(251, 191, 36, 0.2)',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
            }}
          >
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Trophy size={13} color="#fbbf24" /> Mes Récord de Ventas ({data?.year})
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.2rem' }}>
              {topItem?.monthName || 'N/A'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
              {topItem ? formatCurrency(getVal(topItem), getValUsd(topItem)) : 'C$ 0.00'}
            </div>
          </div>
        </div>

        {/* Fila con Subtítulo y Leyenda/Stats de Hover con altura fija (Zero Layout Shift) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', minHeight: '32px', marginTop: '0.2rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Mostrando consolidado mensual (Ene - Dic). Pasa el cursor sobre un mes para ver detalles.
          </div>

          {/* Caja fija de Leyenda / Hover */}
          <div style={{ display: 'flex', alignItems: 'center', height: '28px', flexShrink: 0 }}>
            {activeItem ? (
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  borderRadius: '8px',
                  padding: '0.2rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  height: '28px',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ color: '#ffffff' }}>
                  📅 {activeItem.monthName}:
                </span>
                <span style={{ color: '#34d399' }}>
                  Ventas: {formatCurrency(getVal(activeItem), getValUsd(activeItem))}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.73rem' }}>
                  ({includeSocialSelling ? activeItem.approvedOrders : activeItem.webOrders} órdenes {includeSocialSelling ? 'aprobadas' : 'web'})
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', fontSize: '0.75rem', flexWrap: 'wrap', height: '28px', boxSizing: 'border-box' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#34d399', fontWeight: 700 }}>
                  <span style={{ width: '12px', height: '3px', backgroundColor: '#34d399', borderRadius: '2px', boxShadow: '0 0 8px #34d399' }} /> Ventas Netas
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#fbbf24', fontWeight: 700 }}>
                  🏆 Pico Máximo
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Canvas Gráfico SVG */}
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden', padding: '0.4rem 0' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            overflow: 'visible',
          }}
        >
          <defs>
            <linearGradient id="gradHistoricalSalesArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Guías Horizontales de Montos */}
          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = paddingTop + chartH * (1 - ratio);
            const valLabel = maxVal * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="10"
                  fontWeight="600"
                >
                  C$ {valLabel >= 1000 ? `${(valLabel / 1000).toFixed(0)}k` : valLabel.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Degradado bajo la curva */}
          {areaSales && <path d={areaSales} fill="url(#gradHistoricalSalesArea)" style={{ transition: 'd 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />}

          {/* Curva Suave Principal (Verde Esmeralda) */}
          <path d={pathSales} fill="none" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'd 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />

          {/* Columna interactiva al hacer hover */}
          {hoveredIdx !== null && (
            <rect
              x={points[hoveredIdx].x - 24}
              y={paddingTop - 10}
              width={48}
              height={chartH + 20}
              fill="rgba(52, 211, 153, 0.08)"
              rx={6}
            />
          )}

          {/* Nodos de cada mes */}
          {items.map((item, idx) => {
            const pt = points[idx];
            const isHovered = hoveredIdx === idx;
            const isTop = idx === maxValIdx;
            const isMin = idx === minValIdx && getVal(item) > 0;

            const label = item.monthShort;

            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Etiqueta Eje X */}
                {label && (
                  <text
                    x={pt.x}
                    y={svgHeight - 6}
                    textAnchor="middle"
                    fill={isHovered ? '#34d399' : '#94a3b8'}
                    fontSize={isHovered ? '11' : '10'}
                    fontWeight={isHovered ? '700' : '500'}
                  >
                    {label}
                  </text>
                )}

                {/* Halo del pico máximo (Trofeo Dorado) */}
                {isTop && (
                  <g>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={14}
                      fill="rgba(251, 191, 36, 0.18)"
                      stroke="#fbbf24"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                    />
                    <text
                      x={pt.x}
                      y={Math.max(12, pt.y - 14)}
                      textAnchor="middle"
                      fill="#fbbf24"
                      fontSize="12"
                      fontWeight="800"
                      style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                    >
                      🏆
                    </text>
                  </g>
                )}

                {/* Halo del mínimo significativo */}
                {isMin && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={10}
                    fill="rgba(245, 158, 11, 0.15)"
                    stroke="#f59e0b"
                    strokeWidth="1"
                    style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                  />
                )}

                {/* Punto Principal Verde */}
                {isHovered && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={16}
                    fill="rgba(16, 185, 129, 0.25)"
                    style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 7.5 : 4.5}
                  fill={isHovered ? '#34d399' : isTop ? '#fbbf24' : '#10b981'}
                  stroke="#ffffff"
                  strokeWidth={isHovered || isTop ? 2 : 1}
                  style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* 4. Popover / Tooltip Flotante */}
      {activeItem && activePt && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: isRightSide ? 'auto' : `${Math.min(68, Math.max(2, xPct - 4))}%`,
            right: isRightSide ? `${Math.min(68, Math.max(2, 100 - xPct - 4))}%` : 'auto',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(30, 41, 59, 0.99))',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.8), 0 0 25px rgba(16, 185, 129, 0.25)',
            borderRadius: '14px',
            padding: '0.8rem 1.05rem',
            zIndex: 100,
            minWidth: '260px',
            pointerEvents: 'none',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.35rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              📅 {activeItem.monthName} ({data?.year})
            </span>
            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
              {includeSocialSelling ? activeItem.approvedOrders : activeItem.webOrders} órdenes {includeSocialSelling ? 'aprobadas' : 'web'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                💰 Ventas Netas {includeSocialSelling ? '(Web + Social)' : '(Solo Web)'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', lineHeight: 1.2 }}>
                {formatCurrency(getVal(activeItem), getValUsd(activeItem))}
              </div>
              {includeSocialSelling && (activeItem.socialSalesNio > 0 || activeItem.webSalesNio > 0) && (
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem', display: 'flex', gap: '0.65rem' }}>
                  <span>🌐 Web: <strong style={{ color: '#38bdf8' }}>{formatCurrency(activeItem.webSalesNio || 0, activeItem.webSalesUsd || 0)}</strong></span>
                  <span>🤝 Social: <strong style={{ color: '#34d399' }}>{formatCurrency(activeItem.socialSalesNio || 0, activeItem.socialSalesUsd || 0)}</strong></span>
                </div>
              )}
            </div>

            {activeItem.refundsNio > 0 && (
              <div>
                <div style={{ fontSize: '0.7rem', color: '#fb7185', textTransform: 'uppercase', fontWeight: 700 }}>
                  🛑 Canceladas ({activeItem.canceledOrders} ord.)
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fb7185' }}>
                  {formatCurrency(activeItem.refundsNio, activeItem.refundsUsd)}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.1)', paddingTop: '0.35rem', marginTop: '0.1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700 }}>
                🎫 Ticket Promedio {includeSocialSelling ? '' : '(Web)'}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#a5b4fc' }}>
                {formatCurrency(
                  includeSocialSelling || !activeItem.webOrders
                    ? activeItem.avgTicketNio
                    : (activeItem.webSalesNio / activeItem.webOrders),
                  includeSocialSelling || !activeItem.webOrders
                    ? activeItem.avgTicketUsd
                    : (activeItem.webSalesUsd / activeItem.webOrders)
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
