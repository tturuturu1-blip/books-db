// js/app.js
// ============================================================

const state = {
    currentPage: 'library',
    libraryViewMode: 'shelves',
    isEditingDetails: false,
    library: { reading: [], read: [], planned: [], paused: [], dropped: [] },
    calendar: {},
    collections: [],
    wishlist: [],
    editContext: { category: null, index: null, bookId: null, isNew: false, isGrid: false, detailTarget: null, moveSource: null, editListTarget: null },
    progressContext: null,
    impressionContext: null,
    quoteContext: null,
    detailsOrigin: 'library',
    searchQuery: ''
};

const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
const ICON_SAVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;

let _authorCache = null, _genreCache = null, _tagCache = null;
function invalidateAuthorCache() { _authorCache = null; }
function invalidateGenreCache() { _genreCache = null; }
function invalidateTagsCache() { _tagCache = null; }

async function syncLibraryFromDb() {
    const library = { reading: [], read: [], planned: [], paused: [], dropped: [] };
    const books = await getAllBooks();
    const maxSlots = { reading: -1, read: -1, planned: -1, paused: -1, dropped: -1 };
    
    books.forEach(b => {
        if (maxSlots[b.cabinet] !== undefined && b.slot >= 0) {
            if (b.slot > maxSlots[b.cabinet]) maxSlots[b.cabinet] = b.slot;
        }
    });

    for (const cab of CABINETS) {
        let slotsNeeded = Math.ceil((maxSlots[cab] + 1) / TOTAL_SLOTS) * TOTAL_SLOTS;
        if (slotsNeeded === 0) slotsNeeded = TOTAL_SLOTS;
        if (maxSlots[cab] + 1 >= slotsNeeded) slotsNeeded += TOTAL_SLOTS;
        library[cab] = new Array(slotsNeeded).fill(null);
    }

    books.forEach(b => {
        if (library[b.cabinet] && b.slot >= 0 && b.slot < library[b.cabinet].length) {
            library[b.cabinet][b.slot] = b;
        }
    });
    state.library = library;
}

async function syncCalendarFromDb() {
    const entries = await getAllCalendar();
    const map = {};
    entries.forEach(e => { if (e && e.date && Array.isArray(e.books)) map[e.date] = e.books; });
    state.calendar = map;
}

async function syncCollectionsFromDb() { state.collections = await getCollections(); }
async function syncWishlistFromDb() { state.wishlist = await getWishlists(); }

async function syncAllFromDb() {
    await Promise.all([syncLibraryFromDb(), syncCalendarFromDb(), syncCollectionsFromDb(), syncWishlistFromDb()]);
    invalidateAuthorCache(); invalidateGenreCache(); invalidateTagsCache();
}

function getAllAuthors() {
    if (_authorCache) return _authorCache;
    const authors = new Set();
    for (const cab of CABINETS) for (const book of state.library[cab]) {
        if (!book || !book.author) continue;
        String(book.author).split(',').forEach(a => { const t = a.trim(); if (t) authors.add(t); });
    }
    _authorCache = Array.from(authors).sort((a, b) => a.localeCompare(b, 'ru'));
    return _authorCache;
}
function getAllGenres() {
    if (_genreCache) return _genreCache;
    const genres = new Set();
    for (const cab of CABINETS) for (const book of state.library[cab]) {
        if (!book || !Array.isArray(book.genres)) continue;
        book.genres.forEach(g => { if (g) genres.add(g); });
    }
    _genreCache = Array.from(genres).sort((a, b) => a.localeCompare(b, 'ru'));
    return _genreCache;
}
function getAllTags() {
    if (_tagCache) return _tagCache;
    const tags = new Set();
    for (const cab of CABINETS) for (const book of state.library[cab]) {
        if (!book || !Array.isArray(book.tags)) continue;
        book.tags.forEach(t => { if (t) tags.add(t); });
    }
    _tagCache = Array.from(tags).sort((a, b) => a.localeCompare(b, 'ru'));
    return _tagCache;
}
function findBookByTitleLocal(title) {
    if (!title) return null;
    for (const cab of CABINETS) {
        const slots = state.library[cab] || [];
        for (let i = 0; i < slots.length; i++) {
            if (slots[i] && slots[i].title === title) return { book: slots[i], category: cab, index: i };
        }
    }
    return null;
}

async function initAppAfterAuth() {
    try { await initDb(); } catch (e) { console.error('Ошибка инициализации БД:', e); }
    try { await syncAllFromDb(); } catch (e) { console.error('Ошибка загрузки данных:', e); }
    
    if (typeof syncAll === 'function') syncAll(); 
    if (typeof fetchDbBooks === 'function') fetchDbBooks().catch(() => {});

    if (typeof initPatternsGrid === 'function') initPatternsGrid();
    if (typeof initStarRating === 'function') initStarRating();
    loadTheme();
    
    const shelvesBtn = document.getElementById('view-shelves-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (shelvesBtn) shelvesBtn.classList.toggle('active', state.libraryViewMode === 'shelves');
    if (gridBtn) gridBtn.classList.toggle('active', state.libraryViewMode === 'grid');

    await renderLibrary();
    await navigateTo('library');

    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, true);
    
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) { await syncAllFromDb(); await renderLibrary(); }
    });
}

