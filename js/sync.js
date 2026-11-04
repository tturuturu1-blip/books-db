// js/sync.js
// ============================================================
// Движок синхронизации IndexedDB <-> Supabase
// ============================================================

let isSyncing = false;

// Конвертация локальной книги в формат базы данных Supabase
function toDbBook(b, userId) {
    return {
        id: b.id,
        user_id: userId,
        cabinet: b.cabinet || 'reading',
        slot: b.slot || 0,
        title: b.title || 'Без названия',
        author: b.author || 'Неизвестен',
        color: b.color || '#fcfaf5',
        pattern: b.pattern || '',
        cover: b.cover || '',
        spine_image: b.spineImage || '',
        rating: b.rating || 0,
        genres: Array.isArray(b.genres) ? b.genres : (b.genres ? String(b.genres).split(',').map(g => g.trim()) : []),
        tags: Array.isArray(b.tags) ? b.tags : (b.tags ? String(b.tags).split(',').map(t => t.trim()) : []),
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

// Конвертация книги из базы данных Supabase в локальный формат
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
        genres: r.genres || [],
        tags: r.tags || [],
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
        impressions: r.impressions || [],
        quotes: r.quotes || [],
        characters: r.characters || [],
        terms: r.terms || [],
        dailyProgress: r.daily_progress || {},
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
    };
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ СИНХРОНИЗАЦИИ
// ============================================================
async function syncAll() {
    if (!currentUser || !navigator.onLine || isSyncing) return;
    
    isSyncing = true;
    console.log('🔄 НАЧАЛО СИНХРОНИЗАЦИИ...');
    
    try {
        const userId = currentUser.id;
        
        // 1. Синхронизация книг
        await syncBooks(userId);
        
        // 2. Синхронизация календаря (оборачиваем в try/catch, чтобы не сломать книги)
        try { await syncCalendar(userId); } catch(e) { console.error('Ошибка календаря:', e); }
        
        // 3. Синхронизация коллекций
        try { await syncCollections(userId); } catch(e) { console.error('Ошибка коллекций:', e); }
        
        // 4. Синхронизация желаний
        try { await syncWishlists(userId); } catch(e) { console.error('Ошибка вишлиста:', e); }
        
        // 5. Синхронизация настроек
        try { await syncSettings(userId); } catch(e) { console.error('Ошибка настроек:', e); }
        
        console.log('✅ СИНХРОНИЗАЦИЯ УСПЕШНО ЗАВЕРШЕНА');
    } catch (err) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА СИНХРОНИЗАЦИИ:', err);
    } finally {
        isSyncing = false;
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ КНИГ (Пошаговое слияние)
// ============================================================
async function syncBooks(userId) {
    console.log('📚 Синхронизация книг...');
    
    // 1. Получаем данные из облака
    const { data: remoteBooks, error: pullError } = await supabaseClient
        .from('books')
        .select('*')
        .eq('user_id', userId);
        
    if (pullError) throw pullError;
    console.log(`⬇️ Из облака получено книг: ${remoteBooks.length}`);

    // 2. Получаем данные с устройства
    const localBooks = await db.books.toArray();
    const localMap = new Map(localBooks.map(b => [b.id, b]));
    console.log(`📱 На устройстве книг: ${localBooks.length}`);

    // 3. Слияние (Облако -> Устройство)
    // Если книга есть в облаке, но её нет на устройстве (или облачная версия новее), скачиваем её
    for (const rBook of remoteBooks) {
        const lBook = localMap.get(rBook.id);
        const remoteTime = rBook.updated_at ? new Date(rBook.updated_at).getTime() : 0;
        const localTime = lBook ? lBook.updatedAt : 0;

        if (!lBook || remoteTime > localTime) {
            console.log(`  + Скачиваем книгу из облака: ${rBook.title}`);
            await db.books.put(fromDbBook(rBook));
        }
    }

    // 4. Слияние (Устройство -> Облако)
    // Если книга есть на устройстве, но её нет в облаке (или локальная версия новее), отправляем её
    const updatedLocalBooks = await db.books.toArray();
    const booksToUpload = [];

    for (const lBook of updatedLocalBooks) {
        const rBook = remoteBooks.find(r => r.id === lBook.id);
        const remoteTime = rBook && rBook.updated_at ? new Date(rBook.updated_at).getTime() : 0;
        const localTime = lBook.updatedAt || 0;

        if (!rBook || localTime > remoteTime) {
            console.log(`  ⬆️ Отправляем книгу в облако: ${lBook.title}`);
            booksToUpload.push(toDbBook(lBook, userId));
        }
    }

    // 5. Отправка накопленных данных в облако
    if (booksToUpload.length > 0) {
        // Отправляем частями по 50 штук, чтобы не превысить лимиты
        for (let i = 0; i < booksToUpload.length; i += 50) {
            const chunk = booksToUpload.slice(i, i + 50);
            const { error: pushError } = await supabaseClient.from('books').upsert(chunk);
            if (pushError) throw pushError;
        }
        console.log(`✅ В облако отправлено книг: ${booksToUpload.length}`);
    } else {
        console.log(`ℹ️ Новых книг для отправки нет.`);
    }
}

// ============================================================
// ОСТАЛЬНЫЕ СИНХРОНИЗАЦИИ (Календарь, Коллекции, Вишлист)
// ============================================================
async function syncCalendar(userId) {
    const { data: remote, error } = await supabaseClient.from('calendar').select('*').eq('user_id', userId);
    if (error) throw error;

    for (const r of remote) {
        await db.calendar.put({ date: r.date, books: r.books });
    }

    const local = await db.calendar.toArray();
    if (local.length > 0) {
        const toUpload = local.map(c => ({ date: c.date, user_id: userId, books: c.books }));
        await supabaseClient.from('calendar').upsert(toUpload);
    }
}

async function syncCollections(userId) {
    const { data: remote, error } = await supabaseClient.from('collections').select('*').eq('user_id', userId);
    if (error) throw error;

    const local = await db.collections.toArray();
    const localMap = new Map(local.map(c => [c.id, c]));

    for (const r of remote) {
        await db.collections.put({ id: r.id, name: r.name, books: r.books, updatedAt: Date.now() });
    }

    const toUpload = [];
    for (const l of local) {
        const r = remote.find(x => x.id === l.id);
        if (!r || l.updatedAt > (r.updated_at || 0)) {
            toUpload.push({ id: l.id, user_id: userId, name: l.name, books: l.books });
        }
    }

    if (toUpload.length > 0) {
        await supabaseClient.from('collections').upsert(toUpload);
    }
}

async function syncWishlists(userId) {
    const { data: remote, error } = await supabaseClient.from('wishlists').select('*').eq('user_id', userId);
    if (error) throw error;

    for (const r of remote) {
        await db.wishlists.put({ id: r.id, name: r.name, books: r.books, completed: r.completed, updatedAt: Date.now() });
    }

    const local = await db.wishlists.toArray();
    const toUpload = local.map(l => ({ id: l.id, user_id: userId, name: l.name, books: l.books, completed: l.completed }));
    
    if (toUpload.length > 0) {
        await supabaseClient.from('wishlists').upsert(toUpload);
    }
}

async function syncSettings(userId) {
    const { data: remote, error } = await supabaseClient.from('user_settings').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') console.warn('Ошибка настроек:', error);

    if (remote) {
        if (remote.goal_books) localStorage.setItem('readingGoal', remote.goal_books);
        if (remote.theme) localStorage.setItem('theme', remote.theme);
    }

    const goal = parseInt(localStorage.getItem('readingGoal')) || 0;
    const theme = localStorage.getItem('theme') || 'light';
    
    await supabaseClient.from('user_settings').upsert({ 
        user_id: userId, 
        goal_books: goal, 
        theme: theme 
    });
}

// Автоматическая синхронизация при восстановлении интернета
window.addEventListener('online', () => {
    console.log('🌐 Интернет восстановлен. Запуск синхронизации...');
    if (typeof syncAll === 'function') syncAll();
});
