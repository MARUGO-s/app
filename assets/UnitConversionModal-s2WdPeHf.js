const n=`.unit-conversion-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.66);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.unit-conversion-modal__card {
  width: min(420px, 100%);
  border-radius: 18px;
  border: 1px solid rgba(16, 185, 129, 0.22);
  background:
    radial-gradient(900px 520px at 18% 0%, rgba(16, 185, 129, 0.18), transparent 62%),
    radial-gradient(780px 480px at 95% 12%, rgba(249, 115, 22, 0.14), transparent 58%),
    rgba(18, 18, 18, 0.82);
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 28px 84px rgba(0, 0, 0, 0.68);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  overflow: hidden;
}

.unit-conversion-modal__body {
  padding: 18px;
}

.unit-conversion-modal__title {
  margin: 0 0 14px 0;
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.unit-conversion-modal__field {
  margin-bottom: 12px;
}

.unit-conversion-modal__label {
  display: block;
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.84);
  margin-bottom: 4px;
}

.unit-conversion-modal__value {
  font-weight: 900;
  color: rgba(255, 255, 255, 0.92);
}

.unit-conversion-modal__inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.unit-conversion-modal__row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.unit-conversion-modal__input {
  width: 100%;
  background: rgba(0, 0, 0, 0.22) !important;
  border: 1px solid rgba(16, 185, 129, 0.22) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
  color: rgba(255, 255, 255, 0.92) !important;
  caret-color: rgba(255, 255, 255, 0.92) !important;
}

.unit-conversion-modal__input:focus {
  border-color: rgba(16, 185, 129, 0.40) !important;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
}

.unit-conversion-modal__input::placeholder {
  color: rgba(236, 253, 245, 0.55) !important;
}

.unit-conversion-modal__select {
  min-width: 86px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(16, 185, 129, 0.22);
  color: rgba(255, 255, 255, 0.92);
}

.unit-conversion-modal__select:focus {
  outline: none;
  border-color: rgba(16, 185, 129, 0.40);
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18);
}

.unit-conversion-modal__summary {
  border: 1px solid rgba(16, 185, 129, 0.18);
  background: rgba(16, 185, 129, 0.08);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 14px;
}

.unit-conversion-modal__summary-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.unit-conversion-modal__summary-row + .unit-conversion-modal__summary-row {
  margin-top: 6px;
}

.unit-conversion-modal__summary-label {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.86);
}

.unit-conversion-modal__summary-value {
  font-weight: 900;
  color: rgba(255, 255, 255, 0.94);
}

.unit-conversion-modal__summary-sub {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.80);
}

.unit-conversion-modal__checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.86);
  font-weight: 750;
}

.unit-conversion-modal__checkbox input {
  width: 18px;
  height: 18px;
}

.unit-conversion-modal__actions {
  display: flex;
  gap: 10px;
}

.unit-conversion-modal__actions .btn {
  flex: 1;
  justify-content: center;
}

.unit-conversion-modal__actions .btn--secondary {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  border-color: rgba(16, 185, 129, 0.16);
}

.unit-conversion-modal__actions .btn--secondary:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.10);
  border-color: rgba(16, 185, 129, 0.24);
}
`;export{n as default};
