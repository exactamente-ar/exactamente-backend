// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type UserRole = 'superadmin' | 'admin' | 'user';
export type ResourceStatus = 'pending' | 'published' | 'rejected';
export type ResourceType = 'resumen' | 'parcial' | 'final';

// ─── ENTIDADES BASE ───────────────────────────────────────────────────────────

export interface University {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Faculty {
  id: string;
  universityId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Career {
  id: string;
  facultyId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Subject {
  id: string;
  facultyId: string;
  title: string;
  slug: string;
  description: string;
  urlMoodle: string;
  urlPrograma: string;
  year: number;
  quadmester: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectWithCorrelatives extends Subject {
  careers: Array<{ careerId: string; year: number; quadmester: number }>;
  prerequisites: string[];
  correlatives: string[];
}

export interface SubjectDetail extends SubjectWithCorrelatives {
  prerequisiteSubjects: Subject[];
  correlativeSubjects: Subject[];
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
}

export interface AdminUser extends PublicUser {
  adminFacultyId: string | null;
  adminFaculty: Faculty | null;
}

// ─── RECURSOS ─────────────────────────────────────────────────────────────────

export interface ResourcePublic {
  id: string;
  subjectId: string;
  title: string;
  type: ResourceType;
  status: ResourceStatus;
  driveFileId: string | null;
  driveSize: number | null;
  downloadCount: number;
  publishedAt: string | null;
  createdAt: string;
  previewUrl: string | null;
  downloadUrl: string | null;
}

export interface ResourceDetail extends ResourcePublic {
  subject: Subject;
  uploadedBy: Pick<PublicUser, 'id' | 'displayName'>;
  reviewedBy: Pick<PublicUser, 'id' | 'displayName'> | null;
  rejectionReason: string | null;
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  role: UserRole;
  facultyId: string | null;
  iat: number;
  exp: number;
}

// ─── CONTEXTO HONO ────────────────────────────────────────────────────────────

export type AppContext = {
  Variables: {
    user: JwtPayload;
    requestId: string;
  };
};

// ─── PAGINACIÓN ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
