const n=`.composite-cost-page {
  display: grid;
  gap: 20px;
}

.composite-cost-page__header {
  display: flex;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.composite-cost-page__hero {
  padding: 24px;
  border: 1px solid #DDD0B8;
  background: #FAF7F2;
  box-shadow: 0 8px 20px rgba(101, 72, 22, 0.08);
  border-radius: 12px;
}

.composite-cost-page .composite-cost-page__title {
  margin: 0 0 10px 0;
  color: #0f172a !important;
}

.composite-cost-page .composite-cost-page__saved-title {
  font-size: calc(1.5rem - 0.3rem + 4pt) !important;
}

.composite-cost-page__desc {
  margin: 0;
  color: #2f3f56;
  line-height: 1.7;
}

.composite-cost-page__saved-hero {
  position: relative;
  overflow: hidden;
  padding: 0;
  border: 1px solid #DDD0B8;
  background: linear-gradient(135deg, #FAF7F2 0%, #F5EDD8 64%, #F0E4CC 100%);
  border-radius: 14px;
  box-shadow: 0 14px 34px rgba(101, 72, 22, 0.14);
}

.composite-cost-page__saved-hero::after {
  content: "";
  position: absolute;
  inset: auto -40px -46px auto;
  width: 190px;
  height: 190px;
  border-radius: 999px;
  background: radial-gradient(circle at center, rgba(184, 147, 90, 0.18) 0%, rgba(184, 147, 90, 0) 74%);
  pointer-events: none;
}

.composite-cost-page__saved-hero::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  background: linear-gradient(180deg, #9B7B3A 0%, #C4A267 100%);
}

.composite-cost-page__saved-hero-head-left h2 {
  text-wrap: balance;
}

.composite-cost-page__saved-hero-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 16px 18px 14px 20px;
  border-bottom: 1px solid #DDD0B8;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.75) 0%, rgba(245, 237, 216, 0.55) 100%);
}

.composite-cost-page__saved-hero-head-left {
  display: grid;
  gap: 6px;
}

.composite-cost-page__saved-hero-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  width: fit-content;
  background: #F5EDD8;
  border: 1px solid #CEB98A;
  color: #7A5230;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  box-shadow: inset 0 -1px 0 rgba(122, 82, 48, 0.1);
}

.composite-cost-page__saved-hero-count {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #FBF5E8;
  border: 1px solid #CEB98A;
  color: #5C3A1A;
  font-size: 0.8rem;
  font-weight: 800;
  box-shadow: 0 2px 8px rgba(101, 72, 22, 0.14);
}

.composite-cost-page__saved-hero-note {
  padding: 12px 18px 14px 20px;
  color: #334155;
  line-height: 1.75;
  font-size: 0.9rem;
  background: rgba(255, 255, 255, 0.5);
  border-top: 1px dashed rgba(184, 147, 90, 0.28);
}

.composite-cost-page__selector {
  margin-top: 20px;
  display: grid;
  gap: 8px;
}

.composite-cost-page__label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #1f2937;
}

.composite-cost-page__search,
.composite-cost-page__select {
  width: 100%;
  min-height: 48px;
  border: 1px solid #DDD0B8;
  border-radius: 10px;
  padding: 0 14px;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.95rem;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.composite-cost-page__search:focus,
.composite-cost-page__select:focus {
  outline: none;
  border-color: #B8935A;
  box-shadow: 0 0 0 3px rgba(184, 147, 90, 0.18);
}

.composite-cost-page__search {
  padding: 0 16px;
}

.composite-cost-page__search-meta {
  font-size: 0.8rem;
  color: #52627b;
  line-height: 1.5;
}

.composite-cost-page__selected-meta {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: #0f172a;
}

.composite-cost-page__meta-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
}

.composite-cost-page__meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #c2410c;
  font-size: 0.78rem;
  font-weight: 700;
}

.composite-cost-page__error {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  line-height: 1.65;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.composite-cost-page__empty-search {
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
  line-height: 1.6;
}

.composite-cost-page__search-results {
  margin-top: 18px;
  display: grid;
  gap: 13px;
  padding: 12px;
  border: 1px solid #DDD0B8;
  border-radius: 12px;
  background: #FAF7F2;
}

.composite-cost-page__search-results-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  color: #3f4f65;
  line-height: 1.5;
  padding-bottom: 8px;
  border-bottom: 1px dashed #DDD0B8;
}

.composite-cost-page__search-results-head strong {
  color: #0f172a;
  font-size: 0.92rem;
}

.composite-cost-page__search-results-head span,
.composite-cost-page__search-note {
  font-size: 0.8rem;
  color: #64748b;
}

.composite-cost-page__search-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.composite-cost-page__search-card {
  --card-accent: #9B7B3A;
  --card-tint: #ffffff;
  appearance: none;
  border: 1px solid #E2D5BC;
  border-radius: 14px;
  background: var(--card-tint);
  padding: 14px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 10px;
  position: relative;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
}

.composite-cost-page__search-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: var(--card-accent);
}

.composite-cost-page__search-card:hover {
  border-color: var(--card-accent);
  box-shadow: 0 10px 22px rgba(101, 72, 22, 0.12);
  transform: translateY(-2px);
}

.composite-cost-page__search-card--selected {
  border-color: #B8935A;
  box-shadow: 0 0 0 2px rgba(184, 147, 90, 0.22), 0 12px 26px rgba(184, 147, 90, 0.16);
  background: #FBF5E8;
}

.composite-cost-page__search-card-title {
  color: #0f172a;
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.5;
  word-break: break-word;
}

.composite-cost-page__search-card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.composite-cost-page__search-card-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
}

.composite-cost-page__search-card-chip--category {
  background: #FBF5E8;
  border: 1px solid #CEB98A;
  color: #7A5230;
}

.composite-cost-page__search-card-chip--course {
  background: #F5EDD8;
  border: 1px solid #CEB98A;
  color: #5C3A1A;
}

.composite-cost-page__search-card-chip--store {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #c2410c;
}

.composite-cost-page__search-card-desc {
  color: #5b6b84;
  font-size: 0.84rem;
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.composite-cost-page__search-card-action {
  font-size: 0.76rem;
  font-weight: 700;
  color: #334155;
}

.composite-cost-page__search-card--tone-1 {
  --card-accent: #9B7B3A;
  --card-tint: #ffffff;
}

.composite-cost-page__search-card--tone-2 {
  --card-accent: #7A5230;
  --card-tint: #ffffff;
}

.composite-cost-page__search-card--tone-3 {
  --card-accent: #B8935A;
  --card-tint: #ffffff;
}

.composite-cost-page__search-card--tone-4 {
  --card-accent: #8b5e34;
  --card-tint: #ffffff;
}

.composite-cost-page__search-card--tone-5 {
  --card-accent: #7A5230;
  --card-tint: #ffffff;
}

.composite-cost-page__placeholder {
  padding: 22px 24px;
  color: #475569;
  line-height: 1.7;
}

.composite-cost-page__save-row {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.composite-cost-page__save-row .composite-cost-page__search {
  flex: 1 1 280px;
  min-width: 220px;
}

.composite-cost-page__save-row .composite-cost-page__select {
  width: auto;
  min-width: 180px;
}

.composite-cost-page__share-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  color: #5a3b12;
  white-space: nowrap;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-weight: 700;
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}

.composite-cost-page__share-toggle input[type="checkbox"] {
  inline-size: 16px;
  block-size: 16px;
  accent-color: #0f766e;
}

.composite-cost-page__share-toggle--on {
  color: #065f57;
  border-color: #0f766e;
  background: #ccfbf1;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
}

.composite-cost-page__share-toggle--off {
  color: #475569;
  border-color: #cbd5e1;
  background: #f8fafc;
}

.composite-cost-page__saved-list {
  display: grid;
  gap: 12px;
  counter-reset: saved-composite-item;
}

.composite-cost-page__saved-item {
  position: relative;
  counter-increment: saved-composite-item;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 16px 16px;
  border-radius: 12px;
  background: linear-gradient(180deg, #FAF7F2 0%, #F2E8D5 100%);
  border: 1px solid #DDD0B8;
  box-shadow: 0 8px 20px rgba(101, 72, 22, 0.09);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.composite-cost-page__saved-item--clickable {
  cursor: pointer;
  outline: none;
}

.composite-cost-page__saved-item--clickable:focus-visible {
  box-shadow: 0 0 0 3px rgba(184, 147, 90, 0.4), 0 8px 20px rgba(101, 72, 22, 0.09);
  border-color: #B8935A;
}

.composite-cost-page__saved-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  border-radius: 12px 0 0 12px;
  background: linear-gradient(180deg, #9B7B3A 0%, #C4A267 100%);
}

.composite-cost-page__saved-item::after {
  content: "#" counter(saved-composite-item, decimal-leading-zero);
  position: absolute;
  right: 14px;
  top: 10px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: rgba(122, 82, 48, 0.7);
  background: rgba(251, 245, 232, 0.9);
  border: 1px solid rgba(206, 185, 138, 0.9);
  border-radius: 999px;
  padding: 2px 8px;
}

.composite-cost-page__saved-item:hover {
  transform: translateY(-1px);
  border-color: #CEB98A;
  box-shadow: 0 14px 28px rgba(101, 72, 22, 0.15);
}

.composite-cost-page__saved-item--shared {
  background: linear-gradient(180deg, #EDF7F3 0%, #DDF1E9 100%);
  border-color: #98c8b3;
}

.composite-cost-page__saved-item--shared::before {
  background: linear-gradient(180deg, #0f766e 0%, #2aa890 100%);
}

.composite-cost-page__saved-item--shared::after {
  color: rgba(8, 83, 76, 0.75);
  background: rgba(233, 249, 243, 0.95);
  border-color: rgba(152, 200, 179, 0.95);
}

.composite-cost-page__saved-main {
  display: grid;
  gap: 6px;
  color: #1f2937;
  padding-left: 6px;
  padding-right: 84px;
}

.composite-cost-page__saved-item .composite-cost-page__saved-main strong {
  font-size: calc(1em + 6pt) !important;
  line-height: 1.25;
  letter-spacing: 0.015em;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}

.composite-cost-page__saved-main span:first-of-type {
  font-size: calc(1em + 1pt);
  font-weight: 700;
  color: #7A5230;
  padding-left: 2px;
}

.composite-cost-page__saved-main span:last-of-type {
  color: #475569;
  font-size: 0.92rem;
  padding-left: 2px;
}

.composite-cost-page__saved-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.composite-cost-page__saved-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid #DDD0B8;
  background: rgba(255, 255, 255, 0.85);
  font-size: 0.86rem;
}

.composite-cost-page__saved-chip em {
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
}

.composite-cost-page__saved-chip b {
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.01em;
}

.composite-cost-page__saved-chip--cost {
  border-color: #CEB98A;
  background: #FBF5E8;
}

.composite-cost-page__saved-chip--cost b {
  color: #7A5230;
}

.composite-cost-page__saved-chip--updated {
  border-color: #DDD0B8;
  background: #FAF7F2;
}

.composite-cost-page__saved-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}

.composite-cost-page__saved-actions .btn {
  min-width: 92px;
  border-radius: 10px;
  font-weight: 700;
  letter-spacing: 0.01em;
  padding-left: 12px;
  padding-right: 12px;
}

.composite-cost-page__saved-actions .btn-secondary {
  box-shadow: 0 3px 0 rgba(15, 23, 42, 0.1);
}

.composite-cost-page__saved-actions .btn-danger {
  box-shadow: 0 3px 0 rgba(153, 27, 27, 0.3);
}

.composite-cost-page__saved-actions .composite-cost-page__select {
  width: auto;
  min-width: 140px;
  min-height: 40px;
}

.composite-cost-page__saved-actions .composite-share-btn.btn--secondary {
  font-weight: 800;
}

.composite-cost-page__saved-actions .composite-share-btn--on.btn--secondary {
  background-color: #0f766e !important;
  border-color: #0f766e !important;
  color: #ffffff !important;
  box-shadow: 0 3px 0 rgba(15, 118, 110, 0.35);
}

.composite-cost-page__saved-actions .composite-share-btn--on.btn--secondary:not(:disabled):hover {
  background-color: #0d9488 !important;
  border-color: #0d9488 !important;
}

.composite-cost-page__saved-actions .composite-share-btn--off.btn--secondary {
  background-color: #ffffff !important;
  border-color: #cbd5e1 !important;
  color: #334155 !important;
}

@media (max-width: 700px) {
  .composite-cost-page__hero {
    padding: 18px;
  }

  .composite-cost-page__selected-meta {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .composite-cost-page__search-grid {
    grid-template-columns: 1fr;
  }

  .composite-cost-page__save-row {
    flex-direction: column;
    align-items: stretch;
  }

  .composite-cost-page__saved-hero-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 14px 14px 12px;
  }

  .composite-cost-page__saved-hero-note {
    padding: 10px 14px 12px;
  }

  .composite-cost-page__saved-item::before {
    width: 4px;
  }

  .composite-cost-page__saved-item {
    padding: 12px;
  }

  .composite-cost-page__saved-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .composite-cost-page__saved-item::after {
    right: 10px;
    top: 8px;
    font-size: 0.64rem;
    padding: 2px 7px;
  }

  .composite-cost-page__saved-main {
    padding-right: 72px;
  }

  .composite-cost-page__saved-chip {
    width: 100%;
    justify-content: space-between;
  }
}
`;export{n as default};
