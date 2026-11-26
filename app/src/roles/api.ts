import { api, baseUrl } from '../lib/http';
import { demoRoles } from './demo';
import { NO_ROLES, type Roles } from './types';

/** The signed-in person's rider and merchant status (from GET /me on the server). */
export async function fetchRoles(): Promise<Roles> {
  if (!baseUrl) return { ...demoRoles };
  try {
    const me = await api<{ roles?: Roles }>('GET', '/me');
    return me.roles ?? NO_ROLES;
  } catch {
    return NO_ROLES;
  }
}
