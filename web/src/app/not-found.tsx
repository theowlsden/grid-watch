import Link from "next/link";
import { translator } from "@/i18n";

// Own 404 page: the Next.js default uses inline styles, which the CSP does not allow.
// The bolt is the one from the prototype's battery model, flickering like a failing light.
export default function NotFound() {
  const t = translator("en");
  return (
    <main className="notfound">
      <svg className="bolt" viewBox="0 0 60 120" aria-hidden="true">
        <path d="M42 5 2 65h24l-10 50L58 50H34z" />
      </svg>
      <h1>{t("notFound.title")}</h1>
      <p>
        <Link href="/">{t("notFound.back")}</Link>
      </p>
    </main>
  );
}
