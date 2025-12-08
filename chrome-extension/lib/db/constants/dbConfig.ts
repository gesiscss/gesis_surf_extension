// Database configuration for IndexedDB
export const DB_CONFIG = {
    name: 'GESISSurfdb',
    version: 2,
    stores: {
        winlives: 'window_session_id',
        tabslives: 'tab_session_id',
        domainslives: 'domain_session_id',
        config: 'id',
        winclose: 'id',
        hostslives: 'hostname',
    } as const
};