'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { getNicaraguaNow } from '@/lib/dateUtils';
import * as XLSX from 'xlsx';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Receipt,
  AlertTriangle,
  Users,
  Globe,
  Share2,
  Calendar,
  RefreshCw,
  CheckCircle2,
  Clock,
  Zap,
  Filter,
  CircleDollarSign,
  Megaphone,
  Tag,
  Truck,
  Store,
  MapPin,
  Gift,
  FileSpreadsheet,
  ChevronDown,
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

// Componente Ejecutivo de Gráfica de Tendencia Diaria con Puntos Interactivos (Hover Ampliado)
function DailyInteractiveTrendChart({ dailyBreakdown = [], formatCurrency, bcnRate = 36.6243, periodLabel = '' }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!dailyBreakdown || dailyBreakdown.length === 0) return null;

  // Dimensiones del canvas SVG (Modo Compacto Ejecutivo)
  const svgWidth = 1000;
  const svgHeight = 200;
  const paddingLeft = 50;
  const paddingRight = 40;
  const paddingTop = 22;
  const paddingBottom = 24;

  const chartW = svgWidth - paddingLeft - paddingRight;
  const chartH = svgHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(...dailyBreakdown.map((d) => Math.max(d.salesNio, d.refundsNio)), 1000);

  // Calcular puntos de coordenadas (X, Y) para Ventas y Devoluciones
  const pointsSales = dailyBreakdown.map((d, i) => {
    const x = paddingLeft + (i / (dailyBreakdown.length - 1 || 1)) * chartW;
    const y = paddingTop + chartH - (d.salesNio / maxVal) * chartH;
    return { x, y, day: d, index: i };
  });

  const pointsRefunds = dailyBreakdown.map((d, i) => {
    const x = paddingLeft + (i / (dailyBreakdown.length - 1 || 1)) * chartW;
    const y = paddingTop + chartH - (d.refundsNio / maxVal) * chartH;
    return { x, y, day: d, index: i };
  });

  const pathSales = buildSvgPath(pointsSales);
  const pathRefunds = buildSvgPath(pointsRefunds);

  // Paths de área para degradados inferiores
  const areaSales = pointsSales.length > 0
    ? `${pathSales} L ${pointsSales[pointsSales.length - 1].x} ${paddingTop + chartH} L ${pointsSales[0].x} ${paddingTop + chartH} Z`
    : '';

  const activeDay = hoveredIdx !== null ? dailyBreakdown[hoveredIdx] : null;
  const activeSalesPt = hoveredIdx !== null ? pointsSales[hoveredIdx] : null;

  // Días con órdenes válidas para determinar Ticket Promedio más alto y más bajo
  const daysWithTicket = dailyBreakdown
    .map((d, idx) => ({ ...d, idx }))
    .filter((d) => (d.approvedOrders || 0) > 0 && (d.avgTicketNio || 0) > 0);

  let highestTicketIdx = null;
  let lowestTicketIdx = null;
  let highestTicketDay = null;
  let lowestTicketDay = null;

  if (daysWithTicket.length > 0) {
    let maxD = daysWithTicket[0];
    let minD = daysWithTicket[0];
    for (const d of daysWithTicket) {
      if (d.avgTicketNio > maxD.avgTicketNio) maxD = d;
      if (d.avgTicketNio < minD.avgTicketNio) minD = d;
    }
    highestTicketIdx = maxD.idx;
    highestTicketDay = maxD;
    if (minD.idx !== maxD.idx) {
      lowestTicketIdx = minD.idx;
      lowestTicketDay = minD;
    }
  }

  // Posicionamiento 100% Inmune a Recortes (Anclado al Contenedor Principal de la Tarjeta)
  const xPct = activeSalesPt ? (activeSalesPt.x / svgWidth) * 100 : 50;
  const isRightSide = xPct > 50;

  return (
    <div style={{ background: 'rgba(15, 23, 42, 0.8)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '0.9rem 1.15rem', position: 'relative', marginBottom: '0.9rem', overflow: 'visible' }}>
      
      {/* Encabezado y Leyenda de Gráfica */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
            <TrendingUp size={16} color="#10b981" />
            Tendencia Diaria de Ventas & Devoluciones ({periodLabel || 'Período Seleccionado'})
          </h3>
          <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
            Pasa el cursor sobre los nodos/puntos para ampliar los detalles de cada día en tiempo real.
          </p>
        </div>

        {/* Leyenda interactiva + Banners de Ticket Máx / Mín */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {activeDay ? (
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#38bdf8',
                borderRadius: '10px',
                padding: '0.35rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                transition: 'all 0.25s ease',
              }}
            >
              <span>📅 {activeDay.dayLabel}:</span>
              <span style={{ color: '#10b981' }}>Ventas {formatCurrency(activeDay.salesNio, activeDay.salesUsd)}</span>
              <span>• {activeDay.approvedOrders} ord.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', fontSize: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#10b981', fontWeight: 700 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} /> Ventas
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#fb7185', fontWeight: 700 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#fb7185', boxShadow: '0 0 8px #fb7185' }} /> Devoluciones
              </span>
              {highestTicketDay && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#34d399', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                  🏆 Ticket Máx: {highestTicketDay.dayLabel} ({formatCurrency(highestTicketDay.avgTicketNio, highestTicketDay.avgTicketUsd)})
                </span>
              )}
              {lowestTicketDay && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#f59e0b', fontWeight: 700, background: 'rgba(245, 158, 11, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
                  ⚠️ Ticket Mín: {lowestTicketDay.dayLabel} ({formatCurrency(lowestTicketDay.avgTicketNio, lowestTicketDay.avgTicketUsd)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SVG Canvas interactivo */}
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto', padding: '0.5rem 0' }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', minWidth: '700px', display: 'block', overflow: 'visible' }}>
          
          <defs>
            {/* Degradados para líneas y áreas */}
            <linearGradient id="gradSalesArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradRefundsArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Guías Horizontales de Montos */}
          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = paddingTop + chartH * (1 - ratio);
            const valLabel = maxVal * ratio;
            return (
              <g key={ratio}>
                <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="rgba(255, 255, 255, 0.07)" strokeDasharray="4 4" />
                <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10" fontWeight="600">
                  C$ {valLabel >= 1000 ? `${(valLabel / 1000).toFixed(0)}k` : valLabel.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Degradado bajo curvas */}
          {areaSales && <path d={areaSales} fill="url(#gradSalesArea)" />}

          {/* Curva de Devoluciones (Rosa Elegante Fina) */}
          <path d={pathRefunds} fill="none" stroke="#fb7185" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

          {/* Curva de Ventas (Verde Neón Elegante Fina) */}
          <path d={pathSales} fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" />

          {/* Columna / Franja vertical interactiva al hacer Hover */}
          {hoveredIdx !== null && (
            <rect
              x={pointsSales[hoveredIdx].x - 14}
              y={paddingTop - 10}
              width={28}
              height={chartH + 20}
              fill="rgba(56, 189, 248, 0.08)"
              rx={6}
            />
          )}

          {/* NODOS Y PUNTOS CIRCULARES ELEGANTES (SE AMPLÍAN CON FLUIDEZ AL HACER HOVER) */}
          {dailyBreakdown.map((d, i) => {
            const ptS = pointsSales[i];
            const ptR = pointsRefunds[i];
            const isHovered = hoveredIdx === i;
            const totalDays = dailyBreakdown.length;
            const isHighestTicket = highestTicketIdx === i;
            const isLowestTicket = lowestTicketIdx === i;

            // Formato de etiqueta en X sin amontonamiento
            const showXLabel = totalDays <= 16 || i % 2 === 0 || isHovered || i === totalDays - 1;
            const xLabelText = String(d.dayNum || i + 1).padStart(2, '0');

            return (
              <g
                key={d.date}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Etiqueta del Día en Eje X */}
                {showXLabel && (
                  <text
                    x={ptS.x}
                    y={svgHeight - 12}
                            fill={isHovered ? '#38bdf8' : isHighestTicket ? '#34d399' : isLowestTicket ? '#f59e0b' : '#64748b'}
                    fontSize={isHovered || isHighestTicket || isLowestTicket ? '11' : '10'}
                    fontWeight={isHovered || isHighestTicket || isLowestTicket ? '800' : '600'}
                  >
                    {xLabelText}
                  </text>
                )}

                {/* Halo Destacado de Ticket Promedio Más Alto (Verde Success) */}
                {isHighestTicket && (
                  <g>
                    <circle
                      cx={ptS.x}
                      cy={ptS.y}
                      r={11}
                      fill="rgba(16, 185, 129, 0.18)"
                      stroke="#10b981"
                      strokeWidth="1.4"
                      strokeDasharray="3 2"
                    />
                    <text
                      x={ptS.x}
                      y={Math.max(12, ptS.y - 12)}
                      textAnchor="middle"
                      fill="#34d399"
                      fontSize="9"
                      fontWeight="800"
                    >
                      🏆
                    </text>
                  </g>
                )}

                {/* Halo Destacado de Ticket Promedio Más Bajo (Ámbar Warning) */}
                {isLowestTicket && (
                  <g>
                    <circle
                      cx={ptS.x}
                      cy={ptS.y}
                      r={10}
                      fill="rgba(245, 158, 11, 0.18)"
                      stroke="#f59e0b"
                      strokeWidth="1.4"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={ptS.x}
                      y={Math.max(12, ptS.y - 12)}
                      textAnchor="middle"
                      fill="#f59e0b"
                      fontSize="9"
                      fontWeight="800"
                    >
                      ⚠️
                    </text>
                  </g>
                )}

                {/* Punto de Devolución (Rosa Fino) */}
                {d.refundsNio > 0 && (
                  <circle
                    cx={ptR.x}
                    cy={ptR.y}
                    r={isHovered ? 5.5 : 2.5}
                    fill="#fb7185"
                    stroke="#0f172a"
                    strokeWidth={isHovered ? 2 : 1}
                    style={{ transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                  />
                )}

                {/* Punto de Venta (Verde Neón Elegante) */}
                {isHovered && (
                  <circle
                    cx={ptS.x}
                    cy={ptS.y}
                    r={12}
                    fill="rgba(16, 185, 129, 0.2)"
                  />
                )}
                <circle
                  cx={ptS.x}
                  cy={ptS.y}
                  r={isHovered ? 6.5 : isHighestTicket || isLowestTicket ? 4.0 : 2.8}
                  fill={isHovered ? '#34d399' : isHighestTicket ? '#34d399' : isLowestTicket ? '#f59e0b' : '#10b981'}
                  stroke="#ffffff"
                  strokeWidth={isHovered || isHighestTicket || isLowestTicket ? 2 : 1}
                  style={{ transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* TOOLTIP / POPOVER FLOTANTE AL NIVEL RAÍZ DE LA TARJETA (100% INMUNE A RECORTES BCN) */}
      {activeDay && activeSalesPt && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: isRightSide ? 'auto' : `${Math.min(65, Math.max(2, xPct - 5))}%`,
            right: isRightSide ? `${Math.min(65, Math.max(2, 100 - xPct - 5))}%` : 'auto',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(30, 41, 59, 0.99))',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.8), 0 0 25px rgba(16, 185, 129, 0.25)',
            borderRadius: '14px',
            padding: '0.8rem 1.05rem',
            zIndex: 100,
            minWidth: '270px',
            pointerEvents: 'none',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Encabezado del Popover */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.35rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              📅 Día {activeDay.dayLabel} <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>({activeDay.date})</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
              {activeDay.approvedOrders} órdenes
            </span>
          </div>

          {/* Banner de Ticket Máx / Mín en Popover */}
          {hoveredIdx === highestTicketIdx && (
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '6px', padding: '0.2rem 0.5rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              🏆 Día con el Ticket Promedio MÁS ALTO del Período
            </div>
          )}
          {hoveredIdx === lowestTicketIdx && (
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '6px', padding: '0.2rem 0.5rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              ⚠️ Día con el Ticket Promedio MÁS BAJO del Período
            </div>
          )}

          {/* Datos Principales Ampliados */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {/* Ventas Aprobadas */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>💰 Ventas del Día</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981', lineHeight: 1.2 }}>
                {formatCurrency(activeDay.salesNio, activeDay.salesUsd)}
              </div>
            </div>

            {/* Devoluciones si existen */}
            {activeDay.refundsNio > 0 && (
              <div>
                <div style={{ fontSize: '0.7rem', color: '#fb7185', textTransform: 'uppercase', fontWeight: 700 }}>🛑 Devoluciones / Canceladas ({activeDay.canceledOrders} ord.)</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fb7185' }}>
                  {formatCurrency(activeDay.refundsNio, activeDay.refundsUsd)}
                </div>
              </div>
            )}

            {/* Ticket Promedio del Día */}
            <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.1)', paddingTop: '0.35rem', marginTop: '0.1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700 }}>🎫 Ticket Promedio del Día</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#a5b4fc' }}>
                {formatCurrency(activeDay.avgTicketNio, activeDay.avgTicketUsd)}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function DashboardPage() {
  const nicNow = getNicaraguaNow();

  // Cálculo de mes anterior y mismo día para Período B
  let pY = nicNow.year;
  let pM = nicNow.month - 1;
  if (pM < 0) {
    pM = 11;
    pY -= 1;
  }
  const pMStr = String(pM + 1).padStart(2, '0');
  const lastDayPM = new Date(pY, pM + 1, 0).getDate();
  const sameDayPM = Math.min(nicNow.day, lastDayPM);

  const defaultStartB = `${pY}-${pMStr}-01`;
  const defaultFullEndB = `${pY}-${pMStr}-${String(lastDayPM).padStart(2, '0')}`;
  const sameDayPMStr = `${pY}-${pMStr}-${String(sameDayPM).padStart(2, '0')}`;

  // Período A por defecto: HOY (todayStr)
  const [startDateA, setStartDateA] = useState(nicNow.todayStr);
  const [endDateA, setEndDateA] = useState(nicNow.todayStr);

  // Período B por defecto: Mismo día del mes anterior (1 día a 1 día)
  const [startDateB, setStartDateB] = useState(sameDayPMStr);
  const [endDateB, setEndDateB] = useState(sameDayPMStr);

  const [selectedPreset, setSelectedPreset] = useState('today');
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);

  const presetOptions = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'last_7_days', label: 'Last 7 Days' },
    { id: 'current_month', label: 'Current month' },
    { id: 'last_30_days', label: 'Last 30 days' },
    { id: 'custom', label: 'Custom' },
  ];

  const updateCustomDates = (newSA, newEA) => {
    const sA = newSA !== undefined ? newSA : startDateA;
    const eA = newEA !== undefined ? newEA : endDateA;
    setStartDateA(sA);
    setEndDateA(eA);
    setSelectedPreset('custom');

    if (sA && eA) {
      const [sY, sM, sD] = sA.split('-').map(Number);
      const [eY, eM, eD] = eA.split('-').map(Number);

      let pSY = sY;
      let pSM = sM - 2;
      if (pSM < 0) { pSM += 12; pSY -= 1; }

      let pEY = eY;
      let pEM = eM - 2;
      if (pEM < 0) { pEM += 12; pEY -= 1; }

      const lastDayPSM = new Date(pSY, pSM + 1, 0).getDate();
      const lastDayPEM = new Date(pEY, pEM + 1, 0).getDate();

      const pSD = Math.min(sD, lastDayPSM);
      const pED = Math.min(eD, lastDayPEM);

      const sB = `${pSY}-${String(pSM + 1).padStart(2, '0')}-${String(pSD).padStart(2, '0')}`;
      const eB = `${pEY}-${String(pEM + 1).padStart(2, '0')}-${String(pED).padStart(2, '0')}`;

      setStartDateB(sB);
      setEndDateB(eB);
    }
  };

  const handleSelectPreset = (presetId) => {
    setSelectedPreset(presetId);
    if (presetId === 'custom') {
      return;
    }

    const todayObj = new Date();
    const todayStr = nicNow.todayStr;

    const formatDateStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    let sA = todayStr;
    let eA = todayStr;
    let sB = sameDayPMStr;
    let eB = sameDayPMStr;

    if (presetId === 'today') {
      sA = todayStr;
      eA = todayStr;
      sB = sameDayPMStr;
      eB = sameDayPMStr;
    } else if (presetId === 'yesterday') {
      const yest = new Date(todayObj.getTime() - 24 * 3600 * 1000);
      const yestStr = formatDateStr(yest);
      sA = yestStr;
      eA = yestStr;
      const yestDayPM = Math.min(yest.getDate(), lastDayPM);
      const yestPMStr = `${pY}-${pMStr}-${String(yestDayPM).padStart(2, '0')}`;
      sB = yestPMStr;
      eB = yestPMStr;
    } else if (presetId === 'last_7_days') {
      const d7 = new Date(todayObj.getTime() - 6 * 24 * 3600 * 1000);
      sA = formatDateStr(d7);
      eA = todayStr;
      const d7DayPM = Math.min(d7.getDate(), lastDayPM);
      sB = `${pY}-${pMStr}-${String(d7DayPM).padStart(2, '0')}`;
      eB = sameDayPMStr;
    } else if (presetId === 'current_month') {
      sA = nicNow.firstDayStr;
      eA = todayStr;
      sB = defaultStartB;
      eB = sameDayPMStr;
    } else if (presetId === 'last_30_days') {
      const d30 = new Date(todayObj.getTime() - 29 * 24 * 3600 * 1000);
      sA = formatDateStr(d30);
      eA = todayStr;
      const d30PrevEnd = new Date(d30.getTime() - 24 * 3600 * 1000);
      const d30PrevStart = new Date(d30PrevEnd.getTime() - 29 * 24 * 3600 * 1000);
      sB = formatDateStr(d30PrevStart);
      eB = formatDateStr(d30PrevEnd);
    }

    setStartDateA(sA);
    setEndDateA(eA);
    setStartDateB(sB);
    setEndDateB(eB);
  };

  // Selector de Modo de Moneda: 'usd' por defecto (Dólares USD $), 'nio' (Córdobas C$)
  const [currencyMode, setCurrencyMode] = useState('usd');

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
    fetchAnalytics();
  }, []);
  // Cálculo del número de días en cada período para comparación justa (Like-for-Like)
  const getDaysCount = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const s = new Date(startStr);
    const e = new Date(endStr);
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  };

  const daysCountA = getDaysCount(startDateA, endDateA);
  const daysCountB = getDaysCount(startDateB, endDateB);
  const isLikeForLike = daysCountA > 0 && daysCountA === daysCountB;

  // Función para igualar el número de días del Período B con los días transcurridos del Período A
  const equalizePeriodBToMatchA = () => {
    if (!startDateB || daysCountA <= 0) return;
    const parts = startDateB.split('-');
    if (parts.length !== 3) return;
    const sB = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const newEBDate = new Date(sB.valueOf());
    newEBDate.setDate(newEBDate.getDate() + daysCountA - 1);

    const yyyy = newEBDate.getFullYear();
    const mm = String(newEBDate.getMonth() + 1).padStart(2, '0');
    const dd = String(newEBDate.getDate()).padStart(2, '0');
    const newEndB = `${yyyy}-${mm}-${dd}`;

    setEndDateB(newEndB);
    fetchAnalytics(startDateA, endDateA, startDateB, newEndB);
  };

  // Función para aplicar presets de meses específicos (0 = Mes Actual, 1 = Mes Anterior, 2 = Hace 2 Meses, 3 = Hace 3 Meses)
  const applyMonthPreset = (monthOffset) => {
    let targetYearA = nicNow.year;
    let targetMonthA = nicNow.month - monthOffset;
    while (targetMonthA < 0) {
      targetYearA -= 1;
      targetMonthA += 12;
    }
    const lastDayA = new Date(targetYearA, targetMonthA + 1, 0).getDate();
    const mAStr = String(targetMonthA + 1).padStart(2, '0');

    const sA = `${targetYearA}-${mAStr}-01`;
    const eA = monthOffset === 0
      ? nicNow.todayStr
      : `${targetYearA}-${mAStr}-${String(lastDayA).padStart(2, '0')}`;

    let targetYearB = targetYearA;
    let targetMonthB = targetMonthA - 1;
    if (targetMonthB < 0) {
      targetYearB -= 1;
      targetMonthB = 11;
    }
    const lastDayB = new Date(targetYearB, targetMonthB + 1, 0).getDate();
    const mBStr = String(targetMonthB + 1).padStart(2, '0');

    const sB = `${targetYearB}-${mBStr}-01`;
    const eB = monthOffset === 0
      ? `${targetYearB}-${mBStr}-${String(Math.min(nicNow.day, lastDayB)).padStart(2, '0')}`
      : `${targetYearB}-${mBStr}-${String(lastDayB).padStart(2, '0')}`;

    setStartDateA(sA);
    setEndDateA(eA);
    setStartDateB(sB);
    setEndDateB(eB);

    fetchAnalytics(sA, eA, sB, eB);
  };

  // Función para aplicar presets rápidos de fecha
  const applyPreset = (presetKey) => {
    let sA = nicNow.firstDayStr;
    let eA = nicNow.todayStr;
    let sB = defaultStartB;
    let eB = defaultMtdEndB;

    if (presetKey === 'current_vs_prev_full') {
      sA = nicNow.firstDayStr;
      eA = nicNow.todayStr;
      sB = defaultStartB;
      eB = defaultFullEndB;
    } else if (presetKey === 'current_vs_prev_mtd') {
      sA = nicNow.firstDayStr;
      eA = nicNow.todayStr;
      sB = defaultStartB;
      eB = defaultMtdEndB;
    } else if (presetKey === 'prev_vs_two_ago') {
      sA = defaultStartB;
      eA = defaultFullEndB;

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
      <span className={badgeClass} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
        <IconComponent size={14} />
        {sign}{changePct}%
      </span>
    );
  };

  // Función de formateo según la moneda seleccionada (Dólar USD por defecto)
  const formatCurrency = (nioAmount = 0, usdAmount = 0) => {
    const rate = data?.bcnExchangeRate || 36.6243;
    const calcUsd = usdAmount || (nioAmount > 0 ? nioAmount / rate : 0);

    const formattedNio = `C$ ${nioAmount.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedUsd = `$ ${calcUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

    if (currencyMode === 'nio') return formattedNio;
    return formattedUsd;
  };

  const kpis = data?.kpis;
  const periods = data?.periods;
  const channels = data?.channels;
  const pipeline = data?.pipeline;

  return (
    <AppLayout>
      <main style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        
        {/* BARRA SUPERIOR DE TÍTULO Y SELECTOR DE MONEDA BCN */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.9rem' }}>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              <TrendingUp size={20} color="#38bdf8" />
              Dashboard Ejecutivo de Ventas & Analytics Comparativo
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
              Comparación en tiempo real: <strong style={{ color: 'var(--accent-primary)' }}>{periods?.current?.label || 'Período A'}</strong> vs. <span style={{ color: '#38bdf8', fontWeight: 600 }}>{periods?.previous?.label || 'Período B'}</span>.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            
            {/* SELECTOR DE MONEDA ($ USD Dólares por defecto o C$ Córdobas) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '0.2rem 0.4rem',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <CircleDollarSign size={14} color="#34d399" />
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, marginRight: '0.15rem' }}>Moneda:</span>
              {[
                { id: 'usd', label: '🇺🇸 $ USD' },
                { id: 'nio', label: '🇳🇮 C$ NIO' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setCurrencyMode(m.id)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: currencyMode === m.id ? 700 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: currencyMode === m.id ? '#34d399' : 'transparent',
                    color: currencyMode === m.id ? '#0f172a' : '#94a3b8',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Badge Tasa de Cambio BCN */}
            <div
              style={{
                fontSize: '0.72rem',
                color: '#34d399',
                backgroundColor: 'rgba(52, 211, 153, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                padding: '0.35rem 0.65rem',
                borderRadius: '8px',
                fontWeight: 600,
              }}
            >
              Tasa BCN: 1 USD = C$ {data?.bcnExchangeRate || 36.6243}
            </div>

            <button onClick={() => fetchAnalytics()} disabled={loading} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Dynamic Compact Date Range Picker with Presets Dropdown */}
        <div className="glass-card" style={{ padding: '0.65rem 0.95rem', marginBottom: '0.9rem', position: 'relative', zIndex: 100, overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              
              {/* Dropdown Selector de Preset (matching screenshot style) */}
              <div style={{ position: 'relative', zIndex: 101 }}>
                <button
                  onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#ffffff',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <Calendar size={14} color="#38bdf8" />
                  <span>Created: <strong style={{ color: '#38bdf8' }}>{
                    presetOptions.find(p => p.id === selectedPreset)?.label || 'Custom'
                  }</strong></span>
                  <ChevronDown size={14} color="#94a3b8" />
                </button>

                {showRangeDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '115%',
                      left: 0,
                      zIndex: 9999,
                      background: '#0f172a',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '12px',
                      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9), 0 0 25px rgba(56, 189, 248, 0.2)',
                      padding: '0.85rem 1rem',
                      width: '260px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {presetOptions.map((opt) => (
                        <label
                          key={opt.id}
                          onClick={() => handleSelectPreset(opt.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                            fontSize: '0.82rem',
                            color: selectedPreset === opt.id ? '#ffffff' : '#94a3b8',
                            cursor: 'pointer',
                            padding: '0.35rem 0.5rem',
                            borderRadius: '6px',
                            background: selectedPreset === opt.id ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                            fontWeight: selectedPreset === opt.id ? 700 : 500,
                          }}
                        >
                          <input
                            type="radio"
                            name="presetRadio"
                            checked={selectedPreset === opt.id}
                            onChange={() => handleSelectPreset(opt.id)}
                            style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                          />
                          {opt.label}
                        </label>
                      ))}

                      {/* Campos Custom From / To si la opción Custom está activa */}
                      {selectedPreset === 'custom' && (
                        <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.6rem' }}>
                          <div>
                            <label style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>
                              From
                            </label>
                            <input
                              type="date"
                              value={startDateA}
                              onChange={(e) => updateCustomDates(e.target.value, endDateA)}
                              className="glass-input"
                              style={{ width: '100%', fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: '6px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>
                              To
                            </label>
                            <input
                              type="date"
                              value={endDateA}
                              onChange={(e) => updateCustomDates(startDateA, e.target.value)}
                              className="glass-input"
                              style={{ width: '100%', fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: '6px' }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Botón Apply */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                        <button
                          onClick={() => {
                            setShowRangeDropdown(false);
                            fetchAnalytics(startDateA, endDateA, startDateB, endDateB);
                          }}
                          className="btn-primary"
                          style={{ padding: '0.35rem 1.1rem', fontSize: '0.78rem', backgroundColor: '#2563eb', borderRadius: '6px' }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Rango de Fechas A y B (visibles para confirmación / ajuste fino) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(56, 189, 248, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', whiteSpace: 'nowrap' }}>
                    🔵 A:
                  </span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', minHeight: '28px' }}
                    value={startDateA}
                    onChange={(e) => { setStartDateA(e.target.value); setSelectedPreset('custom'); }}
                  />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>a</span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', minHeight: '28px' }}
                    value={endDateA}
                    onChange={(e) => { setEndDateA(e.target.value); setSelectedPreset('custom'); }}
                  />
                </div>

                <span style={{ color: 'var(--text-dim)', fontWeight: 700, fontSize: '0.75rem' }}>vs.</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(129, 140, 248, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '8px', border: '1px solid rgba(129, 140, 248, 0.25)' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a5b4fc', whiteSpace: 'nowrap' }}>
                    🟣 B:
                  </span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', minHeight: '28px' }}
                    value={startDateB}
                    onChange={(e) => { setStartDateB(e.target.value); setSelectedPreset('custom'); }}
                  />
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>a</span>
                  <input
                    type="date"
                    className="glass-input"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', minHeight: '28px' }}
                    value={endDateB}
                    onChange={(e) => { setEndDateB(e.target.value); setSelectedPreset('custom'); }}
                  />
                </div>
              </div>

            </div>

            {/* Botón Aplicar Filtrado */}
            <button
              onClick={() => fetchAnalytics(startDateA, endDateA, startDateB, endDateB)}
              disabled={loading}
              className="btn-primary"
              style={{ padding: '0.35rem 0.95rem', fontSize: '0.78rem', minHeight: '30px', flexShrink: 0 }}
            >
              <Filter size={13} />
              {loading ? 'Consultando...' : 'Aplicar Comparación'}
            </button>

          </div>
        </div>

        {/* Global Loading & Error Status Banners */}
        {loading && (
          <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '0.9rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={20} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem auto' }} />
            Obteniendo analíticas y analizando 100% de órdenes del Período A y B...
          </div>
        )}

        {error && (
          <div style={{ padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', color: '#fb7185', marginBottom: '0.9rem', fontSize: '0.82rem' }}>
            ⚠️ <strong>Error en métricas:</strong> {error}
          </div>
        )}

        {/* Analytics Main Dashboard Grid */}
        {data && !loading && (
          <>
            {/* Top Key Executive Performance Indicators (Rejilla Estricta 4x2 de 8 Tarjetas) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem', marginBottom: '1.25rem' }}>
              
              {/* Card 1: Ingresos Brutos */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <CircleDollarSign size={13} color="#38bdf8" /> Ingresos Brutos
                    </span>
                    {renderTrendBadge(kpis?.grossRevenue?.changePct || 0)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {formatCurrency(kpis?.grossRevenue?.currentNio || 0, kpis?.grossRevenue?.currentUsd || 0)}
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {formatCurrency(kpis?.grossRevenue?.previousNio || 0, kpis?.grossRevenue?.previousUsd || 0)}</div>
                  <div style={{ opacity: 0.65, fontSize: '0.66rem' }}>(100% órdenes registradas)</div>
                </div>
              </div>

              {/* Card 2: Monto Cancelado */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <AlertTriangle size={13} color="#fb7185" /> Monto Cancelado
                    </span>
                    {renderTrendBadge(kpis?.canceledRevenue?.changePct || 0, true)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#fb7185', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {formatCurrency(kpis?.canceledRevenue?.currentNio || 0, kpis?.canceledRevenue?.currentUsd || 0)}
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {formatCurrency(kpis?.canceledRevenue?.previousNio || 0, kpis?.canceledRevenue?.previousUsd || 0)}</div>
                  <div style={{ color: '#fb7185', opacity: 0.85, fontSize: '0.66rem' }}>({kpis?.totalOrders?.canceledCurrent || 0} órdenes canceladas)</div>
                </div>
              </div>

              {/* Card 3: Ventas Netas */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <DollarSign size={13} color="#34d399" /> Ventas Netas
                    </span>
                    {renderTrendBadge(kpis?.totalRevenue?.changePct || 0)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#34d399', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {formatCurrency(kpis?.totalRevenue?.currentNio || kpis?.totalRevenue?.current || 0, kpis?.totalRevenue?.currentUsd || 0)}
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {formatCurrency(kpis?.totalRevenue?.previousNio || kpis?.totalRevenue?.previous || 0, kpis?.totalRevenue?.previousUsd || 0)}</div>
                  <div style={{ color: '#34d399', opacity: 0.85, fontSize: '0.66rem' }}>(Órdenes aprobadas)</div>
                </div>
              </div>

              {/* Card 4: Tasa Cancelación */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <AlertTriangle size={13} color="#fb7185" /> Tasa Cancelación
                    </span>
                    {renderTrendBadge(kpis?.cancelRate?.changePct || 0, true)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {kpis?.cancelRate?.current || 0}%
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {kpis?.cancelRate?.previous || 0}%</div>
                  <div style={{ color: '#fb7185', opacity: 0.85, fontSize: '0.66rem' }}>({kpis?.totalOrders?.canceledCurrent || 0} de {kpis?.totalOrders?.current || 0} órdenes)</div>
                </div>
              </div>

              {/* Card 5: Total Órdenes */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <ShoppingCart size={13} color="#38bdf8" /> Total Órdenes
                    </span>
                    {renderTrendBadge(kpis?.totalOrders?.changePct || 0)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {(kpis?.totalOrders?.current || 0).toLocaleString()} órdenes
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {(kpis?.totalOrders?.previous || 0).toLocaleString()} órdenes</div>
                  <div style={{ fontSize: '0.66rem' }}>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>{kpis?.totalOrders?.validCurrent || 0} apr.</span> | <span style={{ color: '#fb7185', fontWeight: 600 }}>{kpis?.totalOrders?.canceledCurrent || 0} canc.</span>
                  </div>
                </div>
              </div>

              {/* Card 6: Órdenes Facturadas (Invoiced) */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <CheckCircle2 size={13} color="#34d399" /> Órdenes Facturadas
                    </span>
                    {renderTrendBadge(kpis?.invoicedOrders?.changePct || 0)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#34d399', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {(kpis?.invoicedOrders?.current || 0).toLocaleString()} facturadas
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {(kpis?.invoicedOrders?.previous || 0).toLocaleString()} facturadas</div>
                  <div style={{ color: '#34d399', opacity: 0.85, fontSize: '0.66rem' }}>
                    ({kpis?.totalOrders?.current > 0 ? ((kpis?.invoicedOrders?.current / kpis?.totalOrders?.current) * 100).toFixed(1) : 0}% del total)
                  </div>
                </div>
              </div>

              {/* Card 7: Ticket Promedio Bruto */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <Receipt size={13} color="#a5b4fc" /> Ticket Prom. Bruto
                    </span>
                    {renderTrendBadge(kpis?.grossAvgTicket?.changePct || 0)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {formatCurrency(kpis?.grossAvgTicket?.currentNio || 0, kpis?.grossAvgTicket?.currentUsd || 0)}
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {formatCurrency(kpis?.grossAvgTicket?.previousNio || 0, kpis?.grossAvgTicket?.previousUsd || 0)}</div>
                  <div style={{ opacity: 0.65, fontSize: '0.66rem' }}>(Basado en 100% órdenes)</div>
                </div>
              </div>

              {/* Card 8: Ticket Promedio Neto */}
              <div className="glass-card" style={{ padding: '0.9rem 1.05rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '118px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                      <Receipt size={13} color="#34d399" /> Ticket Prom. Neto
                    </span>
                    {renderTrendBadge(kpis?.avgTicket?.changePct || 0)}
                  </div>
                  <div style={{ fontSize: '1.32rem', fontWeight: 800, color: '#34d399', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {formatCurrency(kpis?.avgTicket?.currentNio || kpis?.avgTicket?.current || 0, kpis?.avgTicket?.currentUsd || 0)}
                  </div>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-dim)', marginTop: '0.45rem', lineHeight: '1.3' }}>
                  <div>vs. {formatCurrency(kpis?.avgTicket?.previousNio || kpis?.avgTicket?.previous || 0, kpis?.avgTicket?.previousUsd || 0)}</div>
                  <div style={{ color: '#34d399', opacity: 0.85, fontSize: '0.66rem' }}>(Basado en aprobadas)</div>
                </div>
              </div>

            </div>

            {/* SECCIÓN DE GRÁFICA MULTI-LÍNEA INTERACTIVA */}
            {data?.dailyBreakdown && data.dailyBreakdown.length > 0 && (
              <DailyInteractiveTrendChart
                dailyBreakdown={data.dailyBreakdown}
                formatCurrency={formatCurrency}
                bcnRate={data?.bcnExchangeRate || 36.6243}
                periodLabel={periods?.current?.label}
              />
            )}

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
                        <strong style={{ color: '#34d399' }}>{periods?.current?.label}:</strong> {channels?.socialSelling?.current?.netCount || 0} órdenes aprobadas <span style={{ opacity: 0.75, fontSize: '0.74rem' }}>({channels?.socialSelling?.current?.grossCount || 0} totales: {channels?.socialSelling?.current?.canceledCount || 0} canc.)</span>
                      </span>
                      <span style={{ color: '#34d399', fontWeight: 700 }}>
                        {channels?.socialSelling?.current?.pct || 0}% ({formatCurrency(channels?.socialSelling?.current?.netRevenueNio || channels?.socialSelling?.current?.revenueNio || 0, channels?.socialSelling?.current?.netRevenueUsd || channels?.socialSelling?.current?.revenueUsd || 0)})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.socialSelling?.current?.pct || 0}%`, height: '100%', background: 'linear-gradient(to right, #34d399, #059669)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                    </div>
                    {Boolean(channels?.socialSelling?.current?.canceledRevenueNio > 0) && (
                      <div style={{ fontSize: '0.7rem', color: '#fb7185', marginTop: '0.25rem' }}>
                        ⚠️ Monto cancelado en Social Selling: {formatCurrency(channels?.socialSelling?.current?.canceledRevenueNio, channels?.socialSelling?.current?.canceledRevenueUsd)} (Bruto: {formatCurrency(channels?.socialSelling?.current?.grossRevenueNio, channels?.socialSelling?.current?.grossRevenueUsd)})
                      </div>
                    )}
                  </div>

                  {/* Período B */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text-dim)' }}>
                        <strong>{periods?.previous?.label}:</strong> {channels?.socialSelling?.previous?.netCount || 0} órdenes aprobadas <span style={{ opacity: 0.75, fontSize: '0.74rem' }}>({channels?.socialSelling?.previous?.grossCount || 0} totales: {channels?.socialSelling?.previous?.canceledCount || 0} canc.)</span>
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
                        {channels?.socialSelling?.previous?.pct || 0}% ({formatCurrency(channels?.socialSelling?.previous?.netRevenueNio || channels?.socialSelling?.previous?.revenueNio || 0, channels?.socialSelling?.previous?.netRevenueUsd || channels?.socialSelling?.previous?.revenueUsd || 0)})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.socialSelling?.previous?.pct || 0}%`, height: '100%', background: 'rgba(148, 163, 184, 0.45)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                    {Boolean(channels?.socialSelling?.previous?.canceledRevenueNio > 0) && (
                      <div style={{ fontSize: '0.7rem', color: '#fb7185', marginTop: '0.25rem' }}>
                        ⚠️ Monto cancelado en Social Selling ({periods?.previous?.label}): {formatCurrency(channels?.socialSelling?.previous?.canceledRevenueNio, channels?.socialSelling?.previous?.canceledRevenueUsd)} (Bruto: {formatCurrency(channels?.socialSelling?.previous?.grossRevenueNio, channels?.socialSelling?.previous?.grossRevenueUsd)})
                      </div>
                    )}
                  </div>
                </div>

                {/* --- Web Directa Section --- */}
                <div style={{ marginBottom: '1rem', background: 'rgba(56, 189, 248, 0.04)', padding: '0.95rem 1rem', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Globe size={15} color="#38bdf8" /> Web Directa / E-Commerce (Orgánico)
                    </span>
                    {renderTrendBadge(channels?.webDirect?.changePct || 0)}
                  </div>

                  {/* Período A */}
                  <div style={{ marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <strong style={{ color: '#38bdf8' }}>{periods?.current?.label}:</strong> {channels?.webDirect?.current?.netCount || 0} órdenes aprobadas <span style={{ opacity: 0.75, fontSize: '0.74rem' }}>({channels?.webDirect?.current?.grossCount || 0} totales: {channels?.webDirect?.current?.canceledCount || 0} canc.)</span>
                      </span>
                      <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                        {channels?.webDirect?.current?.pct || 0}% ({formatCurrency(channels?.webDirect?.current?.netRevenueNio || channels?.webDirect?.current?.revenueNio || 0, channels?.webDirect?.current?.netRevenueUsd || channels?.webDirect?.current?.revenueUsd || 0)})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.webDirect?.current?.pct || 0}%`, height: '100%', background: 'linear-gradient(to right, #38bdf8, #0284c7)', borderRadius: '4px', transition: 'width 0.6s ease' }} />
                    </div>
                    {Boolean(channels?.webDirect?.current?.canceledRevenueNio > 0) && (
                      <div style={{ fontSize: '0.7rem', color: '#fb7185', marginTop: '0.25rem' }}>
                        ⚠️ Monto cancelado en Web Directa: {formatCurrency(channels?.webDirect?.current?.canceledRevenueNio, channels?.webDirect?.current?.canceledRevenueUsd)} (Bruto: {formatCurrency(channels?.webDirect?.current?.grossRevenueNio, channels?.webDirect?.current?.grossRevenueUsd)})
                      </div>
                    )}
                  </div>

                  {/* Período B */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: 'var(--text-dim)' }}>
                        <strong>{periods?.previous?.label}:</strong> {channels?.webDirect?.previous?.netCount || 0} órdenes aprobadas <span style={{ opacity: 0.75, fontSize: '0.74rem' }}>({channels?.webDirect?.previous?.grossCount || 0} totales: {channels?.webDirect?.previous?.canceledCount || 0} canc.)</span>
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
                        {channels?.webDirect?.previous?.pct || 0}% ({formatCurrency(channels?.webDirect?.previous?.netRevenueNio || channels?.webDirect?.previous?.revenueNio || 0, channels?.webDirect?.previous?.netRevenueUsd || channels?.webDirect?.previous?.revenueUsd || 0)})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
                      <div style={{ width: `${channels?.webDirect?.previous?.pct || 0}%`, height: '100%', background: 'rgba(148, 163, 184, 0.45)', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                    {Boolean(channels?.webDirect?.previous?.canceledRevenueNio > 0) && (
                      <div style={{ fontSize: '0.7rem', color: '#fb7185', marginTop: '0.25rem' }}>
                        ⚠️ Monto cancelado en Web Directa ({periods?.previous?.label}): {formatCurrency(channels?.webDirect?.previous?.canceledRevenueNio, channels?.webDirect?.previous?.canceledRevenueUsd)} (Bruto: {formatCurrency(channels?.webDirect?.previous?.grossRevenueNio, channels?.webDirect?.previous?.grossRevenueUsd)})
                      </div>
                    )}
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

                  {/* Other / In Process */}
                  {Boolean(pipeline?.otherInProcess > 0) && (
                    <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.25)', padding: '0.85rem 1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Clock size={18} color="#c084fc" />
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>En Proceso / Verificación</span>
                      </div>
                      <strong style={{ fontSize: '1.1rem', color: '#c084fc' }}>{pipeline?.otherInProcess || 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>órdenes</span></strong>
                    </div>
                  )}

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
