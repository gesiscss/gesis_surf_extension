export const LOCAL_RELOAD_SOCKET_PORT = 8081;
export const LOCAL_RELOAD_SOCKET_URL = `ws://localhost:${LOCAL_RELOAD_SOCKET_PORT}`;


// API Configuration & environment switching
export const API_CONFIG = {
    BASE_URL: 'https://surfcollect.gesis.org/api',
    STG_URL: 'https://staging.surfcollect.gesis.org/api',
    LOCAL_URL: 'http://localhost:8000/api',
    ENDPOINTS: {
        USER_TOKEN: '/user/token/',
        USER_ME: '/user/me/',
        GLOBAL_SESSION: '/session/',
        CLICK: '/clicks/',
        SCROLL: '/scroll/scroll/',
        TAB: '/tab/tabs/',
        DOMAIN: '/domain/domains/',
    }
} as const;
