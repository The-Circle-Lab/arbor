'use client'

import { useEffect, useState } from 'react'

export type PlantState = 'thriving' | 'doing_okay' | 'wilting' | 'dead'
export type PlantType = 'default' | 'cactus' | 'flower' | 'tree'
export const PLANT_TYPES: PlantType[] = ['default', 'cactus', 'flower', 'tree']

export function isPlantType(value: string | null): value is PlantType {
  return value !== null && PLANT_TYPES.some(t => t === value)
}

interface Props {
  state: PlantState
  plantType?: PlantType
  onClick?: () => void
  size?: number
  hideLabel?: boolean
}

type Rect = [number, number, number, number, string] // x, y, w, h, fill

const C = {
  // Pot & soil
  soD:'#3A1C08', soM:'#5A3418',
  pD:'#782818', pM:'#A83C28', pL:'#CC5838', pH:'#DC7050',
  // Default leafy
  lD:'#1A3C08', lM:'#3A6C18', lB:'#5EA030', lL:'#84C848', lH:'#A8DC68',
  fl:'#F8CC28', fo:'#F47820',
  wD:'#4A4A10', wM:'#787828', wL:'#A8A840',
  dD:'#3A2408', dM:'#5A3C18', dL:'#887040',
  sD:'#3A2008', sM:'#6A3C18', sL:'#8A5428',
  // Cactus
  caD:'#14532d', caM:'#166534', caB:'#16a34a', caL:'#4ade80',
  caWD:'#365314', caWM:'#4d7c0f', caWL:'#84cc16',
  caKD:'#57534e', caKM:'#78716c', caKL:'#a8a29e',
  caFP:'#f97316', caFY:'#fbbf24',
  // Flower
  fsD:'#14532d', fsM:'#166534', fsL:'#4ade80',
  fpD:'#be123c', fpM:'#e11d48', fpL:'#fda4af',
  fcY:'#fbbf24', fcO:'#f97316',
  fwD:'#9f1239', fwM:'#be123c',
  // Tree
  ttD:'#78350f', ttM:'#92400e', ttL:'#b45309',
  tcD:'#14532d', tcM:'#166534', tcB:'#15803d', tcL:'#16a34a', tcH:'#22c55e',
  twD:'#713f12', twM:'#a16207', twL:'#ca8a04', twY:'#eab308',
  tkD:'#44403c', tkM:'#78716c',
}

const pot: Rect[] = [
  [12,52,40,4,C.soD],[14,56,36,4,C.soM],
  [8,60,48,4,C.pM],[8,60,16,4,C.pH],
  [12,64,40,4,C.pM],[12,68,40,4,C.pM],[12,64,4,8,C.pH],
  [12,72,40,4,C.pD],[14,72,4,4,C.pL],
  [18,76,28,4,C.pD],[20,76,6,4,C.pM],
  [22,80,20,4,C.pD],
]

function stem(topY: number): Rect[] {
  const r: Rect[] = []
  for (let y = topY; y < 52; y += 4)
    r.push([28,y,8,4,C.sD],[28,y,4,4,C.sM],[28,y,2,4,C.sL])
  return r
}

function flStem(topY: number): Rect[] {
  const r: Rect[] = []
  for (let y = topY; y < 52; y += 4)
    r.push([28,y,8,4,C.fsD],[28,y,4,4,C.fsM],[28,y,2,4,C.fsL])
  return r
}

