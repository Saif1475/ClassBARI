import Link from "next/link";

// Server component (it ships with every page), so the text is bilingual instead of using useLang().
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <span className="text-7xl font-extrabold text-primary">404</span>
      <h1 className="text-3xl font-bold">Page not found · পেজটি পাওয়া যায়নি</h1>
      <p className="max-w-md text-on-surface-variant">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Link href="/" className="rounded-full bg-primary px-6 py-3 font-bold text-on-primary">
        Go to home page · হোম পেজে যান
      </Link>
    </main>
  );
}
