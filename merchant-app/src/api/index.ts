import { mockBackend } from './mock';
import { serverBackend } from './server';
import type { Backend } from './types';

/**
 * Uses the Arodan API server when EXPO_PUBLIC_API_URL is set (see merchant-app/.env.example),
 * otherwise the offline demo.
 */
export const backend: Backend = serverBackend ?? mockBackend;
