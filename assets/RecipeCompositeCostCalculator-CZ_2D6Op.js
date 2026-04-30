const n=`.composite-cost {
  margin-top: 1rem;
  padding: 1.15rem;
  border: 1px solid #d5e8e0;
  border-radius: 12px;
  background: #f3faf6;
  box-shadow: 0 8px 22px rgba(22, 101, 52, 0.08);
  overflow-x: hidden;
}

.composite-cost__title {
  margin: 0 0 0.45rem 0;
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1.35;
  color: #334155;
}

.composite-cost__desc {
  margin: 0 0 0.9rem 0;
  color: #64748b;
  font-size: 0.71rem;
  line-height: 1.6;
}

.composite-cost__grid {
  display: grid;
  gap: 11px;
  padding: 2px;
}

.composite-cost__head-row {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.95fr) minmax(0, 0.9fr) minmax(0, 0.8fr) 34px;
  gap: 10px;
  font-size: 0.77rem;
  color: #334155;
  line-height: 1.4;
  padding: 7px 11px;
  border-radius: 10px;
  border: 1px solid #d6e7df;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 1px 0 rgba(107, 114, 128, 0.16);
}

.composite-cost__row {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.95fr) minmax(0, 0.9fr) minmax(0, 0.8fr) 34px;
  gap: 10px;
  align-items: center;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid #dce9e2;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
}

.composite-cost__row--with-remove {
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.95fr) minmax(0, 0.9fr) minmax(0, 0.8fr) 34px;
}

.composite-cost__head-row > *,
.composite-cost__row > * {
  min-width: 0;
}

.composite-cost__input {
  width: 100%;
  min-width: 0;
  height: 44px;
  font-size: 0.86rem;
  border-radius: 8px;
  padding: 0 12px;
  box-sizing: border-box;
  border: 1px solid #cfdcf0;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease;
}

.composite-cost__input:focus {
  outline: none;
  border-color: #68b98f;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.16);
  background: #ffffff;
}

.composite-cost__fixed-batch {
  padding: 0 12px;
  border: 1px solid #d6e0f2;
  border-radius: 8px;
  background: #eef3fb;
  color: #334155;
  font-weight: 700;
  min-height: 44px;
  font-size: 0.86rem;
  display: flex;
  align-items: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.composite-cost__recipe-name {
  font-weight: 700;
  font-size: 0.86rem;
  min-width: 0;
  color: #1f2937;
  line-height: 1.35;
  word-break: break-word;
}

.composite-cost__line-total {
  font-weight: 700;
  font-size: 0.89rem;
  white-space: nowrap;
  color: #14532d;
  text-align: right;
  padding: 6px 8px;
  border-radius: 8px;
  background: #ecfdf3;
  border: 1px solid #bde7cd;
  box-shadow: inset 0 -1px 0 rgba(134, 239, 172, 0.5);
  letter-spacing: 0.01em;
}

.composite-cost__remove-btn,
.composite-cost__remove-spacer {
  width: 34px;
  min-width: 34px;
  justify-self: end;
}

.composite-cost__remove-spacer {
  visibility: hidden;
}

.composite-cost__input,
.composite-cost__input:disabled {
  color: #111827;
  background-color: #ffffff;
}

.composite-cost__input::placeholder {
  color: #94a3b8;
  opacity: 1;
}

.composite-cost__input option {
  color: #111827;
  background-color: #ffffff;
}

.composite-cost__actions {
  margin-top: 0.85rem;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.composite-cost__loading {
  color: #64748b;
  font-size: 0.71rem;
}

.composite-cost__footer {
  margin-top: 0.9rem;
  padding: 14px 15px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #c9e8d7;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 6px 16px rgba(22, 101, 52, 0.09);
}

.composite-cost__footer-label {
  color: #4b5b73;
  font-size: 0.8rem;
  font-weight: 700;
}

.composite-cost__footer-total {
  font-size: 1.12rem;
  font-weight: 800;
  color: #166534;
  letter-spacing: 0.01em;
}

.composite-cost__profit {
  margin-top: 0.9rem;
  padding: 14px 15px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #d4e9dd;
  box-shadow: 0 6px 18px rgba(22, 101, 52, 0.08);
}

.composite-cost__profit-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  color: #334155;
  font-size: 0.76rem;
  line-height: 1.5;
  padding-bottom: 8px;
  border-bottom: 1px dashed #d0e6db;
}

.composite-cost__profit-head strong {
  font-size: 0.95rem;
  color: #1f2937;
  letter-spacing: 0.01em;
}

.composite-cost__profit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.composite-cost__profit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.composite-cost__profit-field label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.composite-cost__currency-input {
  position: relative;
}

.composite-cost__currency-input > span {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 0.86rem;
  font-weight: 700;
}

.composite-cost__currency-input .composite-cost__input {
  padding-left: 28px;
}

.composite-cost__profit-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.composite-cost__profit-card {
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f4faf6;
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  transition: border-color 0.14s ease, transform 0.14s ease, box-shadow 0.14s ease;
}

.composite-cost__profit-card:hover {
  transform: translateY(-1px);
  border-color: #c8e3d4;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
}

.composite-cost__profit-card strong {
  font-size: 1.04rem;
  color: #0f172a;
}

.composite-cost__profit-card--rate strong {
  color: #15803d;
  text-shadow: 0 1px 0 rgba(220, 252, 231, 0.9);
}

.composite-cost__profit-label {
  font-size: 0.76rem;
  color: #52627b;
  font-weight: 700;
}

@media (max-width: 900px) {
  .composite-cost {
    padding: 0.9rem;
  }

  .composite-cost__title {
    font-size: 0.81rem;
  }

  .composite-cost__desc {
    font-size: 0.67rem;
    margin-bottom: 0.75rem;
  }

  .composite-cost__head-row {
    display: none;
  }

  .composite-cost__row,
  .composite-cost__row--with-remove {
    grid-template-columns: 1fr;
    gap: 7px;
    padding: 8px;
    border: 1px solid #dde7f7;
    border-radius: 6px;
    background: #ffffff;
  }

  .composite-cost__recipe-name {
    font-size: 0.81rem;
  }

  .composite-cost__input,
  .composite-cost__fixed-batch {
    font-size: 0.81rem;
    min-height: 42px;
    height: 42px;
  }

  .composite-cost__line-total {
    text-align: right;
    font-size: 0.87rem;
  }

  .composite-cost__remove-btn {
    justify-self: end;
  }

  .composite-cost__footer-label {
    font-size: 0.71rem;
  }

  .composite-cost__footer-total {
    font-size: 0.91rem;
  }

  .composite-cost__profit-head {
    flex-direction: column;
  }

  .composite-cost__profit-grid,
  .composite-cost__profit-cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1180px) {
  .composite-cost__head-row {
    display: none;
  }

  .composite-cost__row,
  .composite-cost__row--with-remove {
    grid-template-columns: 1fr;
    gap: 7px;
    padding: 8px;
    border: 1px solid #dde7f7;
    border-radius: 6px;
    background: #ffffff;
  }

  .composite-cost__line-total {
    text-align: right;
  }

  .composite-cost__profit-grid,
  .composite-cost__profit-cards {
    grid-template-columns: 1fr;
  }
}
`;export{n as default};
