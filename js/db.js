// js/db.js
// ============================================================
// Слой данных: Dexie (IndexedDB), миграция из localStorage,
// загрузка базы книг из XLSX. Требует utils.js и vendor/dexie.min.js.
// ============================================================

// ==== Константы структуры библиотеки ====
const CABINETS = ['reading', 'read', 'planned', 'paused', 'dropped'];
const CABINET_LABELS = {
    reading: 'Читаю',
    read: 'Прочитано',
    planned: 'В планах',
    paused: 'На паузе',
    dropped: 'Брошено'
};
const SHELVES_PER_CABINET = 6;
const SLOTS_PER_SHELF = 7;
const TOTAL_SLOTS = SHELVES_PER_CABINET * SLOTS_PER_SHELF; // 42

// Ключ старого хранилища — нужен только для миграции
const LEGACY_STORAGE_KEY = 'readingDiaryData_v7';
const MIGRATION_KEY = 'migrated_v1';

// ==== Инстанс базы ====
// *genres и *tags — multiEntry-индексы для массивов, позволяют
// быстро находить книги по жанру/тегу в stats.js.
const db = new Dexie('ReadingDiaryDB');

db.version(1).stores({
    books: '++id, cabinet, slot, title, author, *genres, *tags, rating, startDate, endDate, createdAt',
    calendar: 'date',
    collections: '++id, name',
    wishlists: '++id, name',
    meta: 'key'
});

// ============================================================
// МИГРАЦИЯ ИЗ localStorage
// ============================================================
/**
 * Однократно переносит данные из старого localStorage-формата в Dexie.
 * После успешного переноса ставит флаг meta.migrated_v1 = true,
 * чтобы при следующем запуске миграция не повторялась.
 *
 * Старый формат НЕ удаляется — оставлен как страховка (на случай,
 * если что-то пойдёт не так и нужно будет откатиться).
 */
async function migrateFromLocalStorage() {
    const flag = await db.meta.get(MIGRATION_KEY);
    if (flag && flag.value) return;

    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
        // Нечего мигрировать — просто помечаем, что проверка выполнена
        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
        return;
    }

    let oldState;
    try {
        oldState = JSON.parse(raw);
    } catch (err) {
        console.error('Не удалось разобрать localStorage:', err);
        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now(), error: String(err) });
        return;
    }

    const now = Date.now();
    const bookRecords = [];

    // --- Книги ---
    const library = oldState.library || {};
    for (const cab of CABINETS) {
        const slots = Array.isArray(library[cab]) ? library[cab] : [];
        for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
            const old = slots[slotIndex];
            if (!old || !old.title) continue;

            const d = old.details || {};

            // Жанры и теги: в старом формате это строка через запятую,
            // в новом — массив (нужен для multiEntry-индекса).
            const genres = Array.isArray(d.genres)
                ? d.genres.filter(Boolean)
                : (typeof d.genres === 'string'
                    ? d.genres.split(',').map(g => g.trim()).filter(Boolean)
                    : []);
            const tags = Array.isArray(d.tags)
                ? d.tags.filter(Boolean)
                : (typeof d.tags === 'string'
                    ? d.tags.split(',').map(t => t.trim()).filter(Boolean)
                    : []);

            bookRecords.push({
                cabinet: cab,
                slot: slotIndex,
                title: String(old.title || ''),
                author: String(old.author || ''),
                color: old.color || '#fcfaf5',
                pattern: old.pattern || '',
                cover: d.cover || '',
                spineImage: old.spineImage || '',
                rating: Number(d.rating) || 0,
                genres,
                tags,
                series: d.series || '',
                subseries: d.subseries || '',
                volume: Number(d.volume) || 0,
                year: d.year || '',
                country: d.country || '',
                format: d.format || '',
                startDate: d.startDate || '',
                endDate: d.endDate || '',
                annotation: d.annotation || '',
                summary: d.summary || '',
                timeline: d.timeline || '',
                worldMap: d.worldMap || '',
                impressions: Array.isArray(d.impressions) ? d.impressions : [],
                quotes: Array.isArray(d.quotes) ? d.quotes : [],
                characters: Array.isArray(d.characters) ? d.characters : [],
                terms: Array.isArray(d.terms) ? d.terms : [],
                dailyProgress: (d.dailyProgress && typeof d.dailyProgress === 'object') ? d.dailyProgress : {},
                createdAt: now,
                updatedAt: now
            });
        }
    }

    // --- Календарь ---
    const calendarRecords = [];
    const oldCalendar = oldState.calendar || {};
    for (const date of Object.keys(oldCalendar)) {
        let entries = oldCalendar[date];
        if (typeof entries === 'string') entries = [entries];
        if (!Array.isArray(entries)) continue;
        const unique = [...new Set(entries.filter(t => typeof t === 'string' && t.trim()))];
        if (unique.length > 0) {
            calendarRecords.push({ date, books: unique });
        }
    }

    // --- Коллекции ---
    const collectionRecords = (Array.isArray(oldState.collections) ? oldState.collections : []).map(c => ({
        name: String(c.name || 'Без названия'),
        books: Array.isArray(c.books) ? c.books.filter(Boolean) : []
    }));

    // --- Списки желаний ---
    // Старый код иногда хранил книги как строки (очень старый формат) — нормализуем.
    const wishlistRecords = (Array.isArray(oldState.wishlist) ? oldState.wishlist : []).map(w => {
        const normBook = (b) => {
            if (typeof b === 'string') {
                return {
                    id: 'book_' + Date.now() + Math.random().toString(36).slice(2, 9),
                    title: b,
                    author: 'Неизвестен',
                    cover: ''
                };
            }
            if (b && typeof b === 'object' && b.title) {
                return {
                    id: b.id || ('book_' + Date.now() + Math.random().toString(36).slice(2, 9)),
                    title: b.title,
                    author: b.author || '',
                    cover: b.cover || ''
                };
            }
            return null;
        };
        return {
            name: String(w.name || 'Список'),
            books: (Array.isArray(w.books) ? w.books : []).map(normBook).filter(Boolean),
            completed: (Array.isArray(w.completed) ? w.completed : []).map(normBook).filter(Boolean)
        };
    });

    // --- Запись в одну транзакцию (атомарно) ---
    try {
        await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists, db.meta], async () => {
            if (bookRecords.length) await db.books.bulkAdd(bookRecords);
            if (calendarRecords.length) await db.calendar.bulkAdd(calendarRecords);
            if (collectionRecords.length) await db.collections.bulkAdd(collectionRecords);
            if (wishlistRecords.length) await db.wishlists.bulkAdd(wishlistRecords);
            await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
        });
        console.log(
            `✅ Миграция: ${bookRecords.length} книг, ` +
            `${calendarRecords.length} записей календаря, ` +
            `${collectionRecords.length} коллекций, ` +
            `${wishlistRecords.length} списков`
        );
    } catch (err) {
        console.error('Миграция не удалась, данные в localStorage сохранены:', err);
        // Не ставим флаг — попробуем при следующем запуске
        throw err;
    }
}

