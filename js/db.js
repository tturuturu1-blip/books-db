// js/db.js
// ============================================================
// Слой данных: Dexie (IndexedDB), миграция из localStorage.
// Версия 3: Нормализованный календарь (tombstone-удаление).
// ============================================================

const CABINETS = ['reading', 'read', 'planned', 'paused', 'dropped'];
const CABINET_LABELS = { reading: 'Читаю', read: 'Прочитано', planned: 'В планах', paused: 'На паузе', dropped: 'Брошено' };

const SHELVES_PER_CABINET = 4;
const SLOTS_PER_SHELF = 7;
const TOTAL_SLOTS = SHELVES_PER_CABINET * SLOTS_PER_SHELF; // 28

const LEGACY_STORAGE_KEY = 'readingDiaryData_v7';
const MIGRATION_KEY = 'migrated_v1';
const EMERGENCY_BACKUP_KEY = 'emergency_backup_v1';

const db = new Dexie('ReadingDiaryDB');

// ВЕРСИЯ 1 (Старая, не трогаем)
db.version(1).stores({
    books: '++id, cabinet, slot, title, author, *genres, *tags, rating, startDate, endDate, createdAt',
    calendar: 'date',
    collections: '++id, name',
    wishlists: '++id, name',
    meta: 'key'
});

// ВЕРСИЯ 2 (UUID для облака)
db.version(2).stores({
    books: 'id, cabinet, slot, title, author, *genres, *tags, rating, startDate, endDate, createdAt, updatedAt',
    calendar: 'date',
    collections: 'id, name, updatedAt',
    wishlists: 'id, name, updatedAt',
    meta: 'key'
});

// ВЕРСИЯ 3 (Нормализованный календарь)
db.version(3).stores({
    books: 'id, cabinet, slot, title, author, *genres, *tags, rating, startDate, endDate, createdAt, updatedAt',
    calendar: 'id, date, bookTitle, updatedAt, deleted', // <-- Новая структура
    collections: 'id, name, updatedAt',
    wishlists: 'id, name, updatedAt',
    meta: 'key'
}).upgrade(async tx => {
    // Переносим старый календарь в новый формат
    console.log('🔄 Миграция календаря на версию 3...');
    const oldEntries = await tx.table('calendar').toArray();
    const newRecords = [];
    const now = Date.now();
    
    for (const entry of oldEntries) {
        if (entry.date && Array.isArray(entry.books)) {
            for (const title of entry.books) {
                newRecords.push({
                    id: generateUUID(),
                    date: entry.date,
                    bookTitle: title,
                    updatedAt: now,
                    deleted: false
                });
            }
        }
    }
    await tx.table('calendar').clear();
    if (newRecords.length) await tx.table('calendar').bulkPut(newRecords);
});

// ============================================================
// КНИГИ (без изменений)
// ============================================================
async function getAllBooks() { return await db.books.toArray(); }
async function getBooksByCabinet(cabinet) {
    const books = await db.books.where('cabinet').equals(cabinet).toArray();
    return books.sort((a, b) => a.slot - b.slot);
}
async function getCabinetGrid(cabinet) {
    const books = await getBooksByCabinet(cabinet);
    const grid = new Array(TOTAL_SLOTS).fill(null);
    books.forEach(b => { if (b.slot >= 0 && b.slot < TOTAL_SLOTS) grid[b.slot] = b; });
    return grid;
}
async function getBookById(id) { return id ? await db.books.get(id) : null; }

async function saveBookRecord(book) {
    if (!book) throw new Error('Нет данных для сохранения');
    const now = Date.now();
    book.updatedAt = now;
    if (!book.createdAt) book.createdAt = now;

    if (book.id) {
        await db.books.update(book.id, book);
        return book.id;
    }
    book.id = generateUUID();
    await db.books.add(book);
    return book.id;
}

async function deleteBookRecord(id) { await db.books.delete(id); }

async function repairSlots(cabinet) {
    const books = await getBooksByCabinet(cabinet);
    const usedSlots = new Set();
    const toMove = [];
    for (const book of books) {
        if (book.slot == null || book.slot < 0 || usedSlots.has(book.slot)) toMove.push(book);
        else usedSlots.add(book.slot);
    }
    for (const book of toMove) {
        let freeSlot = 0;
        while (usedSlots.has(freeSlot)) freeSlot++;
        usedSlots.add(freeSlot);
        await db.books.update(book.id, { slot: freeSlot, updatedAt: Date.now() });
    }
}

// ============================================================
// КАЛЕНДАРЬ (НОВЫЕ ФУНКЦИИ)
// ============================================================
async function getCalendarTitles(date) {
    const records = await db.calendar.where('date').equals(date).toArray();
    return records.filter(r => !r.deleted).map(r => r.bookTitle);
}

