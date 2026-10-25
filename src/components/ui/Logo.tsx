export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--ok)" strokeOpacity=".3" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="var(--ok)" strokeOpacity=".7" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="3" fill="var(--bad)" />
    </svg>
  );
}