// ── DEFAULT ──────────────────────────────────────────────────────────────────
const DEFAULT: Record<PlantState, Rect[]> = {
  thriving: [
    [20,4,24,4,C.lD],[12,8,8,4,C.lD],[44,8,8,4,C.lD],[8,12,4,20,C.lD],[52,12,4,20,C.lD],
    [12,32,8,4,C.lD],[44,32,8,4,C.lD],[20,36,24,4,C.lD],
    [20,8,24,4,C.lM],[12,12,40,20,C.lM],[16,32,32,4,C.lM],
    [24,8,16,8,C.lB],[12,16,12,8,C.lB],[40,12,12,12,C.lB],[20,28,16,4,C.lB],[36,24,8,4,C.lB],
    [28,8,8,4,C.lL],[12,16,4,4,C.lL],[44,12,4,4,C.lL],[24,28,8,4,C.lL],
    [32,8,4,4,C.lH],[16,20,4,4,C.lH],[44,20,4,4,C.lH],
    [16,12,4,4,C.fl],[44,28,4,4,C.fl],[40,8,4,4,C.fo],[28,32,4,4,C.fo],[12,24,4,4,C.fl],
    ...stem(40),...pot,
  ],
  doing_okay: [
    // Smaller, sparser bush — fewer leaves, muted (no bright highlight), one side droops
    [24,16,16,4,C.lD],[20,20,4,4,C.lD],[44,20,4,4,C.lD],[20,32,24,4,C.lD],
    [22,20,20,12,C.lM],[18,24,4,8,C.lM],[44,24,4,8,C.lM],
    [26,20,10,8,C.lB],[36,24,6,4,C.lB],
    // Drooping lower-left leaf to signal "okay, not thriving"
    [10,28,8,4,C.lD],[8,32,8,4,C.lM],[8,36,4,4,C.lM],[12,36,4,4,C.lD],
    ...stem(36),...pot,
  ],
  wilting: [
    [24,16,16,4,C.wD],[24,20,16,4,C.wM],[28,16,8,4,C.wL],
    [16,24,8,4,C.wD],[12,28,8,4,C.wM],[8,32,8,4,C.wM],[8,36,4,4,C.wL],[12,36,4,4,C.wD],[20,24,4,8,C.wM],
    [40,24,8,4,C.wD],[44,28,8,4,C.wM],[48,32,8,4,C.wM],[52,36,4,4,C.wL],[44,36,4,4,C.wD],[40,24,4,8,C.wM],
    ...stem(24),...pot,
  ],
  dead: [
    [32,12,4,4,C.dD],[36,16,4,4,C.dM],[36,20,4,4,C.dD],
    [36,24,8,4,C.dD],[40,28,4,4,C.dM],[36,28,4,4,C.dL],
    [24,20,4,4,C.dD],[20,24,4,4,C.dM],
    [12,28,8,4,C.dD],[12,32,4,4,C.dM],[16,32,4,4,C.dL],
    ...stem(16),...pot,
  ],
}

// ── CACTUS ───────────────────────────────────────────────────────────────────
const CACTUS: Record<PlantState, Rect[]> = {
  thriving: [
    // Main column
    [24,16,16,36,C.caM],[24,16,4,36,C.caB],[36,20,4,28,C.caD],
    // Left arm: horizontal then vertical up
    [8,36,16,8,C.caM],[8,36,4,8,C.caB],[8,20,8,16,C.caM],[8,20,4,16,C.caB],[16,24,4,8,C.caD],
    // Right arm
    [40,40,16,8,C.caM],[52,40,4,8,C.caD],[48,28,8,12,C.caM],[52,28,4,12,C.caD],
    // Spine highlights
    [20,24,4,4,C.caL],[20,36,4,4,C.caL],[20,44,4,4,C.caL],
    [40,20,4,4,C.caL],[40,32,4,4,C.caL],
    [4,28,4,4,C.caL],[4,36,4,4,C.caL],[44,44,4,4,C.caL],
    // Flowers: top of main column
    [24,8,16,8,C.caFP],[28,4,8,8,C.caFY],[28,8,4,4,C.caFY],
    [24,8,4,4,C.caFP],[36,8,4,4,C.caFP],
    // Left arm tip flower
    [4,12,8,8,C.caFP],[8,12,4,4,C.caFY],
    // Right arm tip flower
    [52,20,8,8,C.caFP],[52,24,4,4,C.caFY],
    ...pot,
  ],
  doing_okay: [
    // Shorter, no arms, no flowers — just the main column
    [26,28,12,24,C.caM],[26,28,4,24,C.caB],[34,32,4,16,C.caD],
    // A couple of muted spines
    [24,36,4,4,C.caL],[34,40,4,4,C.caD],
    ...pot,
  ],
  wilting: [
    // Thin, shorter, olive-toned column
    [26,32,12,20,C.caWM],[26,32,4,20,C.caWL],[34,36,4,12,C.caWD],
    // Sagging arm
    [8,44,18,8,C.caWM],[8,44,4,8,C.caWL],[8,48,8,4,C.caWD],
    // Pale spines
    [22,36,4,4,C.caWL],[36,40,4,4,C.caWL],
    ...pot,
  ],
  dead: [
    // Gray-brown stick
    [28,20,8,32,C.caKD],[28,20,4,32,C.caKM],[32,24,4,24,C.caKL],
    // Dried stubs where arms were
    [12,40,16,4,C.caKD],[44,44,12,4,C.caKD],
    // Dried tip
    [28,16,8,4,C.caKL],
    ...pot,
  ],
}

