export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Reading the vault" style={{ padding: "56px var(--gut) 96px" }}>
      <div className="sk" style={{ height: 14, width: 120, marginBottom: 22 }} />
      <div className="sk" style={{ height: 46, width: "min(620px, 100%)", marginBottom: 12 }} />
      <div className="sk" style={{ height: 46, width: "min(440px, 80%)", marginBottom: 28 }} />
      <div className="sk" style={{ height: 18, width: "min(560px, 100%)", marginBottom: 10 }} />
      <div className="sk" style={{ height: 18, width: "min(500px, 90%)", marginBottom: 40 }} />
      <div className="sk" style={{ height: "min(620px, 120vw)", width: "100%", borderRadius: 6 }} />
    </div>
  );
}
