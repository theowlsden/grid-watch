import Link from "next/link";
import { translator } from "@/i18n";

// Own 404 page: the Next.js default uses inline styles, which the CSP does not allow.
export default function NotFound() {
  const t = translator("en");
  return (
    <main className="notfound">
      <h1>{t("notFound.title")}</h1>
      <p>
        <Link href="/">{t("notFound.back")}</Link>
      </p>
    </main>
  );
}
