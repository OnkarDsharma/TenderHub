'use client';

import { useState, useEffect, useRef } from "react";

export const CursorFollower = () => {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const circleRef = useRef<HTMLDivElement | null>(null);

  const mousePosition = useRef({ x: -100, y: -100 });
  const circlePosition = useRef({ x: -100, y: -100 });

  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only enable on desktop pointer devices
    if (window.matchMedia && !window.matchMedia('(pointer: fine)').matches) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      mousePosition.current = { x: e.clientX, y: e.clientY };

      // Initialize circle position on first move to prevent flying in from corner
      if (circlePosition.current.x === -100) {
        circlePosition.current = { x: e.clientX, y: e.clientY };
      }

      if (!isVisible) {
        setIsVisible(true);
      }

      // Dot tracks cursor instantly without lag
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      }
    };

    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => setIsHovering(false);

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Select interactive elements
    const attachInteractiveListeners = () => {
      const interactiveElements = document.querySelectorAll(
        "a, button, img, input, textarea, select, [role='button'], .cursor-pointer"
      );
      interactiveElements.forEach((element) => {
        element.addEventListener("mouseenter", handleMouseEnter);
        element.addEventListener("mouseleave", handleMouseLeave);
      });
      return interactiveElements;
    };

    let interactiveElements = attachInteractiveListeners();

    // Re-attach for dynamic client elements
    const observer = new MutationObserver(() => {
      interactiveElements = attachInteractiveListeners();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Hardware accelerated animation loop for outer follower ring
    let animationId: number;
    const lerp = (start: number, end: number, factor: number) => {
      return start + (end - start) * factor;
    };

    const animate = () => {
      // Snappy and fluid: 0.22 provides continuous natural glide that closely hugs the cursor
      circlePosition.current.x = lerp(circlePosition.current.x, mousePosition.current.x, 0.22);
      circlePosition.current.y = lerp(circlePosition.current.y, mousePosition.current.y, 0.22);

      if (circleRef.current) {
        circleRef.current.style.transform = `translate3d(${circlePosition.current.x}px, ${circlePosition.current.y}px, 0) translate(-50%, -50%)`;
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      observer.disconnect();

      interactiveElements.forEach((element) => {
        element.removeEventListener("mouseenter", handleMouseEnter);
        element.removeEventListener("mouseleave", handleMouseLeave);
      });

      cancelAnimationFrame(animationId);
    };
  }, [isVisible]);

  if (typeof window === "undefined") return null;

  return (
    <div 
      className={`pointer-events-none fixed inset-0 z-[9999] overflow-hidden transition-opacity duration-200 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Precision Inner Dot: Direct 1:1 hardware tracking */}
      <div
        ref={dotRef}
        className="absolute top-0 left-0 w-2 h-2 rounded-full bg-techCoral dark:bg-white will-change-transform shadow-xs"
        style={{ transform: "translate3d(-100px, -100px, 0)" }}
      />

      {/* Outer Follower Circle: Glides seamlessly with the cursor */}
      <div
        ref={circleRef}
        className={`absolute top-0 left-0 rounded-full border border-techCoral dark:border-white/90 will-change-transform ${
          isHovering 
            ? "w-11 h-11 bg-techCoral/15 border-techCoral" 
            : "w-7 h-7 bg-transparent"
        }`}
        style={{ 
          transform: "translate3d(-100px, -100px, 0)",
          // Only transition size and color upon hover, NEVER transition position (position is driven by GPU translate3d)
          transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1), height 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease, border-color 0.2s ease"
        }}
      />
    </div>
  );
};

export const Component = CursorFollower;
export default CursorFollower;
