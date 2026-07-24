'use client';

import { Download, FileSpreadsheet, FileJson } from 'lucide-react';

export default function ExportButton({ totalSkus }) {
  const handleExportCsv = () => {
    window.open('/api/skus?format=csv', '_blank');
  };

  const handleExportJson = async () => {
    try {
      const res = await fetch('/api/skus?limit=100000');
      const data = await res.json();
      if (!data.skus) return;

      const blob = new Blob([JSON.stringify(data.skus, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skus_vtex_sinsa_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error exportando JSON: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button
        onClick={handleExportCsv}
        className="btn-secondary"
        style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
        title="Descargar archivo CSV"
      >
        <FileSpreadsheet size={16} color="#34d399" />
        Exportar CSV
      </button>

      <button
        onClick={handleExportJson}
        className="btn-secondary"
        style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
        title="Descargar archivo JSON"
      >
        <FileJson size={16} color="#38bdf8" />
        Exportar JSON
      </button>
    </div>
  );
}
