/**
 * @file frontend/src/components/shared/CopilotMascot.jsx
 * @description Small floating sheep mascot, drawn as single-weight line art,
 * pinned to the bottom-right corner of the home page. Clicking it opens the
 * AI tender analysis page.
 */
import { Link } from 'react-router-dom';

export function CopilotMascot() {
  return (
    <Link to="/services" className="ai-mascot" aria-label="Open the AI tender copilot">
      <span className="ai-mascot-bubble">Ask the tender copilot</span>
      <span className="ai-mascot-body" aria-hidden="true">
        <svg
          viewBox="0 0 64 64"
          width="56"
          height="56"
          role="presentation"
          fill="none"
          stroke="#0b1630"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ai-mascot-art"
        >
          {/* legs */}
          <path d="M24 50v7M30 50v7M36 50v7M42 50v7" />
          <path d="M22 57h4M28 57h4M34 57h4M40 57h4" />

          {/* woolly body: one continuous scalloped outline */}
          <path d="M20 50c-4 0-6-3-5-6-3-1-4-5-1-7-2-3 0-7 4-7 0-4 4-6 7-4 2-3 7-3 9 0 3-3 8-1 8 3 4 0 6 4 4 7 3 2 2 6-1 7 1 3-1 6-5 6H20z" />

          {/* head */}
          <path d="M39 31c-1-4 2-7 6-7 3 0 6 2 6 6 0 3-2 5-4 6-1 2-4 3-6 2-2-1-3-4-2-7z" />
          {/* ear */}
          <path d="M50 27c3-2 6-1 6 1s-3 2-6 1" />
          {/* forelock tuft */}
          <path d="M41 25c0-3 3-4 5-3M45 22c2-1 5 0 5 2" />

          {/* eye and blink group */}
          <g className="ai-mascot-eyes">
            <circle cx="46" cy="30" r="1.3" fill="#0b1630" stroke="none" />
          </g>
          {/* nose and mouth */}
          <path d="M49 35h2" />
          <path d="M47 37c1 1 2 1 3 0" />

          {/* little AI spark */}
          <path d="M14 20v6M11 23h6" stroke="#2563eb" />
          <path d="M20 12v3M18.5 13.5h3" stroke="#2563eb" />
        </svg>
      </span>
    </Link>
  );
}
