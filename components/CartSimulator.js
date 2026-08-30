'use client';

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  Play,
  RotateCcw,
  Download,
  CheckCircle2,
  AlertCircle,
  Gift,
  Tag,
  Search,
  Loader2,
  Package,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertTriangle,
  ImageOff,
  Box,
  Sliders,
} from 'lucide-react';

export default function CartSimulator() {
  const [activeTab, setActiveTab] = useState('excel'); // 'excel' | 'manual'
  const [file, setFile] = useState(null);
  const [extractedItems, setExtractedItems] = useState([]); // [{ skuId, quantity }]
  const [detectedColumns, setDetectedColumns] = useState({ skuCol: '', qtyCol: '' });
  const [manualSkusText, setManualSkusText] = useState('');
  
  // Estado de simulación
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [results, setResults] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  
  // Filtros y Búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'regalias' | 'discounts' | 'diagnostics' | 'available' | 'nostock'
  const [expandedRows, setExpandedRows] = useState({});
  const [copiedSku, setCopiedSku] = useState(null);

  const fileInputRef = useRef(null);

  // Copiar SKU al portapapeles
  const handleCopySku = (sku) => {
    navigator.clipboard.writeText(sku);
    setCopiedSku(sku);
    setTimeout(() => setCopiedSku(null), 2000);
  };

  // Procesar archivo Excel / CSV
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convertir a JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (!rawData || rawData.length === 0) {
          setErrorMsg('El archivo Excel está vacío o no contiene datos.');
          return;
        }

        let headerRowIndex = 0;
        let skuColIndex = -1;
        let qtyColIndex = -1;
        let skuColName = '';
        let qtyColName = '';

        // Buscar en las primeras 5 filas por encabezados de SKU y Cantidad
        for (let r = 0; r < Math.min(5, rawData.length); r++) {
          const row = rawData[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').trim();
            if (/^(sku|skuid|sku_id|codigo|código|id|item|producto|item_id)$/i.test(val) && skuColIndex === -1) {
              headerRowIndex = r;
              skuColIndex = c;
              skuColName = val;
            } else if (/^(cantidad|cant|qty|quantity|unidades|unidad)$/i.test(val) && qtyColIndex === -1) {
              qtyColIndex = c;
              qtyColName = val;
            }
          }
          if (skuColIndex !== -1) break;
        }

        // Si no se encuentra encabezado explícito para SKU, usar la primera columna
        if (skuColIndex === -1) {
          skuColIndex = 0;
          skuColName = String(rawData[0]?.[0] || 'Columna SKU');
        }

        // Extraer los SKUs y Cantidades
        const itemsFound = [];
        const startIndex = headerRowIndex + 1;

        for (let i = startIndex; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row) continue;
          const sVal = String(row[skuColIndex] || '').trim();
          if (sVal && sVal !== 'undefined' && sVal !== 'null') {
            let qVal = 1;
            if (qtyColIndex !== -1 && row[qtyColIndex] !== undefined) {
              const parsedQty = parseInt(String(row[qtyColIndex]).trim(), 10);
              if (!isNaN(parsedQty) && parsedQty > 0) {
                qVal = parsedQty;
              }
            }
            itemsFound.push({ skuId: sVal, quantity: qVal });
          }
        }

        if (itemsFound.length === 0) {
          setErrorMsg('No se encontraron SKUs válidos en la columna detectada.');
          setExtractedItems([]);
        } else {
          setDetectedColumns({
            skuCol: skuColName,
            qtyCol: qtyColIndex !== -1 ? qtyColName : 'Por defecto (1 u.)',
          });
          setExtractedItems(itemsFound);
        }
      } catch (err) {
        console.error('Error leyendo archivo Excel:', err);
        setErrorMsg('Error al procesar el archivo Excel. Asegúrate de que tenga un formato .xlsx, .xls o .csv válido.');
      }
    };
    reader.readAsBinaryString(uploadedFile);
  };

  // Iniciar Simulación en Carrito
  const startSimulation = async () => {
    let targetItems = extractedItems;

    if (activeTab === 'manual') {
      const rawLines = manualSkusText.split(/[\n,;\t]+/);
      targetItems = rawLines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          // Parsear formato "SKU:CANTIDAD" o "SKU xCANTIDAD" o "SKU,CANTIDAD" o "SKU"
          const parts = trimmed.split(/[:,\s]+x?/i);
          const sId = parts[0].trim();
          const qVal = parts[1] ? parseInt(parts[1].trim(), 10) : 1;
          return { skuId: sId, quantity: !isNaN(qVal) && qVal > 0 ? qVal : 1 };
        })
        .filter((item) => Boolean(item) && Boolean(item.skuId));
    }

    if (!targetItems || targetItems.length === 0) {
      setErrorMsg('Por favor ingresa o carga al menos un SKU para probar.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setResults([]);
    setProgress({ current: 0, total: targetItems.length, percentage: 0 });

    const accumulatedResults = [];
    const BATCH_SIZE = 5; // Paquetes de 5 para actualización fluida y diagnóstico de catálogo

    for (let i = 0; i < targetItems.length; i += BATCH_SIZE) {
      const currentBatch = targetItems.slice(i, i + BATCH_SIZE);

      try {
        const res = await fetch('/api/cart-simulation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: currentBatch }),
        });

        const data = await res.json();

        if (data.success && Array.isArray(data.results)) {
          accumulatedResults.push(...data.results);
          setResults([...accumulatedResults]);
        } else {
          currentBatch.forEach((item) => {
            accumulatedResults.push({
              skuId: item.skuId,
              quantity: item.quantity,
              status: 'error',
              error: data.error || 'Fallo en simulación',
              hasRegalias: false,
              regalias: [],
              selectableGiftsOptions: [],
              missingGiftDiagnostics: [],
            });
          });
          setResults([...accumulatedResults]);
        }
      } catch (err) {
        currentBatch.forEach((item) => {
          accumulatedResults.push({
            skuId: item.skuId,
            quantity: item.quantity,
            status: 'error',
            error: err.message,
            hasRegalias: false,
            regalias: [],
            selectableGiftsOptions: [],
            missingGiftDiagnostics: [],
          });
        });
        setResults([...accumulatedResults]);
      }

      const processedCount = Math.min(i + BATCH_SIZE, targetItems.length);
      const pct = Math.round((processedCount / targetItems.length) * 100);
      setProgress({ current: processedCount, total: targetItems.length, percentage: pct });
    }

    setIsProcessing(false);
  };

  // Reiniciar simulador
  const handleReset = () => {
    setFile(null);
    setExtractedItems([]);
    setResults([]);
    setErrorMsg(null);
    setProgress({ current: 0, total: 0, percentage: 0 });
    setManualSkusText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Toggle expansión de filas con regalías / diagnósticos
  const toggleRowExpand = (skuId) => {
    setExpandedRows((prev) => ({ ...prev, [skuId]: !prev[skuId] }));
  };

  // Exportar resultados a Excel (En Córdobas C$)
  const exportToExcel = () => {
    if (results.length === 0) return;

    const exportData = results.map((item) => {
      const regaliasDetalle = item.regalias && item.regalias.length > 0
        ? item.regalias.map((r) => `${r.name} (SKU: ${r.skuId}) x${r.quantity}`).join(' | ')
        : 'Sin Regalías Agregadas';

      const selectablesDetalle = item.selectableGiftsOptions && item.selectableGiftsOptions.length > 0
        ? item.selectableGiftsOptions.map((r) => `${r.name} (SKU: ${r.skuId})`).join(' | ')
        : 'Ninguna';

      const diagDetalle = item.missingGiftDiagnostics && item.missingGiftDiagnostics.length > 0
        ? item.missingGiftDiagnostics.map((d) => `Regalía Faltante SKU ${d.giftSkuId} (${d.name}): ${d.reason}`).join(' | ')
        : 'Sin alertas de diagnóstico';

      const promosDetalle = item.appliedPromotions && item.appliedPromotions.length > 0
        ? item.appliedPromotions.join(', ')
        : 'Ninguna';

      return {
        'SKU Principal': item.skuId,
        'Cantidad Simulada': item.quantity || 1,
        'Nombre Producto': item.name || 'N/A',
        'Estado / Disponibilidad': item.status === 'available' ? 'Disponible' : (item.status === 'withoutStock' ? 'Sin Stock' : 'Error / No Encontrado'),
        'Precio Lista (C$)': item.listPrice !== null && item.listPrice !== undefined ? item.listPrice : 0,
        'Precio Final (C$)': item.sellingPrice !== null && item.sellingPrice !== undefined ? item.sellingPrice : 0,
        'Descuento (C$)': item.discountAmount || 0,
        'Descuento (%)': item.discountPercentage ? `${item.discountPercentage}%` : '0%',
        '¿Tiene Regalía Agregada?': item.hasRegalias ? 'SÍ' : 'NO',
        'Cantidad Regalías Agregadas': item.regalias ? item.regalias.length : 0,
        'Detalle de Regalías Agregadas': regaliasDetalle,
        'Regalías Seleccionables (Opciones)': selectablesDetalle,
        'Diagnóstico de Regalías Faltantes': diagDetalle,
        'Promociones Aplicadas': promosDetalle,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Simulación Carrito VTEX');

    const colWidths = [
      { wch: 15 },
      { wch: 18 },
      { wch: 42 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 22 },
      { wch: 18 },
      { wch: 50 },
      { wch: 45 },
      { wch: 60 },
      { wch: 35 },
    ];
    worksheet['!cols'] = colWidths;

    const fileName = `Simulacion_Carrito_VTEX_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Filtrar resultados
  const filteredResults = results.filter((item) => {
    const matchesQuery = searchQuery === '' || 
      String(item.skuId).toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.regalias || []).some((r) => String(r.name).toLowerCase().includes(searchQuery.toLowerCase()) || String(r.skuId).includes(searchQuery)) ||
      (item.missingGiftDiagnostics || []).some((d) => String(d.name).toLowerCase().includes(searchQuery.toLowerCase()) || String(d.giftSkuId).includes(searchQuery));

    if (!matchesQuery) return false;

    if (filterType === 'regalias') return item.hasRegalias === true;
    if (filterType === 'discounts') return item.hasDiscount === true;
    if (filterType === 'diagnostics') return item.missingGiftDiagnostics && item.missingGiftDiagnostics.length > 0;
    if (filterType === 'available') return item.status === 'available';
    if (filterType === 'nostock') return item.status !== 'available';

    return true;
  });

  // Métricas calculadas
  const totalProcessed = results.length;
  const countAvailable = results.filter((r) => r.status === 'available').length;
  const countNoStock = results.filter((r) => r.status !== 'available').length;
  const countWithDiscount = results.filter((r) => r.hasDiscount).length;
  const countWithRegalias = results.filter((r) => r.hasRegalias).length;
  const countWithDiagnostics = results.filter((r) => r.missingGiftDiagnostics && r.missingGiftDiagnostics.length > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Contenedor Superior: Formulario de Carga y Selección */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Selector de Pestaña: Excel / Manual */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', pb: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }} className="mobile-stack">
          <button
            onClick={() => setActiveTab('excel')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'excel' ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
              color: activeTab === 'excel' ? '#38bdf8' : 'var(--text-muted)',
              borderBottom: activeTab === 'excel' ? '2px solid #38bdf8' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <FileSpreadsheet size={18} />
            Subir Archivo Excel / CSV (con SKUs y Cantidad)
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'manual' ? 'rgba(232, 121, 249, 0.18)' : 'transparent',
              color: activeTab === 'manual' ? '#e879f9' : 'var(--text-muted)',
              borderBottom: activeTab === 'manual' ? '2px solid #e879f9' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <Package size={18} />
            Ingreso Manual de SKUs
          </button>
        </div>

        {/* Tab 1: Carga de Archivo Excel */}
        {activeTab === 'excel' && (
          <div>
            {!file ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed rgba(56, 189, 248, 0.3)',
                  borderRadius: '14px',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  background: 'rgba(15, 23, 42, 0.35)',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.background = 'rgba(56, 189, 248, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                  e.currentTarget.style.background = 'rgba(15, 23, 42, 0.35)';
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  style={{ display: 'none' }}
                />
                <UploadCloud size={44} color="var(--accent-primary)" style={{ marginBottom: '0.75rem' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.35rem' }}>
                  Haz clic o arrastra tu archivo Excel aquí
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Soporta archivos <strong>.xlsx, .xls o .csv</strong>. Lee automáticamente columnas de <strong>SKU</strong> y opcionalmente <strong>Cantidad</strong>.
                </p>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileSpreadsheet size={24} color="#38bdf8" />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>{file.name}</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      <span>Columna SKU: <strong style={{ color: '#38bdf8' }}>"{detectedColumns.skuCol}"</strong></span>
                      •
                      <span>Cantidad: <strong style={{ color: '#e879f9' }}>"{detectedColumns.qtyCol}"</strong></span>
                      •
                      <span>SKUs listos: <strong style={{ color: '#34d399' }}>{extractedItems.length}</strong></span>
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={handleReset}
                    disabled={isProcessing}
                    style={{
                      padding: '0.6rem 1rem',
                      borderRadius: '10px',
                      border: '1px solid var(--border-subtle)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <RotateCcw size={16} /> Cambiar Archivo
                  </button>

                  <button
                    onClick={startSimulation}
                    disabled={isProcessing || extractedItems.length === 0}
                    style={{
                      padding: '0.65rem 1.4rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: isProcessing || extractedItems.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 4px 15px rgba(56, 189, 248, 0.35)',
                      opacity: isProcessing || extractedItems.length === 0 ? 0.6 : 1,
                    }}
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                    {isProcessing ? 'Simulando en Carrito...' : `Probar ${extractedItems.length} SKUs en Carrito`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Ingreso Manual de SKUs */}
        {activeTab === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
              Ingresa o pega los códigos de SKU que deseas simular. Puedes especificar cantidad usando dos puntos o espacio (ej. <code style={{ color: '#e879f9' }}>100878697:2</code> para simular 2 unidades, o solo <code style={{ color: '#38bdf8' }}>100878697</code> para 1 unidad):
            </p>
            <textarea
              rows={4}
              value={manualSkusText}
              onChange={(e) => setManualSkusText(e.target.value)}
              placeholder="Ejemplo:&#10;100878697:2&#10;149980123&#10;100414681:3"
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)',
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={startSimulation}
                disabled={isProcessing || !manualSkusText.trim()}
                style={{
                  padding: '0.65rem 1.4rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #e879f9 0%, #c084fc 100%)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: isProcessing || !manualSkusText.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 15px rgba(232, 121, 249, 0.35)',
                  opacity: isProcessing || !manualSkusText.trim() ? 0.6 : 1,
                }}
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                {isProcessing ? 'Simulando en Carrito...' : 'Iniciar Simulación Manual'}
              </button>
            </div>
          </div>
        )}

        {/* Mensaje de Error si aplica */}
        {errorMsg && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Barra de Progreso en Vivo */}
        {isProcessing && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={14} className="animate-spin" color="#38bdf8" />
                Procesando simulación VTEX OrderForm y auditoría de regalías...
              </span>
              <strong style={{ color: '#38bdf8' }}>{progress.current} / {progress.total} SKUs ({progress.percentage}%)</strong>
            </div>
            <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress.percentage}%`,
                  background: 'linear-gradient(90deg, #38bdf8, #e879f9)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tarjetas de Resumen KPI (Si existen resultados) */}
      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {/* Card 1: Total SKUs Evaluados */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={22} color="#38bdf8" />
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SKUs Evaluados</span>
              <strong style={{ fontSize: '1.35rem', color: '#ffffff', fontWeight: 700 }}>{totalProcessed}</strong>
            </div>
          </div>

          {/* Card 2: Disponibles */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={22} color="#34d399" />
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Disponibles</span>
              <strong style={{ fontSize: '1.35rem', color: '#34d399', fontWeight: 700 }}>{countAvailable}</strong>
            </div>
          </div>

          {/* Card 3: Con Descuento */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(165, 180, 252, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tag size={22} color="#a5b4fc" />
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Con Descuento</span>
              <strong style={{ fontSize: '1.35rem', color: '#a5b4fc', fontWeight: 700 }}>{countWithDiscount}</strong>
            </div>
          </div>

          {/* Card 4: Con Regalías Agregadas 🎁 */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              borderRadius: '14px',
              border: '1px solid rgba(232, 121, 249, 0.3)',
              padding: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 20px rgba(232, 121, 249, 0.15)',
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(232, 121, 249, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gift size={22} color="#e879f9" />
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', color: '#e879f9', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Con Regalías 🎁</span>
              <strong style={{ fontSize: '1.35rem', color: '#ffffff', fontWeight: 700 }}>{countWithRegalias}</strong>
            </div>
          </div>

          {/* Card 5: Diagnóstico Regalía Faltante ⚠ */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(16px)',
              borderRadius: '14px',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              padding: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={22} color="#fbbf24" />
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', color: '#fbbf24', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Regalía Faltante ⚠</span>
              <strong style={{ fontSize: '1.35rem', color: '#ffffff', fontWeight: 700 }}>{countWithDiagnostics}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Contenedor Principal: Tabla de Resultados y Controles de Filtro */}
      {results.length > 0 && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(16px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Header de Tabla: Buscador, Filtros y Botón de Exportación */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            {/* Buscador */}
            <div style={{ position: 'relative', minWidth: '260px', flex: '1' }}>
              <Search size={17} color="var(--text-muted)" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por SKU, Nombre de producto, Regalía u Obsequio faltante..."
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem 0.6rem 2.4rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
            </div>

            {/* Pill Filters */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `Todos (${totalProcessed})` },
                { id: 'regalias', label: `🎁 Con Regalías (${countWithRegalias})` },
                { id: 'discounts', label: `🏷️ Con Descuento (${countWithDiscount})` },
                { id: 'diagnostics', label: `⚠️ Regalías Faltantes (${countWithDiagnostics})` },
                { id: 'available', label: `🟢 Disponibles (${countAvailable})` },
                { id: 'nostock', label: `🔴 Sin Stock (${countNoStock})` },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setFilterType(pill.id)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: filterType === pill.id ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.08)',
                    background: filterType === pill.id ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterType === pill.id ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '0.8rem',
                    fontWeight: filterType === pill.id ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Botón Exportar a Excel */}
            <button
              onClick={exportToExcel}
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: '10px',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                background: 'rgba(52, 211, 153, 0.12)',
                color: '#34d399',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
              }}
            >
              <Download size={17} /> Exportar Excel (C$)
            </button>
          </div>

          {/* Tabla de Resultados */}
          <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(30, 41, 59, 0.8)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>SKU Principal</th>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>Nombre / Descripción</th>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'right' }}>Precio Lista</th>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'right' }}>Precio Final</th>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>Descuento</th>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'center' }}>Regalías Agregadas 🎁</th>
                  <th style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>Promociones / Tags</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No se encontraron productos que coincidan con los criterios de búsqueda o filtro seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((item, idx) => {
                    const isExpanded = expandedRows[item.skuId];
                    const hasRegalias = item.hasRegalias && item.regalias && item.regalias.length > 0;
                    const hasSelectables = item.selectableGiftsOptions && item.selectableGiftsOptions.length > 0;
                    const hasDiagnostics = item.missingGiftDiagnostics && item.missingGiftDiagnostics.length > 0;

                    return (
                      <React.Fragment key={`${item.skuId}-${idx}`}>
                        <tr
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            background: hasDiagnostics 
                              ? 'rgba(251, 191, 36, 0.05)' 
                              : (hasRegalias ? 'rgba(232, 121, 249, 0.04)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)')),
                            transition: 'background 0.2s ease',
                          }}
                        >
                          {/* SKU ID + Cantidad */}
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600, fontFamily: 'monospace', color: '#ffffff', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                              <span>{item.skuId}</span>
                              {item.quantity > 1 && (
                                <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontSize: '0.72rem', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 700 }}>
                                  x{item.quantity}
                                </span>
                              )}
                              <button
                                onClick={() => handleCopySku(item.skuId)}
                                style={{ background: 'none', border: 'none', color: copiedSku === item.skuId ? '#34d399' : 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center' }}
                                title="Copiar SKU"
                              >
                                {copiedSku === item.skuId ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                            </div>
                          </td>

                          {/* Nombre */}
                          <td style={{ padding: '0.85rem 1rem', color: '#e2e8f0', maxWidth: '320px', minWidth: '220px', verticalAlign: 'middle' }}>
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>
                              {item.name || 'Sin Nombre'}
                            </div>
                          </td>

                          {/* Estado */}
                          <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {item.status === 'available' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: '20px', background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(52, 211, 153, 0.3)', whiteSpace: 'nowrap' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                                Disponible
                              </span>
                            ) : item.status === 'withoutStock' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: '20px', background: 'rgba(248, 113, 113, 0.15)', color: '#f87171', fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(248, 113, 113, 0.3)', whiteSpace: 'nowrap' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f87171', display: 'inline-block' }} />
                                Sin Stock
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: '20px', background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(251, 191, 36, 0.3)', whiteSpace: 'nowrap' }}>
                                ⚠ Error ({item.error || 'N/A'})
                              </span>
                            )}
                          </td>

                          {/* Precio Lista en C$ */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: 'var(--text-muted)', verticalAlign: 'middle', whiteSpace: 'nowrap', minWidth: '130px' }}>
                            {item.listPrice !== null && item.listPrice !== undefined ? `C$ ${item.listPrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>

                          {/* Precio Final en C$ */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: item.hasDiscount ? '#34d399' : '#ffffff', fontSize: '0.92rem', verticalAlign: 'middle', whiteSpace: 'nowrap', minWidth: '130px' }}>
                            {item.sellingPrice !== null && item.sellingPrice !== undefined ? `C$ ${item.sellingPrice.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>

                          {/* Descuento */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {item.hasDiscount ? (
                              <span style={{ display: 'inline-block', padding: '0.25rem 0.6rem', borderRadius: '8px', background: 'rgba(165, 180, 252, 0.18)', color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                -{item.discountPercentage}% (C$ {item.discountAmount.toFixed(2)})
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>Sin desc.</span>
                            )}
                          </td>

                          {/* Regalías Agregadas / Opciones / Diagnóstico */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center' }}>
                              {hasRegalias && (
                                <button
                                  onClick={() => toggleRowExpand(item.skuId)}
                                  style={{
                                    padding: '0.3rem 0.75rem',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(232, 121, 249, 0.5)',
                                    background: 'rgba(232, 121, 249, 0.18)',
                                    color: '#e879f9',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    boxShadow: '0 2px 10px rgba(232, 121, 249, 0.2)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <Gift size={14} /> SÍ ({item.regalias.length} obsequio{item.regalias.length > 1 ? 's' : ''})
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              )}

                              {hasSelectables && (
                                <button
                                  onClick={() => toggleRowExpand(item.skuId)}
                                  style={{
                                    padding: '0.25rem 0.65rem',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(56, 189, 248, 0.5)',
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <Sliders size={13} /> {item.selectableGiftsOptions.length} Opciones a elegir
                                </button>
                              )}

                              {hasDiagnostics && (
                                <button
                                  onClick={() => toggleRowExpand(item.skuId)}
                                  style={{
                                    padding: '0.25rem 0.65rem',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(251, 191, 36, 0.5)',
                                    background: 'rgba(251, 191, 36, 0.15)',
                                    color: '#fbbf24',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <AlertTriangle size={13} /> Alerta Regalía ({item.missingGiftDiagnostics.length})
                                </button>
                              )}

                              {!hasRegalias && !hasSelectables && !hasDiagnostics && (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>Sin regalía</span>
                              )}
                            </div>
                          </td>

                          {/* Promociones / Tags */}
                          <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.78rem', verticalAlign: 'middle' }}>
                            {item.appliedPromotions && item.appliedPromotions.length > 0 ? (
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {item.appliedPromotions.map((p, pIdx) => (
                                  <span key={pIdx} style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px', color: '#cbd5e1' }}>
                                    {p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-dim)' }}>-</span>
                            )}
                          </td>
                        </tr>

                        {/* Fila Desplegable con Detalle de Regalías y Diagnósticos */}
                        {(hasRegalias || hasSelectables || hasDiagnostics) && isExpanded && (
                          <tr style={{ background: 'rgba(30, 41, 59, 0.85)' }}>
                            <td colSpan={8} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                
                                {/* SECCIÓN 1: Regalías Agregadas Automáticamente */}
                                {hasRegalias && (
                                  <div>
                                    <div style={{ fontSize: '0.78rem', color: '#e879f9', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                      <Sparkles size={15} /> Obsequios Agregados Automáticamente al Carrito para SKU {item.skuId}:
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.6rem' }}>
                                      {item.regalias.map((regalo, rIdx) => (
                                        <div
                                          key={rIdx}
                                          style={{
                                            background: 'rgba(15, 23, 42, 0.75)',
                                            border: '1px solid rgba(232, 121, 249, 0.3)',
                                            borderRadius: '8px',
                                            padding: '0.6rem 0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                          }}
                                        >
                                          <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(232, 121, 249, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Gift size={16} color="#e879f9" />
                                          </div>
                                          <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {regalo.name}
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', marginTop: '0.1rem' }}>
                                              <span>SKU Regalía: <strong style={{ color: '#e879f9', fontFamily: 'monospace' }}>{regalo.skuId}</strong></span>
                                              <span>Cant: <strong style={{ color: '#ffffff' }}>{regalo.quantity}</strong></span>
                                              <span>Precio: <strong style={{ color: '#34d399' }}>GRATIS (C$ 0.00)</strong></span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* SECCIÓN 2: Regalías Seleccionables (Opciones Múltiples) */}
                                {hasSelectables && (
                                  <div>
                                    <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                      <Sliders size={15} /> Opciones de Regalía Seleccionables por el Cliente:
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.6rem' }}>
                                      {item.selectableGiftsOptions.map((opt, oIdx) => (
                                        <div
                                          key={oIdx}
                                          style={{
                                            background: 'rgba(15, 23, 42, 0.75)',
                                            border: '1px solid rgba(56, 189, 248, 0.3)',
                                            borderRadius: '8px',
                                            padding: '0.6rem 0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                          }}
                                        >
                                          <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Gift size={16} color="#38bdf8" />
                                          </div>
                                          <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {opt.name}
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', marginTop: '0.1rem' }}>
                                              <span>SKU Opción: <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{opt.skuId}</strong></span>
                                              <span>Elegir: <strong style={{ color: '#ffffff' }}>1 unidad</strong></span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* SECCIÓN 3: Motor de Diagnóstico de Regalías Faltantes */}
                                {hasDiagnostics && (
                                  <div>
                                    <div style={{ fontSize: '0.78rem', color: '#fbbf24', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                      <AlertTriangle size={15} /> Auditoría de Regalías Faltantes (Promoción Activa pero Obsequio NO Agregado):
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                      {item.missingGiftDiagnostics.map((diag, dIdx) => (
                                        <div
                                          key={dIdx}
                                          style={{
                                            background: 'rgba(251, 191, 36, 0.08)',
                                            border: '1px solid rgba(251, 191, 36, 0.35)',
                                            borderRadius: '8px',
                                            padding: '0.75rem 1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            flexWrap: 'wrap',
                                            gap: '0.75rem',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(251, 191, 36, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                              <AlertTriangle size={18} color="#fbbf24" />
                                            </div>
                                            <div>
                                              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
                                                Regalía Esperada: <span style={{ color: '#fbbf24' }}>{diag.name}</span> (SKU: <code style={{ fontFamily: 'monospace' }}>{diag.giftSkuId}</code>)
                                              </div>
                                              <div style={{ fontSize: '0.78rem', color: '#fef08a', marginTop: '0.15rem', display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                                                <span>Causa: <strong>{diag.reason}</strong></span>
                                              </div>
                                            </div>
                                          </div>

                                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            {!diag.isActive && (
                                              <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '0.72rem', fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                                ❌ SKU Inactivo
                                              </span>
                                            )}
                                            {!diag.hasImage && (
                                              <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontSize: '0.72rem', fontWeight: 600, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                <ImageOff size={12} /> Sin Foto
                                              </span>
                                            )}
                                            {diag.totalStock <= 0 && (
                                              <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '0.72rem', fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                <Box size={12} /> Stock: 0 u.
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
