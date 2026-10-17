/**
 * Original, hand-drawn SVG illustrations (no external images, so nothing is downloaded and the
 * app stays fully offline). Colours are fixed, soft tones that read on light and dark surfaces.
 */

const SKIN = ['#f2c9a5', '#c98f66', '#8a5a3c'];

function Person({ x, y, scale = 1, skin = 0, top = '#0d6652', bottom = '#2b3a4a', pose = 'walk' }: { x: number; y: number; scale?: number; skin?: number; top?: string; bottom?: string; pose?: 'walk' | 'stretch' | 'sit' }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="0" cy="-62" r="9" fill={SKIN[skin]} />
      <path d="M-9 -64 Q0 -78 9 -64 Q4 -68 -9 -64z" fill="#3a2a22" />
      {pose === 'walk' && (
        <>
          <path d="M0 -52 L0 -22" stroke={top} strokeWidth="13" />
          <path d="M-2 -22 L-10 6 M2 -22 L12 4" stroke={bottom} strokeWidth="9" fill="none" />
          <path d="M-3 -48 L-14 -30 M3 -48 L15 -36" stroke={top} strokeWidth="6" fill="none" />
        </>
      )}
      {pose === 'stretch' && (
        <>
          <path d="M0 -52 L0 -22" stroke={top} strokeWidth="13" />
          <path d="M-2 -22 L-8 6 M2 -22 L8 6" stroke={bottom} strokeWidth="9" fill="none" />
          <path d="M-3 -50 L-14 -76 M3 -50 L14 -76" stroke={top} strokeWidth="6" fill="none" />
        </>
      )}
      {pose === 'sit' && (
        <>
          <path d="M0 -52 L0 -24" stroke={top} strokeWidth="13" />
          <path d="M0 -24 L18 -24 L18 2" stroke={bottom} strokeWidth="9" fill="none" />
          <path d="M-3 -48 L8 -34 L16 -40" stroke={top} strokeWidth="6" fill="none" />
        </>
      )}
    </g>
  );
}

function Sunrise() {
  return (
    <svg viewBox="0 0 800 300" role="img" aria-label="Illustration: people exercising outdoors at sunrise" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="il-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe9e0" />
          <stop offset="0.7" stopColor="#fbeccb" />
          <stop offset="1" stopColor="#f9dcb0" />
        </linearGradient>
      </defs>
      <rect width="800" height="300" fill="url(#il-sky)" />
      <circle cx="560" cy="170" r="62" fill="#f6b95c" opacity="0.95" />
      <circle cx="560" cy="170" r="92" fill="#f6b95c" opacity="0.2" />
      <path d="M0 190 Q120 130 240 180 T480 170 T800 160 V300 H0z" fill="#9fcdb8" />
      <path d="M0 220 Q160 170 320 215 T640 205 T800 215 V300 H0z" fill="#6fb596" />
      <path d="M0 252 Q200 218 400 248 T800 240 V300 H0z" fill="#3f9a78" />
      <g fill="#2f7d60">
        <path d="M70 250 l14 -44 l14 44z" />
        <path d="M96 250 l11 -34 l11 34z" />
        <path d="M720 244 l14 -44 l14 44z" />
      </g>
      <path d="M150 300 Q330 250 520 258 T800 262" stroke="#e8d8b4" strokeWidth="22" fill="none" opacity="0.9" />
      <Person x={250} y={262} scale={1.15} skin={1} top="#0d6652" bottom="#2b3a4a" pose="walk" />
      <Person x={330} y={268} scale={1.05} skin={0} top="#c0602f" bottom="#3a4a5e" pose="walk" />
      <Person x={610} y={246} scale={1} skin={2} top="#1f4f86" bottom="#2b3a4a" pose="stretch" />
      <g fill="#fff" opacity="0.85">
        <ellipse cx="160" cy="70" rx="38" ry="10" />
        <ellipse cx="190" cy="62" rx="26" ry="9" />
        <ellipse cx="650" cy="52" rx="34" ry="9" />
      </g>
    </svg>
  );
}

