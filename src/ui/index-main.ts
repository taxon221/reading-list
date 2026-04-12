export function renderIndexMain() {
	return `
    <div class="container">
      <header>
        <h1>Reading List</h1>
        <div class="header-actions">
          <div class="account-entry" id="account-entry">
            <button type="button" class="account-icon-btn" id="account-button" aria-expanded="false" aria-haspopup="dialog" aria-controls="account-modal" title="Account" aria-label="Account">
              <svg class="account-icon-guest" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
              </svg>
            </button>
          </div>
          <input type="file" id="import-file" accept=".csv,text/csv" hidden />
          <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Theme" title="Theme: Device"><span class="theme-symbol theme-symbol-system" aria-hidden="true">◐</span><span class="theme-symbol theme-symbol-dark" aria-hidden="true">☾</span><span class="theme-symbol theme-symbol-light" aria-hidden="true">☼</span></button>
        </div>
      </header>

      <section class="add-form">
        <form id="add-item-form">
          <div class="form-row">
            <input type="url" id="url" placeholder="Paste a URL..." autocomplete="off" />
            <input type="file" id="file-upload-input" accept=".pdf,.epub,application/pdf,application/epub+zip" hidden />
            <button type="submit" id="submit-btn">Add</button>
          </div>
          <div class="form-row form-details">
            <input type="text" id="title" placeholder="Title" class="title-input" />
            <input type="text" id="author" placeholder="Author" class="author-input" />
            <select id="type-select"><option value="article">Article</option><option value="video">Video</option><option value="pdf">PDF</option><option value="ebook">Ebook</option><option value="podcast">Podcast</option></select>
          </div>
          <div class="form-row"><div class="tags-input" id="tags-input"><input type="text" id="tag-input" placeholder="Add tags (Enter or Tab)" autocomplete="off" /></div></div>
        </form>
      </section>

      <nav class="view-tabs">
        <button type="button" class="view-tab active" data-view="reading-list">Reading List</button>
        <button type="button" class="view-tab" data-view="notes">Notes & Highlights</button>
      </nav>

      <div id="reading-list-view">
        <section class="search-section">
          <div class="search-shell" id="search-shell">
            <div class="search-token-list" id="search-token-list"></div>
            <input type="text" id="search-input" class="search-input" placeholder='Search or add filters like \`type article\` or \`website != "less"\`' autocomplete="off" />
            <button type="button" class="search-action-btn" id="save-view-open">Save view</button>
            <div class="search-suggestions" id="search-suggestions" aria-live="polite"></div>
          </div>
        </section>

        <section class="filters">
          <div class="filters-row">
            <div class="filter-dropdown" id="type-dropdown">
              <button type="button" class="filter-btn" id="type-filter-btn"><span class="filter-label">Type</span><span class="filter-value" id="type-filter-value">All</span><span class="filter-arrow">▾</span></button>
              <div class="dropdown-menu" id="type-menu">
                <div class="dropdown-search"><input type="text" placeholder="Search..." id="type-search" autocomplete="off" /></div>
                <div class="dropdown-options" id="type-options">
                  <label class="dropdown-option" data-value="article"><input type="checkbox" value="article" />Article</label>
                  <label class="dropdown-option" data-value="video"><input type="checkbox" value="video" />Video</label>
                  <label class="dropdown-option" data-value="pdf"><input type="checkbox" value="pdf" />PDF</label>
                  <label class="dropdown-option" data-value="ebook"><input type="checkbox" value="ebook" />Ebook</label>
                  <label class="dropdown-option" data-value="podcast"><input type="checkbox" value="podcast" />Podcast</label>
                </div>
                <div class="dropdown-actions"><button type="button" class="dropdown-clear" id="type-clear">Clear</button></div>
              </div>
            </div>

            <div class="filter-dropdown" id="tag-dropdown">
              <button type="button" class="filter-btn" id="tag-filter-btn"><span class="filter-label">Tags</span><span class="filter-value" id="tag-filter-value">All</span><span class="filter-arrow">▾</span></button>
              <div class="dropdown-menu" id="tag-menu">
                <div class="dropdown-search"><input type="text" placeholder="Search tags..." id="tag-search" autocomplete="off" /></div>
                <div class="dropdown-options" id="tag-options"></div>
                <div class="dropdown-actions"><button type="button" class="dropdown-clear" id="tag-clear">Clear</button></div>
              </div>
            </div>

            <div class="filter-dropdown" id="views-dropdown">
              <button type="button" class="filter-btn" id="views-filter-btn"><span class="filter-label">Views</span><span class="filter-value" id="views-filter-value">None</span><span class="filter-arrow">▾</span></button>
              <div class="dropdown-menu views-menu" id="views-menu"><div class="dropdown-options views-options" id="views-options"></div></div>
            </div>

            <div class="filter-dropdown" id="delete-dropdown">
              <button type="button" class="filter-btn delete-filter-btn" id="delete-filter-btn"><span class="filter-label">Delete all</span><span class="filter-arrow">▾</span></button>
              <div class="dropdown-menu delete-menu" id="delete-menu">
                <div class="delete-dropdown-heading">Match</div>
                <div class="dropdown-options delete-by-options" id="delete-by-options">
                  <button type="button" class="dropdown-option delete-choice-option" data-delete-by="tag">Tag</button>
                  <button type="button" class="dropdown-option delete-choice-option" data-delete-by="author">Author</button>
                  <button type="button" class="dropdown-option delete-choice-option" data-delete-by="domain">Website</button>
                  <button type="button" class="dropdown-option delete-choice-option" data-delete-by="type">Type</button>
                </div>
                <div class="delete-dropdown-heading">Value</div>
                <div class="dropdown-search delete-dropdown-search"><input type="text" id="delete-value-text" list="delete-value-suggestions" autocomplete="off" /></div>
                <div class="dropdown-options delete-value-options" id="delete-value-options"></div>
                <div class="dropdown-actions delete-dropdown-actions">
                  <button type="button" class="dropdown-clear" id="delete-clear">Clear</button>
                  <button type="button" class="btn-danger delete-confirm-btn" id="delete-confirm">Delete</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="filter-chips" id="filter-chips" style="display:none"></div>
        <section class="items-list" id="items-list"></section>
      </div>

      <div id="notes-view" style="display: none">
        <section class="notes-list" id="notes-list">
          <div class="empty-state"><p>No highlights yet</p><p class="empty-hint">Select text while reading to save highlights and notes</p></div>
        </section>
      </div>
    </div>`;
}
