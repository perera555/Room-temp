import { ImageResponse } from "next/og";

/** App icon rendered as PNG: /icons/192, /icons/512, /icons/180, /icons/maskable */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const maskable = raw === "maskable";
  const size = maskable ? 512 : Math.min(1024, Math.max(16, Number.parseInt(raw, 10) || 192));
  const pad = maskable ? 0.2 : 0.08;
  const inner = Math.round(size * (1 - pad * 2));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "linear-gradient(135deg,#1d4ed8,#059669)" : "transparent",
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: maskable ? 0 : inner * 0.24,
            background: "linear-gradient(135deg,#2563eb 0%,#0ea5e9 45%,#10b981 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={inner * 0.7} height={inner * 0.7} viewBox="0 0 64 64" fill="none">
            {/* house */}
            <path d="M8 30 32 10l24 20" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 26v28h36V26" stroke="white" strokeWidth="5" strokeLinejoin="round" />
            {/* thermometer */}
            <rect x="28.5" y="24" width="7" height="20" rx="3.5" fill="white" />
            <circle cx="32" cy="45" r="6.5" fill="white" />
            <circle cx="32" cy="45" r="3.5" fill="#ef4444" />
            <rect x="30.5" y="33" width="3" height="11" rx="1.5" fill="#ef4444" />
          </svg>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=604800, immutable" },
    },
  );
}
