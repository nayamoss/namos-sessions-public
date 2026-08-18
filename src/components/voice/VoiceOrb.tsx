import { cn } from "@/lib/utils";

export type VoiceOrbState = "idle" | "connecting" | "listening" | "thinking" | "talking";

const FLOW_BY_STATE: Record<VoiceOrbState, string> = {
  idle: "52s",
  connecting: "18s",
  listening: "29s",
  thinking: "12s",
  talking: "6.5s",
};

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.92'/%3E%3C/svg%3E\")";

/**
 * Namos adaptation of Imori's bleeding-pigment voice orb. State changes the
 * flow speed while the silhouette remains still, so motion communicates the
 * conversation without becoming a distracting spinner or pulse.
 */
export function VoiceOrb({
  state = "idle",
  className,
}: {
  state?: VoiceOrbState;
  className?: string;
}) {
  const flow = FLOW_BY_STATE[state];

  return (
    <>
      <style>{`
        @keyframes namos-orb-grain { to { background-position: 72px -53px; } }
        @keyframes namos-orb-a {
          0%   { transform: translate(-10%, -4%) rotate(-4deg); }
          48%  { transform: translate(7%, 5%) rotate(3deg); }
          100% { transform: translate(2%, -8%) rotate(-2deg); }
        }
        @keyframes namos-orb-b {
          0%   { transform: translate(8%, 8%) rotate(5deg); }
          55%  { transform: translate(-8%, -3%) rotate(-4deg); }
          100% { transform: translate(2%, 4%) rotate(2deg); }
        }
        @keyframes namos-orb-c {
          0%   { transform: translate(-4%, 9%) skew(-4deg, 2deg); }
          50%  { transform: translate(8%, -7%) skew(3deg, -3deg); }
          100% { transform: translate(-7%, 1%) skew(-2deg, 3deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .namos-voice-orb *, .namos-voice-orb::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
      <div
        aria-hidden="true"
        data-state={state}
        className={cn(
          "namos-voice-orb relative isolate aspect-square overflow-hidden rounded-full bg-[#edf4ff]",
          className,
        )}
      >
        <i
          className="pointer-events-none absolute block"
          style={{
            inset: "-40%",
            filter: "blur(15px)",
            willChange: "transform",
            background:
              "conic-gradient(from 115deg at 62% 63%, #edf4ff 0 13%, #b8d1ff 28%, #6da4ff 48%, #0066ff 68%, #edf4ff 100%)",
            animation: `namos-orb-a ${flow} cubic-bezier(.46,0,.54,1) infinite alternate`,
          }}
        />
        <i
          className="pointer-events-none absolute block"
          style={{
            inset: "-25%",
            opacity: 0.77,
            mixBlendMode: "multiply",
            filter: "blur(15px)",
            willChange: "transform",
            background:
              "conic-gradient(from 280deg at 31% 70%, #b8d1ff 0 22%, #edf4ff 39%, #6da4ff 57%, #003c99 73%, #b8d1ff 100%)",
            animation: `namos-orb-b calc(${flow} * .78) cubic-bezier(.46,0,.54,1) infinite alternate-reverse`,
          }}
        />
        <i
          className="pointer-events-none absolute block"
          style={{
            inset: "-35%",
            opacity: 0.55,
            mixBlendMode: "color-burn",
            filter: "blur(15px)",
            willChange: "transform",
            background:
              "conic-gradient(from 62deg at 73% 24%, #edf4ff 0 27%, #6da4ff 48%, #0066ff 67%, #b8d1ff 83%, #edf4ff 100%)",
            animation: `namos-orb-c calc(${flow} * 1.18) cubic-bezier(.46,0,.54,1) infinite alternate`,
          }}
        />
        <span
          className="pointer-events-none absolute inset-0 z-20 opacity-[0.58] mix-blend-multiply dark:opacity-[0.44] dark:mix-blend-soft-light"
          style={{
            backgroundImage: GRAIN_URL,
            backgroundSize: "72px 72px",
            animation: `namos-orb-grain calc(${flow} * .55) steps(8) infinite`,
          }}
        />
      </div>
    </>
  );
}
