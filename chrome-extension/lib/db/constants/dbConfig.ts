// Database configuration for IndexedDB
export const DB_CONFIG = {
  name: 'GESISSurfdb',
  version: 6,
  stores: {
    winlives: 'window_session_id',
    windowclosings: 'id',
    tabslives: 'tab_session_id',
    domainslives: 'local_key',
    domainvisits: 'local_key',
    config: 'id',
    winclose: 'id',
    hostslives: 'hostname',
    selectors: 'provider',
  } as const,
};
