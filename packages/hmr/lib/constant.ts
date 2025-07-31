export const LOCAL_RELOAD_SOCKET_PORT = 8081;
export const LOCAL_RELOAD_SOCKET_URL = `ws://localhost:${LOCAL_RELOAD_SOCKET_PORT}`;


// API Configuration & environment switching
export const API_CONFIG = {
    BASE_URL: 'https://api-stg.brain-community.com/api',
    LOCAL_URL: 'http://localhost:8000/api',
    ENDPOINTS: {
        AUTH: '/user/token/',
        ME: '/user/me/',
        USER: '/user/user/',
        CLICK: '/click/click/',
        SCROLL: '/scroll/scroll/',
        TAB: '/tab/tab/',
        DOMAIN: '/domain/domain/',
        SESSION: '/session/',
    }
} as const;
