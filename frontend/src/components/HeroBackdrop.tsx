import {useEffect, useState} from 'react'

import heroFlow from '../assets/hero-flow.webp'
import heroVideo from '../assets/weir_bg_video.mp4'

/**
 * Colour grade that lands the blue source footage on Weir's green palette.
 *
 * Two stages, because either one alone falls short. `hue-rotate` swings the whole frame
 * from blue toward green but leaves cool highlights behind; a solid accent layer in
 * `mix-blend-mode: color` then takes hue and saturation from the accent while keeping the
 * video's own luminance, so motion and detail survive intact. Held at partial opacity —
 * a full `color` blend is perfectly on-theme and perfectly flat.
 *
 * Every value is here rather than inline so regrading is one edit, not six.
 */
const GRADE = {
  hueRotate: '-74deg',
  saturate: 1.1,
  brightness: 0.9,
  contrast: 1.05,
  /** Strength of the hue lock. 0 keeps the rotated blue, 1 goes fully monochrome green. */
  tintOpacity: 0.55,
  /**
   * How far the footage is pushed back behind the content. This is the legibility dial:
   * the page's body copy sits directly on top of the video with nothing but this scrim
   * between them, so it buys contrast at the cost of how much of the footage reads.
   */
  scrimOpacity: 0.62,
}

const DESCRIPTION =
  'Customers pay USDT into the Weir splitter contract, which divides every settlement between the merchant and the funder pool.'

/**
 * Full-viewport backdrop behind the landing page.
 *
 * Fixed rather than scrolling, so the footage stays put while content moves over it — a
 * scrolling background at this scale reads as parallax jitter. `object-cover` crops to
 * fill whatever the viewport is, so there is no letterboxing at any aspect ratio.
 *
 * The page wrapper must not set its own background or it paints straight over this; the
 * canvas colour comes from `body` in index.css and shows through wherever the video does
 * not reach.
 *
 * Under `prefers-reduced-motion` this renders the original still instead — and renders it
 * *instead of*, not on top of, so the reduced-motion path never pays for the download.
 */
export function HeroBackdrop() {
  const reduceMotion = usePrefersReducedMotion()

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {reduceMotion ? (
        <img src={heroFlow} alt="" className="h-full w-full object-cover" />
      ) : (
        <video
          src={heroVideo}
          poster={heroFlow}
          aria-label={DESCRIPTION}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
          style={{
            filter: `hue-rotate(${GRADE.hueRotate}) saturate(${GRADE.saturate}) brightness(${GRADE.brightness}) contrast(${GRADE.contrast})`,
          }}
        />
      )}

      {/* Hue lock: accent hue, video luminance. See GRADE. */}
      <span
        className="absolute inset-0"
        style={{
          background: 'var(--color-accent)',
          mixBlendMode: 'color',
          opacity: GRADE.tintOpacity,
        }}
      />

      {/* Legibility scrim. Everything the page renders sits on top of this. */}
      <span
        className="absolute inset-0"
        style={{background: 'var(--color-canvas)', opacity: GRADE.scrimOpacity}}
      />

      {/* Vignette, so the frame's edges dissolve rather than ending on a hard line. */}
      <span
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 35%, transparent 30%, var(--color-canvas) 100%)',
        }}
      />

      {/* Ambient accent glow drifting under the hero copy. */}
      <span
        className="absolute"
        style={{
          left: '15%',
          top: '5%',
          width: '70%',
          height: '70%',
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent)',
          filter: 'blur(60px)',
          mixBlendMode: 'screen',
          animation: 'breathe 4.5s ease-in-out infinite',
        }}
      />
    </div>
  )
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduce(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduce
}
