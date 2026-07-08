import Image from "next/image";

export function AppLogo({ heightPx = 32 }: { heightPx?: number }) {
  return (
    <div className="flex items-center gap-2" style={{ height: heightPx }}>
      <Image
        src="/images/logo-cong-ty.png"
        alt="Logo PVCFC"
        width={heightPx}
        height={heightPx}
        priority
        className="h-full w-auto object-contain"
      />
      <Image
        src="/images/logo-xuong.png"
        alt="Logo xưởng"
        width={heightPx}
        height={heightPx}
        priority
        className="h-full w-auto object-contain"
      />
    </div>
  );
}
