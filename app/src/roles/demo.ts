import type { Roles } from './types';

/**
 * Offline demo only: role applications, shared by the demo rider and merchant backends.
 * The demo approves applications straight away so every screen can be tried.
 */
export const demoRoles: Roles = { rider: 'none', merchant: 'none' };
