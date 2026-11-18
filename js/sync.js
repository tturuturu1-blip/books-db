// js/sync.js
// ============================================================
// Движок синхронизации с прогресс-баром и tombstone-календарём
// ============================================================

let isSyncing = false;

// Функция для отправки события прогресса
function emitSyncProgress(percent, text) {
    document.dispatchEvent(new CustomEvent('syncProgress', { detail: { percent, text } }));
}

function toDbBook(b, userId) {
    return {
        id: b.id, user_id: userId, cabinet: b.cabinet || 'reading', slot: b.slot || 0,
        title: b.title || 'Без названия', author: b.author || 'Неизвестен',
        color: b.color || '#fcfaf5', pattern: b.pattern || '', cover: b.cover || '',
        spine_image: b.spineImage || '', rating: b.rating || 0,
        genres: Array.isArray(b.genres) ? b.genres : [], tags: Array.isArray(b.tags) ? b.tags : [],
        series: b.series || '', subseries: b.subseries || '', volume: b.volume || 0,
        year: b.year || '', country: b.country || '', format: b.format || '',
        start_date: b.startDate || '', end_date: b.endDate || '', annotation: b.annotation || '',
        summary: b.summary || '', timeline: b.timeline || '', world_map: b.worldMap || '',
        impressions: b.impressions || [], quotes: b.quotes || [],
        characters: b.characters || [], terms: b.terms || [],
        daily_progress: b.dailyProgress || {},
        created_at: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString(),
        updated_at: b.updatedAt ? new Date(b.updatedAt).toISOString() : new Date().toISOString()
    };
}

function fromDbBook(r) {
    return {
        id: r.id, cabinet: r.cabinet, slot: r.slot, title: r.title, author: r.author,
        color: r.color, pattern: r.pattern, cover: r.cover, spineImage: r.spine_image,
        rating: r.rating, genres: r.genres || [], tags: r.tags || [],
        series: r.series, subseries: r.subseries, volume: r.volume, year: r.year,
        country: r.country, format: r.format, startDate: r.start_date, endDate: r.end_date,
        annotation: r.annotation, summary: r.summary, timeline: r.timeline, worldMap: r.world_map,
        impressions: r.impressions || [], quotes: r.quotes || [],
        characters: r.characters || [], terms: r.terms || [],
        dailyProgress: r.daily_progress || {},
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
    };
}

async function syncAll() {
    if (!currentUser || !navigator.onLine || isSyncing) return;
    isSyncing = true;
    
    emitSyncProgress(5, 'Запуск...');
    
    try {
        const userId = currentUser.id;
        
        try { await syncBooks(userId); } catch(e) { console.error('Ошибка книг:', e); }
        emitSyncProgress(40, 'Календарь...');
        
        try { await syncCalendar(userId); } catch(e) { console.error('Ошибка календаря:', e); }
        emitSyncProgress(60, 'Коллекции...');
        
        try { await syncCollections(userId); } catch(e) { console.error('Ошибка коллекций:', e); }
        emitSyncProgress(75, 'Списки...');
        
        try { await syncWishlists(userId); } catch(e) { console.error('Ошибка списков:', e); }
        emitSyncProgress(90, 'Настройки...');
        
        try { await syncSettings(userId); } catch(e) { console.error('Ошибка настроек:', e); }
        
        emitSyncProgress(100, 'Готово');
    } catch (err) {
        console.error('Критическая ошибка:', err);
        emitSyncProgress(0, 'Ошибка');
    } finally {
        isSyncing = false;
    }
}

async function syncBooks(userId) {
    const { data: remoteBooks, error: pullError } = await supabaseClient.from('books').select('*').eq('user_id', userId);
    if (pullError) throw pullError;

    const localBooks = await db.books.toArray();
    const remoteMap = new Map(remoteBooks.map(r => [r.id, r]));
    const localMap = new Map(localBooks.map(l => [l.id, l]));

    // Скачиваем
    for (const rBook of remoteBooks) {
        const lBook = localMap.get(rBook.id);
        const rTime = rBook.updated_at ? new Date(rBook.updated_at).getTime() : 0;
        const lTime = lBook ? lBook.updatedAt : 0;
        if (!lBook || rTime > lTime) await db.books.put(fromDbBook(rBook));
    }

    // Отправляем
    const booksToUpload = [];
    for (const lBook of localBooks) {
        const rBook = remoteMap.get(lBook.id);
        const rTime = rBook && rBook.updated_at ? new Date(rBook.updated_at).getTime() : 0;
        const lTime = lBook.updatedAt || 0;
        if (!rBook || lTime > rTime) booksToUpload.push(toDbBook(lBook, userId));
    }

    if (booksToUpload.length > 0) {
        for (let i = 0; i < booksToUpload.length; i += 50) {
            const { error } = await supabaseClient.from('books').upsert(booksToUpload.slice(i, i + 50), { onConflict: 'id' });
            if (error) throw error;
        }
    }
}

