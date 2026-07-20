export function Petals({ count = 10 }: { count?: number }) {
  const items = Array.from({ length: count });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((_, i) => {
        const left = Math.random() * 100;
        const dur = 6 + Math.random() * 6;
        const delay = Math.random() * 8;
        const dx = (Math.random() * 60 - 30).toFixed(0);
        const size = 6 + Math.random() * 6;
        return (
          <span
            key={i}
            className="petal"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
              ["--dx" as any]: `${dx}px`,
            }}
          />
        );
      })}
    </div>
  );
}
