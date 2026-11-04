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
        series: b.series || '',
        subseries: b.subseries || '',
        volume: b.volume || 0,
        year: b.year || '',
        country: b.country || '',
        format: b.format || '',
        start_date: b.startDate || '',
        end_date: b.endDate || '',
        annotation: b.annotation || '',
        summary: b.summary || '',
        timeline: b.timeline || '',
        world_map: b.worldMap || '',
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
    console.log('🔄 Начинаем синхронизацию с облаком...');
    
    try {
        const userId = currentUser.id;
        
        // 1. Синхронизация Книг (самое важное, делаем первым, без catch)
        await syncBooks(userId);
        
        // Остальные таблицы синхронизируем с защитой от падения (catch),
        // чтобы ошибка в одной не прервала весь процесс.
        await syncCalendar(userId).catch(e => console.warn('⚠️ Ошибка синхр. календаря:', e.message));
        await syncCollections(userId).catch(e => console.warn('⚠️ Ошибка синхр. коллекций:', e.message));
        await syncWishlists(userId).catch(e => console.warn('⚠️ Ошибка синхр. вишлиста:', e.message));
        await syncSettings(userId).catch(e => console.warn('⚠️ Ошибка синхр. настроек:', e.message));
        
        lastSyncTime = Date.now();
        console.log('✅ Синхронизация завершена');
        
        // Обновляем локальный кеш state (вызывается из app.js)
        if (typeof syncAllFromDb === 'function') {
            await syncAllFromDb();
        }
        
    } catch (err) {
        console.error('❌ Критическая ошибка синхронизации книг:', err);
    } finally {
        isSyncing = false;
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ КНИГ
// ============================================================
async function syncBooks(userId) {
    // --- ШАГ 1: Скачиваем из облака (Pull) ---
    const { data: remoteData, error: pullError } = await supabaseClient
        .from('books')
        .select('*')
        .eq('user_id', userId);
        
    if (pullError) throw pullError;
    
    const localData = await db.books.toArray();
    const localMap = new Map(localData.map(b => [b.id, b]));
    
    for (const rItem of remoteData) {
        const localItem = localMap.get(rItem.id);
        const remoteUpdatedAt = rItem.updated_at ? new Date(rItem.updated_at).getTime() : 0;
        
        // Если локальной книги нет, или версия в облаке новее — перезаписываем локальную
        if (!localItem || remoteUpdatedAt > localItem.updatedAt) {
            await db.books.put(fromDbBook(rItem));
        }
    }
    
    // --- ШАГ 2: Отправляем в облако (Push) ---
    const updatedLocalData = await db.books.toArray();
    if (updatedLocalData.length > 0) {
        const toUpload = updatedLocalData.map(b => toDbBook(b, userId));
        
        // Разбиваем на чанки по 50 штук, чтобы не превысить лимиты запроса
        for (let i = 0; i < toUpload.length; i += 50) {
            const chunk = toUpload.slice(i, i + 50);
            const { error: pushError } = await supabaseClient
                .from('books')
                .upsert(chunk);
                
            if (pushError) throw pushError;
        }
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ КАЛЕНДАРЯ
// ============================================================
async function syncCalendar(userId) {
    const { data: remote, error } = await supabaseClient.from('calendar').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.calendar.toArray();
    const localMap = new Map(local.map(c => [c.date, c]));

    // Скачиваем (Pull)
    for (const r of remote) {
        const l = localMap.get(r.date);
        if (!l) {
            await db.calendar.put({ date: r.date, books: r.books });
        }
    }

    // Отправляем (Push)
    const updatedLocal = await db.calendar.toArray();
    if (updatedLocal.length > 0) {
        const toUpload = updatedLocal.map(c => ({ date: c.date, user_id: userId, books: c.books }));
        await supabaseClient.from('calendar').upsert(toUpload);
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ КОЛЛЕКЦИЙ
// ============================================================
async function syncCollections(userId) {
    const { data: remote, error } = await supabaseClient.from('collections').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.collections.toArray();
    
    // Скачиваем (Pull)
    for (const r of remote) {
        await db.collections.put({ id: r.id, name: r.name, books: r.books, updatedAt: Date.now() });
    }

    // Отправляем (Push)
    const updatedLocal = await db.collections.toArray();
    if (updatedLocal.length > 0) {
        const toUpload = updatedLocal.map(c => ({ id: c.id, user_id: userId, name: c.name, books: c.books }));
        await supabaseClient.from('collections').upsert(toUpload);
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ WISHLIST
// ============================================================
async function syncWishlists(userId) {
    const { data: remote, error } = await supabaseClient.from('wishlists').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.wishlists.toArray();
    
    // Скачиваем (Pull)
    for (const r of remote) {
        await db.wishlists.put({ id: r.id, name: r.name, books: r.books, completed: r.completed, updatedAt: Date.now() });
    }

    // Отправляем (Push)
    const updatedLocal = await db.wishlists.toArray();
    if (updatedLocal.length > 0) {
        const toUpload = updatedLocal.map(c => ({ id: c.id, user_id: userId, name: c.name, books: c.books, completed: c.completed }));
        await supabaseClient.from('wishlists').upsert(toUpload);
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ НАСТРОЕК (Цель, Тема)
// ============================================================
async function syncSettings(userId) {
    const { data: remote, error } = await supabaseClient.from('user_settings').select('*').eq('user_id', userId).single();
    
    // Игнорируем ошибку "строка не найдена" (PGRST116)
    if (error && error.code !== 'PGRST116') console.warn('Ошибка синхронизации настроек:', error);

    if (remote) {
        // Если в облаке есть данные, применяем их
        if (remote.goal_books !== undefined && remote.goal_books !== null) {
            localStorage.setItem('readingGoal', remote.goal_books);
        }
        if (remote.theme) {
            localStorage.setItem('theme', remote.theme);
        }
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

// ============================================================
// АВТОМАТИЧЕСКАЯ СИНХРОНИЗАЦИЯ
// ============================================================
// Если интернет пропал и появился снова — запускаем синк
window.addEventListener('online', () => {
    console.log('🌐 Соединение восстановлено, запускаем фоновую синхронизацию...');
    if (typeof syncAll === 'function') syncAll();
});
