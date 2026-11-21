import type { Localised } from './types.ts';

export type AdventureStatus = 'draft' | 'published' | 'archived';
export type AdventureVerification = 'checkin' | 'qr' | 'host' | 'quest';
export type AdventureNodeState = 'locked' | 'available' | 'completed';
export type ActivityQrType = 'static' | 'dynamic';
export type AdventureEvidenceStatus =
  | 'draft' | 'submitted' | 'pending_review' | 'approved' | 'rejected' | 'cancelled';

export interface AdventureVerificationPolicy {
  nodeId: string;
  requiresGps: boolean;
  requiresQr: boolean;
  requiresEvidence: boolean;
  requiresHost: boolean;
  geofenceRadiusM: number;
}

export interface AdventureNode {
  id: string;
  chapterId: string;
  position: number;
  place: { id: string; name: Localised; lat: number; lng: number; photoUrl: string | null };
  title: Localised;
  story: Localised;
  instruction: Localised;
  verification: AdventureVerification;
  questId: string | null;
  optional: boolean;
  state: AdventureNodeState;
  completedAt: string | null;
  completionSource: 'checkin' | 'unlock' | null;
  policy: AdventureVerificationPolicy;
}

export interface AdventureChapter {
  id: string;
  position: number;
  title: Localised;
  summary: Localised;
  nodes: AdventureNode[];
  completedNodes: number;
  totalNodes: number;
  progressPercent: number;
}

export interface AdventureArc {
  id: string;
  areaKey: string;
  status: AdventureStatus;
  title: Localised;
  summary: Localised;
  coverPlaceId: string | null;
  chapters: AdventureChapter[];
  completedNodes: number;
  totalNodes: number;
  progressPercent: number;
  currentNodeId: string | null;
}

export interface AdventureOverview { adventure: AdventureArc | null }

export interface ActivityQrVerification {
  scanId: string;
  qrId: string;
  nodeId: string;
  placeId: string;
  verifiedAt: string;
  replayed: boolean;
  activityVerified: boolean;
}

export interface AdventureEvidence {
  id: string;
  nodeId: string;
  placeId: string;
  status: AdventureEvidenceStatus;
  photoCount: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}
