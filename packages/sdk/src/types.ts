/** The permission strings accepted by the current REST API. */
export type ApiScope =
  | "events:read"
  | "submissions:read"
  | "submissions:write"
  | "speakers:read"
  | "agenda:read"
  | "tasks:read";

export type SubmissionStatus =
  | "draft"
  | "pending"
  | "accept_queue"
  | "accepted"
  | "maybe"
  | "decline_queue"
  | "declined"
  | "withdrawn";

/** The public event projection returned by GET /api/v1/events. */
export interface Event {
  id: string;
  name: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  websiteUrl: string | null;
  location: string | null;
  timezone: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  programPublishedAt: string | null;
  contactEmail: string | null;
  logoFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Raw Convex documents returned by the resource routes. These deliberately retain the
 * field names and epoch-millisecond timestamps used by convex/publicApi.ts.
 */
export interface Submission {
  _id: string;
  _creationTime: number;
  eventId: string;
  formId: string;
  idempotencyKey?: string;
  speakerId?: string;
  tagIds?: string[];
  trackId?: string;
  sponsorId?: string;
  title: string;
  status: SubmissionStatus;
  answers: unknown;
  submittedAt?: number;
  lastSpeakerEditAt?: number;
  speakerEditCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Speaker {
  _id: string;
  _creationTime: number;
  eventId: string;
  email: string;
  firstName: string;
  lastName: string;
  bio?: string;
  salutation?: string;
  honorific?: string;
  pronouns?: string;
  gender?: string;
  linkedinUrl?: string;
  xUrl?: string;
  facebookUrl?: string;
  websiteUrl?: string;
  headshotStorageKey?: string;
  confirmationStatus?: "awaiting" | "confirmed" | "declined";
  status: "invited" | "active" | "inactive";
  createdAt: number;
  updatedAt: number;
}

export interface AgendaItem {
  _id: string;
  _creationTime: number;
  eventId: string;
  submissionId?: string;
  title: string;
  roomId: string;
  trackId?: string;
  startTime: number;
  endTime: number;
  speakerIds: string[];
  videoUrl?: string;
  locationDetails?: string;
  calendarUid?: string;
  calendarSequence?: number;
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  _id: string;
  _creationTime: number;
  eventId: string;
  targetType: "contact" | "group" | "submission" | "sponsor";
  submissionId?: string;
  speakerId?: string;
  sponsorId?: string;
  title: string;
  description?: string;
  source: "manual" | "auto" | "agent";
  linkedFormId?: string;
  status: "pending" | "in_progress" | "completed";
  dueDate?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TokenSummary {
  _id: string;
  _creationTime: number;
  label: string;
  keyPrefix: string;
  scopes: ApiScope[];
  createdByUserId: string;
  createdAt: number;
  lastUsedAt?: number;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details: unknown;
}

export type ListResponse<T> = { data: T[] };
export type UpdateSubmissionStatusResponse = { data: Submission };
export type CreateTokenResponse = { token: string; prefix: string };
export type RevokeTokenResponse = { revoked: true };
