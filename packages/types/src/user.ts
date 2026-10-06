export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  googleId?: string | null;
  authProvider: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  userId: string;
  email: string;
  token?: string;
  user?: User;
}
