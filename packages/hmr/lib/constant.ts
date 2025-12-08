export const LOCAL_RELOAD_SOCKET_PORT = 8081;
export const LOCAL_RELOAD_SOCKET_URL = `ws://localhost:${LOCAL_RELOAD_SOCKET_PORT}`;

const STG_URL = 'https://staging.surfcollect.gesis.org/api';
const PROD_URL = 'https://surfcollect.gesis.org/api';
const LOCAL_URL = 'http://localhost:8000/api';


const getApiUrl = (): string => LOCAL_URL;

// API Configuration & environment switching
export const API_CONFIG = {
    BASE_URL: getApiUrl(),
    STG_URL,
    PROD_URL,
    LOCAL_URL,
    LOGGING_BASE_URL: getApiUrl(),
    GESIS_BASE_URL: getApiUrl(),
    ENDPOINTS: {
        USER_TOKEN: '/user/token/',
        USER_ME: '/user/me/',
        GLOBAL_SESSION: '/session/',
        CLICK: '/clicks/',
        SCROLL: '/scrolls/',
        TAB: '/tab/tabs/',
        DOMAIN: '/domain/domains/',
        HOST: '/host/hosts/',
        HOST_TASK: '/host/task-result/',
    }
} as const;