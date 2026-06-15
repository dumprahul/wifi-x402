'use client';

interface ShinyTextProps {
  text: string;
  className?: string;
  speed?: number; // seconds for one cycle
  disabled?: boolean;
}

export function ShinyText({ text, className = '', speed = 3, disabled = false }: ShinyTextProps) {
  return (
    <span
      className={`relative inline-block bg-clip-text text-transparent ${className} ${disabled ? '' : 'animate-shiny-text'}`}
      style={{
        backgroundImage: disabled
          ? 'none'
          : 'linear-gradient(120deg, currentColor 30%, rgba(255,255,255,0.9) 50%, currentColor 70%)',
        backgroundSize: '200% auto',
        animationDuration: `${speed}s`,
      }}
    >
      {text}
    </span>
  );
}
