'use client';

import React, { useState } from 'react';
import {
  X,
  CreditCard,
  User,
  Package,
  MapPin,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Building,
  Phone,
  Mail,
  Receipt,
} from 'lucide-react';

export default function TransactionDetailModal({ transaction, onClose }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [copiedText, setCopiedText] = useState('');

  if (!transaction) return null;

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const isCanceled = transaction.status === 'Canceled' || transaction.errorDiagnostics?.isError;
  const isApproved = transaction.status === 'Approved' || transaction.status === 'Completed';

  const formattedDate = transaction.startDate
    ? new Date(transaction.startDate).toLocaleString('es-NI', {
        timeZone: 'America/Managua',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'N/A';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderRadius: '20px',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: isCanceled
                  ? 'rgba(239, 68, 68, 0.15)'
                  : isApproved
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(245, 158, 11, 0.15)',
                border: `1px solid ${
                  isCanceled ? 'rgba(239, 68, 68, 0.3)' : isApproved ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                }`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isCanceled ? (
                <XCircle size={22} color="#ef4444" />
              ) : isApproved ? (
                <CheckCircle2 size={22} color="#22c55e" />
              ) : (
                <Clock size={22} color="#f59e0b" />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Transacción #{transaction.key}
                </h2>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.65rem',
                    borderRadius: '20px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    backgroundColor: isCanceled
                      ? 'rgba(239, 68, 68, 0.18)'
                      : isApproved
                      ? 'rgba(34, 197, 94, 0.18)'
                      : 'rgba(245, 158, 11, 0.18)',
                    color: isCanceled ? '#f87171' : isApproved ? '#4ade80' : '#fbbf24',
                    border: `1px solid ${
                      isCanceled ? 'rgba(239, 68, 68, 0.35)' : isApproved ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'
                    }`,
                  }}
                >
                  {isCanceled ? 'Cancelada / Error' : isApproved ? 'Aprobada' : 'Pendiente'}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.2rem 0 0 0' }}>
                Orden VTEX: <strong style={{ color: '#cbd5e1' }}>{transaction.orderId}</strong> • {formattedDate}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              borderRadius: '10px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* DIAGNOSTIC ALERT BANNER (SI HAY ERROR, RECHAZO O DEVOLUCIÓN) */}
        {transaction.errorDiagnostics?.isRefund ? (
          <div
            style={{
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              borderBottom: '1px solid rgba(99, 102, 241, 0.35)',
              padding: '0.9rem 1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={22} color="#a5b4fc" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#c7d2fe', fontWeight: 700 }}>
                  {transaction.errorDiagnostics?.title || '🔄 Devolución / Anulación Post-Venta'}
                </h4>
                <span
                  style={{
                    fontSize: '0.75rem',
                    background: 'rgba(99, 102, 241, 0.3)',
                    color: '#e0e7ff',
                    border: '1px solid rgba(99, 102, 241, 0.5)',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '6px',
                    fontWeight: 800,
                  }}
                >
                  DEVOLUCIÓN POST-VENTA
                </span>
              </div>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: '#e0e7ff', lineHeight: 1.45 }}>
                {transaction.errorDiagnostics?.description}
              </p>
              {transaction.errorDiagnostics?.cancelReason && (
                <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: '#a5b4fc' }}>
                  💡 <strong>Motivo en VTEX:</strong> {transaction.errorDiagnostics.cancelReason}
                </p>
              )}
            </div>
          </div>
        ) : isCanceled ? (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '0.9rem 1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#f87171', fontWeight: 700 }}>
                  {transaction.errorDiagnostics?.title || 'Transacción Rechazada / Cancelada'}
                </h4>
                {transaction.errorDiagnostics?.code && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      background: 'rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '6px',
                      fontWeight: 800,
                    }}
                  >
                    Código: {transaction.errorDiagnostics.code}
                  </span>
                )}
              </div>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: '#fca5a5', lineHeight: 1.45 }}>
                {transaction.errorDiagnostics?.description ||
                  transaction.errorDiagnostics?.reason ||
                  'Transacción cancelada o rechazada por la pasarela de pago o el banco emisor.'}
              </p>
              {transaction.errorDiagnostics?.cancelReason && (
                <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: '#fca5a5' }}>
                  💡 <strong>Motivo de Cancelación VTEX:</strong> {transaction.errorDiagnostics.cancelReason}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* NAVIGATION TABS */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem 0 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {[
            { id: 'summary', label: 'Resumen & Pago', icon: CreditCard },
            { id: 'client', label: 'Cliente', icon: User },
            { id: 'skus', label: `SKUs & Productos (${transaction.skus?.length || 0})`, icon: Package },
            { id: 'shipping', label: 'Dirección de Entrega', icon: MapPin },
            { id: 'logs', label: 'Logs Gateway', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1rem',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  background: 'none',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={16} color={isActive ? '#38bdf8' : '#64748b'} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* MODAL BODY CONTENT */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
          {/* TAB 1: RESUMEN & PAGO */}
          {activeTab === 'summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* TOP METRICS SUMMARY GRID */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.5)',
                    padding: '1rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                    Monto Total Procesado
                  </span>
                  <strong style={{ fontSize: '1.4rem', color: '#38bdf8' }}>
                    {transaction.amount?.toLocaleString('es-NI', { minimumFractionDigits: 2 })} {transaction.currency}
                  </strong>
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.5)',
                    padding: '1rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                    Método de Pago
                  </span>
                  <strong style={{ fontSize: '1.1rem', color: '#ffffff' }}>
                    {transaction.payment?.systemName || 'Tarjeta'}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginTop: '0.1rem' }}>
                    {transaction.payment?.cardNumber}
                  </span>
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.5)',
                    padding: '1rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                    Pasarela / Adquirente
                  </span>
                  <strong style={{ fontSize: '1.1rem', color: '#ffffff' }}>
                    {transaction.payment?.acquirer || 'Tilopay'}
                  </strong>
                </div>
              </div>

              {/* PAYMENT TECHNICAL DETAILS BOX */}
              <div
                style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.4)',
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '1.25rem',
                }}
              >
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#ffffff', fontWeight: 600 }}>
                  Detalles Técnicos del Pago en Pasarela
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>ID de Transacción (TransactionId):</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#38bdf8' }}>
                        {transaction.transactionId}
                      </code>
                      <button
                        onClick={() => handleCopy(transaction.transactionId, 'txId')}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                      >
                        {copiedText === 'txId' ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>Identificador de Pago (TID):</span>
                    <strong style={{ color: '#e2e8f0', display: 'block', marginTop: '0.2rem' }}>
                      {transaction.payment?.tid || 'N/A'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>Código de Autorización (AuthId):</span>
                    <strong style={{ color: '#e2e8f0', display: 'block', marginTop: '0.2rem' }}>
                      {transaction.payment?.authId || 'N/A'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>Código de Retorno / Error:</span>
                    <div style={{ marginTop: '0.25rem' }}>
                      <span
                        style={{
                          padding: '0.25rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          backgroundColor: isCanceled ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                          color: isCanceled ? '#f87171' : '#4ade80',
                          border: `1px solid ${isCanceled ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        {isCanceled
                          ? `Código ${transaction.payment?.returnCode || transaction.errorDiagnostics?.code || 'N/A'}`
                          : 'Código 00 - Exitoso'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>Tarjetahabiente (Card Holder):</span>
                    <strong style={{ color: '#e2e8f0', display: 'block', marginTop: '0.2rem' }}>
                      {transaction.payment?.cardHolder || transaction.client?.name || 'N/A'}
                    </strong>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLIENTE */}
          {activeTab === 'client' && (
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {transaction.client?.name?.slice(0, 2).toUpperCase() || 'CL'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#ffffff', fontWeight: 700 }}>
                    {transaction.client?.name}
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Cliente Comprador VTEX</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Mail size={18} color="#38bdf8" />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Correo Electrónico</span>
                    <strong style={{ fontSize: '0.9rem', color: '#f1f5f9', wordBreak: 'break-all' }}>{transaction.client?.email}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Phone size={18} color="#38bdf8" />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Teléfono</span>
                    <strong style={{ fontSize: '0.9rem', color: '#f1f5f9' }}>{transaction.client?.phone}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Building size={18} color="#38bdf8" />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Documento / Cédula</span>
                    <strong style={{ fontSize: '0.9rem', color: '#f1f5f9' }}>{transaction.client?.document}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SKUS & PRODUCTOS */}
          {activeTab === 'skus' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(30, 41, 59, 0.3)',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600 }}>Producto / SKU</th>
                      <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600, textAlign: 'center' }}>Cant.</th>
                      <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600, textAlign: 'right' }}>Precio Unit.</th>
                      <th style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600, textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.skus?.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background 0.2s' }}
                      >
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                style={{
                                  width: '44px',
                                  height: '44px',
                                  objectFit: 'contain',
                                  borderRadius: '8px',
                                  background: '#ffffff',
                                  padding: '2px',
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '8px',
                                  background: 'rgba(255,255,255,0.05)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Package size={20} color="#64748b" />
                              </div>
                            )}
                            <div>
                              <strong style={{ color: '#ffffff', display: 'block', fontSize: '0.88rem' }}>{item.name}</strong>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                SKU: <code style={{ color: '#38bdf8' }}>{item.id}</code> • Marca: {item.brand}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 600, color: '#f1f5f9' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>
                          C$ {item.unitPrice?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                          C$ {item.totalPrice?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: DIRECCIÓN DE ENTREGA */}
          {activeTab === 'shipping' && (
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <MapPin size={22} color="#38bdf8" />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#ffffff', fontWeight: 600 }}>
                      {transaction.shipping?.addressType}
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      Destinatario: <strong>{transaction.shipping?.receiverName}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
                <div>
                  <span style={{ color: '#94a3b8' }}>Dirección Completa: </span>
                  <strong style={{ color: '#f1f5f9' }}>{transaction.shipping?.fullAddressFormatted}</strong>
                </div>

                <div>
                  <span style={{ color: '#94a3b8' }}>Ciudad / Departamento: </span>
                  <strong style={{ color: '#f1f5f9' }}>
                    {transaction.shipping?.city}, {transaction.shipping?.state}
                  </strong>
                </div>

                <div>
                  <span style={{ color: '#94a3b8' }}>País: </span>
                  <strong style={{ color: '#f1f5f9' }}>{transaction.shipping?.country}</strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LOGS & INTERACCIONES DE PASARELA */}
          {activeTab === 'logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '100%' }}>
              {transaction.interactions?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxWidth: '100%' }}>
                  {transaction.interactions.map((log, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: 'rgba(30, 41, 59, 0.4)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        padding: '0.85rem 1rem',
                        fontSize: '0.82rem',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        maxWidth: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{log.Source || 'Gateway'}</span>
                        <span style={{ color: '#64748b' }}>
                          {log.Date ? new Date(log.Date).toLocaleString('es-NI') : ''}
                        </span>
                      </div>
                      <div style={{ color: '#e2e8f0', fontWeight: 500, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {log.Status || log.Message}
                      </div>
                      {log.Message && log.Message !== log.Status && (
                        <div
                          style={{
                            color: '#94a3b8',
                            fontSize: '0.78rem',
                            marginTop: '0.35rem',
                            wordBreak: 'break-all',
                            overflowWrap: 'anywhere',
                            whiteSpace: 'pre-wrap',
                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            fontFamily: 'monospace',
                            maxWidth: '100%',
                          }}
                        >
                          {log.Message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                  No hay eventos de interacción adicionales registrados para esta transacción.
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            IP Cliente: {transaction.technical?.ipAddress}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '10px',
              backgroundColor: '#38bdf8',
              color: '#0f172a',
              fontWeight: 600,
              fontSize: '0.85rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)',
            }}
          >
            Cerrar Modal
          </button>
        </div>
      </div>
    </div>
  );
}
