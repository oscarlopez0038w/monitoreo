'use client';

import { useState } from 'react';
import { ShieldAlert, Upload, Plus, FileText, CheckCircle2, AlertTriangle, RefreshCw, X } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SafetyStockPanel({ onSafetyStockUpdated }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'single'
  const [loading, setLoading] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState(null);

  // Formulario manual
  const [singleSku, setSingleSku] = useState('');
  const [singleDescription, setSingleDescription] = useState('');
  const [singleStock, setSingleStock] = useState('0');

  // Helper para procesar una hoja concreta y extraer filas válidas de SKU
  const parseSheetData = (worksheet) => {
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!matrix || matrix.length === 0) return { rows: [] };

    // Buscar la fila de encabezado en las primeras 30 filas
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(matrix.length, 30); i++) {
      const rowStr = matrix[i].map((c) => String(c).trim().toLowerCase()).join(' ');
      if (
        rowStr.includes('sku') ||
        rowStr.includes('codigo') ||
        rowStr.includes('código') ||
        rowStr.includes('item')
      ) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = matrix.findIndex((r) => r.some((cell) => String(cell).trim().length > 0));
      if (headerRowIdx === -1) headerRowIdx = 0;
    }

    const headers = matrix[headerRowIdx].map((c) => String(c).trim());
    const lowerHeaders = headers.map((h) => h.toLowerCase());

    let skuIdx = lowerHeaders.findIndex(
      (h) => h === 'sku' || h === 'sku_id' || h === 'id' || h.includes('sku') || h.includes('codigo') || h.includes('código')
    );
    if (skuIdx === -1) skuIdx = 0;

    let descIdx = lowerHeaders.findIndex(
      (h) => h.includes('descrip') || h.includes('nombre') || h.includes('product') || h === 'description'
    );
    if (descIdx === -1) descIdx = 1;

    let stockIdx = lowerHeaders.findIndex(
      (h) =>
        h.includes('stock') ||
        h.includes('seguridad') ||
        h.includes('safety') ||
        h.includes('threshold') ||
        h.includes('minimo') ||
        h.includes('mínimo') ||
        h.includes('recomendad')
    );
    if (stockIdx === -1) stockIdx = 2;

    const dataRows = matrix.slice(headerRowIdx + 1);
    const rows = [];

    for (const r of dataRows) {
      const rawSku = r[skuIdx];
      if (rawSku == null || rawSku === '') continue;

      const cleanSkuStr = String(rawSku).replace(/\.0$/, '').trim();
      const skuNum = parseInt(cleanSkuStr, 10);
      if (isNaN(skuNum) || skuNum <= 0) continue;

      const desc = r[descIdx] ? String(r[descIdx]).trim() : null;
      const rawStock = r[stockIdx];
      const safetyStock =
        typeof rawStock === 'number'
          ? Math.round(rawStock)
          : parseInt(String(rawStock).replace(/,/g, ''), 10) || 0;

      rows.push({
        skuId: skuNum,
        description: desc,
        safetyStock: Math.max(0, safetyStock),
      });
    }

    return { rows };
  };

  // Parsear Excel / CSV cargado por el usuario
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setMessage(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        setMessage({ type: 'error', text: 'El archivo Excel no contiene hojas de cálculo.' });
        return;
      }

      // Evaluar todas las hojas del libro Excel y seleccionar automáticamente la que contiene la mayor cantidad de SKUs válidos
      let bestSheetName = workbook.SheetNames[0];
      let bestResult = parseSheetData(workbook.Sheets[bestSheetName]);

      for (let i = 1; i < workbook.SheetNames.length; i++) {
        const sheetName = workbook.SheetNames[i];
        const res = parseSheetData(workbook.Sheets[sheetName]);
        if (res.rows.length > bestResult.rows.length) {
          bestSheetName = sheetName;
          bestResult = res;
        }
      }

      if (bestResult.rows.length === 0) {
        setMessage({ type: 'error', text: 'No se encontraron SKUs válidos en ninguna de las hojas del archivo Excel.' });
        return;
      }

      setParsedRows(bestResult.rows);
      setMessage({
        type: 'success',
        text: `Se leyeron ${bestResult.rows.length.toLocaleString()} filas válidas de la hoja "${bestSheetName}" del archivo ${file.name}.`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: `Error procesando el archivo Excel: ${err.message}` });
    }
  };

  // Guardar datos procesados masivamente
  const handleSaveBulk = async () => {
    if (parsedRows.length === 0) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/skus/safety-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedRows }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `🎉 ¡Éxito! ${data.message}` });
        setParsedRows([]);
        setFileName('');
        if (onSafetyStockUpdated) onSafetyStockUpdated();
      } else {
        setMessage({ type: 'error', text: `Error: ${data.error}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Error de red: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Guardar SKU individual
  const handleSaveSingle = async (e) => {
    e.preventDefault();
    const skuNum = parseInt(singleSku.trim(), 10);
    if (isNaN(skuNum)) {
      setMessage({ type: 'error', text: 'Ingresa un SKU ID válido.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/skus/safety-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: skuNum,
          description: singleDescription.trim(),
          safetyStock: parseInt(singleStock, 10) || 0,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Stock de seguridad asignado al SKU ${skuNum}.` });
        setSingleSku('');
        setSingleDescription('');
        setSingleStock('0');
        if (onSafetyStockUpdated) onSafetyStockUpdated();
      } else {
        setMessage({ type: 'error', text: `Error: ${data.error}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Error de red: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={20} color="var(--accent-amber)" />
            Módulo de Stock de Seguridad
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Subir archivo CSV (SKU, Descripción, Stock de Seguridad) o gestionar individualmente.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('upload')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'upload' ? 'var(--gradient-btn)' : 'transparent',
              color: activeTab === 'upload' ? '#ffffff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Upload size={14} /> Cargar CSV Masivo
          </button>
          <button
            onClick={() => setActiveTab('single')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'single' ? 'var(--gradient-btn)' : 'transparent',
              color: activeTab === 'single' ? '#ffffff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Plus size={14} /> Agregar Individual
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div
          style={{
            background: message.type === 'success' ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)',
            border: `1px solid ${message.type === 'success' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.86rem',
            color: message.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {message.text}
          </div>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: CSV Upload */}
      {activeTab === 'upload' && (
        <div>
          <div
            style={{
              border: '2px dashed var(--border-subtle)',
              borderRadius: '12px',
              padding: '1.5rem',
              textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.3)',
              marginBottom: '1rem',
            }}
          >
            <Upload size={32} color="var(--accent-primary)" style={{ margin: '0 auto 0.5rem auto', opacity: 0.8 }} />
            <p style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.2rem' }}>
              Selecciona o arrastra tu archivo Excel (.xlsx / .xls)
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1.0rem' }}>
              Formato de columnas: <code style={{ color: '#ffffff' }}>sku</code>, <code style={{ color: '#ffffff' }}>description</code>, <code style={{ color: '#ffffff' }}>safety_stock</code>
            </p>

            <label className="btn-secondary" style={{ cursor: 'pointer', padding: '0.55rem 1.35rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={16} color="var(--accent-primary)" />
              {fileName ? fileName : 'Examinar archivo Excel (.xlsx, .xls, .csv)'}
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>

          {/* Preview rows if loaded */}
          {parsedRows.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Vista previa ({parsedRows.length.toLocaleString()} filas listas para guardar)
                </span>

                <button onClick={handleSaveBulk} disabled={loading} className="btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}>
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {loading ? 'Guardando...' : 'Confirmar y Guardar en Supabase'}
                </button>
              </div>

              {/* Table preview scrollable */}
              <div style={{ maxHeight: '160px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--border-subtle)', background: '#04070d' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.9)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem 0.8rem' }}>SKU ID</th>
                      <th style={{ padding: '0.5rem 0.8rem' }}>Descripción</th>
                      <th style={{ padding: '0.5rem 0.8rem', textAlign: 'right' }}>Stock Seguridad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '0.4rem 0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#ffffff' }}>{r.skuId}</td>
                        <td style={{ padding: '0.4rem 0.8rem', color: 'var(--text-main)' }}>{r.description || '-'}</td>
                        <td style={{ padding: '0.4rem 0.8rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-amber)' }}>{r.safetyStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Single Manual Form */}
      {activeTab === 'single' && (
        <form onSubmit={handleSaveSingle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              SKU ID *
            </label>
            <input
              type="number"
              className="glass-input"
              style={{ width: '100%', fontSize: '0.88rem' }}
              placeholder="Ej: 100992271"
              value={singleSku}
              onChange={(e) => setSingleSku(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              Descripción / Nombre
            </label>
            <input
              type="text"
              className="glass-input"
              style={{ width: '100%', fontSize: '0.88rem' }}
              placeholder="Ej: Taladro Percutor 1/2 Dual"
              value={singleDescription}
              onChange={(e) => setSingleDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
              Stock de Seguridad *
            </label>
            <input
              type="number"
              className="glass-input"
              style={{ width: '100%', fontSize: '0.88rem' }}
              placeholder="Ej: 10"
              value={singleStock}
              onChange={(e) => setSingleStock(e.target.value)}
              required
              min="0"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary" style={{ padding: '0.65rem 1.25rem', fontSize: '0.88rem', height: '42px', justifyContent: 'center' }}>
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
            {loading ? 'Guardando...' : 'Guardar SKU'}
          </button>
        </form>
      )}
    </div>
  );
}
