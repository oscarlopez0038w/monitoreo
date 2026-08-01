// Service Singleton en servidor Node.js para controlar el estado de sincronización en segundo plano

let syncState = {
  isRunning: false,
  processedInSession: 0,
  lastSyncTime: null,
  message: 'Sistema listo para sincronización en segundo plano.',
  stopRequested: false,
};

export function getBackgroundSyncState() {
  return { ...syncState };
}

export function startBackgroundSyncState() {
  syncState.isRunning = true;
  syncState.stopRequested = false;
  syncState.message = 'Sincronización en segundo plano iniciada...';
}

export function stopBackgroundSyncState(reason = 'Sincronización detenida por el usuario.') {
  syncState.stopRequested = true;
  syncState.isRunning = false;
  syncState.message = reason;
}

export function updateBackgroundSyncProgress(batchCount, remaining) {
  syncState.processedInSession += batchCount;
  syncState.lastSyncTime = new Date().toISOString();
  syncState.message = `Procesando... ${batchCount} SKUs actualizados en este lote. Quedan ${remaining} pendientes.`;
}
