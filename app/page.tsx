import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">TruckTrace</h1>
        <Link
          href="/manager"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Log In
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-24 text-center">
        <h2 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">
          Fleet tracking,<br />simplified.
        </h2>
      </div>
    </main>
  );
}
