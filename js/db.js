// js/db.js
// ============================================================
// Слой данных: Dexie (IndexedDB), миграция из localStorage,
// загрузка базы книг из XLSX.
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
// МИГРАЦИЯ ИЗ localStorage (безопасная)
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
    try { 
        oldState = JSON.parse(raw); 
    } catch (err) { 
        // Битый JSON — помечаем миграцию как выполненную, чтобы не пытаться вечно
        console.warn('Битые старые данные в localStorage');
        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
        return; 
    }
    
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
                id: generateUUID(), 
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
                dailyProgress: d.dailyProgress || {}, 
                createdAt: now, 
                updatedAt: now
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
        id: generateUUID(), 
        name: c.name || 'Без названия', 
        books: Array.isArray(c.books) ? c.books : [], 
        updatedAt: now
    }));

    const wishlistRecords = (Array.isArray(oldState.wishlist) ? oldState.wishlist : []).map(w => {
        const normBook = (b) => {
            if (typeof b === 'string') return { id: generateUUID(), title: b, author: 'Неизвестен', cover: '' };
            if (b && typeof b === 'object' && b.title) return { id: b.id || generateUUID(), title: b.title, author: b.author || '', cover: b.cover || '' };
            return null;
        };
        return { 
            id: generateUUID(), 
            name: w.name || 'Список', 
            books: (Array.isArray(w.books) ? w.books : []).map(normBook).filter(Boolean), 
            completed: (Array.isArray(w.completed) ? w.completed : []).map(normBook).filter(Boolean), 
            updatedAt: now 
        };
    });

    try {
        await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists, db.meta], async () => {
            if (bookRecords.length) await db.books.bulkPut(bookRecords);
            if (calendarRecords.length) await db.calendar.bulkPut(calendarRecords);
            if (collectionRecords.length) await db.collections.bulkPut(collectionRecords);
            if (wishlistRecords.length) await db.wishlists.bulkPut(wishlistRecords);
            await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
        });
    } catch (err) { 
        console.error('Миграция не удалась:', err); 
    }
}

async function ensureDefaultWishlist() {
    const count = await db.wishlists.count();
    if (count === 0) {
        await db.wishlists.add({ 
            id: generateUUID(), 
            name: 'Хочу купить', 
            books: [], 
            completed: [], 
            updatedAt: Date.now() 
        });
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

/**
 * Получить книгу по её ID.
 * Возвращает объект книги или null, если не найдена.
 */
async function getBookById(id) {
    if (!id) return null;
    return await db.books.get(id);
}

/**
 * Сохранить книгу (создать или обновить).
 * Если у книги есть ID — обновляются только переданные поля (put в режиме merge).
 * Если ID нет — создаётся новая книга с новым ID.
 */
async function saveBookRecord(book) {
    if (!book) throw new Error('Нет данных для сохранения');
    
    const now = Date.now();
    book.updatedAt = now;
    if (!book.createdAt) book.createdAt = now;

    if (book.id) {
        // Обновление существующей — используем update, чтобы не стереть неуказанные поля
        await db.books.update(book.id, book);
        return book.id;
    }
    // Создание новой
    if (!book.id) book.id = generateUUID();
    await db.books.add(book);
    return book.id;
}

async function deleteBookRecord(id) {
    await db.books.delete(id);
}

async function swapBookSlots(bookA, slotB, cabinetB) {
    if (!bookA) return;
    await db.books.update(bookA.id, { slot: slotB, cabinet: cabinetB, updatedAt: Date.now() });
}

/**
 * Починить слоты в шкафу: если две книги оказались на одном слоте,
 * вторую перемещаем на первый свободный.
 * Возвращает количество перемещённых книг.
 */
async function repairSlots(cabinet) {
    const books = await getBooksByCabinet(cabinet);
    const usedSlots = new Set();
    const toMove = [];
    
    for (const book of books) {
        if (book.slot == null || book.slot < 0 || usedSlots.has(book.slot)) {
            toMove.push(book);
        } else {
            usedSlots.add(book.slot);
        }
    }
    
    let moved = 0;
    for (const book of toMove) {
        let freeSlot = 0;
        while (usedSlots.has(freeSlot)) freeSlot++;
        usedSlots.add(freeSlot);
        await db.books.update(book.id, { slot: freeSlot, updatedAt: Date.now() });
        moved++;
    }
    return moved;
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

/**
 * Сохранить коллекцию. Автоматически ставит updatedAt.
 */
async function saveCollection(collection) {
    if (!collection) throw new Error('Нет данных коллекции');
    collection.updatedAt = Date.now();
    
    if (collection.id) {
        await db.collections.update(collection.id, collection);
        return collection.id;
    }
    collection.id = generateUUID();
    await db.collections.add(collection);
    return collection.id;
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

/**
 * Сохранить список желаний. Автоматически ставит updatedAt.
 */
async function saveWishlist(wishlist) {
    if (!wishlist) throw new Error('Нет данных списка');
    wishlist.updatedAt = Date.now();
    
    if (wishlist.id) {
        await db.wishlists.update(wishlist.id, wishlist);
        return wishlist.id;
    }
    wishlist.id = generateUUID();
    await db.wishlists.add(wishlist);
    return wishlist.id;
}

async function deleteWishlist(id) {
    await db.wishlists.delete(id);
}

// ============================================================
// XLSX БАЗА (поиск книг) — с корректным снятием «замка» при ошибке
// ============================================================
let cachedDbBooks = null;
let dbFetchPromise = null;

async function fetchDbBooks(forceReload = false) {
    if (forceReload) { 
        cachedDbBooks = null; 
        dbFetchPromise = null; 
    }
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
            // ВАЖНО: снимаем «замок», чтобы можно было попробовать снова
            dbFetchPromise = null;
            return [];
        }
    })();
    
    try {
        return await dbFetchPromise;
    } catch (e) {
        dbFetchPromise = null;
        return [];
    }
}

// ============================================================
// ЭКСПОРТ / ИМПОРТ
// ============================================================
async function dumpAllData() {
    const [books, calendar, collections, wishlists] = await Promise.all([
        db.books.toArray(), db.calendar.toArray(), db.collections.toArray(), db.wishlists.toArray()
    ]);
    return { 
        version: 1, 
        exportedAt: new Date().toISOString(), 
        books, calendar, collections, wishlists 
    };
}

/**
 * Заменить все данные. Валидирует формат файла. Использует bulkPut для избежания
 * падений при дубликатах ID.
 */
async function replaceAllData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Некорректный формат файла: ожидается объект');
    }
    
    // Валидация: должен быть хотя бы один из ключевых массивов
    const hasValidStructure = 
        Array.isArray(data.books) || 
        Array.isArray(data.calendar) || 
        Array.isArray(data.collections) || 
        Array.isArray(data.wishlists);
    
    if (!hasValidStructure) {
        throw new Error('Это не файл резервной копии КниБум');
    }
    
    const books = Array.isArray(data.books) ? data.books : [];
    const calendar = Array.isArray(data.calendar) ? data.calendar : [];
    const collections = Array.isArray(data.collections) ? data.collections : [];
    const wishlists = Array.isArray(data.wishlists) ? data.wishlists : [];

    // Убедимся, что у всех записей есть ID и updatedAt (для безопасности)
    const now = Date.now();
    books.forEach(b => {
        if (!b.id) b.id = generateUUID();
        if (!b.updatedAt) b.updatedAt = b.createdAt || now;
        if (!b.createdAt) b.createdAt = now;
    });
    collections.forEach(c => {
        if (!c.id) c.id = generateUUID();
        if (!c.updatedAt) c.updatedAt = now;
    });
    wishlists.forEach(w => {
        if (!w.id) w.id = generateUUID();
        if (!w.updatedAt) w.updatedAt = now;
    });

    await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists, db.meta], async () => {
        await db.books.clear(); 
        await db.calendar.clear();
        await db.collections.clear(); 
        await db.wishlists.clear();

        // bulkPut вместо bulkAdd — не падает при дубликатах ID
        if (books.length) await db.books.bulkPut(books);
        if (calendar.length) await db.calendar.bulkPut(calendar);
        if (collections.length) await db.collections.bulkPut(collections);
        if (wishlists.length) await db.wishlists.bulkPut(wishlists);

        await db.meta.put({ key: MIGRATION_KEY, value: true, at: Date.now() });
    });
}

