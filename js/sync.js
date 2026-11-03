// js/sync.js
// ============================================================
// Движок синхронизации IndexedDB <-> Supabase
// ============================================================

let isSyncing = false;
let lastSyncTime = 0;

// Помощники для конвертации названий полей (camelCase в JS <-> snake_case в SQL)
function toDbBook(b, userId) {
    return {
        id: b.id,
        user_id: userId,
        cabinet: b.cabinet,
        slot: b.slot,
        title: b.title,
        author: b.author,
        color: b.color,
        pattern: b.pattern,
        cover: b.cover,
        spine_image: b.spineImage,
        rating: b.rating || 0,
        genres: b.genres || [],
        tags: b.tags || [],
        series: b.series,
        subseries: b.subseries,
        volume: b.volume || 0,
        year: b.year,
        country: b.country,
        format: b.format,
        start_date: b.startDate,
        end_date: b.endDate,
        annotation: b.annotation,
        summary: b.summary,
        timeline: b.timeline,
        world_map: b.worldMap,
        impressions: b.impressions || [],
        quotes: b.quotes || [],
        characters: b.characters || [],
        terms: b.terms || [],
        daily_progress: b.dailyProgress || {},
        created_at: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
        updated_at: b.updatedAt ? new Date(b.updatedAt).toISOString() : new Date().toISOString()
    };
}

function fromDbBook(r) {
    return {
        id: r.id,
        cabinet: r.cabinet,
        slot: r.slot,
        title: r.title,
        author: r.author,
        color: r.color,
        pattern: r.pattern,
        cover: r.cover,
        spineImage: r.spine_image,
        rating: r.rating,
        genres: r.genres,
        tags: r.tags,
        series: r.series,
        subseries: r.subseries,
        volume: r.volume,
        year: r.year,
        country: r.country,
        format: r.format,
        startDate: r.start_date,
        endDate: r.end_date,
        annotation: r.annotation,
        summary: r.summary,
        timeline: r.timeline,
        worldMap: r.world_map,
        impressions: r.impressions,
        quotes: r.quotes,
        characters: r.characters,
        terms: r.terms,
        dailyProgress: r.daily_progress,
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: new Date(r.updated_at).getTime()
    };
}

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ СИНХРОНИЗАЦИИ
// ============================================================

async function syncAll() {
    if (!currentUser || !navigator.onLine || isSyncing) return;
    
    isSyncing = true;
    console.log('🔄 Начинаем синхронизацию...');
    
    try {
        const userId = currentUser.id;
        
        // 1. Синхронизация Книг
        await syncTable('books', 'books', toDbBook, fromDbBook, userId);
        
        // 2. Синхронизация Календаря
        await syncCalendar(userId);
        
        // 3. Синхронизация Коллекций
        await syncCollections(userId);
        
        // 4. Синхронизация Wishlist
        await syncWishlists(userId);
        
        // 5. Синхронизация настроек (Цель)
        await syncSettings(userId);
        
        lastSyncTime = Date.now();
        console.log('✅ Синхронизация завершена');
        
        // Обновляем UI после синхронизации
        if (typeof syncAllFromDb === 'function') await syncAllFromDb();
        if (typeof renderLibrary === 'function') await renderLibrary();
        
    } catch (err) {
        console.error('❌ Ошибка синхронизации:', err);
    } finally {
        isSyncing = false;
    }
}

// Универсальный синк для простых таблиц
async function syncTable(localTable, remoteTable, toDbFunc, fromDbFunc, userId) {
    // --- ШАГ 1: Скачиваем из облака (Pull) ---
    const { data: remoteData, error: pullError } = await supabaseClient
        .from(remoteTable)
        .select('*')
        .eq('user_id', userId);
        
    if (pullError) throw pullError;
    
    const localData = await db[localTable].toArray();
    const localMap = new Map(localData.map(b => [b.id, b]));
    
    // Обновляем локальные, если в облаке версия новее
    for (const rItem of remoteData) {
        const localItem = localMap.get(rItem.id);
        const remoteUpdatedAt = new Date(rItem.updated_at).getTime();
        
        if (!localItem || remoteUpdatedAt > localItem.updatedAt) {
            await db[localTable].put(fromDbFunc(rItem));
        }
    }
    
    // --- ШАГ 2: Отправляем в облако (Push) ---
    // Берем обновленные локальные данные
    const updatedLocalData = await db[localTable].toArray();
    const toUpload = updatedLocalData.map(b => toDbFunc(b, userId));
    
    if (toUpload.length > 0) {
        const { error: pushError } = await supabaseClient
            .from(remoteTable)
            .upsert(toUpload);
            
        if (pushError) throw pushError;
    }
}