async function syncCalendar(userId) {
    const { data: remote, error } = await supabaseClient.from('calendar').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.calendar.toArray();
    
    // Ключи для быстрого сравнения
    const localKeys = new Set(local.map(l => `${l.date}|${l.bookTitle}`));
    const remoteKeys = new Set(remote.map(r => `${r.date}|${r.book_title}`));

    // 1. Скачиваем/Обновляем из облака
    for (const r of remote) {
        const key = `${r.date}|${r.book_title}`;
        const l = local.find(x => `${x.date}|${x.bookTitle}` === key);
        
        if (!l) {
            // Нет локально - добавляем
            await db.calendar.add({
                id: r.id || generateUUID(), date: r.date, bookTitle: r.book_title,
                updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(), deleted: !!r.deleted
            });
        } else {
            // Есть локально - проверяем время и флаг удаления
            const rTime = r.updated_at ? new Date(r.updated_at).getTime() : 0;
            if (rTime > l.updatedAt) {
                await db.calendar.update(l.id, { deleted: !!r.deleted, updatedAt: rTime });
            }
        }
    }

    // 2. Отправляем локальные изменения
    const updatedLocal = await db.calendar.toArray();
    const toUpload = [];
    
    for (const l of updatedLocal) {
        const key = `${l.date}|${l.bookTitle}`;
        const r = remote.find(x => `${x.date}|${x.book_title}` === key);
        
        if (!r) {
            // Нет в облаке - отправляем
            toUpload.push({
                user_id: userId, date: l.date, book_title: l.bookTitle,
                deleted: l.deleted, updated_at: new Date(l.updatedAt).toISOString()
            });
        } else {
            // Есть в облаке - проверяем, не новее ли локальная
            const rTime = r.updated_at ? new Date(r.updated_at).getTime() : 0;
            if (l.updatedAt > rTime) {
                toUpload.push({
                    user_id: userId, date: l.date, book_title: l.bookTitle,
                    deleted: l.deleted, updated_at: new Date(l.updatedAt).toISOString()
                });
            }
        }
    }

    if (toUpload.length > 0) {
        for (let i = 0; i < toUpload.length; i += 50) {
            const chunk = toUpload.slice(i, i + 50);
            const { error } = await supabaseClient.from('calendar')
                .upsert(chunk, { onConflict: 'user_id,date,book_title' });
            if (error) throw error;
        }
    }
}

async function syncCollections(userId) {
    const { data: remote, error } = await supabaseClient.from('collections').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.collections.toArray();
    const localMap = new Map(local.map(l => [l.id, l]));
    const remoteMap = new Map(remote.map(r => [r.id, r]));
    const toUpload = [];

    for (const r of remote) {
        const l = localMap.get(r.id);
        const rTime = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        if (!l || rTime > l.updatedAt) await db.collections.put({ id: r.id, name: r.name, books: r.books || [], updatedAt: rTime });
    }

    for (const l of local) {
        const r = remoteMap.get(l.id);
        const rTime = r && r.updated_at ? new Date(r.updated_at).getTime() : 0;
        if (!r || l.updatedAt > rTime) {
            toUpload.push({ id: l.id, user_id: userId, name: l.name, books: l.books, updated_at: new Date(l.updatedAt || Date.now()).toISOString() });
        }
    }

    if (toUpload.length > 0) {
        const { error } = await supabaseClient.from('collections').upsert(toUpload, { onConflict: 'id' });
        if (error) throw error;
    }
}

async function syncWishlists(userId) {
    const { data: remote, error } = await supabaseClient.from('wishlists').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.wishlists.toArray();
    const localMap = new Map(local.map(l => [l.id, l]));
    const remoteMap = new Map(remote.map(r => [r.id, r]));
    const toUpload = [];

    for (const r of remote) {
        const l = localMap.get(r.id);
        const rTime = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        if (!l || rTime > l.updatedAt) await db.wishlists.put({ id: r.id, name: r.name, books: r.books || [], completed: r.completed || [], updatedAt: rTime });
    }

    for (const l of local) {
        const r = remoteMap.get(l.id);
        const rTime = r && r.updated_at ? new Date(r.updated_at).getTime() : 0;
        if (!r || l.updatedAt > rTime) {
            toUpload.push({ id: l.id, user_id: userId, name: l.name, books: l.books, completed: l.completed, updated_at: new Date(l.updatedAt || Date.now()).toISOString() });
        }
    }

    if (toUpload.length > 0) {
        const { error } = await supabaseClient.from('wishlists').upsert(toUpload, { onConflict: 'id' });
        if (error) throw error;
    }
}

async function syncSettings(userId) {
    const { data: remote, error } = await supabaseClient.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    if (error) { console.warn('Ошибка настроек:', error.message); }
    else if (remote) {
        if (remote.goal_books !== undefined) {
            const localTime = parseInt(localStorage.getItem('goalUpdatedAt') || '0');
            if (Date.now() - localTime > 5000) localStorage.setItem('readingGoal', remote.goal_books);
        }
        if (remote.theme) {
            const localTime = parseInt(localStorage.getItem('themeUpdatedAt') || '0');
            if (Date.now() - localTime > 5000) localStorage.setItem('theme', remote.theme);
        }
    }

    const goal = parseInt(localStorage.getItem('readingGoal')) || 0;
    const theme = localStorage.getItem('theme') || 'light';
    
    await supabaseClient.from('user_settings').upsert({ user_id: userId, goal_books: goal, theme: theme }, { onConflict: 'user_id' });
}

window.addEventListener('online', () => { if (typeof syncAll === 'function') syncAll(); });