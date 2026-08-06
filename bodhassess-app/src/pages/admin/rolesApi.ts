import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────

/** Matches RoleRequest on the backend. urlPaths REPLACES the stored set. */
export interface RolePayload {
  /** Max 50 characters, unique (409 on clash). */
  name: string;
  description: string | null;
  /**
   * Rooted paths whose last segment may be a lone "*" — /dashboard,
   * /admin/*, /assessments/edit/:id. At least one is required.
   */
  urlPaths: string[];
}

/** Matches RoleResponse on the backend. */
export interface RoleResponse {
  id: number;
  name: string;
  description: string | null;
  /** Sorted by the backend, so the list and editor agree. */
  urlPaths: string[];
  /** How many groups bundle this role — a delete is refused while > 0. */
  groupCount: number;
}

/** Matches RoleGroupRequest on the backend. roleIds REPLACES the membership. */
export interface RoleGroupPayload {
  name: string;
  description: string | null;
  roleIds: number[];
}

/** Matches RoleRefResponse on the backend. */
export interface RoleRef {
  id: number;
  name: string;
}

/** Matches RoleGroupResponse on the backend. */
export interface RoleGroupResponse {
  roleGroupId: number;
  name: string;
  description: string | null;
  roles: RoleRef[];
  /** The merged union of every role's paths — what this group opens. */
  urlPaths: string[];
  /** How many users hold it — a delete is refused while > 0. */
  memberCount: number;
}

/** Matches DashboardUserResponse on the backend. */
export interface DashboardUserResponse {
  userId: number;
  serialId: string | null;
  /** From the practitioner profile — null for a bare superadmin. */
  name: string | null;
  email: string;
  superAdmin: boolean;
  roleGroupId: number | null;
  roleGroupName: string | null;
}

// ── Roles ─────────────────────────────────────────────────────────────────
function getAllRoles() {
  return axios.get<RoleResponse[]>(`${API_URL}/roles/getAll`);
}

function createRole(role: RolePayload) {
  return axios.post<RoleResponse>(`${API_URL}/roles/create`, role);
}

function updateRole(id: number, role: RolePayload) {
  return axios.put<RoleResponse>(`${API_URL}/roles/update/${id}`, role);
}

/** 409 while any group still bundles this role. */
function deleteRole(id: number) {
  return axios.delete<void>(`${API_URL}/roles/delete/${id}`);
}

// ── Role groups ───────────────────────────────────────────────────────────
function getAllRoleGroups() {
  return axios.get<RoleGroupResponse[]>(`${API_URL}/role-groups/getAll`);
}

function createRoleGroup(group: RoleGroupPayload) {
  return axios.post<RoleGroupResponse>(`${API_URL}/role-groups/create`, group);
}

function updateRoleGroup(id: number, group: RoleGroupPayload) {
  return axios.put<RoleGroupResponse>(`${API_URL}/role-groups/update/${id}`, group);
}

/** 409 while any user still holds this group. */
function deleteRoleGroup(id: number) {
  return axios.delete<void>(`${API_URL}/role-groups/delete/${id}`);
}

// ── Assignment ────────────────────────────────────────────────────────────
/** Everyone who can open the dashboard, with the group they hold. */
function getDashboardUsers() {
  return axios.get<DashboardUserResponse[]>(`${API_URL}/user-access/getAll`);
}

/**
 * Replaces the one group a user holds; null clears it back to
 * dashboard-only. 409 for a superadmin (the flag already grants everything).
 * Takes effect on that person's next /auth/me, i.e. their next page load.
 */
function assignRoleGroup(userId: number, roleGroupId: number | null) {
  return axios.put<DashboardUserResponse>(
    `${API_URL}/user-access/assign-role-group/${userId}`,
    { roleGroupId },
  );
}

export const rolesApi = {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getAllRoleGroups,
  createRoleGroup,
  updateRoleGroup,
  deleteRoleGroup,
  getDashboardUsers,
  assignRoleGroup,
};
