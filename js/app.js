// js/app.js
// ============================================================
// Глобальный state, инициализация, навигация.
// Требует: utils.js, db.js, vendor/dexie.min.js.
// Должен грузиться ДО library.js, calendar.js и т.д.
// ============================================================

// ==== Глобальный state ====
// state.library / state.calendar / state.collections / state.wishlist —
// это КЕШ содержимого БД. Источник правды — IndexedDB. Кеш обновляется
// через sync*FromDb() после каждого изменения. Рендер-функции читают
// из кеша синхронно (быстро), а изменения всегда идут через БД.
const state = {
    currentPage: 'library',
    libraryViewMode: 'shelves',
    isEditingDetails: false,

    // Кеши (заполняются из БД)
    library: { reading: [], read: [], planned: [], paused: [], dropped: [] },
    calendar: {},
    collections: [],
    wishlist: [],

    // Контекст редактирования
    editContext: {
        category: null,
        index: null,
        bookId: null,
        isNew: false,
        isGrid: false,
        detailTarget: null,   // { source, category, index, bookId }
        moveSource: null,
        editListTarget: null
    },
    progressContext: null,
    impressionContext: null,
    quoteContext: null,

    // Откуда пришли в детали — для «Назад»
    detailsOrigin: 'library'
};

// ==== Иконки SVG ====
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
const ICON_SAVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// ==== Кеши авторов / жанров / тегов для автодополнения ====
let _authorCache = null;
let _genreCache = null;
let _tagCache = null;

function invalidateAuthorCache() { _authorCache = null; }
function invalidateGenreCache() { _genreCache = null; }
function invalidateTagsCache() { _tagCache = null; }

// ============================================================
// СИНХРОНИЗАЦИЯ STATE ← БД
// ============================================================

async function syncLibraryFromDb() {
    const library = { reading: [], read: [], planned: [], paused: [], dropped: [] };
    for (const cab of CABINETS) {
        library[cab] = new Array(TOTAL_SLOTS).fill(null);
    }
    const books = await getAllBooks();
    books.forEach(b => {
        if (library[b.cabinet] && b.slot >= 0 && b.slot < TOTAL_SLOTS) {
            library[b.cabinet][b.slot] = b;
        }
    });
    state.library = library;
}

async function syncCalendarFromDb() {
    const entries = await getAllCalendar();
    const map = {};
    entries.forEach(e => {
        if (e && e.date && Array.isArray(e.books)) {
            map[e.date] = e.books;
        }
    });
    state.calendar = map;
}

async function syncCollectionsFromDb() {
    state.collections = await getCollections();
}

async function syncWishlistFromDb() {
    state.wishlist = await getWishlists();
}

async function syncAllFromDb() {
    await Promise.all([
        syncLibraryFromDb(),
        syncCalendarFromDb(),
        syncCollectionsFromDb(),
        syncWishlistFromDb()
    ]);
    invalidateAuthorCache();
    invalidateGenreCache();
    invalidateTagsCache();
}

// ============================================================
// СИНХРОННЫЕ ГЕТТЕРЫ (по кешу state)
// ============================================================

function getAllAuthors() {
    if (_authorCache) return _authorCache;
    const authors = new Set();
    for (const cab of CABINETS) {
        for (const book of state.library[cab]) {
            if (!book || !book.author) continue;
            String(book.author).split(',').forEach(a => {
                const t = a.trim();
                if (t) authors.add(t);
            });
        }
    }
    _authorCache = Array.from(authors).sort((a, b) => a.localeCompare(b, 'ru'));
    return _authorCache;
}

function getAllGenres() {
    if (_genreCache) return _genreCache;
    const genres = new Set();
    for (const cab of CABINETS) {
        for (const book of state.library[cab]) {
            if (!book || !Array.isArray(book.genres)) continue;
            book.genres.forEach(g => { if (g) genres.add(g); });
        }
    }
    _genreCache = Array.from(genres).sort((a, b) => a.localeCompare(b, 'ru'));
    return _genreCache;
}