// ============================================================
// ДЕФОЛТНЫЙ СПИСОК ЖЕЛАНИЙ
// ============================================================
async function ensureDefaultWishlist() {
    const count = await db.wishlists.count();
    if (count === 0) {
        await db.wishlists.add({
            name: 'Хочу купить',
            books: [],
            completed: []
        });
    }
}

// ============================================================
// ЗАГРУЗКА book_info.xlsx (с кешем)
// ============================================================
let cachedDbBooks = null;
let dbFetchPromise = null;

/**
 * Лениво грузит book_info.xlsx, парсит через SheetJS и кеширует.
 * Повторные вызовы возвращают тот же массив (или тот же промис,
 * пока идёт загрузка).
 */
async function fetchDbBooks(forceReload = false) {
    if (forceReload) {
        cachedDbBooks = null;
        dbFetchPromise = null;
    }
    if (cachedDbBooks) return cachedDbBooks;
    if (dbFetchPromise) return dbFetchPromise;

    dbFetchPromise = (async () => {
        try {
            if (typeof XLSX === 'undefined') {
                throw new Error('Библиотека XLSX не загружена (проверьте vendor/xlsx.full.min.js)');
            }
            const res = await fetch('book_info.xlsx');
            if (!res.ok) throw new Error('Ошибка загрузки XLSX: HTTP ' + res.status);

            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            cachedDbBooks = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            console.log(`✅ book_info.xlsx загружена: ${cachedDbBooks.length} строк`);
            return cachedDbBooks;
        } catch (err) {
            console.error('Не удалось загрузить базу книг:', err);
            dbFetchPromise = null; // позволит повторить попытку
            return [];
        }
    })();

    return dbFetchPromise;
}

// ============================================================
// CRUD: КНИГИ
// ============================================================

/** Все книги в шкафу, отсортированные по позиции на полке. */
async function getBooksByCabinet(cabinet) {
    const books = await db.books.where('cabinet').equals(cabinet).toArray();
    return books.sort((a, b) => a.slot - b.slot);
}

/** Все книги вообще (для статистики и рекомендаций). */
async function getAllBooks() {
    return db.books.toArray();
}

/**
 * Возвращает массив из TOTAL_SLOTS ячеек (null или book) для шкафа.
 * Нужно для рендера полок в стиле «сетка с пустыми слотами».
 */
async function getCabinetGrid(cabinet) {
    const books = await getBooksByCabinet(cabinet);
    const grid = new Array(TOTAL_SLOTS).fill(null);
    books.forEach(b => {
        if (b.slot >= 0 && b.slot < TOTAL_SLOTS) {
            grid[b.slot] = b;
        }
    });
    return grid;
}

/**
 * Сохраняет книгу. Если book.id есть — обновляет, иначе — создаёт.
 * Возвращает id.
 */