function resetAppState() {
    state.library = { reading: [], read: [], planned: [], paused: [], dropped: [] };
    state.calendar = {}; state.collections = []; state.wishlist = [];
    document.getElementById('page-library').classList.add('active');
}

function handleGlobalClick(e) {
    if (!e.target.closest('.custom-select-wrapper')) closeAllCustomDropdowns();
    const menu = document.getElementById('context-menu');
    if (menu && !menu.contains(e.target)) menu.classList.remove('show');
    const wMenu = document.getElementById('wishlist-context-menu');
    if (wMenu && !wMenu.contains(e.target)) wMenu.classList.remove('show');
    document.querySelectorAll('.author-suggestions').forEach(dd => {
        if (!dd.parentElement.contains(e.target)) dd.classList.remove('show');
    });
    
    // Закрываем поиск при клике вне его
    const searchDropdown = document.getElementById('search-results-dropdown');
    if (searchDropdown && !e.target.closest('.search-container')) {
        searchDropdown.classList.remove('show');
    }
}
function handleGlobalScroll(e) {
    if (e.target.closest && e.target.closest('.custom-select-options')) return;
    closeAllCustomDropdowns();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
}

const PAGE_INDEX_MAP = { 'library': 0, 'reading-now': 1, 'calendar': 2, 'stats': 3, 'collections': 4, 'wishlist': 5, 'recommendations': 6 };

async function navigateTo(pageId) {
    state.currentPage = pageId;
    document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
    const pageEl = document.getElementById('page-' + pageId);
    if (pageEl) pageEl.classList.add('active');
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    
    const menuItems = Array.from(document.querySelectorAll('.menu-item'));
    const idx = PAGE_INDEX_MAP[pageId];
    if (idx !== undefined && menuItems[idx]) menuItems[idx].classList.add('active');

    if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
    document.getElementById('context-menu').classList.remove('show');
    document.getElementById('wishlist-context-menu').classList.remove('show');
    closeAllCustomDropdowns();

    const topBackBtn = document.getElementById('top-back-btn');
    const topActionBtn = document.getElementById('top-action-btn');
    
    // Поиск больше не скрывается, убрали строку searchContainer.style.display = ...

    if (pageId === 'details') {
        topBackBtn.style.display = 'flex'; topActionBtn.style.display = 'flex';
    } else {
        topBackBtn.style.display = 'none'; topActionBtn.style.display = 'none';
    }

    if (pageId === 'reading-now' && typeof renderReadingNow === 'function') await renderReadingNow();
    if (pageId === 'calendar' && typeof renderCalendar === 'function') await renderCalendar();
    if (pageId === 'stats' && typeof renderStats === 'function') await renderStats();
    if (pageId === 'collections' && typeof renderCollections === 'function') await renderCollections();
    if (pageId === 'wishlist' && typeof renderWishlist === 'function') await renderWishlist();
    if (pageId === 'recommendations' && typeof renderRecommendations === 'function') await renderRecommendations();
    if (typeof updateUrlHash === 'function') updateUrlHash(pageId);
}

async function goBack() {
    if (state.currentPage === 'details') await navigateTo(state.detailsOrigin || 'library');
    else await navigateTo('library');
}

async function handleDetailsAction() {
    const btn = document.getElementById('top-action-btn');
    if (!btn) return;
    if (state.isEditingDetails) {
        if (typeof saveDetails === 'function') await saveDetails();
    } else {
        state.isEditingDetails = true;
        document.getElementById('page-details').classList.add('edit-mode');
        btn.classList.add('active'); btn.title = 'Сохранить'; btn.innerHTML = ICON_SAVE;
        if (typeof refreshDetailsView === 'function') await refreshDetailsView();
    }
}

