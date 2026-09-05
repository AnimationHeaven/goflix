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

export type GofileErrorCode =
  | 'not_found'
  | 'password_required'
  | 'wrong_password'
  | 'rate_limited'
  | 'expired'
  | 'unauthorized'
  | 'unknown';

export class GofileApiError extends Error {
  code: GofileErrorCode;
  status: number;
  /** Gofile's own Retry-After hint (ms) when it sent one on a 429 — lets
   * callers back off by exactly as long as Gofile actually asked for,
   * instead of guessing. */
  retryAfterMs?: number;

  constructor(code: GofileErrorCode, message: string, status = 400, retryAfterMs?: number) {
    super(message);
    this.name = 'GofileApiError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface GofileRawChild {
  id: string;
  type: string;
  name: string;
  size?: number;
  createTime?: number;
  modTime?: number;
  mimeType?: string;
  mimetype?: string;
  link?: string;
  directLink?: string;
  childrenCount?: number;
  thumbnail?: string;
}

export interface GofileRawContent {
  id: string;
  type: string;
  name: string;
  createTime?: number;
  childrenCount?: number;
  totalCount?: number;
  children?: Record<string, GofileRawChild>;
  code?: string;
}

export interface GofileApiResponse {
  status: string;
  data?: GofileRawContent & {
    token?: string;
    tier?: string;
  };
}