async function saveBookRecord(book) {
    const now = Date.now();
    book.updatedAt = now;
    if (!book.createdAt) book.createdAt = now;

    if (book.id) {
        await db.books.put(book);
        return book.id;
    }
    // Отделяем id, чтобы Dexie сам его сгенерировал
    const { id, ...rest } = book;
    return await db.books.add(rest);
}

/** Удаление книги по id. */
async function deleteBookRecord(id) {
    await db.books.delete(id);
}

/** Поиск первой книги по точному названию (для календаря). */
async function findBookByTitle(title) {
    if (!title) return null;
    const matches = await db.books.where('title').equals(title).toArray();
    return matches[0] || null;
}

/**
 * Обмен позиций двух книг (drag & drop на полках).
 * Если один из id = null — просто перемещаем книгу в пустой слот.
 */
async function swapBookSlots(bookA, slotB, cabinetB) {
    if (!bookA) return;
    await db.books.update(bookA.id, {
        slot: slotB,
        cabinet: cabinetB,
        updatedAt: Date.now()
    });
}

// ============================================================
// CRUD: КАЛЕНДАРЬ
// ============================================================

/** Запись календаря на конкретную дату ('YYYY-MM-DD') или undefined. */
async function getCalendarEntry(date) {
    return db.calendar.get(date);
}

/** Возвращает массив названий книг на дате (пустой, если нет записи). */
async function getCalendarTitles(date) {
    const entry = await db.calendar.get(date);
    return entry && Array.isArray(entry.books) ? entry.books : [];
}

/** Записывает массив названий на дату. Пустой массив = удаление записи. */
async function setCalendarTitles(date, titles) {
    const unique = [...new Set((titles || []).filter(t => t && t.trim()))];
    if (unique.length === 0) {
        await db.calendar.delete(date);
    } else {
        await db.calendar.put({ date, books: unique });
    }
}

/** Все записи календаря (для статистики по месяцам). */
async function getAllCalendar() {
    return db.calendar.toArray();
}

// ============================================================
// CRUD: КОЛЛЕКЦИИ
// ============================================================

async function getCollections() {
    return db.collections.toArray();
}

async function saveCollection(collection) {
    if (collection.id) {
        await db.collections.put(collection);
        return collection.id;
    }
    const { id, ...rest } = collection;
    return await db.collections.add(rest);
}

async function deleteCollection(id) {
    await db.collections.delete(id);
}

// ============================================================
// CRUD: WISHLIST
// ============================================================

async function getWishlists() {
    return db.wishlists.toArray();
}

async function saveWishlist(wishlist) {
    if (wishlist.id) {
        await db.wishlists.put(wishlist);
        return wishlist.id;
    }
    const { id, ...rest } = wishlist;
    return await db.wishlists.add(rest);
}

async function deleteWishlist(id) {
    await db.wishlists.delete(id);
}

// ============================================================
// ЭКСПОРТ / ИМПОРТ (используется в app.js)
// ============================================================

/**
 * Собирает всё содержимое базы в один объект — для экспорта в JSON.
 */
async function dumpAllData() {
    const [books, calendar, collections, wishlists] = await Promise.all([
        db.books.toArray(),
        db.calendar.toArray(),
        db.collections.toArray(),
        db.wishlists.toArray()
    ]);
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        books,
        calendar,
        collections,
        wishlists
    };
}

/**
 * Полностью заменяет содержимое базы данными из JSON.
 * Вызывающий код должен предварительно подтвердить действие.
 */
async function replaceAllData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Некорректный формат файла');
    }
    const books = Array.isArray(data.books) ? data.books : [];
    const calendar = Array.isArray(data.calendar) ? data.calendar : [];
    const collections = Array.isArray(data.collections) ? data.collections : [];
    const wishlists = Array.isArray(data.wishlists) ? data.wishlists : [];

    await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists, db.meta], async () => {
        await db.books.clear();
        await db.calendar.clear();
        await db.collections.clear();
        await db.wishlists.clear();

        if (books.length) await db.books.bulkAdd(books);
        if (calendar.length) await db.calendar.bulkAdd(calendar);
        if (collections.length) await db.collections.bulkAdd(collections);
        if (wishlists.length) await db.wishlists.bulkAdd(wishlists);

        // Не сбрасываем migrated_v1 — миграция из localStorage уже не нужна
        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
    });

    // Сбрасываем кеши в других модулях
    if (typeof invalidateAuthorCache === 'function') invalidateAuthorCache();
    if (typeof invalidateGenresCache === 'function') invalidateGenresCache();
    if (typeof invalidateTagsCache === 'function') invalidateTagsCache();
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
async function initDb() {
    try {
        await migrateFromLocalStorage();
        await ensureDefaultWishlist();
        // Прогреваем кеш XLSX в фоне — не блокирует запуск
        fetchDbBooks().catch(() => {});
        console.log('✅ База данных готова');
    } catch (err) {
        console.error('❌ Ошибка инициализации БД:', err);
        alert('Не удалось инициализировать базу данных.\n' + err.message);
    }
}