function getAllTags() {
    if (_tagCache) return _tagCache;
    const tags = new Set();
    for (const cab of CABINETS) {
        for (const book of state.library[cab]) {
            if (!book || !Array.isArray(book.tags)) continue;
            book.tags.forEach(t => { if (t) tags.add(t); });
        }
    }
    _tagCache = Array.from(tags).sort((a, b) => a.localeCompare(b, 'ru'));
    return _tagCache;
}

/**
 * Синхронный поиск книги по точному названию в кеше state.library.
 * Возвращает { book, category, index } или null.
 */
function findBookByTitleLocal(title) {
    if (!title) return null;
    for (const cab of CABINETS) {
        const slots = state.library[cab] || [];
        for (let i = 0; i < slots.length; i++) {
            if (slots[i] && slots[i].title === title) {
                return { book: slots[i], category: cab, index: i };
            }
        }
    }
    return null;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

async function init() {
    // 1. Готовим БД (миграция из localStorage, дефолтный wishlist)
    await initDb();

    // 2. Загружаем все данные в кеш state
    await syncAllFromDb();

    // 3. Инициализируем UI-компоненты (если функции уже загружены)
    if (typeof initPatternsGrid === 'function') initPatternsGrid();
    if (typeof initStarRating === 'function') initStarRating();

    // 4. Прогрев XLSX в фоне (не блокирует старт)
    fetchDbBooks().catch(() => {});

    // 5. Кнопки переключения вида
    const shelvesBtn = document.getElementById('view-shelves-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (shelvesBtn) shelvesBtn.classList.toggle('active', state.libraryViewMode === 'shelves');
    if (gridBtn) gridBtn.classList.toggle('active', state.libraryViewMode === 'grid');

    // 6. Первый рендер
    await renderLibrary();
    await navigateTo('library');

    // 7. Глобальные слушатели
    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, true);

    // 8. Пересинхронизация при возврате на вкладку
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            try {
                await syncAllFromDb();
                await renderLibrary();
            } catch (err) {
                console.warn('Ошибка фоновой синхронизации:', err);
            }
        }
    });

    console.log('🚀 Приложение запущено');
}

function handleGlobalClick(e) {
    if (!e.target.closest('.custom-select-wrapper')) {
        closeAllCustomDropdowns();
    }
    const menu = document.getElementById('context-menu');
    if (menu && !menu.contains(e.target)) menu.classList.remove('show');

    const wMenu = document.getElementById('wishlist-context-menu');
    if (wMenu && !wMenu.contains(e.target)) wMenu.classList.remove('show');

    document.querySelectorAll('.author-suggestions').forEach(dd => {
        if (!dd.parentElement.contains(e.target)) dd.classList.remove('show');
    });
}

function handleGlobalScroll(e) {
    if (e.target.closest && e.target.closest('.custom-select-options')) return;
    closeAllCustomDropdowns();
}

// ============================================================
// ПЕРЕКЛЮЧЕНИЕ ВИДА БИБЛИОТЕКИ
// ============================================================

async function switchLibraryView(mode) {
    state.libraryViewMode = mode;
    const shelvesBtn = document.getElementById('view-shelves-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (shelvesBtn) shelvesBtn.classList.toggle('active', mode === 'shelves');
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
    await renderLibrary();
}

// ============================================================
// САЙДБАР
// ============================================================

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
}

// ============================================================
// НАВИГАЦИЯ
// ============================================================

const PAGE_INDEX_MAP = {
    'library': 0,
    'reading-now': 1,
    'calendar': 2,
    'stats': 3,
    'collections': 4,
    'wishlist': 5,
    'recommendations': 6
};

