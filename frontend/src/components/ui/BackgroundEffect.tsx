export default function BackgroundEffect() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
    >
      <div className="bg-orb bg-orb-gold" />
      <div className="bg-orb bg-orb-paper" />
      <div className="bg-vignette" />
    </div>
  );
}
