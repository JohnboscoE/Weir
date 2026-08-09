import heroFlow from '../assets/hero-flow.webp'

/**
 * The hero illustration with animated lighting composited on top.
 *
 * The artwork itself is a flat raster, so nothing in it can actually move. Instead a
 * small set of light layers are positioned over the paths that are already drawn there:
 * a comet runs the customer inflow, two more run the merchant and funder outflows, a
 * glow breathes under the splitter, and a wide sheen crosses the panel now and then.
 * Every layer uses `mix-blend-mode: screen`, so it can only add light — misalignment of
 * a few pixels reads as bloom rather than as a mistake.
 */
export function HeroArtwork() {
  return (
    <figure className="lit relative mx-auto w-full max-w-6xl">
      <div className="relative overflow-hidden rounded-[16px] border border-hairline bg-canvas">
        <img
          src={heroFlow}
          alt="Customers pay USDT into the Weir splitter contract, which divides every settlement between the merchant and the funder pool."
          width={1444}
          height={576}
          className="block w-full"
          style={{animation: 'drift 9s ease-in-out infinite'}}
        />

        {/* Breathing glow beneath the splitter plinth. */}
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: '33%',
            top: '30%',
            width: '32%',
            height: '58%',
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 55%, transparent), transparent)',
            filter: 'blur(26px)',
            mixBlendMode: 'screen',
            animation: 'breathe 4.5s ease-in-out infinite',
          }}
        />

        {/* Value in flight, one comet per flow the artwork already draws. */}
        <Comet top="34%" left="17%" width="28%" rotate={-7} duration={2.9} delay={0} />
        <Comet top="21%" left="56%" width="27%" rotate={-13} duration={2.9} delay={1.35} />
        <Comet top="51%" left="59%" width="24%" rotate={-4} duration={2.9} delay={1.7} />

        {/* Occasional sheen across the whole panel. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/4"
          style={{
            background:
              'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent-soft) 18%, transparent), transparent)',
            mixBlendMode: 'screen',
            animation: 'sheen 11s ease-in-out infinite',
          }}
        />

        {/* Vignette so the artwork's black edge dissolves into the page. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% 45%, transparent 55%, var(--color-canvas) 100%)',
          }}
        />
      </div>

      <figcaption className="mt-4 text-center text-xs text-muted">
        Illustrative split. Every offer sets its own revenue share and repayment cap.
      </figcaption>
    </figure>
  )
}

function Comet({
  top,
  left,
  width,
  rotate,
  duration,
  delay,
}: {
  top: string
  left: string
  width: string
  rotate: number
  duration: number
  delay: number
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute h-3"
      style={{
        top,
        left,
        width,
        transform: `rotate(${rotate}deg)`,
        background:
          'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-accent-soft) 85%, transparent) 50%, transparent 100%)',
        backgroundSize: '26% 100%',
        backgroundRepeat: 'no-repeat',
        filter: 'blur(5px)',
        mixBlendMode: 'screen',
        animation: `streak ${duration}s linear ${delay}s infinite`,
      }}
    />
  )
}