// --- Специфичные функции для сложных структур ---

async function syncCalendar(userId) {
    const { data: remote, error } = await supabaseClient.from('calendar').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.calendar.toArray();
    const localMap = new Map(local.map(c => [c.date, c]));

    for (const r of remote) {
        const l = localMap.get(r.date);
        // В календаре нет updated_at, поэтому облако всегда перезаписывает локаль (или объединяем)
        if (!l) {
            await db.calendar.put({ date: r.date, books: r.books });
        }
    }

    const updatedLocal = await db.calendar.toArray();
    const toUpload = updatedLocal.map(c => ({ date: c.date, user_id: userId, books: c.books }));
    
    if (toUpload.length > 0) {
        await supabaseClient.from('calendar').upsert(toUpload);
    }
}

async function syncCollections(userId) {
    const { data: remote, error } = await supabaseClient.from('collections').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.collections.toArray();
    const localMap = new Map(local.map(c => [c.id, c]));

    for (const r of remote) {
        if (!localMap.has(r.id)) {
            await db.collections.put({ id: r.id, name: r.name, books: r.books });
        } else {
            await db.collections.put({ id: r.id, name: r.name, books: r.books });
        }
    }

    const updatedLocal = await db.collections.toArray();
    const toUpload = updatedLocal.map(c => ({ id: c.id, user_id: userId, name: c.name, books: c.books }));
    
    if (toUpload.length > 0) {
        await supabaseClient.from('collections').upsert(toUpload);
    }
}

async function syncWishlists(userId) {
    const { data: remote, error } = await supabaseClient.from('wishlists').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.wishlists.toArray();
    const localMap = new Map(local.map(c => [c.id, c]));

    for (const r of remote) {
        await db.wishlists.put({ id: r.id, name: r.name, books: r.books, completed: r.completed });
    }

    const updatedLocal = await db.wishlists.toArray();
    const toUpload = updatedLocal.map(c => ({ id: c.id, user_id: userId, name: c.name, books: c.books, completed: c.completed }));
    
    if (toUpload.length > 0) {
        await supabaseClient.from('wishlists').upsert(toUpload);
    }
}

async function syncSettings(userId) {
    const { data: remote, error } = await supabaseClient.from('user_settings').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') console.error(error); // Игнорируем ошибку "не найдено"

    if (remote) {
        if (remote.goal_books) localStorage.setItem('readingGoal', remote.goal_books);
        if (remote.theme) localStorage.setItem('theme', remote.theme);
    }

    // Отправляем локальные настройки в облако
    const goal = parseInt(localStorage.getItem('readingGoal')) || 0;
    const theme = localStorage.getItem('theme') || 'light';
    
    await supabaseClient.from('user_settings').upsert({ 
        user_id: userId, 
        goal_books: goal, 
        theme: theme 
    });
}

// Вспомогательная функция для удаления из облака при локальном удалении
async function deleteFromCloud(table, id) {
    if (!currentUser || !navigator.onLine) return;
    try {
        await supabaseClient.from(table).delete().eq('id', id).eq('user_id', currentUser.id);
    } catch (err) {
        console.error(`Ошибка удаления из облака (${table}):`, err);
    }
}

// Автоматическая синхронизация при появлении интернета
window.addEventListener('online', () => {
    console.log('🌐 Соединение восстановлено, запускаем синхронизацию...');
    syncAll();
});
