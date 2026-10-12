// Loading placeholders with a soft shimmer. Self-contained: the keyframes are
// injected once via a <style> tag, so no CSS file changes are needed.
const shimmerCss = `
@keyframes cx-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.cx-skel {
  background: linear-gradient(90deg, rgba(128,128,128,.14) 25%, rgba(128,128,128,.26) 50%, rgba(128,128,128,.14) 75%);
  background-size: 200% 100%;
  animation: cx-shimmer 1.4s linear infinite;
  border-radius: 8px;
}
`;

function ShimmerStyle() {
  return <style>{shimmerCss}</style>;
}

// A single rectangle. <SkeletonBlock height={120} />
export function SkeletonBlock({ height = 80, width = '100%', style }) {
  return (
    <>
      <ShimmerStyle />
      <div className="cx-skel" style={{ height, width, ...style }} />
    </>
  );
}

// A row of stat cards. <SkeletonStatGrid count={4} />
export function SkeletonStatGrid({ count = 4 }) {
  return (
    <>
      <ShimmerStyle />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
          marginBottom: 22,
        }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="cx-skel" style={{ height: 88 }} />
        ))}
      </div>
    </>
  );
}

// A stack of list rows. <SkeletonRows count={3} />
export function SkeletonRows({ count = 3, rows, height = 54 }) {
  const n = rows ?? count;
  return (
    <>
      <ShimmerStyle />
      <div style={{ display: 'grid', gap: 10 }}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="cx-skel" style={{ height }} />
        ))}
      </div>
    </>
  );
}
