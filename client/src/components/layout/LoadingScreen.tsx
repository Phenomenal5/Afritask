// Full-page wait (session check, first workspace load). Calm, centred, and announced.
import { LogoMark } from "@/components/ui/Logo";

export default function LoadingScreen({ label = "Opening Afritask" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-page">
      <LogoMark size={40} className="animate-pulse" />
      <p className="text-[15px] text-muted">{label}...</p>
    </div>
  );
}
