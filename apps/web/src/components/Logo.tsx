export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'xl' }) {
  const s = size === 'xl' ? 'text-6xl sm:text-8xl' : size === 'md' ? 'text-4xl' : 'text-2xl';
  return (
    <div className={`font-display relative select-none font-bold leading-none ${s}`} aria-label="Corporate Sus">
      <span className="bg-gradient-to-b from-white to-[#c9cfe6] bg-clip-text text-transparent drop-shadow-[0_6px_0_rgba(20,26,61,0.9)]">CORPORATE</span>{' '}
      <span
        className="relative inline-block rotate-[-6deg] rounded-xl border-4 border-corp-red px-2 text-corp-red"
        style={{ animation: 'stamp 0.6s cubic-bezier(0.2,1.4,0.4,1) 0.2s both', textShadow: '0 0 18px rgba(239,62,74,0.45)' }}
      >
        SUS
      </span>
    </div>
  );
}
