'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  CreditCard,
  AlertTriangle,
  Package,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { formatNicaraguaTime } from '@/lib/dateUtils';

export default function TransactionsTable({ transactions, onSelectTransaction, isLoading }) {
  if (isLoading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', margin: '0 auto 1rem auto', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: '0.9rem' }}>Cargando transacciones en tiempo real desde VTEX...</p>
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <CreditCard size={42} color="#64748b" style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <h3 style={{ fontSize: '1.05rem', color: '#ffffff', margin: '0 0 0.4rem 0' }}>
          No se encontraron transacciones
        </h3>
        <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-dim)' }}>
          Prueba cambiando el rango de fechas o ajustando los filtros de búsqueda.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
        <thead>
          <tr
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              borderBottom: '1px solid var(--border-subtle)',
              color: 'var(--text-dim)',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <th style={{ padding: '0.9rem 1.2rem', fontWeight: 600 }}>Estado</th>
            <th style={{ padding: '0.9rem 1.2rem', fontWeight: 600 }}>Inicio (Start)</th>
            <th style={{ padding: '0.9rem 1.2rem', fontWeight: 600 }}>Cliente</th>
            <th style={{ padding: '0.9rem 1.2rem', fontWeight: 600 }}>Key</th>
            <th style={{ padding: '0.9rem 1.2rem', fontWeight: 600 }}>Método Pago</th>
            <th style={{ padding: '0.9rem 1.2rem', fontWeight: 600, textAlign: 'right' }}>Monto</th>
            <th style={{ padding: '0.9rem 1.2rem', fontWeight: 600 }}>Diagnóstico / Error</th>
            <th style={{ padding: '0.9rem 1rem', fontWeight: 600, textAlign: 'center' }}>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, index) => {
            const isCanceled = tx.status === 'Canceled' || tx.errorDiagnostics?.isError;
            const isApproved = tx.status === 'Approved' || tx.status === 'Completed';

            const formattedTime = formatNicaraguaTime(tx.startDate);

            return (
              <tr
                key={tx.transactionId || tx.key || index}
                onClick={() => onSelectTransaction(tx)}
                style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                }}
                className="tx-row"
              >
                {/* ESTADO */}
                <td style={{ padding: '1rem 1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    {tx.errorDiagnostics?.isRefund ? (
                      <span style={{ fontSize: '1rem' }}>🔄</span>
                    ) : isCanceled ? (
                      <XCircle size={16} color="#ef4444" />
                    ) : isApproved ? (
                      <CheckCircle2 size={16} color="#22c55e" />
                    ) : (
                      <Clock size={16} color="#f59e0b" />
                    )}
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '20px',
                        backgroundColor: tx.errorDiagnostics?.isRefund
                          ? 'rgba(99, 102, 241, 0.18)'
                          : isCanceled
                          ? 'rgba(239, 68, 68, 0.15)'
                          : isApproved
                          ? 'rgba(34, 197, 94, 0.15)'
                          : 'rgba(245, 158, 11, 0.15)',
                        color: tx.errorDiagnostics?.isRefund
                          ? '#c7d2fe'
                          : isCanceled
                          ? '#f87171'
                          : isApproved
                          ? '#4ade80'
                          : '#fbbf24',
                        border: `1px solid ${
                          tx.errorDiagnostics?.isRefund
                            ? 'rgba(99, 102, 241, 0.35)'
                            : isCanceled
                            ? 'rgba(239, 68, 68, 0.3)'
                            : isApproved
                            ? 'rgba(34, 197, 94, 0.3)'
                            : 'rgba(245, 158, 11, 0.3)'
                        }`,
                      }}
                    >
                      {tx.errorDiagnostics?.isRefund ? 'Devolución' : isCanceled ? 'Canceled' : isApproved ? 'Approved' : 'Pending'}
                    </span>
                  </div>
                </td>

                {/* START HORA */}
                <td style={{ padding: '1rem 1.2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {formattedTime}
                </td>

                {/* CLIENTE */}
                <td style={{ padding: '1rem 1.2rem' }}>
                  <strong style={{ color: '#ffffff', display: 'block', fontSize: '0.88rem' }}>
                    {tx.client?.name || 'Cliente General'}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    {tx.client?.email}
                  </span>
                </td>

                {/* KEY / SECUENCIA */}
                <td style={{ padding: '1rem 1.2rem' }}>
                  <code
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      color: '#38bdf8',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    {tx.key}
                  </code>
                </td>

                {/* MÉTODO DE PAGO Y FINANCIAMIENTO */}
                <td style={{ padding: '1rem 1.2rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: '#f8fafc',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <CreditCard size={13} color="#a5b4fc" />
                        {tx.payment?.cardBrand || tx.payment?.systemName || 'Tarjeta'}
                      </span>

                      {/* FINANCIAMIENTO VS CONTADO PILL */}
                      <span
                        style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          backgroundColor: tx.payment?.isFinanced ? 'rgba(168, 85, 247, 0.2)' : 'rgba(34, 197, 94, 0.15)',
                          color: tx.payment?.isFinanced ? '#c084fc' : '#4ade80',
                          border: `1px solid ${tx.payment?.isFinanced ? 'rgba(168, 85, 247, 0.4)' : 'rgba(34, 197, 94, 0.3)'}`,
                        }}
                      >
                        {tx.payment?.isFinanced ? `⚡ Cuotas (x${tx.payment.installments})` : 'Contado'}
                      </span>
                    </div>

                    {tx.payment?.cardNumber && tx.payment.cardNumber !== 'N/A' && (
                      <span style={{ fontSize: '0.76rem', color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        💳 {tx.payment.cardNumber}
                      </span>
                    )}
                  </div>
                </td>

                {/* MONTO */}
                <td style={{ padding: '1rem 1.2rem', textAlign: 'right' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>
                    {tx.amount?.toLocaleString('es-NI', { minimumFractionDigits: 2 })} {tx.currency || 'NIO'}
                  </strong>
                </td>

                {/* DIAGNÓSTICO / ERROR */}
                <td style={{ padding: '1rem 1.2rem', maxWidth: '300px' }}>
                  {tx.errorDiagnostics?.isRefund ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.35)', padding: '0.25rem 0.6rem', borderRadius: '6px', color: '#c7d2fe', fontSize: '0.76rem', fontWeight: 700 }}>
                      <span>🔄 Devolución Post-Venta</span>
                    </div>
                  ) : isCanceled ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.25rem 0.55rem', borderRadius: '6px', color: '#f87171', fontSize: '0.76rem', fontWeight: 800 }}>
                        <AlertTriangle size={13} color="#f87171" style={{ flexShrink: 0 }} />
                        <span>Code {tx.errorDiagnostics?.code || tx.returnCode || 'ERR'}: {tx.errorDiagnostics?.title || 'Rechazada'}</span>
                      </div>
                    </div>
                  ) : isApproved ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '0.25rem 0.55rem', borderRadius: '6px', color: '#34d399', fontSize: '0.76rem', fontWeight: 800 }}>
                        <CheckCircle2 size={13} color="#34d399" style={{ flexShrink: 0 }} />
                        <span>Code 00: Autorizado {tx.authId ? `#${tx.authId}` : ''}</span>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#fbbf24', fontSize: '0.78rem', fontWeight: 600 }}>
                      ● En proceso
                    </span>
                  )}
                </td>




                {/* ACCIONES */}
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTransaction(tx);
                    }}
                    style={{
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      color: '#38bdf8',
                      borderRadius: '8px',
                      width: '32px',
                      height: '32px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <style jsx>{`
        .tx-row:hover {
          background-color: rgba(56, 189, 248, 0.06) !important;
        }
      `}</style>
    </div>
  );
}
