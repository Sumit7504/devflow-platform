import React, { useEffect, useState } from "react";
import { subscribeWakingState, clearWakingState } from "../../services/wakingState";

export default function ServerWakingBanner() {
  const [wakingInfo, setWakingInfo] = useState({
    isWaking: false,
    message: "The server may be waking up, this can take up to a minute",
    retryHandler: null,
  });

  useEffect(() => {
    return subscribeWakingState(setWakingInfo);
  }, []);

  if (!wakingInfo.isWaking) return null;

  const handleRetry = () => {
    if (typeof wakingInfo.retryHandler === "function") {
      wakingInfo.retryHandler();
    }
    clearWakingState();
  };

  return (
    <div className="waking-banner" role="status" aria-live="polite">
      <div className="waking-banner-content">
        <span className="waking-banner-text">{wakingInfo.message}</span>
        {wakingInfo.retryHandler && (
          <button
            type="button"
            className="btn btn-secondary waking-banner-btn"
            onClick={handleRetry}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