// ── FLOWER ───────────────────────────────────────────────────────────────────
const FLOWER: Record<PlantState, Rect[]> = {
  thriving: [
    // Stem leaves
    [12,36,16,8,C.fsM],[12,36,8,4,C.fsL],
    [36,40,16,8,C.fsM],[44,40,4,4,C.fsL],
    // Petals (all 5)
    [28,4,8,12,C.fpM],   // top
    [12,12,16,8,C.fpM],  // left
    [36,12,16,8,C.fpM],  // right
    [16,6,12,10,C.fpL],  // top-left
    [36,6,12,10,C.fpL],  // top-right
    [28,22,8,6,C.fpL],   // bottom short
    // Petal shading
    [28,4,4,8,C.fpD],[12,12,4,4,C.fpD],[48,14,4,4,C.fpD],
    [18,8,4,4,C.fpL],[40,8,4,4,C.fpL],
    // Center
    [24,12,16,12,C.fcO],[26,14,12,8,C.fcY],[30,16,4,4,'#fff7ed'],
    ...flStem(28),...pot,
  ],
  doing_okay: [
    // One small stem leaf
    [14,40,12,6,C.fsM],
    // Compact bloom: 3 petals only, muted (no light outer petals)
    [28,12,8,10,C.fpM],
    [16,18,12,8,C.fpM],[36,18,12,8,C.fpM],
    [28,12,4,8,C.fpD],[16,18,4,4,C.fpD],
    // Smaller center
    [26,18,12,8,C.fcO],[28,20,8,4,C.fcY],
    ...flStem(30),...pot,
  ],
  wilting: [
    // Drooping stem (angled right)
    [28,24,8,4,C.fsD],[28,28,8,4,C.fsD],[28,32,8,4,C.fsD],
    [30,36,8,4,C.fsD],[32,40,8,4,C.fsD],[32,44,8,4,C.fsD],
    // Drooping flower head (shifted right + down)
    [36,14,12,4,C.fwM],[40,18,12,8,C.fwD],[44,22,8,8,C.fwD],
    [36,14,4,4,C.fwM],[48,22,4,4,C.fwM],
    [40,18,8,8,C.fcO],
    // Fallen petal
    [14,44,8,4,C.fpM],
    ...pot,
  ],
  dead: [
    // Bare stick
    [28,12,8,40,C.fsD],[28,12,4,40,C.fsM],
    // Fallen dried petals around base
    [8,44,8,4,C.fwD],[12,48,8,4,C.fwD],
    [44,44,12,4,C.fwD],[48,48,8,4,C.fwD],
    [24,44,4,4,C.fwD],
    // Dried bud at top
    [28,8,8,4,C.fwM],[30,4,4,8,C.fwD],
    ...pot,
  ],
}

