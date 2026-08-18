import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow } from '../api.js';

const FUTURE_WARNING_MS = 60 * 60 * 1000;

export function useFutureEntryConfirm() {
  const resolverRef = useRef(null);
  const [confirming, setConfirming] = useState(false);

  const settle = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setConfirming(false);
    resolve?.(result);
  }, []);

  useEffect(() => () => settle(false), [settle]);

  const requestFutureConfirm = useCallback((timestamps) => {
    const needsConfirm = (timestamps || []).some((iso) => {
      if (!iso) return false;
      const ms = Date.parse(iso);
      return Number.isFinite(ms) && ms - serverNow() > FUTURE_WARNING_MS;
    });
    if (!needsConfirm) return Promise.resolve(true);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirming(true);
    });
  }, []);

  const futureConfirm = confirming ? (
    <div className="confirm-overlay" onClick={() => settle(false)}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3>Log this future event?</h3>
        <p>This event is being logged in the future, are you sure you would like to log this?</p>
        <button className="btn btn-primary" onClick={() => settle(true)}>
          Log anyway
        </button>
        <button className="btn btn-ghost" onClick={() => settle(false)}>
          Back
        </button>
      </div>
    </div>
  ) : null;

  return { requestFutureConfirm, futureConfirm };
}