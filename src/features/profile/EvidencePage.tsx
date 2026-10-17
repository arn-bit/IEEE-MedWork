import { useState } from 'react';
import { EVIDENCE, EVIDENCE_KIND_LABEL } from '../../domain/evidence/registry';
import type { EvidenceKind } from '../../domain/types';
import { EvidenceRefs, PageHead } from '../../components/ui';

export function EvidencePage() {
  const [kind, setKind] = useState<EvidenceKind | 'all'>('all');
  const kinds = [...new Set(EVIDENCE.map((e) => e.kind))];
  const ids = EVIDENCE.filter((e) => kind === 'all' || e.kind === kind).map((e) => e.id);
  return (
    <div className="stack fade-in">
      <PageHead eyebrow="Evidence library" title="Where the guidance comes from">
        Each source is listed with the specific claim the app relies on, the population it applies to, its limitations, and when we last checked it. Product heuristics are labelled — they are cautious choices, not evidence.
      </PageHead>
      <div className="chip-group" role="group" aria-label="Filter by type">
        {(['all', ...kinds] as const).map((k) => (
          <label key={k} className="chip">
            <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
            <span>{k === 'all' ? `All (${EVIDENCE.length})` : EVIDENCE_KIND_LABEL[k]}</span>
          </label>
        ))}
      </div>
      <div className="card">
        <EvidenceRefs ids={ids} />
      </div>
    </div>
  );
}