function Privacy() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-label="Illustration: a phone with a shield, showing data staying on the device">
      <rect x="10" y="10" width="220" height="180" rx="26" fill="#dbeee7" />
      <rect x="78" y="28" width="84" height="150" rx="14" fill="#13201c" />
      <rect x="84" y="40" width="72" height="126" rx="8" fill="#f5f4ef" />
      <path d="M120 66 L144 76 V104 C144 120 133 130 120 136 C107 130 96 120 96 104 V76z" fill="#0d6652" />
      <path d="M109 101 l8 8 l14 -16" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="92" y="146" width="56" height="6" rx="3" fill="#c3beb1" />
      <rect x="100" y="156" width="40" height="5" rx="2.5" fill="#dad6cc" />
      <g stroke="#0d6652" strokeWidth="2.5" strokeDasharray="4 5" fill="none" strokeLinecap="round">
        <path d="M60 60 Q36 60 36 86" />
        <path d="M180 60 Q204 60 204 86" />
      </g>
      <g fill="#a4481f">
        <path d="M30 98 l12 12 M42 98 l-12 12" stroke="#a4481f" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M198 98 l12 12 M210 98 l-12 12" stroke="#a4481f" strokeWidth="3.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Together() {
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="Illustration: three people of different ages exercising together">
      <rect width="320" height="180" rx="22" fill="#fbeccb" />
      <circle cx="262" cy="46" r="22" fill="#f6b95c" />
      <path d="M0 150 Q80 124 160 146 T320 140 V180 H0z" fill="#9fcdb8" />
      <rect x="0" y="160" width="320" height="20" fill="#6fb596" />
      <Person x={80} y={152} scale={1.1} skin={0} top="#1f4f86" bottom="#3a4a5e" pose="stretch" />
      <Person x={160} y={156} scale={0.8} skin={1} top="#c0602f" bottom="#2b3a4a" pose="walk" />
      <g>
        <rect x="204" y="118" width="34" height="5" rx="2" fill="#8a5300" />
        <path d="M208 123 v30 M234 123 v30 M206 118 v-28" stroke="#8a5300" strokeWidth="4" strokeLinecap="round" />
      </g>
      <Person x={220} y={118} scale={0.98} skin={2} top="#0d6652" bottom="#2b3a4a" pose="sit" />
    </svg>
  );
}

function Rest() {
  return (
    <svg viewBox="0 0 240 160" role="img" aria-label="Illustration: a cosy chair, a cup and a plant for a rest day">
      <rect width="240" height="160" rx="20" fill="#e4edf8" />
      <circle cx="190" cy="40" r="18" fill="#fff" opacity="0.8" />
      <circle cx="202" cy="36" r="14" fill="#e4edf8" />
      <path d="M66 70 q-8 -20 8 -22 h60 q16 2 8 22 v40 H66z" fill="#c0602f" />
      <rect x="58" y="96" width="92" height="26" rx="10" fill="#a4481f" />
      <path d="M66 122 v22 M142 122 v22" stroke="#6b3a1d" strokeWidth="6" strokeLinecap="round" />
      <rect x="170" y="108" width="30" height="36" rx="5" fill="#e4e1d8" />
      <path d="M185 108 C170 90 176 76 185 70 C194 76 200 90 185 108z" fill="#52b878" />
      <path d="M185 104 C196 96 204 90 210 92 C206 100 198 104 185 104z" fill="#3fa564" />
      <rect x="152" y="130" width="14" height="14" rx="3" fill="#fff" />
      <path d="M166 134 h4 a3 3 0 0 1 0 6 h-4" stroke="#fff" strokeWidth="2.5" fill="none" />
      <path d="M156 124 q-3 -6 0 -10 M162 124 q-3 -6 0 -10" stroke="#8aa0b8" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Bloom() {
  return (
    <svg viewBox="0 0 240 160" role="img" aria-label="Illustration: a garden bed with small plants growing">
      <rect width="240" height="160" rx="20" fill="#e4f3ea" />
      <rect y="112" width="240" height="48" fill="#8a6a4a" />
      <path d="M0 112 Q60 100 120 110 T240 108 V120 H0z" fill="#a1805c" />
      {[44, 100, 156, 200].map((cx, i) => (
        <g key={cx}>
          <path d={`M${cx} 114 C${cx} ${100 - i * 8} ${cx} ${90 - i * 10} ${cx} ${80 - i * 12}`} stroke="#3b9b5e" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d={`M${cx} 104 C${cx - 14} 104 ${cx - 20} 96 ${cx - 18} 90 C${cx - 8} 90 ${cx - 2} 96 ${cx} 104z`} fill="#52b878" />
          {i >= 2 && (
            <g transform={`translate(${cx} ${80 - i * 12})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx="0" cy="-9" rx="5" ry="9" fill={i === 3 ? '#f08c5f' : '#f6b95c'} transform={`rotate(${a})`} />
              ))}
              <circle r="5" fill="#f0b44c" />
            </g>
          )}
        </g>
      ))}
      <g fill="#f6b95c">
        <circle cx="30" cy="30" r="9" />
      </g>
      <g stroke="#f6b95c" strokeWidth="3" strokeLinecap="round">
        <path d="M30 12 v-4 M30 52 v4 M12 30 h-4 M48 30 h4" />
      </g>
    </svg>
  );
}

const SCENES = { sunrise: Sunrise, privacy: Privacy, together: Together, rest: Rest, bloom: Bloom } as const;
export type SceneName = keyof typeof SCENES;

export function Scene({ name, className }: { name: SceneName; className?: string }) {
  const S = SCENES[name];
  return (
    <div className={`scene scene-${name}${className ? ` ${className}` : ''}`}>
      <S />
    </div>
  );
}
