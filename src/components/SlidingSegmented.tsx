"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  className?: string;
};

/**
 * Apple iOS-style sliding segmented control.
 * Measures the active button and smoothly glides a single floating pill across the other options
 * using Apple's spring-like easing curve.
 */
export function SlidingSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
  pillClassName = "bg-primary text-on-primary shadow-[0_4px_14px_rgba(0,106,96,0.28)]",
  activeTextClassName = "text-on-primary",
  inactiveTextClassName = "text-on-surface-variant hover:text-on-surface",
  buttonClassName = "h-11 px-4 text-sm font-bold",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
  pillClassName?: string;
  activeTextClassName?: string;
  inactiveTextClassName?: string;
  buttonClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number; top: number; height: number } | null>(null);

  const measure = () => {
    const idx = options.findIndex((o) => o.value === value);
    const el = btnRefs.current[idx];
    if (!el) return;
    setPill({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  };

  useLayoutEffect(measure, [value, options.length]);

  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [value, options.length]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      className={`glass-well relative flex items-center rounded-[14px] border border-white/70 bg-surface-container p-1 backdrop-blur-xl ${className}`}
    >
      {/* Floating Apple-style sliding pill */}
      {pill && (
        <span
          aria-hidden="true"
          style={{
            transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
            width: `${pill.width}px`,
            height: `${pill.height}px`,
            transition:
              "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), width 380ms cubic-bezier(0.22, 1, 0.36, 1), height 380ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          className={`glass-3d pointer-events-none absolute left-0 top-0 rounded-[10px] ${pillClassName}`}
        />
      )}

      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[10px] transition-colors duration-200 ${buttonClassName} ${
              active ? activeTextClassName : inactiveTextClassName
            } ${o.className ?? ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
