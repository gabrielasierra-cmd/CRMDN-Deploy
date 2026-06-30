export type RoleName = "admin" | "staff";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: RoleName;
}
