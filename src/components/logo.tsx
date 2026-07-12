// Beam logo mark — a source point radiating a fan of rays (beaming the
// laptop's agent outward), black on the brand lime tile.
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
      className="shrink-0"
    >
      <rect width="512" height="512" rx="116" fill="#d8f878" />
      <circle cx="150" cy="362" r="40" fill="#000000" />
      <path d="M235 277 L369 143" stroke="#000000" strokeWidth="46" strokeLinecap="round" />
      <path d="M263 321 L385 277" stroke="#000000" strokeWidth="46" strokeLinecap="round" />
      <path d="M191 249 L236 127" stroke="#000000" strokeWidth="46" strokeLinecap="round" />
    </svg>
  );
}
