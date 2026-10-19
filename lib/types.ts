export type AppRole = 'member' | 'editor' | 'admin';
export type MaterialStatus = 'draft' | 'published' | 'archived';
export type Visibility = 'public' | 'restricted';
export type MaterialType =
  | 'book' | 'pdf' | 'handout' | 'document' | 'audiobook' | 'audio' | 'video'
  | 'video_lesson' | 'course' | 'article' | 'research' | 'glossary' | 'external_link';
export type FileRole = 'main' | 'cover' | 'supplementary' | 'track' | 'subtitle' | 'transcript';

export interface Profile {
  id: string;
  display_name: string | null;
  role: AppRole;
  approved: boolean;
  reading_prefs: Record<string, unknown>;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  position: number;
}

export interface Material {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  type: MaterialType;
  language: string;
  year: number | null;
  isbn: string | null;
  organizer: string | null;
  tradition: string | null;
  source_reference: string | null;
  keywords: string[];
  page_count: number | null;
  duration_seconds: number | null;
  status: MaterialStatus;
  visibility: Visibility;
  featured: boolean;
  featured_rank: number | null;
  rights_holder: string | null;
  license: string | null;
  original_source: string | null;
  publication_authorized: boolean;
  access_conditions: string | null;
  rights_verified_at: string | null;
  allow_download: boolean;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface FileRow {
  id: string;
  material_id: string;
  role: FileRole;
  bucket: string;
  path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  original_name: string | null;
  title: string | null;
  position: number;
  duration_seconds: number | null;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  processing_error: string | null;
}

export interface MaterialCardData {
  id: string;
  slug: string;
  title: string;
  type: MaterialType;
  cover_path: string | null;
  coverUrl?: string | null;
  authors?: string;
}
