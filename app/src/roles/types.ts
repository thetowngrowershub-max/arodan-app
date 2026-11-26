/** Which part of the app is showing. Everyone can shop; riding and selling need Arodan's approval. */
export type Mode = 'shop' | 'ride' | 'sell';

/**
 * none: never applied · pending: applied, waiting for Arodan's checks ·
 * approved: can use that mode · paused: Arodan has paused the account.
 */
export type RoleStatus = 'none' | 'pending' | 'approved' | 'paused';

export interface Roles { rider: RoleStatus; merchant: RoleStatus }

export const NO_ROLES: Roles = { rider: 'none', merchant: 'none' };
