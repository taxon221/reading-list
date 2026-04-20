export function renderIndexOverlays() {
	return `
    <div class="selection-popup" id="selection-popup" style="display: none">
      <button type="button" class="popup-highlight-btn" id="popup-highlight-btn" title="Highlight">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 20l4.2-.8L19 8.4a2 2 0 0 0-2.8-2.8L5.4 16.4 4 20z"></path><path d="M14.8 6.2l3 3"></path></svg>
        Highlight
      </button>
    </div>

    <div class="note-modal-overlay" id="note-modal" style="display: none">
      <div class="note-modal">
        <div class="note-modal-header"><h3>Add Note</h3><button type="button" class="modal-close" id="note-modal-close">×</button></div>
        <div class="note-modal-quote" id="note-modal-quote"></div>
        <textarea id="note-modal-text" placeholder="Add your thoughts (optional)..." rows="3"></textarea>
        <div class="note-modal-actions"><button type="button" class="btn-secondary" id="note-modal-cancel">Cancel</button><button type="button" class="btn-primary" id="note-modal-save">Save Highlight</button></div>
      </div>
    </div>

    <div class="reader-overlay" id="reader-modal" style="display: none">
      <div class="reader-container">
        <div class="reader-header">
          <div class="reader-progress" id="reader-progress"><div class="reader-progress-track"><div class="reader-progress-fill" id="reader-progress-fill"></div></div><span class="reader-progress-label" id="reader-progress-label">0%</span></div>
          <div class="reader-header-main">
            <div class="reader-title" id="reader-title">Loading...</div>
            <div class="reader-actions">
              <button type="button" class="reader-btn theme-toggle" id="reader-theme-toggle" aria-label="Theme" title="Theme: Device"><span class="theme-symbol theme-symbol-system" aria-hidden="true">◐</span><span class="theme-symbol theme-symbol-dark" aria-hidden="true">☾</span><span class="theme-symbol theme-symbol-light" aria-hidden="true">☼</span></button>
              <button type="button" class="reader-btn" id="reader-toggle-notes" title="Toggle notes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></button>
              <a href="#" id="reader-open-original" class="reader-btn" target="_blank" rel="noopener" title="Open original"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>
              <button type="button" class="reader-btn reader-close" id="reader-close" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
          </div>
        </div>
        <div class="reader-body">
          <div class="reader-content" id="reader-content"><div class="reader-loading"><div class="reader-spinner"></div><p>Loading content...</p></div></div>
          <div class="reader-sidebar hidden" id="reader-sidebar">
            <div class="sidebar-header"><h3>Highlights</h3><span class="highlights-count" id="highlights-count"></span></div>
            <div class="sidebar-highlights" id="sidebar-highlights"><div class="sidebar-empty"><p>No highlights yet</p><p class="empty-hint">Select text to highlight</p></div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="item-dropdown-menu" id="item-dropdown-menu" style="display: none">
      <button type="button" class="dropdown-item" id="dropdown-edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>Edit</button>
      <button type="button" class="dropdown-item" id="dropdown-open-url"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>Open original URL</button>
    </div>

    <div class="modal-overlay" id="save-view-modal" style="display: none">
      <div class="modal">
        <div class="modal-header"><h2>Save View</h2><button type="button" class="modal-close" id="save-view-modal-close">×</button></div>
        <form id="save-view-form">
          <div class="form-group"><label for="save-view-name">Name</label><input type="text" id="save-view-name" maxlength="40" placeholder="For example: Hide X" autocomplete="off" required /></div>
          <div class="modal-actions"><button type="button" class="btn-secondary" id="save-view-cancel">Cancel</button><button type="submit" class="btn-primary">Save</button></div>
        </form>
      </div>
    </div>

    <div class="modal-overlay" id="edit-modal" style="display: none">
      <div class="modal">
        <div class="modal-header"><h2>Edit Item</h2><button type="button" class="modal-close" id="modal-close">×</button></div>
        <form id="edit-form">
          <input type="hidden" id="edit-id" />
          <div class="form-group"><label for="edit-url">URL</label><input type="url" id="edit-url" required /></div>
          <div class="form-group"><label for="edit-title">Title</label><input type="text" id="edit-title" /></div>
          <div class="form-group"><label for="edit-author">Author</label><input type="text" id="edit-author" /></div>
          <div class="form-group"><label for="edit-type">Type</label><select id="edit-type"><option value="article">Article</option><option value="video">Video</option><option value="pdf">PDF</option><option value="ebook">Ebook</option><option value="podcast">Podcast</option></select></div>
          <div class="form-group"><label>Tags</label><div class="tags-input" id="edit-tags-input"><input type="text" id="edit-tag-input" placeholder="Add tags (press Enter)" autocomplete="off" /></div></div>
          <div class="modal-actions"><button type="button" class="btn-secondary" id="modal-cancel">Cancel</button><button type="submit" class="btn-primary">Save</button></div>
        </form>
      </div>
    </div>

    <div class="account-modal-overlay" id="account-modal-overlay" hidden>
      <div class="account-modal-backdrop" id="account-modal-backdrop" tabindex="-1"></div>
      <div class="account-modal" id="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-heading">
        <div class="account-modal-header"><h2 id="account-modal-heading" class="account-modal-heading">Account</h2><button type="button" class="modal-close" id="account-modal-close" aria-label="Close account">×</button></div>
        <div class="account-modal-body">
          <div id="account-panel-user" hidden><p class="account-title" id="account-title"></p><p class="account-email" id="account-email"></p><p class="account-meta" id="account-meta"></p><a class="header-link account-modal-action" id="account-action" href="#" hidden></a><button type="button" class="import-btn account-modal-action" id="import-btn">Import CSV</button></div>
          <div id="account-panel-guest" hidden><p class="account-guest-message" id="account-guest-message"></p><p class="account-meta" id="account-guest-meta"></p><a class="header-link account-modal-action" id="auth-link" href="#" hidden></a></div>
        </div>
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js"></script>
    <script type="module" src="/static/app.js"></script>`;
}