async function switchLibraryView(mode) {
    state.libraryViewMode = mode;
    const shelvesBtn = document.getElementById('view-shelves-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (shelvesBtn) shelvesBtn.classList.toggle('active', mode === 'shelves');
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
    await renderLibrary();
}

async function manualSync() {
    const btn = document.getElementById('refresh-btn');
    if (!btn || btn.disabled) return;
    btn.disabled = true; btn.style.opacity = '0.5';
    if (typeof showToast === 'function') showToast('Синхронизация...', 'info');

    try {
        if (typeof syncAll === 'function') await syncAll();
        await syncAllFromDb();
        await renderLibrary();
        if (state.currentPage === 'stats' && typeof renderStats === 'function') await renderStats();
        if (state.currentPage === 'calendar' && typeof renderCalendar === 'function') await renderCalendar();
        if (state.currentPage === 'wishlist' && typeof renderWishlist === 'function') await renderWishlist();
        if (typeof showToast === 'function') showToast('Данные обновлены', 'success');
    } catch (err) {
        console.error('Ошибка синхронизации:', err);
        if (typeof showToast === 'function') showToast('Ошибка: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.style.opacity = '1';
    }
}

function loadTheme() {
    const isDark = localStorage.getItem('theme') === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    updateThemeBtn(isDark);
}
function toggleTheme() {
    const isDark = !document.body.classList.contains('dark-theme');
    document.body.classList.toggle('dark-theme', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeBtn(isDark);
    if (typeof syncSettings === 'function' && currentUser) syncSettings(currentUser.id);
}
function updateThemeBtn(isDark) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = isDark ? '☀️ Светлая тема' : '🌙 Тёмная тема';
}

function openGoalModal() {
    const goal = parseInt(localStorage.getItem('readingGoal')) || 0;
    document.getElementById('goal-input').value = goal || '';
    document.getElementById('goal-modal').style.display = 'flex';
}
function closeGoalModal() { document.getElementById('goal-modal').style.display = 'none'; }
function saveGoal() {
    const goal = parseInt(document.getElementById('goal-input').value) || 0;
    localStorage.setItem('readingGoal', goal);
    closeGoalModal();
    if (typeof renderStats === 'function') renderStats();
    if (typeof syncSettings === 'function' && currentUser) syncSettings(currentUser.id);
    if (typeof showToast === 'function') showToast('Цель обновлена', 'success');
}

// ============================================================
// ПОИСК ПО БИБЛИОТЕКЕ (АВТОДОПОЛНЕНИЕ)
// ============================================================
const _handleGlobalSearchDebounced = debounce((query) => {
    const dropdown = document.getElementById('search-results-dropdown');
    if (!dropdown) return;
    
    query = query.toLowerCase().trim();
    if (query.length < 2) {
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        return;
    }

    const results = [];
    for (const cab of CABINETS) {
        const books = state.library[cab] || [];
        books.forEach((book, index) => {
            if (!book) return;
            const titleMatch = book.title && book.title.toLowerCase().includes(query);
            const authorMatch = book.author && book.author.toLowerCase().includes(query);
            if (titleMatch || authorMatch) {
                results.push({ book, cabinet: cab, index });
            }
        });
    }

    if (results.length === 0) {
        dropdown.innerHTML = '<div style="padding: 15px; text-align: center; color: #888;">Ничего не найдено</div>';
        dropdown.classList.add('show');
        return;
    }

    dropdown.innerHTML = results.slice(0, 10).map(r => {
        let coverHtml = '';
        if (r.book.cover) {
            coverHtml = `<img src="${escapeHtml(r.book.cover)}" class="search-result-cover" alt="">`;
        } else {
            const textColor = getContrastTextColor(r.book.color);
            const shortTitle = escapeHtml(r.book.title.substring(0, 10)) + '...';
            coverHtml = `<div class="search-result-cover" style="background-color:${r.book.color || '#eee'}; color:${textColor};">${shortTitle}</div>`;
        }
        return `
            <div class="search-result-item" onclick="goToBookFromSearch('${r.cabinet}', ${r.index})">
                ${coverHtml}
                <div class="search-result-info">
                    <div class="search-result-title">${escapeHtml(r.book.title)}</div>
                    <div class="search-result-author">${escapeHtml(r.book.author || 'Неизвестен')}</div>
                </div>
            </div>
        `;
    }).join('');
    
    dropdown.classList.add('show');
}, 300);

function handleGlobalSearch(query) {
    _handleGlobalSearchDebounced(query);
}

async function goToBookFromSearch(cabinet, index) {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results-dropdown').classList.remove('show');
    if (typeof openDetails === 'function') {
        await openDetails(cabinet, index);
    }
}

async function exportData() {
    try {
        const data = await dumpAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `library_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { if (typeof showToast === 'function') showToast('Ошибка экспорта', 'error'); }
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!await showConfirm('Импорт', 'Импорт заменит текущую библиотеку. Продолжить?')) return;
            await replaceAllData(data);
            await syncAllFromDb();
            await renderLibrary();
            await navigateTo(state.currentPage || 'library');
            if (typeof syncAll === 'function') syncAll();
            if (typeof showToast === 'function') showToast('Импорт завершён', 'success');
        } catch (err) { if (typeof showToast === 'function') showToast('Ошибка импорта', 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

window.addEventListener('load', async () => {
    setTimeout(async () => {
        if (typeof checkSession === 'function') await checkSession();
    }, 100);
});
