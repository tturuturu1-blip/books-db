// js/db.js
// ============================================================
// Слой данных: Dexie (IndexedDB), миграция из localStorage,
// загрузка базы книг из XLSX.
// ============================================================

const CABINETS = ['reading', 'read', 'planned', 'paused', 'dropped'];
const CABINET_LABELS = { reading: 'Читаю', read: 'Прочитано', planned: 'В планах', paused: 'На паузе', dropped: 'Брошено' };

// ИЗМЕНЕНО: теперь по 4 полки в шкафу
const SHELVES_PER_CABINET = 4; 
const SLOTS_PER_SHELF = 7;
const TOTAL_SLOTS = SHELVES_PER_CABINET * SLOTS_PER_SHELF; // 28 слотов в одном шкафу

const LEGACY_STORAGE_KEY = 'readingDiaryData_v7';
const MIGRATION_KEY = 'migrated_v1';

const db = new Dexie('ReadingDiaryDB');

// ВЕРСИЯ 1: Старая схема (с автоинкрементными ID)
db.version(1).stores({
    books: '++id, cabinet, slot, title, author, *genres, *tags, rating, startDate, endDate, createdAt',
    calendar: 'date',
    collections: '++id, name',
    wishlists: '++id, name',
    meta: 'key'
});

// ВЕРСИЯ 2: Новая схема (с UUID для облака)
db.version(2).stores({
    books: 'id, cabinet, slot, title, author, *genres, *tags, rating, startDate, endDate, createdAt, updatedAt',
    calendar: 'date',
    collections: 'id, name, updatedAt',
    wishlists: 'id, name, updatedAt',
    meta: 'key'
}).upgrade(async tx => {
    // Конвертируем старые числовые ID в строковые UUID при обновлении
    const fixTable = async (tableName) => {
        const items = await tx.table(tableName).toArray();
        for (let item of items) {
            if (typeof item.id === 'number' || (typeof item.id === 'string' && item.id.length < 10)) {
                const newId = generateUUID();
                await tx.table(tableName).delete(item.id);
                item.id = newId;
                if (!item.updatedAt) item.updatedAt = item.createdAt || Date.now();
                await tx.table(tableName).put(item);
            }
        }
    };
    await fixTable('books');
    await fixTable('collections');
    await fixTable('wishlists');
});

// ============================================================
// МИГРАЦИЯ ИЗ localStorage
// ============================================================
async function migrateFromLocalStorage() {
    const flag = await db.meta.get(MIGRATION_KEY);
    if (flag && flag.value) return;
    
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
        return;
    }
    
    let oldState;
    try { oldState = JSON.parse(raw); } catch (err) { return; }
    
    const now = Date.now();
    const bookRecords = [];
    const library = oldState.library || {};
    
    for (const cab of CABINETS) {
        const slots = Array.isArray(library[cab]) ? library[cab] : [];
        for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
            const old = slots[slotIndex];
            if (!old || !old.title) continue;
            const d = old.details || {};
            const genres = Array.isArray(d.genres) ? d.genres : (typeof d.genres === 'string' ? d.genres.split(',').map(g => g.trim()).filter(Boolean) : []);
            const tags = Array.isArray(d.tags) ? d.tags : (typeof d.tags === 'string' ? d.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
            
            bookRecords.push({
                id: generateUUID(), cabinet: cab, slot: slotIndex, title: old.title, author: old.author || '',
                color: old.color || '#fcfaf5', pattern: old.pattern || '', cover: d.cover || '', spineImage: old.spineImage || '',
                rating: Number(d.rating) || 0, genres, tags, series: d.series || '', subseries: d.subseries || '',
                volume: Number(d.volume) || 0, year: d.year || '', country: d.country || '', format: d.format || '',
                startDate: d.startDate || '', endDate: d.endDate || '', annotation: d.annotation || '',
                summary: d.summary || '', timeline: d.timeline || '', worldMap: d.worldMap || '',
                impressions: Array.isArray(d.impressions) ? d.impressions : [], quotes: Array.isArray(d.quotes) ? d.quotes : [],
                characters: Array.isArray(d.characters) ? d.characters : [], terms: Array.isArray(d.terms) ? d.terms : [],
                dailyProgress: d.dailyProgress || {}, createdAt: now, updatedAt: now
            });
        }
    }

    const calendarRecords = [];
    const oldCalendar = oldState.calendar || {};
    for (const date of Object.keys(oldCalendar)) {
        let entries = oldCalendar[date];
        if (typeof entries === 'string') entries = [entries];
        if (!Array.isArray(entries)) continue;
        const unique = [...new Set(entries.filter(t => typeof t === 'string' && t.trim()))];
        if (unique.length > 0) calendarRecords.push({ date, books: unique });
    }

    const collectionRecords = (Array.isArray(oldState.collections) ? oldState.collections : []).map(c => ({
        id: generateUUID(), name: c.name || 'Без названия', books: c.books || [], updatedAt: now
    }));

    const wishlistRecords = (Array.isArray(oldState.wishlist) ? oldState.wishlist : []).map(w => {
        const normBook = (b) => {
            if (typeof b === 'string') return { id: generateUUID(), title: b, author: 'Неизвестен', cover: '' };
            if (b && typeof b === 'object' && b.title) return { id: b.id || generateUUID(), title: b.title, author: b.author || '', cover: b.cover || '' };
            return null;
        };
        return { id: generateUUID(), name: w.name || 'Список', books: (w.books || []).map(normBook).filter(Boolean), completed: (w.completed || []).map(normBook).filter(Boolean), updatedAt: now };
    });

    try {
        await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists, db.meta], async () => {
            if (bookRecords.length) await db.books.bulkAdd(bookRecords);
            if (calendarRecords.length) await db.calendar.bulkAdd(calendarRecords);
            if (collectionRecords.length) await db.collections.bulkAdd(collectionRecords);
            if (wishlistRecords.length) await db.wishlists.bulkAdd(wishlistRecords);
            await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
        });
    } catch (err) { console.error('Миграция не удалась:', err); }
}

