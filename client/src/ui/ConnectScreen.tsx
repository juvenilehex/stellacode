import { useState, useRef, useEffect, useCallback } from 'react';
import { COLORS } from '../utils/colors';
import { useGraphStore } from '../store/graph-store';

type Phase = 'idle' | 'connecting' | 'connected' | 'done';

interface ConnectScreenProps {
  onConnected: () => void;
}

// --- Starfield Canvas ---

function StarfieldCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf: number;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Generate stars
    const stars: Star[] = [];
    for (let i = 0; i < 300; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.8 + 0.3,
        baseAlpha: Math.random() * 0.6 + 0.1,
        twinkleSpeed: Math.random() * 2 + 0.5,
        twinklePhase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.08,
      });
    }
    // A few brighter "feature" stars
    for (let i = 0; i < 12; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2.5 + 1.5,
        baseAlpha: Math.random() * 0.3 + 0.5,
        twinkleSpeed: Math.random() * 3 + 1,
        twinklePhase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.03,
      });
    }
    starsRef.current = stars;

    function draw(time: number) {
      const t = time * 0.001;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      for (const star of stars) {
        const twinkle = Math.sin(t * star.twinkleSpeed + star.twinklePhase);
        const alpha = star.baseAlpha * (0.5 + twinkle * 0.5);
        if (alpha < 0.02) continue;

        // Slow vertical drift
        star.y += star.drift;
        if (star.y < -2) star.y = canvas!.height + 2;
        if (star.y > canvas!.height + 2) star.y = -2;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 200, 220, ${alpha})`;
        ctx.fill();

        // Glow for larger stars
        if (star.size > 1.5 && alpha > 0.3) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(
            star.x, star.y, 0, star.x, star.y, star.size * 3
          );
          grad.addColorStop(0, `rgba(200, 200, 220, ${alpha * 0.3})`);
          grad.addColorStop(1, 'rgba(200, 200, 220, 0)');
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  drift: number;
}

// --- Main ConnectScreen ---

export function ConnectScreen({ onConnected }: ConnectScreenProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [targetPath, setTargetPath] = useState('');
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const [titleVisible, setTitleVisible] = useState(false);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Cinematic sequence: overlapping fade-ins
    const t1 = setTimeout(() => setTitleVisible(true), 200);
    const t2 = setTimeout(() => setSubtitleVisible(true), 600);
    const t3 = setTimeout(() => setFormVisible(true), 900);
    const t4 = setTimeout(() => inputRef.current?.focus(), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  const handleConnect = useCallback(async () => {
    const trimmed = targetPath.trim();
    if (!trimmed) return;

    setError('');
    setPhase('connecting');
    setStatusText('Scanning directory...');

    try {
      const res = await fetch('/api/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Connection failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      useGraphStore.getState().setTargetPath(trimmed);
      setStatusText(`${data.stats.totalFiles} files, ${data.stats.totalEdges} edges`);
      setPhase('connected');

      setTimeout(() => {
        setPhase('done');
        setTimeout(onConnected, 800);
      }, 1200);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setPhase('idle');
      setStatusText('');
    }
  }, [targetPath, onConnected]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && phase === 'idle') handleConnect();
  }

  const isIdle = phase === 'idle';
  const isDone = phase === 'done';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-1000"
      style={{
        background: COLORS.bg,
        opacity: isDone ? 0 : 1,
        pointerEvents: isDone ? 'none' : 'auto',
      }}
    >
      {/* Star background */}
      <StarfieldCanvas />

{/* no vignette — clean uniform background */}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">

        {/* Title: STELLA CODE */}
        <div
          className="mb-2 text-center transition-all duration-[1800ms] ease-out"
          style={{
            opacity: titleVisible ? 1 : 0,
            transform: titleVisible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.96)',
            filter: titleVisible ? 'blur(0px)' : 'blur(4px)',
          }}
        >
          <h1
            className="text-3xl font-extralight tracking-[0.4em] stella-title"
            style={{ color: COLORS.textPrimary }}
          >
            STELLA CODE
          </h1>
        </div>

        {/* Subtitle: CODE OBSERVATORY */}
        <div
          className="mb-14 text-center transition-all duration-[1200ms] ease-out"
          style={{
            opacity: subtitleVisible ? 0.6 : 0,
            transform: subtitleVisible ? 'translateY(0)' : 'translateY(6px)',
          }}
        >
          <p
            className="text-[11px] tracking-[0.25em] font-light"
            style={{ color: COLORS.textSecondary }}
          >
            CODE OBSERVATORY
          </p>
        </div>

        {/* Input area — wider, responsive */}
        <div
          className="w-[80vw] max-w-[520px] px-6 transition-all duration-[1000ms] ease-out"
          style={{
            opacity: formVisible ? 1 : 0,
            transform: formVisible ? 'translateY(0)' : 'translateY(16px)',
          }}
        >
          <label
            className="block text-[10px] tracking-[0.2em] uppercase mb-2"
            style={{ color: COLORS.textSecondary }}
          >
            Target Directory
          </label>
          <input
            ref={inputRef}
            type="text"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isIdle}
            placeholder="C:\path\to\your\project"
            className="w-full px-4 py-2 text-sm rounded-none border outline-none transition-colors duration-300 disabled:opacity-50"
            style={{
              background: 'rgba(180, 180, 200, 0.03)',
              borderColor: error ? '#FF8EC8' : 'rgba(180, 180, 200, 0.15)',
              color: COLORS.textPrimary,
              fontFamily: 'monospace',
            }}
          />

          {/* Action row — Connect morphs into status */}
          <div className="mt-3 flex justify-center h-8 items-center">
            {/* Connect button */}
            {isIdle && (
              <button
                onClick={handleConnect}
                className="px-6 py-1.5 text-xs tracking-[0.2em] uppercase transition-all duration-300"
                style={{
                  color: COLORS.textPrimary,
                  background: 'rgba(180, 180, 200, 0.06)',
                  border: '1px solid rgba(180, 180, 200, 0.18)',
                  opacity: targetPath.trim() ? 1 : 0,
                  transform: targetPath.trim() ? 'translateY(0)' : 'translateY(-4px)',
                  pointerEvents: targetPath.trim() ? 'auto' : 'none',
                }}
              >
                Connect
              </button>
            )}

            {/* Status text — replaces connect button in same spot */}
            {!isIdle && statusText && (
              <p
                className="text-xs tracking-[0.1em] animate-fade-in"
                style={{ color: phase === 'connected' ? '#7EDCCC' : COLORS.textSecondary }}
              >
                {phase === 'connecting' && (
                  <span className="inline-block animate-pulse mr-2">&#x25CF;</span>
                )}
                {statusText}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="mt-2 text-xs text-center" style={{ color: '#FF8EC8' }}>
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Scan line when connecting */}
      {phase === 'connecting' && (
        <div className="absolute inset-x-0 top-0 h-px animate-scan-line" />
      )}
    </div>
  );
}
