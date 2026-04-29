export default function Loading() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-6"
      style={{ backgroundColor: '#070b14' }}
    >
      {/* Pulsing logo circle */}
      <div className="relative flex items-center justify-center">
        <span
          className="absolute h-16 w-16 animate-ping rounded-full opacity-20"
          style={{ backgroundColor: '#FFD700' }}
        />
        <span
          className="absolute h-12 w-12 animate-pulse rounded-full opacity-30"
          style={{ backgroundColor: '#FFD700' }}
        />
        <div
          className="relative flex h-10 w-10 animate-spin items-center justify-center rounded-full border-2 border-transparent border-t-amber-400"
          style={{ animationDuration: '1s' }}
        />
      </div>

      {/* App name */}
      <div className="flex flex-col items-center gap-2">
        <h1
          className="text-2xl font-bold tracking-wide"
          style={{ color: '#FFD700' }}
        >
          ForexYemeni
        </h1>
        <p className="text-sm text-gray-500">جاري التحميل...</p>
      </div>
    </div>
  );
}
