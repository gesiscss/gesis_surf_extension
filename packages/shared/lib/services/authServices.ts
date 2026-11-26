/**
 * @fileoverview Legacy auth service functions.
 *
 * The old `apiRequest` (throws ApiError) and `validateToken` (takes token param)
 * have been removed. All API calls now go through the unified `apiRequest` in
 * `apiClient.ts` (never throws, returns Response). Token validation is handled
 * inline by `AuthService.validateToken()` in chrome-extension.
 *
 * This file is kept for the `AuthValidationResult` type re-export so existing
 * imports from `@chrome-extension-boilerplate/shared/lib/services/authServices`
 * continue to work during the transition period.
 */

export {};
