const n=`.reference-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reference-box__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.reference-box__header-main {
  flex: 1 1 640px;
  min-width: 0;
}

.reference-box__subtitle {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.92rem;
}

.reference-box__usage {
  margin-top: 10px;
  width: 100%;
}

.reference-box__usage-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.86rem;
  color: rgba(255, 255, 255, 0.92);
  margin-bottom: 4px;
}

.reference-box__usage-bar {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.reference-box__usage-fill {
  height: 100%;
  background: #2f6fed;
}

.reference-box__usage-fill.is-warn {
  background: #f59e0b;
}

.reference-box__usage-fill.is-danger {
  background: #dc2626;
}

.reference-box__usage-note {
  margin-top: 4px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.78);
}

.reference-box__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.reference-box__status {
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 0.9rem;
}

.reference-box__status.info {
  background: #e8f4ff;
  color: #0b5394;
}

.reference-box__status.success {
  background: #e8f9ee;
  color: #1e7e34;
}

.reference-box__status.warning {
  background: #fff4db;
  color: #8a5a00;
}

.reference-box__status.error {
  background: #ffe9ea;
  color: #a61d24;
}

.reference-box__content {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 12px;
  min-height: 64vh;
}

.reference-box__sidebar,
.reference-box__editor {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}

.reference-box__search,
.reference-box__body-input {
  width: 100%;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.95rem;
}

.reference-box__search {
  margin-bottom: 10px;
}

.reference-box__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(64vh - 64px);
  overflow: auto;
}

.reference-box__item {
  width: 100%;
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  cursor: pointer;
}

.reference-box__item:hover {
  border-color: #a7c4f2;
  background: #f8fbff;
}

.reference-box__item.active {
  border-color: #2f6fed;
  background: #eef4ff;
}

.reference-box__item-title {
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
}

.reference-box__item-date {
  color: #666;
  font-size: 0.82rem;
}

.reference-box__empty {
  color: #888;
  text-align: center;
  padding: 20px 10px;
}

.reference-box__editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reference-box__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.reference-box__dropzone {
  border: 1px dashed #9db2cf;
  border-radius: 10px;
  padding: 10px;
  background: #fafcff;
}

.reference-box__dropzone.is-drag-over {
  border-color: #2f6fed;
  background: #eef4ff;
}

.reference-box__dropzone-title {
  font-weight: 700;
  color: #2a3f63;
}

.reference-box__dropzone-desc {
  color: #5f6f85;
  font-size: 0.86rem;
  margin: 4px 0 8px;
}

.reference-box__file-input {
  width: 100%;
  font-size: 0.9rem;
}

.reference-box__dropzone-note {
  color: #6b7280;
  font-size: 0.8rem;
  margin-top: 6px;
}

.reference-box__share-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reference-box__share-inline-trigger {
  display: flex;
  justify-content: flex-start;
}

.reference-box__share-title {
  font-weight: 700;
  color: #374151;
}

.reference-box__share-note {
  margin-top: 4px;
  font-size: 0.82rem;
  color: #6b7280;
}

.reference-box__share-summary {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  color: #374151;
  font-size: 0.88rem;
}

.reference-box__share-search {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
}

.reference-box__share-quick-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.reference-box__share-targets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 8px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}

.reference-box__share-target {
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  column-gap: 8px;
  row-gap: 2px;
  font-size: 0.85rem;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 6px 8px;
  background: #f9fafb;
}

.reference-box__share-target input {
  grid-row: 1 / span 2;
}

.reference-box__share-target-main {
  font-weight: 600;
  color: #1f2937;
  line-height: 1.2;
  word-break: break-all;
}

.reference-box__share-target-sub {
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.2;
  word-break: break-all;
}

.reference-box__share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid #e5e7eb;
  padding-top: 10px;
}

.reference-box__attachments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reference-box__attachment-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.reference-box__attachment-main {
  min-width: 0;
}

.reference-box__attachment-name {
  font-weight: 700;
  color: #374151;
  word-break: break-all;
}

.reference-box__attachment-meta {
  color: #6b7280;
  font-size: 0.82rem;
}

.reference-box__category-editor {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.reference-box__category-input {
  flex: 1 1 260px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.85rem;
}

.reference-box__category-select {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.85rem;
  background: #fff;
  color: #374151;
  min-width: 220px;
}


.reference-box__attachment-actions {
  display: flex;
  gap: 6px;
}

.reference-box__preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 320px;
}

.reference-box__preview-pane {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  min-height: 280px;
  background: #fff;
}

.reference-box__preview-image {
  width: 100%;
  height: auto;
  max-height: 520px;
  object-fit: contain;
}

.reference-box__preview-iframe {
  width: 100%;
  min-height: 520px;
  border: none;
}

.reference-box__preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #374151;
}

@media (max-width: 900px) {
  .reference-box__content {
    grid-template-columns: 1fr;
  }

  .reference-box__list {
    max-height: 280px;
  }

  .reference-box__body-input {
    min-height: 320px;
  }

  .reference-box__attachment-item {
    flex-direction: column;
    align-items: flex-start;
  }
}
`;export{n as default};
