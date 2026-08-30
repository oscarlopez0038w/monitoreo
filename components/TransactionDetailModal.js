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
import { formatNicaraguaDateTime } from '@/lib/dateUtils';

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

  const formattedDate = formatNicaraguaDateTime(transaction.startDate);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 99999,
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
          height: '680px',
          maxHeight: '85vh',
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
        className="bottom-sheet-container"
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

        {/* DIAGNOSTIC ALERT BANNER (APROBADA, RECHAZO O DEVOLUCIÓN) */}
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
              {transaction.errorDiagnostics?.sacRecommendation && (
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#a5b4fc', backgroundColor: 'rgba(99, 102, 241, 0.15)', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                  💡 <strong>Recomendación SAC:</strong> {transaction.errorDiagnostics.sacRecommendation}
                </p>
              )}
            </div>
          </div>
        ) : isApproved ? (
          <div
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.08)',
              borderBottom: '1px solid rgba(34, 197, 94, 0.25)',
              padding: '0.85rem 1.5rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={22} color="#4ade80" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#4ade80', fontWeight: 700 }}>
                  {transaction.errorDiagnostics?.title || 'Transacción Aprobada & Acreditada'}
                </h4>
                {transaction.authId && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '6px',
                      fontWeight: 800,
                    }}
                  >
                    Auth Code: {transaction.authId}
                  </span>
                )}
              </div>
              <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.86rem', color: '#bbf7d0', lineHeight: 1.4 }}>
                {transaction.errorDiagnostics?.description || 'Cobro autorizado exitosamente por el banco y procesado en la pasarela Tilopay.'}
              </p>
              {transaction.errorDiagnostics?.sacRecommendation && (
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: '#86efac', backgroundColor: 'rgba(34, 197, 94, 0.12)', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
                  ⚡ <strong>Estado SAC:</strong> {transaction.errorDiagnostics.sacRecommendation}
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
              {transaction.errorDiagnostics?.sacRecommendation && (
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#fecaca', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  💡 <strong>Recomendación SAC:</strong> {transaction.errorDiagnostics.sacRecommendation}
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
              
              {/* FINANCING VS CONTADO MODE BANNER */}
              <div
                style={{
                  backgroundColor: transaction.payment?.isFinanced ? 'rgba(168, 85, 247, 0.12)' : 'rgba(34, 197, 94, 0.1)',
                  border: `1px solid ${transaction.payment?.isFinanced ? 'rgba(168, 85, 247, 0.35)' : 'rgba(34, 197, 94, 0.3)'}`,
                  borderRadius: '12px',
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CreditCard size={22} color={transaction.payment?.isFinanced ? '#c084fc' : '#4ade80'} />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: transaction.payment?.isFinanced ? '#e9d5ff' : '#bbf7d0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                      Modalidad de Pago
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: '#ffffff', fontWeight: 800 }}>
                      {transaction.payment?.isFinanced
                        ? `⚡ FINANCIAMIENTO (${transaction.payment.installments} CUOTAS / MINICUOTAS)`
                        : '🟢 PAGO DE CONTADO (1 Pago Único)'}
                    </strong>
                  </div>
                </div>

                {transaction.payment?.isFinanced ? (
                  <div style={{ backgroundColor: 'rgba(168, 85, 247, 0.25)', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '0.35rem 0.85rem', borderRadius: '8px', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.72rem', color: '#e9d5ff', display: 'block' }}>Cuota Estimada:</span>
                    <strong style={{ fontSize: '1rem', color: '#f3e8ff' }}>
                      {Number(transaction.payment.installmentValue)?.toLocaleString('es-NI', { minimumFractionDigits: 2 })} {transaction.currency} / mes
                    </strong>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: '#86efac', fontWeight: 700, backgroundColor: 'rgba(34, 197, 94, 0.18)', padding: '0.3rem 0.7rem', borderRadius: '6px' }}>
                    Pago Inmediato 100%
                  </span>
                )}
              </div>

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
                    Franquicia & Método
                  </span>
                  <strong style={{ fontSize: '1.1rem', color: '#ffffff' }}>
                    {transaction.payment?.cardBrand || transaction.payment?.systemName || 'Tarjeta'} ({transaction.payment?.cardType || 'Crédito'})
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#38bdf8', display: 'block', marginTop: '0.2rem', fontFamily: 'monospace', fontWeight: 700 }}>
                    💳 {transaction.payment?.cardNumber || 'Dígitos No Disponibles'}
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

              {/* FULL CARD & PAYMENT TECHNICAL DETAILS BOX */}
              <div
                style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.4)',
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '1.25rem',
                }}
              >
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  💳 Captura Completa de Datos de la Tarjeta y Transacción
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.1rem', fontSize: '0.85rem' }}>
                  
                  {/* NOMBRE EN TARJETA / TARJETAHABIENTE */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>Tarjetahabiente (Nombre en Tarjeta):</span>
                    <strong style={{ color: '#38bdf8', fontSize: '0.95rem', display: 'block', marginTop: '0.2rem' }}>
                      👤 {transaction.payment?.cardHolder || transaction.client?.name || 'N/A'}
                    </strong>
                    {transaction.payment?.isCardHolderExtracted && (
                      <span style={{ fontSize: '0.72rem', color: '#34d399' }}>✓ Nombre extraído de pasarela</span>
                    )}
                  </div>

                  {/* BIN & ULTIMOS DIGITOS */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>BIN & Máscara de Tarjeta:</span>
                    <strong style={{ color: '#e2e8f0', display: 'block', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                      BIN: {transaction.payment?.bin !== 'N/A' ? transaction.payment.bin : '••••••'} | {transaction.payment?.cardNumber || 'N/A'}
                    </strong>
                  </div>

                  {/* MARCA Y TIPO DE TARJETA */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>Tipo y Franquicia de Tarjeta:</span>
                    <strong style={{ color: '#e2e8f0', display: 'block', marginTop: '0.2rem' }}>
                      {transaction.payment?.cardBrand || 'Tarjeta'} ({transaction.payment?.cardType || 'Crédito'})
                    </strong>
                  </div>

                  {/* PLAN DE FINANCIAMIENTO */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>Plan de Cuotas / Financiamiento:</span>
                    <strong style={{ color: transaction.payment?.isFinanced ? '#c084fc' : '#4ade80', display: 'block', marginTop: '0.2rem' }}>
                      {transaction.payment?.installmentsDescription || 'Pago de Contado (1 cuota)'}
                    </strong>
                  </div>

                  {/* ID DE TRANSACCION */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>ID Transacción (TransactionId):</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#38bdf8', fontSize: '0.82rem' }}>
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

                  {/* TID / NSU */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>Identificador Pasarela (TID / NSU):</span>
                    <strong style={{ color: '#e2e8f0', display: 'block', marginTop: '0.2rem' }}>
                      {transaction.payment?.tid || 'N/A'}
                    </strong>
                  </div>

                  {/* AUTH CODE */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>Código de Autorización Bancaria:</span>
                    <strong style={{ color: '#4ade80', display: 'block', marginTop: '0.2rem' }}>
                      {transaction.payment?.authId || 'N/A'}
                    </strong>
                  </div>

                  {/* CÓDIGO DE RETORNO / ESTADO */}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.78rem' }}>Código de Retorno Banco:</span>
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
                          : 'Código 00 - Autorizado Exitoso'}
                      </span>
                    </div>
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
              {/* VISTA TABLA PARA ESCRITORIO */}
              <div
                className="skus-desktop-table"
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(30, 41, 59, 0.3)',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'left' }}>
                      <th style={{ padding: '0.65rem 0.85rem', color: '#94a3b8', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Producto / SKU</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: '#94a3b8', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Cant.</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: '#94a3b8', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Precio Unit.</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: '#94a3b8', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.skus?.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background 0.2s' }}
                      >
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  objectFit: 'contain',
                                  borderRadius: '6px',
                                  background: '#ffffff',
                                  padding: '2px',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '6px',
                                  background: 'rgba(255,255,255,0.05)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <Package size={18} color="#64748b" />
                              </div>
                            )}
                            <div>
                              <strong style={{ color: '#ffffff', display: 'block', fontSize: '0.84rem', lineHeight: '1.3', fontWeight: 600 }}>{item.name}</strong>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                SKU: <code style={{ color: '#38bdf8' }}>{item.id}</code> • Marca: {item.brand}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center', fontWeight: 600, color: '#f1f5f9', fontSize: '0.84rem' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', color: '#cbd5e1', fontSize: '0.82rem' }}>
                          C$ {item.unitPrice?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#38bdf8', fontSize: '0.84rem' }}>
                          C$ {item.totalPrice?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* VISTA TARJETAS CARDS PARA MÓVIL */}
              <div className="skus-mobile-cards">
                {transaction.skus?.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'rgba(30, 41, 59, 0.45)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    {/* ENCABEZADO PRODUCTO + IMAGEN */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
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
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '8px',
                            background: 'rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Package size={20} color="#64748b" />
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 }}>
                        <strong style={{ color: '#ffffff', fontSize: '0.84rem', lineHeight: '1.3', fontWeight: 700 }}>
                          {item.name}
                        </strong>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <span>SKU: <code style={{ color: '#38bdf8' }}>{item.id}</code></span>
                          {item.brand && <span>• Marca: <strong style={{ color: '#cbd5e1' }}>{item.brand}</strong></span>}
                        </div>
                      </div>
                    </div>

                    {/* BARRA INFERIOR CON DETALLES DE CANTIDAD, PRECIO UNITARIO Y SUBTOTAL */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.5rem',
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                          Cant.
                        </span>
                        <strong style={{ fontSize: '0.82rem', color: '#f1f5f9', fontWeight: 700 }}>
                          {item.quantity} unid.
                        </strong>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                          Precio Unit.
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>
                          C$ {item.unitPrice?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                          Subtotal
                        </span>
                        <strong style={{ fontSize: '0.82rem', color: '#38bdf8', fontWeight: 800 }}>
                          C$ {item.totalPrice?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
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
          {activeTab === 'logs' && (() => {
            const effectiveInteractions = (transaction.interactions && transaction.interactions.length > 0)
              ? transaction.interactions
              : [
                  {
                    Source: 'VTEX Payment Gateway',
                    Date: transaction.startDate,
                    Status: '1. Solicitud de Pago Iniciada en Checkout VTEX',
                    Message: JSON.stringify({
                      evento: 'Solicitud de Pago en Checkout',
                      secuenciaKey: transaction.key,
                      orderId: transaction.orderId,
                      transactionId: transaction.transactionId || transaction.id,
                      montoTotal: `${transaction.amount?.toLocaleString('es-NI', { minimumFractionDigits: 2 })} ${transaction.currency}`,
                      metodoPago: transaction.payment?.systemName,
                      tarjeta: transaction.payment?.cardNumber,
                      titular: transaction.payment?.cardHolder,
                      cliente: transaction.client?.name,
                      email: transaction.client?.email,
                      ipCliente: transaction.technical?.ipAddress,
                    }, null, 2)
                  },
                  {
                    Source: `${transaction.payment?.acquirer || 'Tilopay'} Conector`,
                    Date: transaction.startDate,
                    Status: `2. Envío de Solicitud de Cobro a Pasarela (${transaction.payment?.acquirer || 'Tilopay'})`,
                    Message: JSON.stringify({
                      evento: 'Procesamiento en Pasarela Conector',
                      pasarelaAdquirente: transaction.payment?.acquirer || 'Tilopay',
                      metodoPago: transaction.payment?.systemName,
                      tarjeta: transaction.payment?.cardNumber,
                      titular: transaction.payment?.cardHolder,
                      tid: transaction.payment?.tid,
                    }, null, 2)
                  },
                  {
                    Source: 'Banco Emisor / Pasarela Adquirente',
                    Date: transaction.startDate,
                    Status: `3. Respuesta del Banco Emisor / Pasarela: ${
                      isApproved ? 'Aprobado (Code 00)' : transaction.errorDiagnostics?.isRefund ? 'Devolución Post-Venta' : `Rechazado (Código ${transaction.errorDiagnostics?.code || transaction.payment?.returnCode || 'ERR'})`
                    }`,
                    Message: JSON.stringify({
                      evento: 'Respuesta de Autorización Bancaria',
                      codigoRetorno: transaction.errorDiagnostics?.code || transaction.payment?.returnCode || 'N/A',
                      tituloRespuesta: transaction.errorDiagnostics?.title || 'Transacción Procesada',
                      explicacionDetallada: transaction.errorDiagnostics?.description || 'Detalle no proporcionado por el conector',
                      recomendacionSAC: transaction.errorDiagnostics?.sacRecommendation,
                      codigoAutorizacionBancaria: transaction.authId || transaction.payment?.authId,
                      tidPasarela: transaction.payment?.tid,
                      motivoCancelacionVTEX: transaction.errorDiagnostics?.cancelReason,
                    }, null, 2)
                  },
                  {
                    Source: 'VTEX OMS (Order Management)',
                    Date: transaction.startDate,
                    Status: `4. Registro Final de Estado en OMS: ${transaction.status}`,
                    Message: JSON.stringify({
                      evento: 'Actualización de Estado de la Orden',
                      estadoFinalOMS: transaction.status,
                      rawStatusVTEX: transaction.rawStatus,
                      ordenAutorizada: isApproved,
                      motivoFinalizacion: transaction.errorDiagnostics?.cancelReason || (isApproved ? 'Aprobado y acreditado' : transaction.errorDiagnostics?.title),
                    }, null, 2)
                  }
                ];

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '100%' }}>
                
                {/* ENCABEZADO Y RESUMEN TÉCNICO DE LOGS */}
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
                    Eventos de Diagnóstico Registrados: <strong style={{ color: '#38bdf8' }}>{effectiveInteractions.length} eventos</strong>
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    VTEX Transaction ID: <code style={{ color: '#cbd5e1' }}>{transaction.id || transaction.key}</code>
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxWidth: '100%' }}>
                  {effectiveInteractions.map((log, i) => {
                    let formattedJson = null;
                    if (log.Message) {
                      try {
                        const jsonStart = log.Message.indexOf('{');
                        const jsonEnd = log.Message.lastIndexOf('}');
                        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                          const jsonStr = log.Message.substring(jsonStart, jsonEnd + 1);
                          const parsed = JSON.parse(jsonStr);
                          formattedJson = JSON.stringify(parsed, null, 2);
                        }
                      } catch (e) {
                        // Not JSON
                      }
                    }

                    return (
                      <div
                        key={i}
                        style={{
                          backgroundColor: 'rgba(30, 41, 59, 0.4)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          padding: '1rem',
                          fontSize: '0.82rem',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          maxWidth: '100%',
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            ⚡ Paso {i + 1}: {log.Source || 'Gateway Conector'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6 me-2', flexWrap: 'wrap' }}>
                            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                              {log.Date ? new Date(log.Date).toLocaleString('es-NI') : ''}
                            </span>
                            <button
                              onClick={() => handleCopy(log.Message || log.Status || '', `log-${i}`)}
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                color: copiedText === `log-${i}` ? '#34d399' : '#94a3b8',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                marginLeft: '0.5rem',
                              }}
                              title="Copiar log al portapapeles"
                            >
                              {copiedText === `log-${i}` ? <Check size={12} /> : <Copy size={12} />}
                              {copiedText === `log-${i}` ? 'Copiado' : 'Copiar Log'}
                            </button>
                          </div>
                        </div>

                        <div style={{ color: '#ffffff', fontWeight: 600, marginBottom: '0.35rem' }}>
                          {log.Status || log.Message}
                        </div>

                        {formattedJson ? (
                          <pre
                            style={{
                              color: '#34d399',
                              fontSize: '0.76rem',
                              marginTop: '0.5rem',
                              backgroundColor: '#090d16',
                              padding: '0.75rem 0.95rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(52, 211, 153, 0.25)',
                              fontFamily: 'Consolas, Monaco, monospace',
                              overflowX: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              maxHeight: '300px',
                            }}
                          >
                            {formattedJson}
                          </pre>
                        ) : log.Message && log.Message !== log.Status ? (
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
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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

      <style jsx>{`
        .skus-desktop-table {
          display: block;
        }
        .skus-mobile-cards {
          display: none;
        }
        @media (max-width: 768px) {
          .skus-desktop-table {
            display: none !important;
          }
          .skus-mobile-cards {
            display: flex !important;
            flex-direction: column;
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
