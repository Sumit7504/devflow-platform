import React, { useState, useEffect, useRef } from "react";

/**
 * Countdown timer computed from server deadline and server clock offset.
 *
 * Rules:
 * - Design tokens only: no amber, no extra colors.
 * - aria-live strictly for the 5-minute and 1-minute warnings.
 * - Prevents multiple triggers of onExpire.
 */
export default function CountdownTimer({ deadline, serverOffset = 0, onExpire }) {
  const expiredCalledRef = useRef(false);
  const warned5MinRef = useRef(false);
  const warned1MinRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  const calculateRemaining = () => {
    if (!deadline) return 0;
    const target = new Date(deadline).getTime();
    const currentServerTime = Date.now() + serverOffset;
    return Math.max(0, Math.floor((target - currentServerTime) / 1000));
  };

  const [remainingSeconds, setRemainingSeconds] = useState(calculateRemaining);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);

      // 5-minute warning announcement (strictly once)
      if (remaining <= 300 && remaining > 290 && !warned5MinRef.current) {
        warned5MinRef.current = true;
        setAnnouncement("5 minutes remaining in assessment.");
      }

      // 1-minute warning announcement (strictly once)
      if (remaining <= 60 && remaining > 50 && !warned1MinRef.current) {
        warned1MinRef.current = true;
        setAnnouncement("1 minute remaining in assessment. Submitting soon.");
      }

      // Time expired
      if (remaining <= 0) {
        clearInterval(timer);
        if (!expiredCalledRef.current) {
          expiredCalledRef.current = true;
          if (typeof onExpire === "function") {
            onExpire();
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline, serverOffset, onExpire]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isUrgent = remainingSeconds <= 60;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
      {/* Hidden aria-live region announcing only the 5-minute and 1-minute milestones */}
      <div
        aria-live="polite"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          border: 0,
        }}
      >
        {announcement}
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 12px",
          borderRadius: "9999px",
          fontSize: "0.875rem",
          fontWeight: 600,
          fontFamily: "monospace",
          backgroundColor: isUrgent ? "var(--color-error-bg)" : "var(--color-bg)",
          color: isUrgent ? "var(--color-error)" : "var(--color-text)",
          border: `1px solid ${isUrgent ? "var(--color-error-border)" : "var(--color-border)"}`,
        }}
      >
        Time left {formattedTime}
      </div>
    </div>
  );
}