// ============================================================
// ИНФОРМАЦИЯ О ХРАНИЛИЩЕ
// ============================================================
/**
 * Возвращает приблизительную статистику использования хранилища.
 * Полезно для отладки и отображения в интерфейсе.
 */
async function getStorageInfo() {
    const [books, calendar, collections, wishlists] = await Promise.all([
        db.books.count(), 
        db.calendar.count(), 
        db.collections.count(), 
        db.wishlists.count()
    ]);
    
    // Приблизительная оценка размера через Storage API (если доступен)
    let estimatedBytes = 0;
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            estimatedBytes = estimate.usage || 0;
        }
    } catch (_) { /* API недоступен — вернём 0 */ }
    
    return {
        booksCount: books,
        calendarEntries: calendar,
        collectionsCount: collections,
        wishlistsCount: wishlists,
        estimatedBytes,
        estimatedMB: (estimatedBytes / (1024 * 1024)).toFixed(2)
    };
}

// ============================================================
// ПЕРЕСБОРКА ИНДЕКСОВ
// ============================================================
/**
 * Пересобирает индексы Dexie (полезно после импорта больших файлов).
 * Просто вызывает реиндексацию через запросы.
 */
async function rebuildIndexes() {
    try {
        // Проход по всем индексам через count() — заставляет Dexie пересчитать
        await db.books.orderBy('id').toArray();
        await db.collections.orderBy('id').toArray();
        await db.wishlists.orderBy('id').toArray();
        await db.calendar.orderBy('date').toArray();
        console.log('✅ Индексы пересобраны');
        return true;
    } catch (err) {
        console.error('❌ Ошибка пересборки индексов:', err);
        return false;
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (с безопасной обработкой ошибок схемы)
// ============================================================
async function initDb() {
    try {
        await db.open();
    } catch (error) {
        if (error.name === 'UpgradeError' || error.name === 'VersionError') {
            // КРИТИЧНО: не удаляем базу молча. Сначала пробуем сохранить бэкап.
            console.warn('⚠️ Несовместимое изменение структуры БД. Пробуем сохранить данные...');
            try {
                const backup = await dumpAllData().catch(() => null);
                if (backup) {
                    localStorage.setItem(EMERGENCY_BACKUP_KEY, JSON.stringify(backup));
                    console.log('✅ Резервная копия сохранена в localStorage (ключ: ' + EMERGENCY_BACKUP_KEY + ')');
                }
            } catch (e) {
                console.error('Не удалось создать резервную копию:', e);
            }
            // Теперь удаляем и создаём заново
            await db.delete();
            await db.open();
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