async function ensureDefaultWishlist() {
    const count = await db.wishlists.count();
    if (count === 0) {
        await db.wishlists.add({ id: generateUUID(), name: 'Хочу купить', books: [], completed: [], updatedAt: Date.now() });
    }
}

// ============================================================
// КНИГИ
// ============================================================
async function getAllBooks() {
    return await db.books.toArray();
}

async function getBooksByCabinet(cabinet) {
    const books = await db.books.where('cabinet').equals(cabinet).toArray();
    return books.sort((a, b) => a.slot - b.slot);
}

async function getCabinetGrid(cabinet) {
    const books = await getBooksByCabinet(cabinet);
    const grid = new Array(TOTAL_SLOTS).fill(null);
    books.forEach(b => {
        if (b.slot >= 0 && b.slot < TOTAL_SLOTS) grid[b.slot] = b;
    });
    return grid;
}

async function saveBookRecord(book) {
    const now = Date.now();
    book.updatedAt = now;
    if (!book.createdAt) book.createdAt = now;

    if (book.id) {
        await db.books.put(book);
        return book.id;
    }
    const { id, ...rest } = book;
    return await db.books.add(rest);
}

async function deleteBookRecord(id) {
    await db.books.delete(id);
}

async function swapBookSlots(bookA, slotB, cabinetB) {
    if (!bookA) return;
    await db.books.update(bookA.id, { slot: slotB, cabinet: cabinetB, updatedAt: Date.now() });
}

// ============================================================
// КАЛЕНДАРЬ
// ============================================================
async function getCalendarEntry(date) { return db.calendar.get(date); }

async function getCalendarTitles(date) {
    const entry = await db.calendar.get(date);
    return entry && Array.isArray(entry.books) ? entry.books : [];
}

async function setCalendarTitles(date, titles) {
    const unique = [...new Set((titles || []).filter(t => t && t.trim()))];
    if (unique.length === 0) {
        await db.calendar.delete(date);
    } else {
        await db.calendar.put({ date, books: unique });
    }
}

async function getAllCalendar() {
    return db.calendar.toArray();
}

// ============================================================
// КОЛЛЕКЦИИ
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
// WISHLIST
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
// XLSX БАЗА (поиск)
// ============================================================
let cachedDbBooks = null;
let dbFetchPromise = null;

async function fetchDbBooks(forceReload = false) {
    if (forceReload) { cachedDbBooks = null; dbFetchPromise = null; }
    if (cachedDbBooks) return cachedDbBooks;
    if (dbFetchPromise) return dbFetchPromise;
    
    dbFetchPromise = (async () => {
        try {
            if (typeof XLSX === 'undefined') throw new Error('XLSX не загружен');
            const res = await fetch('book_info.xlsx');
            if (!res.ok) throw new Error('Ошибка загрузки XLSX: ' + res.status);
            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            cachedDbBooks = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            return cachedDbBooks;
        } catch (err) {
            console.error('Не удалось загрузить базу книг:', err);
            dbFetchPromise = null;
            return [];
        }
    })();
    return dbFetchPromise;
}

// ============================================================
// ЭКСПОРТ / ИМПОРТ
// ============================================================
async function dumpAllData() {
    const [books, calendar, collections, wishlists] = await Promise.all([
        db.books.toArray(), db.calendar.toArray(), db.collections.toArray(), db.wishlists.toArray()
    ]);
    return { version: 1, exportedAt: new Date().toISOString(), books, calendar, collections, wishlists };
}

async function replaceAllData(data) {
    if (!data || typeof data !== 'object') throw new Error('Некорректный формат файла');
    const books = Array.isArray(data.books) ? data.books : [];
    const calendar = Array.isArray(data.calendar) ? data.calendar : [];
    const collections = Array.isArray(data.collections) ? data.collections : [];
    const wishlists = Array.isArray(data.wishlists) ? data.wishlists : [];

    await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists, db.meta], async () => {
        await db.books.clear(); await db.calendar.clear();
        await db.collections.clear(); await db.wishlists.clear();

        if (books.length) await db.books.bulkAdd(books);
        if (calendar.length) await db.calendar.bulkAdd(calendar);
        if (collections.length) await db.collections.bulkAdd(collections);
        if (wishlists.length) await db.wishlists.bulkAdd(wishlists);

        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
    });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (с защитой от ошибки UpgradeError)
// ============================================================
async function initDb() {
    try {
        // Явно открываем базу, чтобы поймать ошибку несовместимости
        await db.open();
    } catch (error) {
        // Если схема базы изменилась несовместимо (например, сменился primary key)
        if (error.name === 'UpgradeError' || error.name === 'VersionError') {
            console.warn('⚠️ Несовместимое изменение структуры БД. Пересоздаем базу...');
            await db.delete(); // Удаляем старую базу
            await db.open();   // Создаем новую
        } else {
            console.error('Ошибка открытия БД:', error);
            return;
        }
    }

    try {
        await migrateFromLocalStorage();
        await ensureDefaultWishlist();
        fetchDbBooks().catch(() => {});
        console.log('✅ База данных готова');
    } catch (err) {
        console.error('❌ Ошибка инициализации данных:', err);
    }
}