async function navigateTo(pageId) {
    state.currentPage = pageId;

    // Переключаем активную страницу
    document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
    const pageEl = document.getElementById('page-' + pageId);
    if (pageEl) pageEl.classList.add('active');

    // Активный пункт меню
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    const menuItems = Array.from(document.querySelectorAll('.menu-item'));
    const idx = PAGE_INDEX_MAP[pageId];
    if (idx !== undefined && menuItems[idx]) {
        menuItems[idx].classList.add('active');
    }

    // Закрываем сайдбар
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) toggleSidebar();

    // Прячем плавающие элементы
    document.getElementById('context-menu').classList.remove('show');
    document.getElementById('wishlist-context-menu').classList.remove('show');
    closeAllCustomDropdowns();

    // Кнопки в топ-баре
    const topBackBtn = document.getElementById('top-back-btn');
    const topActionBtn = document.getElementById('top-action-btn');
    const viewShelvesBtn = document.getElementById('view-shelves-btn');
    const viewGridBtn = document.getElementById('view-grid-btn');

    if (pageId === 'library') {
        viewShelvesBtn.style.display = 'flex';
        viewGridBtn.style.display = 'flex';
    } else {
        viewShelvesBtn.style.display = 'none';
        viewGridBtn.style.display = 'none';
    }

    if (pageId === 'details') {
        topBackBtn.style.display = 'flex';
        topActionBtn.style.display = 'flex';
    } else {
        topBackBtn.style.display = 'none';
        topActionBtn.style.display = 'none';
    }

    // Рендер целевой страницы
    if (pageId === 'reading-now' && typeof renderReadingNow === 'function') {
        await renderReadingNow();
    }
    if (pageId === 'calendar' && typeof renderCalendar === 'function') {
        await renderCalendar();
    }
    if (pageId === 'stats' && typeof renderStats === 'function') {
        await renderStats();
    }
    if (pageId === 'collections' && typeof renderCollections === 'function') {
        await renderCollections();
    }
    if (pageId === 'wishlist' && typeof renderWishlist === 'function') {
        await renderWishlist();
    }
    if (pageId === 'recommendations' && typeof renderRecommendations === 'function') {
        await renderRecommendations();
    }

    // Обновляем hash для кнопки «Назад» Android-браузера
    updateUrlHash(pageId);
}

/**
 * Кнопка «Назад» в топ-баре (и будущая кнопка Android).
 * Для страницы details — возврат туда, откуда пришли (library/wishlist/calendar),
 * для остальных — в библиотеку.
 */
async function goBack() {
    if (state.currentPage === 'details') {
        await navigateTo(state.detailsOrigin || 'library');
    } else {
        await navigateTo('library');
    }
}

// ============================================================
// КНОПКА РЕДАКТИРОВАНИЯ НА СТРАНИЦЕ ДЕТАЛЕЙ
// ============================================================

async function handleDetailsAction() {
    const btn = document.getElementById('top-action-btn');
    if (!btn) return;

    if (state.isEditingDetails) {
        // Режим редактирования → сохранить
        if (typeof saveDetails === 'function') {
            await saveDetails();
        }
    } else {
        // Просмотр → перейти в редактирование
        state.isEditingDetails = true;
        document.getElementById('page-details').classList.add('edit-mode');
        btn.classList.add('active');
        btn.title = 'Сохранить';
        btn.innerHTML = ICON_SAVE;
        if (typeof refreshDetailsView === 'function') {
            await refreshDetailsView();
        }
    }
}

// ============================================================
// ЭКСПОРТ / ИМПОРТ
// ============================================================

async function exportData() {
    try {
        const data = await dumpAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `library_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
        console.error('Ошибка экспорта:', err);
        alert('Не удалось экспортировать данные: ' + err.message);
    }
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => alert('Не удалось прочитать файл');
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!confirm('Импорт полностью заменит текущую библиотеку, коллекции и списки желаний. Продолжить?')) {
                return;
            }
            await replaceAllData(data);
            await syncAllFromDb();
            await renderLibrary();
            await navigateTo(state.currentPage || 'library');
            alert('Импорт завершён успешно.');
        } catch (err) {
            console.error('Ошибка импорта:', err);
            alert('Ошибка импорта: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================================
// ХЕЛПЕР ДЛЯ БУДУЩЕЙ КНОПКИ «НАЗАД» ANDROID
// ============================================================

async function handleAndroidBack() {
    if (state.currentPage === 'details' || state.currentPage !== 'library') {
        await goBack();
        return true; // «съели» системную кнопку
    }
    return false; // обычное поведение — выйти из приложения
}

// Запуск
window.addEventListener('load', () => {
    init().catch(err => {
        console.error('Критическая ошибка запуска:', err);
        alert('Не удалось запустить приложение.\n' + err.message);
    });
});
