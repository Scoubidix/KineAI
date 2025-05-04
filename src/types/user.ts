// src/types/user.ts
export type UserRole = 'kine' | 'patient';

export interface UserProfileData {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  linkedPatients?: string[]; // For Kine: Array of patient IDs
  linkedKine?: string;      // For Patient: ID of their Kine
}
