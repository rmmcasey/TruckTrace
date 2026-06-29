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
        <p className="text-lg text-gray-500 max-w-md mb-10">
          Real-time GPS location logging for your vehicle fleet. Drivers check in from any phone — no app required.
        </p>
        <Link
          href="/signup"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors"
        >
          Get Started Free
        </Link>
      </div>
    </main>
  );
}
