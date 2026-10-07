export default function GrandFinalEmblem({ className = '' }: { className?: string }) {
  // Keep the supplied transparent artwork intact.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`grand-final-emblem ${className}`} src="/grand-final-amma-save.png" alt="Grand Final AMMA x SAVE" width={1774} height={887} />;
}
