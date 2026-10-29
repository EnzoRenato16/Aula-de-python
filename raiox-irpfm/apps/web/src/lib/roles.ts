/** Better Auth organization roles, shown in the UI as Dono, Admin and Assessor. */
export type OrgRole = "owner" | "admin" | "member";

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Dono",
  admin: "Admin",
  member: "Assessor",
};
