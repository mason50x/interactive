import Image from "next/image";
import { Section } from "@/components/ui/section";
import { trust } from "@/lib/content";

export function TrustStrip() {
  return (
    <Section rhythm="tight" width="default">
      <p className="text-center text-[0.875rem] text-faint">{trust.label}</p>
      <ul className="mx-auto mt-8 grid max-w-4xl grid-cols-2 items-center justify-items-center gap-x-8 gap-y-8 sm:grid-cols-4 sm:gap-x-12">
        {trust.colleges.map((college) => (
          <li
            key={college.name}
            className="flex h-14 items-center justify-center"
          >
            <Image
              src={college.logo}
              alt={college.name}
              width={college.width}
              height={48}
              unoptimized
              className="h-auto max-h-12 max-w-full object-contain"
              style={{ width: college.width }}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
