export type ContentType = 'folder' | 'file';
export type MediaType = 'video' | 'image' | 'gif' | 'other';

export interface NormalizedItem {
  id: string;
  name: string;
  type: ContentType;
  mimeType?: string;
  size?: number;
  createdAt?: number;
  directLink?: string;
  thumbnail?: string;
  isVideo?: boolean;
  mediaType?: MediaType;
  children?: NormalizedItem[];
}

export interface FolderResponse {
  id: string;
  name: string;
  type: 'folder';
  children: NormalizedItem[];
  videoCount: number;
  imageCount: number;
  gifCount: number;
  folderCount: number;
  otherCount: number;
}

export type ApiErrorCode =
  | 'not_found'
  | 'password_required'
  | 'wrong_password'
  | 'rate_limited'
  | 'expired'
  | 'unauthorized'
  | 'invalid_id'
  | 'unknown';

export interface ApiErrorBody {
  error: ApiErrorCode;
  message: string;
  retryAfterMs?: number;
}

export class FolderFetchError extends Error {
  code: ApiErrorCode;
  status: number;
  /** Gofile's own Retry-After hint (ms), when it sent one on a 429. */
  retryAfterMs?: number;

  constructor(code: ApiErrorCode, message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'FolderFetchError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export type SortKey =
  | 'name-asc'
  | 'name-desc'
  | 'date-newest'
  | 'date-oldest'
  | 'size-largest'
  | 'size-smallest'
  | 'duration-longest'
  | 'duration-shortest';

export interface WatchProgress {
  fileId: string;
  folderId: string;
  name: string;
  directLink?: string;
  currentTime: number;
  duration: number;
  updatedAt: number;
}

export interface RecentFolder {
  id: string;
  name: string;
  loadedAt: number;
}

export interface BreadcrumbEntry {
  id: string;
  name: string;
}
