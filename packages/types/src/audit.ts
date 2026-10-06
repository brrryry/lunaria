export interface AuditLogEntry {
  id: string;
  actorId?: string | null;
  action: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}
