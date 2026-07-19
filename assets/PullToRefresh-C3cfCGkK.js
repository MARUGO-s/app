const n=`.pull-to-refresh {
  position: fixed;
  top: max(10px, env(safe-area-inset-top));
  left: 50%;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.16);
  color: #1e3a8a;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  transition: transform 120ms ease-out, opacity 120ms ease-out;
}

.pull-to-refresh__icon {
  display: inline-flex;
  width: 18px;
  justify-content: center;
  color: #2563eb;
  font-size: 1.05rem;
}

.pull-to-refresh--refreshing .pull-to-refresh__icon {
  animation: pull-to-refresh-spin 0.8s linear infinite;
}

@keyframes pull-to-refresh-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .pull-to-refresh,
  .pull-to-refresh--refreshing .pull-to-refresh__icon {
    transition: none;
    animation: none;
  }
}
`;export{n as default};
