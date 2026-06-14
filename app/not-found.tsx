import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-8xl font-black text-white/5 mb-6 font-mono">404</div>
        <h1 className="text-2xl font-bold mb-3">Page not found</h1>
        <p className="text-white/40 mb-8">The page you are looking for does not exist.</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition-colors">
            Back to Home
          </Link>
          <Link href="/buy" className="px-5 py-2.5 bg-white/8 hover:bg-white/15 text-white font-semibold rounded-xl text-sm border border-white/10 transition-colors">
            Buy WiFi Access
          </Link>
        </div>
      </div>
    </div>
  );
}
