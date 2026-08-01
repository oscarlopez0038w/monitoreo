// Service Singleton en servidor Node.js para controlar el estado de sincronización en segundo plano

let syncState = {
  isRunning: false,
  processedInSession: 0,
  currentOffset: 0,
  totalCatalog: 82234,
  lastSyncTime: null,
  message: 'Sistema listo para sincronización en segundo plano.',
  stopRequested: false,
};

export function getBackgroundSyncState() {
  return { ...syncState };
}

export function startBackgroundSyncState(totalCatalog = 82234) {
  syncState.isRunning = true;
  syncState.stopRequested = false;
  syncState.processedInSession = 0;
  syncState.currentOffset = 0;
  syncState.totalCatalog = totalCatalog;
  syncState.lastSyncTime = new Date().toISOString();
  syncState.message = '⚡ Sincronización masiva en segundo plano iniciada desde cero...';
}

export function stopBackgroundSyncState(reason = 'Sincronización detenida por el usuario.') {
  syncState.stopRequested = true;
  syncState.isRunning = false;
  syncState.message = reason;
}

export function updateBackgroundSyncProgress(batchCount, currentOffset) {
  syncState.processedInSession += batchCount;
  syncState.currentOffset = currentOffset;
  syncState.lastSyncTime = new Date().toISOString();
  syncState.message = `Procesando... ${syncState.processedInSession.toLocaleString()} de ${syncState.totalCatalog.toLocaleString()} SKUs actualizados desde cero.`;
}
