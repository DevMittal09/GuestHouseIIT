import Image from "next/image";

/** Shared logo + title block for the signed-out pages (`/` and `/mock-login`). */
export function AuthMasthead({ subtitle }: { subtitle: React.ReactNode }) {
  return (
    <div className="mb-10 text-center">
      <Image
        src="/iitpkd-logo.png"
        alt="IIT Palakkad logo"
        width={72}
        height={72}
        className="mx-auto mb-4 size-18"
        priority
      />
      <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
        Indian Institute of Technology Palakkad
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Guest House Booking Portal
      </h1>
      <p className="mt-2 text-muted-foreground">{subtitle}</p>
    </div>
  );
}