// ── TREE ─────────────────────────────────────────────────────────────────────
const TREE: Record<PlantState, Rect[]> = {
  thriving: [
    // Trunk + roots
    [26,44,12,8,C.ttM],[26,44,4,8,C.ttL],[34,44,4,8,C.ttD],
    [20,48,24,4,C.ttD],[20,48,8,4,C.ttM],
    // Canopy bottom layer (widest)
    [8,36,48,12,C.tcM],[8,36,16,4,C.tcB],[8,36,4,12,C.tcD],[52,36,4,12,C.tcD],
    [16,40,8,8,C.tcB],[40,40,12,4,C.tcH],[24,36,8,4,C.tcH],
    // Middle layer
    [12,24,40,12,C.tcB],[12,24,12,4,C.tcH],[36,24,8,8,C.tcH],
    [12,24,4,12,C.tcD],[48,24,4,12,C.tcD],[16,28,4,4,C.tcH],
    // Top layer
    [18,12,28,12,C.tcL],[18,12,8,4,C.tcH],[38,16,8,4,C.tcH],
    [18,12,4,12,C.tcD],[42,12,4,12,C.tcD],
    // Tip
    [24,4,16,8,C.tcH],[24,4,4,8,C.tcD],[36,8,4,4,C.tcL],
    ...pot,
  ],
  doing_okay: [
    // Trunk
    [26,44,12,8,C.ttM],[26,44,4,8,C.ttL],[34,44,4,8,C.ttD],
    [20,48,24,4,C.ttD],[20,48,8,4,C.ttM],
    // Two layers only, narrower, muted (mid/dark greens, no bright highlight)
    [16,32,32,12,C.tcM],[16,32,4,12,C.tcD],[44,32,4,12,C.tcD],
    [24,36,8,8,C.tcB],
    [20,22,24,10,C.tcM],[20,22,4,10,C.tcD],[40,22,4,10,C.tcD],
    [28,26,8,4,C.tcB],
    // Small top
    [26,16,12,6,C.tcB],[26,16,4,6,C.tcD],
    ...pot,
  ],
  wilting: [
    // Trunk
    [26,44,12,8,C.ttM],[26,44,4,8,C.ttL],
    [20,48,24,4,C.ttD],[20,48,8,4,C.ttM],
    // Sparse yellowing canopy (broken outline feel)
    [12,28,40,8,C.twM],[12,28,4,8,C.twD],[48,28,4,8,C.twD],
    [16,28,8,4,C.twL],[44,32,8,4,C.twY],
    [20,20,24,8,C.twM],[20,20,4,8,C.twD],[40,20,4,8,C.twD],
    [24,24,4,4,C.twY],[36,20,4,4,C.twL],
    [28,12,16,8,C.twL],[28,12,4,8,C.twD],
    [32,16,4,4,C.twY],
    // Fallen leaves
    [8,48,8,4,C.twY],[52,44,8,4,C.twY],
    ...pot,
  ],
  dead: [
    // Trunk
    [26,32,12,20,C.ttM],[26,32,4,20,C.ttL],[34,36,4,16,C.ttD],
    [20,48,24,4,C.ttD],
    // Bare branches
    [28,24,4,8,C.ttD],
    [8,28,20,4,C.tkM],[8,28,4,4,C.tkD],   // left branch
    [36,28,20,4,C.tkM],[52,28,4,4,C.tkD],  // right branch
    [16,20,8,4,C.tkM],  // left twig
    [44,24,8,4,C.tkM],  // right twig
    [28,16,4,8,C.tkM],  // top twig
    [20,16,8,4,C.tkM],  // extra left
    ...pot,
  ],
}

const PLANTS: Record<PlantType, Record<PlantState, Rect[]>> = {
  default: DEFAULT,
  cactus: CACTUS,
  flower: FLOWER,
  tree: TREE,
}

export const STATE_LABELS: Record<PlantState, string> = {
  thriving: 'Thriving',
  doing_okay: 'Doing okay',
  wilting: 'Wilting',
  dead: 'Dead',
}

// Single source of truth for state → color so a given plant state reads the
// same way wherever it's shown (student plant page, instructor dashboard, ...).
export const STATE_COLORS: Record<PlantState, { bg: string; text: string; border: string }> = {
  thriving: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  doing_okay: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  wilting: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  dead: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
}

export const PLANT_TYPE_LABELS: Record<PlantType, string> = {
  default: 'Leafy plant',
  cactus: 'Cactus',
  flower: 'Flower',
  tree: 'Tree',
}

export function PlantVisual({ state, plantType = 'default', onClick, size = 160, hideLabel }: Props) {
  const [displayed, setDisplayed] = useState(state)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (state === displayed) return
    setFading(true)
    const t = setTimeout(() => { setDisplayed(state); setFading(false) }, 350)
    return () => clearTimeout(t)
  }, [state, displayed])

  const rects = PLANTS[plantType][displayed]

  return (
    <div
      className={`flex flex-col items-center gap-2 ${onClick ? 'cursor-pointer select-none' : ''}`}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 64 96"
        width={size}
        height={size * 1.5}
        xmlns="http://www.w3.org/2000/svg"
        style={{ imageRendering: 'pixelated', transition: 'opacity 0.35s ease', opacity: fading ? 0 : 1 }}
      >
        {rects.map(([x, y, w, h, fill], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
        ))}
      </svg>
      {!hideLabel && <span className="text-sm font-semibold text-stone-600">{STATE_LABELS[displayed]}</span>}
    </div>
  )
}
