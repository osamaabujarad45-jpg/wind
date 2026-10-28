/** Preparatory policy only: callers must independently establish directed crossings and evidence quality. */
export type EvidenceQuality = 'complete' | 'missing' | 'stale' | 'conflicting';
export type RevisionMetadata = { graph: string | null; profile: string | null; restriction: string | null; provider: string | null };
export type DirectedCrossing = {
  restrictionId: string;
  direction: 'crossed' | 'not_crossed' | 'unknown';
  applicability: 'applies' | 'does_not_apply' | 'unknown';
  status: 'closed' | 'restricted' | 'open' | 'unknown';
  confirmedProhibition: boolean;
};
export type RoutingEvidence = {
  revisions: RevisionMetadata;
  provider: EvidenceQuality;
  graph: EvidenceQuality;
  restrictions: EvidenceQuality;
  crossings: readonly DirectedCrossing[];
};
export type RoutingVerdict = {
  feasibility: 'feasible' | 'infeasible' | 'uncertain';
  reasons: string[];
  revisions: RevisionMetadata;
};

export function evaluateRoutingEvidence(evidence: RoutingEvidence): RoutingVerdict {
  if (!evidence || !evidence.revisions || !Array.isArray(evidence.crossings)) {
    return { feasibility: 'uncertain', reasons: ['invalid_evidence'], revisions: {graph:null,profile:null,restriction:null,provider:null} };
  }
  const revisions = { ...evidence.revisions };
  const blocked = evidence.crossings.filter(c => c && typeof c.restrictionId === 'string' && c.restrictionId.trim() && c.direction === 'crossed' && c.applicability === 'applies'
    && c.confirmedProhibition === true && (c.status === 'closed' || c.status === 'restricted'));
  if (blocked.length) return { feasibility: 'infeasible', reasons: blocked.map(c => `prohibited:${c.restrictionId}`), revisions };

  const reasons: string[] = [];
  for (const source of ['provider', 'graph', 'restrictions'] as const) {
    if (evidence[source] !== 'complete') reasons.push(`${source}:${evidence[source]}`);
  }
  for (const key of ['provider', 'graph', 'profile', 'restriction'] as const) {
    if (typeof revisions[key] !== 'string' || !revisions[key]!.trim()) reasons.push(`revision_missing:${key}`);
  }
  for (const c of evidence.crossings) {
    if (!c || typeof c.restrictionId !== 'string' || !c.restrictionId.trim() ||
      !['crossed','not_crossed','unknown'].includes(c.direction) || !['applies','does_not_apply','unknown'].includes(c.applicability) ||
      !['closed','restricted','open','unknown'].includes(c.status) || typeof c.confirmedProhibition !== 'boolean') {
      reasons.push('invalid_crossing');continue;
    }
    if (c.direction === 'not_crossed' || c.applicability === 'does_not_apply') continue;
    if (c.direction === 'unknown' || c.applicability === 'unknown' || c.status === 'unknown' || (c.status === 'open' && c.confirmedProhibition)
      || ((c.status === 'closed' || c.status === 'restricted') && !c.confirmedProhibition)) {
      reasons.push(`restriction_uncertain:${c.restrictionId}`);
    }
  }
  return { feasibility: reasons.length ? 'uncertain' : 'feasible', reasons, revisions };
}
