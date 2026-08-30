'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import TransactionsTable from '@/components/TransactionsTable';
import TransactionDetailModal from '@/components/TransactionDetailModal';
import {
  CreditCard,
  Search,
  Calendar,
  Filter,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { getNicaraguaNow, formatNicaraguaDateTime } from '@/lib/dateUtils';

export default function TransaccionesPage() {
  const nicNow = getNicaraguaNow();

  // State Management
  const [startDate, setStartDate] = useState(nicNow.todayStr);
  const [endDate, setEndDate] = useState(nicNow.todayStr);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [transactions, setTransactions] = useState([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    approvedCount: 0,
    canceledCount: 0,
    pendingCount: 0,
    totalApprovedAmount: 0,
    totalCanceledAmount: 0,
    approvalRate: '0.0',
    cancellationRate: '0.0',
  });

  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  // Fetch transactions from API
  const fetchTransactionsData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const query = new URLSearchParams({
        startDate,
        endDate,
        status: statusFilter,
        search: searchTerm.trim(),
      });

      const res = await fetch(`/api/transactions?${query.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        setTransactions(data.data || []);
        if (data.metrics) setMetrics(data.metrics);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error cargando transacciones:', err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [startDate, endDate, statusFilter, searchTerm]);

  // Initial Load and Filter Updates
  useEffect(() => {
    fetchTransactionsData(false);
  }, [fetchTransactionsData]);

  // Auto-refresh Timer Setup (30s fijo en segundo plano)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      fetchTransactionsData(true);
    }, 30000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchTransactionsData]);

  // Quick Date Setters
  const setQuickDate = (range) => {
    const now = getNicaraguaNow();
    if (range === 'today') {
      setStartDate(now.todayStr);
      setEndDate(now.todayStr);
    } else if (range === 'yesterday') {
      const yest = new Date(now.todayStr);
      yest.setDate(yest.getDate() - 1);
      const yestStr = yest.toISOString().split('T')[0];
      setStartDate(yestStr);
      setEndDate(yestStr);
    } else if (range === '7days') {
      const d7 = new Date(now.todayStr);
      d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().split('T')[0];
      setStartDate(d7Str);
      setEndDate(now.todayStr);
    }
  };

  // CSV Export Handler
  const exportToCSV = () => {
    if (!transactions || transactions.length === 0) return;

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'Key (Secuencia)',
      'OrderId',
      'TransactionId',
      'Estado',
      'Fecha / Hora',
      'Modalidad de Pago',
      'Cuotas / Minicuotas',
      'Cuota Estimada Mensual',
      'Monto Total (NIO)',
      'Método / Franquicia',
      'Tipo Tarjeta',
      'BIN (Primeros 6 Dígitos)',
      'Tarjeta (Máscara)',
      'Tarjetahabiente (Nombre en Tarjeta)',
      'Cliente Nombre',
      'Cliente Email',
      'Cliente Telefono',
      'Pasarela / Adquirente',
      'Identificador Pago (TID)',
      'Código Autorización (AuthId)',
      'Código de Error (ReturnCode)',
      'Diagnóstico de Error (Título)',
      'Explicación del Error (Detalle)',
      'Recomendación SAC',
      'SKUs e Ítems del Carrito',
      'Dirección de Entrega',
    ];

    const rows = transactions.map((t) => [
      escapeCSV(t.key),
      escapeCSV(t.orderId),
      escapeCSV(t.transactionId),
      escapeCSV(t.status),
      escapeCSV(t.startDate ? formatNicaraguaDateTime(t.startDate) : ''),
      escapeCSV(t.payment?.isFinanced ? 'Financiamiento (Cuotas)' : 'Contado'),
      t.payment?.installments || 1,
      t.payment?.installmentValue || t.amount || 0,
      t.amount || 0,
      escapeCSV(t.payment?.cardBrand || t.payment?.systemName),
      escapeCSV(t.payment?.cardType || 'Crédito'),
      escapeCSV(t.payment?.bin || 'N/A'),
      escapeCSV(t.payment?.cardNumber),
      escapeCSV(t.payment?.cardHolder),
      escapeCSV(t.client?.name),
      escapeCSV(t.client?.email),
      escapeCSV(t.client?.phone),
      escapeCSV(t.payment?.acquirer || 'Tilopay'),
      escapeCSV(t.payment?.tid),
      escapeCSV(t.payment?.authId),
      escapeCSV(t.status === 'Approved' ? '00' : (t.errorDiagnostics?.code || t.payment?.returnCode || 'N/A')),
      escapeCSV(t.errorDiagnostics?.title || (t.status === 'Approved' ? 'Transacción Aprobada Exitosamente' : 'Transacción Cancelada')),
      escapeCSV(t.errorDiagnostics?.description || (t.status === 'Approved' ? 'El pago fue procesado y autorizado correctamente por la pasarela de pago y el banco emisor.' : 'Sin detalles adicionales')),
      escapeCSV(t.errorDiagnostics?.sacRecommendation),
      escapeCSV((t.skus || []).map((s) => `${s.name} (Cant: ${s.quantity})`).join('; ')),
      escapeCSV(t.shipping?.fullAddressFormatted),
    ]);


    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `transacciones_vtex_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
        {/* PAGE TITLE & HEADER */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 18px rgba(244, 63, 94, 0.35)',
                }}
              >
                <CreditCard size={22} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, background: 'linear-gradient(to right, #ffffff, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Monitoreo de Transacciones VTEX
                </h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                  Supervisión de pagos en tiempo real, diagnósticos de rechazo, SKUs y datos del cliente
                </p>
              </div>
            </div>
          </div>

          {/* CONTROLS & AUTO REFRESH */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => fetchTransactionsData(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <RefreshCw size={15} className={isLoading ? 'spin-icon' : ''} />
              <span>Actualizar</span>
            </button>

            <button
              onClick={exportToCSV}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(52, 211, 153, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.25)',
                color: '#34d399',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Download size={15} />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* STATS METRIC CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {/* TOTAL TRANSACCIONES */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '0.2rem' }}>
                Total Transacciones
              </span>
              <strong style={{ fontSize: '1.6rem', color: '#ffffff', fontWeight: 800 }}>
                {metrics.total}
              </strong>
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={20} color="#38bdf8" />
            </div>
          </div>

          {/* MONTO APROBADO */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '0.2rem' }}>
                Monto Aprobado Total
              </span>
              <strong style={{ fontSize: '1.5rem', color: '#34d399', fontWeight: 800 }}>
                C$ {metrics.totalApprovedAmount?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </strong>
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(52, 211, 153, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="#34d399" />
            </div>
          </div>

          {/* TRANS APROBADAS */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '0.2rem' }}>
                Aprobadas ({metrics.approvalRate}%)
              </span>
              <strong style={{ fontSize: '1.6rem', color: '#4ade80', fontWeight: 800 }}>
                {metrics.approvedCount}
              </strong>
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={20} color="#4ade80" />
            </div>
          </div>

          {/* TRANS CANCELADAS / RECHAZADAS */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(16px)',
              borderRadius: '16px',
              border: metrics.canceledCount > 0 ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-subtle)',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '0.8rem', color: metrics.canceledCount > 0 ? '#f87171' : 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '0.2rem' }}>
                Canceladas / Error ({metrics.cancellationRate}%)
              </span>
              <strong style={{ fontSize: '1.6rem', color: metrics.canceledCount > 0 ? '#f87171' : '#ffffff', fontWeight: 800 }}>
                {metrics.canceledCount}
              </strong>
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XCircle size={20} color="#f87171" />
            </div>
          </div>
        </div>

        {/* FILTERS & SEARCH CONTROL BAR */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(16px)',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            {/* DATE RANGE FILTERS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <Calendar size={16} color="#38bdf8" />
                <span>Fecha:</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '0.4rem 0.65rem',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>a</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '0.4rem 0.65rem',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* QUICK DATE BUTTONS */}
              <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '0.5rem' }}>
                <button
                  onClick={() => setQuickDate('today')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    backgroundColor: startDate === nicNow.todayStr && endDate === nicNow.todayStr ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: startDate === nicNow.todayStr && endDate === nicNow.todayStr ? '#38bdf8' : 'var(--text-muted)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Hoy
                </button>

                <button
                  onClick={() => setQuickDate('yesterday')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-muted)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Ayer
                </button>

                <button
                  onClick={() => setQuickDate('7days')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-muted)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Últimos 7 días
                </button>
              </div>
            </div>

            {/* STATUS FILTER PILLS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <Filter size={15} color="#94a3b8" />
              {[
                { id: 'all', label: 'Todas' },
                { id: 'approved', label: 'Aprobadas' },
                { id: 'canceled', label: 'Rechazadas / Error' },
                { id: 'refund', label: '🔄 Devoluciones' },
                { id: 'pending', label: 'Pendientes' },
              ].map((st) => {
                const isActive = statusFilter === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => setStatusFilter(st.id)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '20px',
                      backgroundColor: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      color: isActive ? '#38bdf8' : 'var(--text-muted)',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                    }}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SEARCH INPUT BAR */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={17} color="#64748b" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Buscar por Key, Orden VTEX, Cliente, Email, Auth Code (ej: 849102), o Código de Error (ej: 12, 51)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.7rem 1rem 0.7rem 2.75rem',
                borderRadius: '12px',
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.88rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* TRANSACTIONS TABLE CONTAINER */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(16px)',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
          }}
        >
          <TransactionsTable
            transactions={transactions}
            onSelectTransaction={(tx) => setSelectedTransaction(tx)}
            isLoading={isLoading}
          />
        </div>

        {/* TRANSACTION DETAIL MODAL */}
        {selectedTransaction && (
          <TransactionDetailModal
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
          />
        )}
      </div>

      <style jsx global>{`
        .spin-icon {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </AppLayout>
  );
}
