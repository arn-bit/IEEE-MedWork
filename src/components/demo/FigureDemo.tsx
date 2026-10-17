import { useEffect, useState } from 'react';
import { DEMOS, type Demo, type Pose, type Prop, type Pt } from './poses';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';

function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function mix(a: Pose, b: Pose, t: number): Pose {
  const out = {} as Record<keyof Pose, Pt>;
  for (const k of Object.keys(a) as (keyof Pose)[]) out[k] = lerp(a[k], b[k], t);
  return out as Pose;
}
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

function Props({ props }: { props: Prop[] }) {
  return (
    <g strokeWidth={3} strokeLinecap="round">
      {props.includes('chair_seat') && (
        <g className="prop">
          <path d="M70 125 H112 M75 125 V185 M108 125 V185 M72 125 L68 72" />
        </g>
      )}
      {props.includes('chair_support') && (
        <g className="prop">
          <path d="M136 84 V185 M136 128 H170 M168 128 V185 M136 84 L138 84" />
        </g>
      )}
      {props.includes('chair_front') && (
        <g className="prop">
          <path d="M72 124 H128 M76 124 V185 M124 124 V185" />
        </g>
      )}
      {props.includes('wall') && <path className="prop" d="M151 20 V186" strokeWidth={5} />}
      {props.includes('step') && <rect className="prop-fill" x={112} y={166} width={52} height={20} rx={3} strokeWidth={2} />}
      {props.includes('mat') && <rect className="prop-fill" x={22} y={182} width={156} height={5} rx={2} strokeWidth={1} />}
    </g>
  );
}

function Figure({ pose, view, props }: { pose: Pose; view: Demo['view']; props: Prop[] }) {
  const L = (a: Pt, b: Pt, far = false) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={far ? 'limb-far' : 'limb'} />;
  const farSide = view === 'side';
  return (
    <g strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* far limbs first */}
      {L(pose.rSh, pose.rEl, farSide)}
      {L(pose.rEl, pose.rWr, farSide)}
      {L(pose.rHip, pose.rKn, farSide)}
      {L(pose.rKn, pose.rAn, farSide)}
      {L(pose.rAn, pose.rToe, farSide)}
      {/* torso */}
      {L(pose.neck, pose.pelvis)}
      {view === 'front' && L(pose.lSh, pose.rSh)}
      {view === 'front' && L(pose.lHip, pose.rHip)}
      {L(pose.lHip, pose.lKn)}
      {L(pose.lKn, pose.lAn)}
      {L(pose.lAn, pose.lToe)}
      {L(pose.lSh, pose.lEl)}
      {L(pose.lEl, pose.lWr)}
      {props.includes('weights') && (
        <g className="accent" strokeWidth={0}>
          <rect x={pose.lWr[0] - 7} y={pose.lWr[1] - 4} width={14} height={8} rx={3} />
          <rect x={pose.rWr[0] - 7} y={pose.rWr[1] - 4} width={14} height={8} rx={3} />
        </g>
      )}
      {props.includes('band') && <path d={`M${pose.lWr[0]} ${pose.lWr[1]} L${pose.lToe[0]} ${pose.lToe[1]}`} className="accent" strokeWidth={2.5} />}
      <circle cx={pose.head[0]} cy={pose.head[1]} r={11} className="limb" strokeWidth={5} fill="var(--surface-2)" />
      {view === 'front' && <circle cx={pose.head[0] + (pose.head[0] - pose.neck[0]) * 0.6} cy={pose.head[1] + 2} r={2.2} className="accent" strokeWidth={0} />}
    </g>
  );
}

/** Animated demonstration for an exercise. Shows static start/end frames when reduced motion is preferred. */
export function FigureDemo({ exerciseId, size = 'md', animate = true, label }: { exerciseId: string; size?: 'sm' | 'md' | 'lg'; animate?: boolean; label?: string }) {
  const demo = DEMOS[exerciseId];
  const reduced = usePrefersReducedMotion();
  const [t, setT] = useState(0);
  const shouldAnimate = animate && !reduced && !!demo && size !== 'sm';

  useEffect(() => {
    if (!shouldAnimate || !demo) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((now - start) % demo.periodMs) / demo.periodMs;
      setT(ease(phase < 0.5 ? phase * 2 : 2 - phase * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shouldAnimate, demo]);

  if (!demo) {
    return (
      <div className="demo" role="img" aria-label="No demonstration available" style={{ aspectRatio: '1', display: 'grid', placeItems: 'center' }}>
        <span className="tiny muted">No demo</span>
      </div>
    );
  }
  const alt = label ?? `Demonstration: ${demo.caption[0]}, then ${demo.caption[1].toLowerCase()}.`;
  const floor = <line x1={10} y1={187} x2={190} y2={187} className="floor" strokeWidth={2} />;

  if (size === 'sm') {
    return (
      <svg viewBox="0 0 200 200" className="demo" role="img" aria-label={alt} width="100%" height="100%">
        {floor}
        <Props props={demo.props} />
        <Figure pose={mix(demo.a, demo.b, 0.6)} view={demo.view} props={demo.props} />
      </svg>
    );
  }

  if (!shouldAnimate) {
    return (
      <figure style={{ margin: 0 }} aria-label={alt} role="group">
        <div className="grid-2" style={{ gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          {(['a', 'b'] as const).map((k, i) => (
            <div key={k} className="stack-sm" style={{ gap: 4 }}>
              <svg viewBox="0 0 200 200" className="demo" aria-hidden="true">
                {floor}
                <Props props={demo.props} />
                <Figure pose={demo[k]} view={demo.view} props={demo.props} />
              </svg>
              <span className="tiny muted">
                {i + 1}. {demo.caption[i]}
              </span>
            </div>
          ))}
        </div>
      </figure>
    );
  }

  return (
    <figure style={{ margin: 0 }} className="stack-sm">
      <svg viewBox="0 0 200 200" className="demo" role="img" aria-label={alt}>
        {floor}
        <Props props={demo.props} />
        <Figure pose={mix(demo.a, demo.b, t)} view={demo.view} props={demo.props} />
      </svg>
      <figcaption className="tiny muted row" style={{ justifyContent: 'space-between' }}>
        <span>1. {demo.caption[0]}</span>
        <span>2. {demo.caption[1]}</span>
      </figcaption>
    </figure>
  );
}
