'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, RefreshCw, Terminal, AlertTriangle, Warehouse } from 'lucide-react';

export default function SyncPanel({ onSyncCompleted, vtexReady, supabaseReady, initialTotalSkus = 0 }) {
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncingInventory, setSyncingInventory] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFetched, setTotalFetched] = useState(0);
  const [inventoryProcessed, setInventoryProcessed] = useState(0);
  const [logs, setLogs] = useState([]);
  const [statusMessage, setStatusMessage] = useState('Listo para operar.');

  const isPausedRef = useRef(paused);

  useEffect(() => {
    isPausedRef.current = paused;
  }, [paused]);

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('es-NI', { hour12: false });
    setLogs((prev) => [...prev.slice(-100), { timestamp, msg, type }]);
  };

  // 1. Sincronización de Catálogo (SKU IDs)
  const handleStartCatalogSync = async () => {
    if (syncingCatalog || syncingInventory) return;

    setSyncingCatalog(true);
    setPaused(false);
    setLogs([]);
    let page = 1;
    let accumulatedSkus = 0;
    let finished = false;

    addLog('🚀 Iniciando extracción masiva de SKUs desde VTEX Catalog API...', 'info');
    addLog('🔗 Endpoint: /api/catalog_system/pvt/sku/stockkeepingunitids', 'info');

    while (!finished) {
      if (isPausedRef.current) {
        setStatusMessage('Sincronización pausada.');
        addLog('⏸️ Sincronización pausada.', 'warning');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      setCurrentPage(page);
      setStatusMessage(`Procesando Página ${page} en VTEX...`);
      addLog(`📄 Solicitando página ${page} a VTEX...`, 'info');

      try {
        const res = await fetch('/api/skus/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page, pageSize: 1000 }),
        });

        const data = await res.json();

        if (!data.success) {
          addLog(`❌ Error en Página ${page}: ${data.error}`, 'error');
          setStatusMessage(`Fallo en página ${page}: ${data.error}`);
          setSyncingCatalog(false);
          return;
        }

        if (data.isFinished || data.fetchedSkus === 0) {
          finished = true;
          addLog(`✅ Extracción de SKUs finalizada. Total: ${(accumulatedSkus + data.fetchedSkus).toLocaleString()} SKUs.`, 'success');
          setStatusMessage('¡Extracción de Catálogo completada!');
        } else {
          accumulatedSkus += data.fetchedSkus;
          setTotalFetched(accumulatedSkus);
          addLog(`✨ Página ${page}: ${data.fetchedSkus} SKUs insertados en Supabase.`, 'success');
          page++;

          if (onSyncCompleted) onSyncCompleted();
        }
      } catch (err) {
        addLog(`💥 Error de conexión: ${err.message}`, 'error');
        setStatusMessage('Error de red o timeout.');
        setSyncingCatalog(false);
        return;
      }
    }

    setSyncingCatalog(false);
    if (onSyncCompleted) onSyncCompleted();
  };

  // 2. Sincronización de Inventarios por Bodegas (Logistics API)
  const handleStartInventorySync = async () => {
    if (syncingCatalog || syncingInventory) return;

    setSyncingInventory(true);
    setPaused(false);
    setInventoryProcessed(0);
    const syncStartTime = new Date().toISOString(); // Marcar inicio del ciclo activo

    addLog('🏬 Iniciando actualización de inventarios por bodegas desde VTEX Logistics API...', 'info');
    addLog('🔗 Endpoint: /api/logistics/pvt/inventory/skus/{skuId}', 'info');

    let finished = false;
    let totalUpdated = 0;

    while (!finished) {
      if (isPausedRef.current) {
        setStatusMessage('Actualización de inventario pausada.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      setStatusMessage(`Consultando inventarios en lotes de 500 bodegas...`);

      try {
        const res = await fetch('/api/skus/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 500, syncStartTime }),
        });

        const data = await res.json();

        if (!data.success) {
          addLog(`❌ Error en inventario: ${data.error}`, 'error');
          setSyncingInventory(false);
          return;
        }

        if (data.processedCount === 0) {
          finished = true;
          addLog(`🎉 ¡Inventarios de bodegas sincronizados al 100%! Total de SKUs procesados: ${totalUpdated.toLocaleString()}.`, 'success');
          setStatusMessage('¡Inventarios completados al 100%!');
        } else {
          totalUpdated += data.processedCount;
          setInventoryProcessed(totalUpdated);
          addLog(`📦 Lote actualizado: ${data.processedCount} SKUs procesados con stock (Avance: ${totalUpdated.toLocaleString()}).`, 'success');

          if (onSyncCompleted) onSyncCompleted();
        }
      } catch (err) {
        addLog(`💥 Error consultando inventarios: ${err.message}`, 'error');
        setSyncingInventory(false);
        return;
      }
    }

    setSyncingInventory(false);
    if (onSyncCompleted) onSyncCompleted();
  };

  const isAnySyncing = syncingCatalog || syncingInventory;
  const displaySkuCount = syncingCatalog ? totalFetched : (totalFetched > 0 ? totalFetched : initialTotalSkus);

  return (
    <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      
      {/* Panel Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw size={20} className={isAnySyncing ? 'animate-spin' : ''} color="var(--accent-primary)" />
            Centro de Extracción e Inventario por Bodegas
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Extrae SKUs e inventario de Bodega 1 y Bodega 2 desde VTEX y guarda en Supabase.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {!isAnySyncing ? (
            <>
              <button
                onClick={handleStartCatalogSync}
                disabled={!vtexReady || !supabaseReady}
                className="btn-primary"
              >
                <Play size={16} />
                1. Extraer SKUs Masivos
              </button>
              <button
                onClick={handleStartInventorySync}
                disabled={!vtexReady || !supabaseReady || initialTotalSkus === 0}
                className="btn-secondary"
                style={{ borderColor: 'var(--accent-emerald)', color: '#34d399' }}
              >
                <Warehouse size={16} />
                2. Actualizar Inventario Bodegas
              </button>
            </>
          ) : (
            <button
              onClick={() => setPaused(!paused)}
              className="btn-secondary"
              style={{ color: paused ? '#34d399' : '#fbbf24' }}
            >
              {paused ? <Play size={18} /> : <Pause size={18} />}
              {paused ? 'Reanudar' : 'Pausar'}
            </button>
          )}
        </div>
      </div>

      {/* Warning banner */}
      {(!vtexReady || !supabaseReady) && (
        <div
          style={{
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.25)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <AlertTriangle size={20} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.88rem' }}>
            <strong style={{ color: '#fbbf24' }}>Configuración Incompleta en .env.local:</strong>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Asegúrate de tener <code style={{ color: '#ffffff' }}>VTEX_APP_KEY</code>, <code style={{ color: '#ffffff' }}>VTEX_APP_TOKEN</code> y las claves de Supabase en <code style={{ color: 'var(--accent-primary)' }}>.env.local</code>.
            </p>
          </div>
        </div>
      )}

      {/* Live Sync Progress Info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Página Catálogo</span>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '0.2rem' }}>
            Página {currentPage}
          </div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
            {syncingInventory ? 'Inventarios Actualizados' : 'SKUs en Supabase'}
          </span>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: '0.2rem' }}>
            {syncingInventory ? inventoryProcessed.toLocaleString() : displaySkuCount.toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Estado de Avance</span>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)', marginTop: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {statusMessage}
          </div>
        </div>
      </div>

      {/* Terminal Live Logs */}
      <div
        style={{
          background: '#04070d',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
          padding: '1rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82rem',
          maxHeight: '180px',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Terminal size={14} /> Registro de Operación
        </div>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {initialTotalSkus > 0
              ? `Se encontraron ${initialTotalSkus.toLocaleString()} SKUs listos. Usa "2. Actualizar Inventario Bodegas" para consultar el stock de cada una.`
              : 'Haz clic en "1. Extraer SKUs Masivos" para iniciar.'}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ marginBottom: '0.3rem', display: 'flex', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>[{log.timestamp}]</span>
              <span
                style={{
                  color:
                    log.type === 'error'
                      ? '#f87171'
                      : log.type === 'success'
                      ? '#34d399'
                      : log.type === 'warning'
                      ? '#fbbf24'
                      : '#cbd5e1',
                }}
              >
                {log.msg}
              </span>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
