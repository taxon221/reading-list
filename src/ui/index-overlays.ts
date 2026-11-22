export function renderIndexOverlays() {
	return `
    <div class="selection-popup" id="selection-popup" style="display: none">
      <button type="button" class="popup-highlight-btn" id="popup-highlight-btn" title="Highlight">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 20l4.2-.8L19 8.4a2 2 0 0 0-2.8-2.8L5.4 16.4 4 20z"></path><path d="M14.8 6.2l3 3"></path></svg>
        Highlight
      </button>
    </div>

    <div role="dialog" aria-modal="true" aria-labelledby="reader-title" class="reader-overlay" id="reader-modal" style="display: none">
      <div class="reader-container">
        <div class="reader-header">
          <div class="reader-progress" id="reader-progress"><div class="reader-progress-track"><div class="reader-progress-fill" id="reader-progress-fill"></div></div><span class="reader-progress-label" id="reader-progress-label">0%</span></div>
          <div class="reader-header-main">
            <div class="reader-title" id="reader-title">Loading...</div>
            <div class="reader-actions">
              <div class="reader-font-controls" aria-label="Text size">
                <button type="button" class="reader-btn reader-font-btn" id="reader-font-decrease" title="Decrease text size" aria-label="Decrease text size">A−</button>
                <span class="reader-font-label" id="reader-font-label" aria-hidden="true">20px</span>
                <button type="button" class="reader-btn reader-font-btn" id="reader-font-increase" title="Increase text size" aria-label="Increase text size">A+</button>
              </div>
              <button type="button" class="reader-btn theme-toggle" id="reader-theme-toggle" aria-label="Theme" title="Theme: Device"><span class="theme-symbol theme-symbol-system" aria-hidden="true">◐</span><span class="theme-symbol theme-symbol-dark" aria-hidden="true">☾</span><span class="theme-symbol theme-symbol-light" aria-hidden="true">☼</span></button>
              <button type="button" class="reader-btn" id="reader-toggle-notes" title="Notes and highlights (H)" aria-label="Notes and highlights" aria-expanded="false" aria-controls="reader-sidebar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></button>
              <a href="#" id="reader-open-original" class="reader-btn" target="_blank" rel="noopener" title="Open original (O)" aria-label="Open original"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>
              <button type="button" class="reader-btn reader-close" id="reader-close" title="Close (Esc)" aria-label="Close reader"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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

    <!-- After the reader: the last open dialog in page order takes focus. -->
    <div role="dialog" aria-modal="true" aria-labelledby="note-modal-title" class="note-modal-overlay" id="note-modal" style="display: none">
      <div class="note-modal">
        <div class="note-modal-header"><h3 id="note-modal-title">Add Note</h3><button type="button" class="modal-close" id="note-modal-close" aria-label="Close">×</button></div>
        <div class="note-modal-quote" id="note-modal-quote"></div>
        <textarea id="note-modal-text" placeholder="Add a note" rows="3"></textarea>
        <div class="note-modal-actions"><button type="button" class="btn-secondary" id="note-modal-cancel">Cancel</button><button type="button" class="btn-primary" id="note-modal-save">Save Highlight</button></div>
      </div>
    </div>

    <div role="dialog" aria-modal="true" aria-labelledby="add-modal-title" class="modal-overlay" id="add-modal" style="display: none">
      <div class="modal">
        <div class="modal-header"><h2 id="add-modal-title">Add link</h2><button type="button" class="modal-close" id="add-modal-close" aria-label="Close">×</button></div>
        <form id="add-item-form">
          <input type="file" id="file-upload-input" accept=".pdf,.epub,application/pdf,application/epub+zip" hidden />
          <div class="form-group" id="add-url-group"><label for="url" id="add-url-label">URL</label><input type="url" id="url" placeholder="https://example.com/article" autocomplete="off" /></div>
          <button type="button" class="import-btn file-picker-btn" id="add-file-picker" style="display: none">Choose PDF / EPUB</button>
          <div id="add-file-summary" class="account-meta" hidden>No file selected.</div>
          <div id="add-details-group">
            <div class="form-group"><label for="title">Title</label><input type="text" id="title" placeholder="Title" class="title-input" /></div>
            <div class="form-group"><label for="author">Author</label><input type="text" id="author" placeholder="Author" class="author-input" /></div>
            <div class="form-group" id="add-type-group"><label for="type-select">Type</label><select id="type-select"><option value="article">Article</option><option value="video">Video</option><option value="pdf">PDF</option><option value="ebook">Ebook</option><option value="podcast">Podcast</option></select></div>
            <div class="form-group"><label>Tags</label><div class="tags-input" id="tags-input"><input type="text" id="tag-input" placeholder="Add tags (Enter or Tab)" autocomplete="off" /></div></div>
          </div>
          <div class="modal-actions"><button type="button" class="btn-secondary" id="add-modal-cancel">Cancel</button><button type="submit" class="btn-primary" id="submit-btn">Add</button></div>
        </form>
      </div>
    </div>

    <div role="dialog" aria-modal="true" aria-label="Save view" class="modal-overlay" id="save-view-modal" style="display: none">
      <div class="modal">
        <div class="modal-header"><h2>Save View</h2><button type="button" class="modal-close" id="save-view-modal-close" aria-label="Close">×</button></div>
        <form id="save-view-form">
          <div class="form-group"><label for="save-view-name">Name</label><input type="text" id="save-view-name" maxlength="40" placeholder="For example: Hide X" autocomplete="off" required /></div>
          <div class="modal-actions"><button type="button" class="btn-secondary" id="save-view-cancel">Cancel</button><button type="submit" class="btn-primary">Save</button></div>
        </form>
      </div>
    </div>

    <div role="dialog" aria-modal="true" aria-label="Edit item" class="modal-overlay" id="edit-modal" style="display: none">
      <div class="modal">
        <div class="modal-header"><h2>Edit Item</h2><button type="button" class="modal-close" id="modal-close" aria-label="Close">×</button></div>
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

    <div class="account-modal-overlay" id="account-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="account-modal-heading" hidden>
      <div class="account-modal-backdrop" id="account-modal-backdrop" tabindex="-1"></div>
      <div class="account-modal" id="account-modal">
        <div class="account-modal-header"><h2 id="account-modal-heading" class="account-modal-heading">Settings</h2><button type="button" class="modal-close" id="account-modal-close" aria-label="Close settings">×</button></div>
        <div class="account-modal-body">
          <div id="account-panel-user" class="settings-layout" hidden>
            <div class="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
              <button type="button" role="tab" id="settings-tab-account" data-settings-tab="account" aria-controls="settings-panel-account" aria-selected="true">Account</button>
              <button type="button" role="tab" id="settings-tab-library" data-settings-tab="library" aria-controls="settings-panel-library" aria-selected="false" tabindex="-1">Library</button>
              <button type="button" role="tab" id="settings-tab-security" data-settings-tab="security" aria-controls="app-auth-settings" aria-selected="false" tabindex="-1">Security</button>
              <button type="button" role="tab" id="settings-tab-feeds" data-settings-tab="feeds" aria-controls="settings-panel-feeds" aria-selected="false" tabindex="-1">RSS feeds</button>
            </div>
            <div class="settings-content">
              <section id="settings-panel-account" role="tabpanel" aria-labelledby="settings-tab-account" data-settings-panel="account" tabindex="0">
                <div class="settings-page-header"><h3 class="settings-page-title">Account</h3></div>
                <div class="settings-card settings-profile">
                  <div><p class="account-title" id="account-title"></p><p class="account-email" id="account-email"></p><p class="account-meta" id="account-meta"></p></div>
                  <a class="btn-secondary" id="account-action" href="#" hidden></a>
                </div>
                <div id="account-invite-section" class="account-section" hidden>
                  <h4>Invite a reader</h4>
                  <form id="invite-form" class="settings-card settings-invite-form" hidden>
                    <label for="invite-email">Email address</label>
                    <div class="settings-input-row"><input type="email" id="invite-email" placeholder="reader@example.com" autocomplete="email" required /><button type="submit" class="btn-secondary">Create invitation</button></div>
                    <p class="account-meta">Copy and share the link. It expires after 24 hours.</p>
                    <div id="invite-result-group" hidden><div class="settings-input-row"><input id="invite-result" aria-label="Private invitation link" readonly /><button type="button" class="btn-secondary" id="invite-copy">Copy link</button></div></div>
                    <p id="invite-status" class="settings-status" role="status" aria-live="polite"></p>
                  </form>
                  <div id="invitation-list" class="invitation-list" aria-live="polite"></div>
                </div>
              </section>
              <section id="settings-panel-library" role="tabpanel" aria-labelledby="settings-tab-library" data-settings-panel="library" tabindex="0" hidden>
                <div class="settings-page-header"><h3 class="settings-page-title">Library</h3></div>
                <div class="settings-card">
                  <div class="settings-row"><div><h4>Import a reading list</h4><p>Bring in links from a CSV file.</p></div><button type="button" class="btn-secondary" id="import-btn">Import CSV</button></div>
                  <div class="settings-row"><div><h4>Complete library</h4><p>Save your items, notes, highlights, and files.</p></div><button type="button" class="btn-secondary" id="export-library">Export</button></div>
                  <div class="settings-row"><div><h4>Notes &amp; highlights</h4><p>Download your annotations as Markdown.</p></div><a class="btn-secondary" href="/api/export?format=highlights" download>Export notes</a></div>
                </div>
                <p id="export-status" class="settings-status" role="status"></p>
                <div class="account-section"><h4>Cleanup</h4>
                  <div class="settings-card">
                    <div class="settings-row"><div><h4>Bulk deletion</h4><p>Choose which items to remove from your library.</p></div><button type="button" class="btn-secondary" id="manage-library">Manage…</button></div>
                  </div>
                </div>
              </section>
              <section id="app-auth-settings" role="tabpanel" aria-labelledby="settings-tab-security" data-settings-panel="security" tabindex="0" hidden>
                <div class="settings-page-header"><h3 class="settings-page-title">Security</h3></div>
                <div class="account-section"><div class="settings-section-heading"><h4>Passkeys</h4><button type="button" class="btn-secondary" id="add-passkey">Add passkey</button></div>
                  <div id="passkey-list" class="settings-card"><p class="account-meta">Loading passkeys…</p></div>
                </div>
                <div class="settings-card settings-recovery-row"><div class="settings-row"><div><h4>Recovery codes</h4><p>Create a new set if your backup codes are lost.</p></div><button type="button" class="btn-secondary" id="replace-recovery">Replace codes</button></div></div>
                <div class="account-section"><h4>Signed-in devices</h4><div id="device-list" class="settings-card"><p class="account-meta">Loading devices…</p></div></div>
              </section>
              <section id="settings-panel-feeds" role="tabpanel" aria-labelledby="settings-tab-feeds" data-settings-panel="feeds" tabindex="0" hidden>
                <div class="settings-page-header"><h3 class="settings-page-title">RSS feeds</h3><button type="button" class="btn-secondary" id="rss-import-all-btn">Refresh feeds</button></div>
                <p class="settings-rss-description">New posts from the feeds you follow land in your library. Add a feed from the Add menu.</p>
                <p class="settings-status" id="rss-status" role="status"></p>
                <div id="rss-subscriptions-list" class="rss-subscriptions-list"><p class="account-meta">No RSS feeds loaded yet.</p></div>
              </section>
            </div>
          </div>
          <div id="account-panel-guest" hidden><p class="account-guest-message" id="account-guest-message"></p><p class="account-meta" id="account-guest-meta"></p><a class="header-link account-modal-action" id="auth-link" href="#" hidden></a></div>
        </div>
      </div>
    </div>


    <div class="modal-overlay" id="signin-modal" role="dialog" aria-modal="true" aria-labelledby="signin-heading" aria-describedby="signin-description" hidden>
      <div class="modal auth-modal">
        <div class="modal-header">
          <h2 id="signin-heading">Sign in</h2>
          <button type="button" id="signin-close" class="modal-close" aria-label="Close sign in">×</button>
        </div>
        <div class="auth-body">
          <div id="auth-signin-view" class="auth-view">
            <p class="auth-copy" id="signin-description">Use the passkey you saved when you set up your account. Your device will ask you to unlock it.</p>
            <button type="button" class="btn-primary auth-primary" id="passkey-signin">Sign in with a passkey</button>
            <p class="auth-hint" id="auth-invite-hint">New here? Open your invitation link to set up your account.</p>
          </div>
          <div id="auth-register-view" class="auth-view" hidden>
            <p class="auth-step" id="auth-setup-step">Step 1 of 2</p>
            <div id="invited-account" class="auth-invited-account" hidden><span>Account</span><strong id="invited-email"></strong><p id="invited-context"></p></div>
            <p class="auth-copy" id="passkey-description">A passkey is your sign-in key, saved by your device or password manager. You don't need to choose a password.</p>
            <ol class="auth-next" id="auth-setup-next">
              <li aria-current="step"><span class="auth-step-number" aria-hidden="true">1</span><div><strong>Create your passkey</strong><p>Use your fingerprint, face, or device PIN.</p></div></li>
              <li><span class="auth-step-number" aria-hidden="true">2</span><div><strong>Keep a backup</strong><p>Save your recovery codes, then open your library.</p></div></li>
            </ol>
            <form id="passkey-form" class="auth-form">
              <div class="form-group" id="passkey-name-field" hidden>
                <label for="passkey-name">Passkey name <span class="auth-optional">(optional)</span></label>
                <input type="text" id="passkey-name" placeholder="e.g. Personal laptop" maxlength="80" autocomplete="off" />
              </div>
              <button type="submit" class="btn-primary auth-primary" id="passkey-register">Create my passkey</button>
            </form>
            <p class="auth-hint" id="passkey-prompt-hint">Your device will open a secure prompt for the next step.</p>
          </div>
          <div id="auth-recovery-view" class="auth-view" hidden>
            <p class="auth-copy" id="recover-description">Use one of your saved recovery codes to sign in.</p>
            <form id="recover-form" class="auth-form">
              <div class="form-group">
                <label for="recover-email">Email</label>
                <input type="email" id="recover-email" autocomplete="username" placeholder="you@example.com" required />
              </div>
              <div class="form-group">
                <label for="recover-code">Recovery code</label>
                <input type="text" id="recover-code" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="Enter your recovery code" required />
              </div>
              <button type="submit" class="btn-primary auth-primary">Sign in</button>
            </form>
          </div>
          <p id="signin-status" class="auth-status" role="status" aria-live="polite"></p>
        </div>
        <div class="auth-footer" id="auth-signin-options">
          <button type="button" class="auth-link" data-auth-view="recovery">Use a recovery code</button>
          <button type="button" class="auth-link" id="auth-setup-link" data-auth-view="register" hidden>Set up your account</button>
        </div>
        <div class="auth-footer" id="auth-back" hidden>
          <button type="button" class="auth-link" id="auth-back-button" data-auth-view="signin">Back to sign in</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" id="recovery-panel" role="dialog" aria-modal="true" aria-labelledby="recovery-heading" hidden>
      <div class="modal auth-modal">
        <div class="modal-header"><h2 id="recovery-heading">Save your recovery codes</h2></div>
        <div class="auth-body">
          <p class="auth-step" id="recovery-setup-step">Step 2 of 2 · Passkey created</p>
          <p class="auth-copy">These are your backup way in if you lose your passkey. Save them somewhere private, like your password manager. Each code works once.</p>
          <pre id="recovery-codes" class="auth-recovery-codes"></pre>
          <div class="modal-actions auth-code-actions">
            <button type="button" id="download-recovery" class="btn-secondary">Download codes</button>
            <button type="button" id="recovery-close" class="btn-primary">I've saved them · Open my library</button>
          </div>
        </div>
      </div>
    </div>
<div id="recovered-note" hidden><p>Your unfinished note was recovered.</p><textarea aria-label="Recovered note"></textarea><button type="button" id="restore-note">Continue editing</button></div>
<script src="/static/vendor/webauthn.js" defer></script>
    <div id="toast-container" class="toast-container" aria-live="polite" aria-atomic="true"></div>
    <script type="module" src="/static/app.js"></script>`;
}
