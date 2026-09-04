import Link from "next/link";
import { LogoMark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import styles from "@/components/landing/landing.module.css";

export function SiteFooter() {
  return (
    <footer className={`${styles.container} ${styles.footer}`}>
      <div className={styles.footerRow}>
        <Link
          href="/"
          aria-label={`${brand.name} home`}
          className={styles.brand}
        >
          <LogoMark />
          {brand.name}
        </Link>
        <div className={styles.legal}>
          <Link href="/pp">Privacy</Link>
          <Link href="/tos">Terms</Link>
        </div>
      </div>
      <p className={styles.copyright}>
        © {new Date().getFullYear()} {brand.name}
      </p>
    </footer>
  );
}