async function setCalendarTitles(date, titles) {
    const unique = [...new Set((titles || []).filter(t => t && t.trim()))];
    
    await db.transaction('rw', db.calendar, async () => {
        const existing = await db.calendar.where('date').equals(date).toArray();
        const existingMap = new Map(existing.map(e => [e.bookTitle, e]));
        
        // 1. Помечаем удалённые (Tombstone)
        for (const e of existing) {
            if (!unique.includes(e.bookTitle) && !e.deleted) {
                await db.calendar.update(e.id, { deleted: true, updatedAt: Date.now() });
            }
        }
        
        // 2. Добавляем новые или восстанавливаем удалённые
        for (const title of unique) {
            const existingRecord = existingMap.get(title);
            if (!existingRecord) {
                await db.calendar.add({
                    id: generateUUID(), date, bookTitle: title,
                    updatedAt: Date.now(), deleted: false
                });
            } else if (existingRecord.deleted) {
                await db.calendar.update(existingRecord.id, { deleted: false, updatedAt: Date.now() });
            }
        }
    });
}

// Возвращает массив в старом формате (совместимость с app.js)
async function getAllCalendar() {
    const records = await db.calendar.filter(r => !r.deleted).toArray();
    const map = {};
    for (const r of records) {
        if (!map[r.date]) map[r.date] = [];
        map[r.date].push(r.bookTitle);
    }
    return Object.keys(map).map(date => ({ date, books: map[date] }));
}

// ============================================================
// КОЛЛЕКЦИИ И WISHLIST
// ============================================================
async function getCollections() { return db.collections.toArray(); }
async function saveCollection(collection) {
    collection.updatedAt = Date.now();
    if (collection.id) { await db.collections.update(collection.id, collection); return collection.id; }
    collection.id = generateUUID(); await db.collections.add(collection); return collection.id;
}
async function deleteCollection(id) { await db.collections.delete(id); }

async function getWishlists() { return db.wishlists.toArray(); }
async function saveWishlist(wishlist) {
    wishlist.updatedAt = Date.now();
    if (wishlist.id) { await db.wishlists.update(wishlist.id, wishlist); return wishlist.id; }
    wishlist.id = generateUUID(); await db.wishlists.add(wishlist); return wishlist.id;
}
async function deleteWishlist(id) { await db.wishlists.delete(id); }

// ============================================================
// XLSX БАЗА И ЭКСПОРТ/ИМПОРТ
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
            if (!res.ok) throw new Error('Ошибка XLSX: ' + res.status);
            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            cachedDbBooks = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            return cachedDbBooks;
        } catch (err) {
            dbFetchPromise = null; return [];
        }
    })();
    try { return await dbFetchPromise; } catch (e) { dbFetchPromise = null; return []; }
}

async function dumpAllData() {
    const [books, calendarRecords, collections, wishlists] = await Promise.all([
        db.books.toArray(), db.calendar.toArray(), db.collections.toArray(), db.wishlists.toArray()
    ]);
    return { version: 2, exportedAt: new Date().toISOString(), books, calendarRecords, collections, wishlists };
}

async function replaceAllData(data) {
    if (!data || typeof data !== 'object') throw new Error('Некорректный формат файла');
    const books = Array.isArray(data.books) ? data.books : [];
    const calendarRecords = Array.isArray(data.calendarRecords) ? data.calendarRecords : (Array.isArray(data.calendar) ? data.calendar : []);
    const collections = Array.isArray(data.collections) ? data.collections : [];
    const wishlists = Array.isArray(data.wishlists) ? data.wishlists : [];
    const now = Date.now();

    // Миграция старого формата календаря в импортируемом файле (если он старый)
    let normalizedCalendar = [];
    if (calendarRecords.length > 0 && calendarRecords[0].books) {
        // Старый формат
        for (const entry of calendarRecords) {
            for (const title of entry.books) {
                normalizedCalendar.push({ id: generateUUID(), date: entry.date, bookTitle: title, updatedAt: now, deleted: false });
            }
        }
    } else {
        normalizedCalendar = calendarRecords;
    }

    await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists, db.meta], async () => {
        await db.books.clear(); await db.calendar.clear();
        await db.collections.clear(); await db.wishlists.clear();
        if (books.length) await db.books.bulkPut(books);
        if (normalizedCalendar.length) await db.calendar.bulkPut(normalizedCalendar);
        if (collections.length) await db.collections.bulkPut(collections);
        if (wishlists.length) await db.wishlists.bulkPut(wishlists);
        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
    });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
async function initDb() {
    try { await db.open(); } catch (error) {
        if (error.name === 'UpgradeError' || error.name === 'VersionError') {
            try {
                const backup = await dumpAllData().catch(() => null);
                if (backup) localStorage.setItem(EMERGENCY_BACKUP_KEY, JSON.stringify(backup));
            } catch (e) {}
            await db.delete(); await db.open();
        } else { return; }
    }
    try { await ensureDefaultWishlist(); fetchDbBooks().catch(() => {}); } catch (err) {}
}

async function ensureDefaultWishlist() {
    const count = await db.wishlists.count();
    if (count === 0) await db.wishlists.add({ id: generateUUID(), name: 'Хочу купить', books: [], completed: [], updatedAt: Date.now() });
}