import { useEffect, useRef, useState } from 'react';
import './PullToRefresh.css';

const REFRESH_THRESHOLD = 84;
const MAX_PULL_DISTANCE = 118;

const isTouchDevice = () => (
  window.matchMedia?.('(pointer: coarse)').matches
  || navigator.maxTouchPoints > 0
);

const isInsideScrollableArea = (target) => {
  if (!(target instanceof Element)) return false;

  let element = target.parentElement;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const canScrollVertically = /(auto|scroll|overlay)/.test(style.overflowY)
      && element.scrollHeight > element.clientHeight + 1;

    if (canScrollVertically) return true;
    element = element.parentElement;
  }

  return false;
};

/**
 * Mobile/tablet-only pull-to-refresh for the document itself.
 * Scrollable panels and modal dialogs are intentionally ignored so their
 * ordinary touch interactions remain unchanged.
 */
export function PullToRefresh() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const gestureRef = useRef({ active: false, startY: 0, distance: 0 });

  useEffect(() => {
    const updateEnabled = () => setIsEnabled(isTouchDevice());
    updateEnabled();

    const coarsePointer = window.matchMedia?.('(pointer: coarse)');
    coarsePointer?.addEventListener?.('change', updateEnabled);
    return () => coarsePointer?.removeEventListener?.('change', updateEnabled);
  }, []);

  useEffect(() => {
    if (!isEnabled) return undefined;

    const stopTracking = () => {
      gestureRef.current = { active: false, startY: 0, distance: 0 };
      setPullDistance(0);
    };

    const onTouchStart = (event) => {
      if (isRefreshing || window.scrollY > 0 || event.touches.length !== 1) return;

      const target = event.target;
      if (
        target instanceof Element
        && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], .modal-overlay, .secondary-actions')
      ) {
        return;
      }

      if (isInsideScrollableArea(target)) return;

      gestureRef.current = {
        active: true,
        startY: event.touches[0].clientY,
        distance: 0,
      };
    };

    const onTouchMove = (event) => {
      if (!gestureRef.current.active || event.touches.length !== 1) return;

      const distance = Math.max(0, event.touches[0].clientY - gestureRef.current.startY);
      gestureRef.current.distance = distance;
      setPullDistance(Math.min(distance, MAX_PULL_DISTANCE));
    };

    const onTouchEnd = () => {
      const { active, distance } = gestureRef.current;
      if (!active) return;

      if (distance >= REFRESH_THRESHOLD) {
        setIsRefreshing(true);
        setPullDistance(REFRESH_THRESHOLD);
        window.setTimeout(() => window.location.reload(), 120);
        return;
      }

      stopTracking();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', stopTracking, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', stopTracking);
    };
  }, [isEnabled, isRefreshing]);

  if (!isEnabled) return null;

  const isReady = pullDistance >= REFRESH_THRESHOLD;
  const indicatorStyle = {
    transform: `translate(-50%, ${Math.min(pullDistance - 66, 16)}px)`,
    opacity: pullDistance ? 1 : 0,
  };

  return (
    <div
      className={`pull-to-refresh${isRefreshing ? ' pull-to-refresh--refreshing' : ''}`}
      style={indicatorStyle}
      role="status"
      aria-live="polite"
      aria-hidden={pullDistance === 0 && !isRefreshing}
    >
      <span className="pull-to-refresh__icon" aria-hidden="true">
        {isRefreshing ? '↻' : isReady ? '↑' : '↓'}
      </span>
      <span>{isRefreshing ? '更新しています…' : isReady ? '離して更新' : '下に引いて更新'}</span>
    </div>
  );
}
