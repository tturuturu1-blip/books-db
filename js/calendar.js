// js/calendar.js
// ============================================================

let currentCalendarDate = new Date();
let selectedCalendarDateStr = '';
let moveCalendarDate = new Date();
let moveContext = { sourceDate: null, title: null };

const MONTH_NAMES_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

async function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    document.getElementById('current-month-year').textContent = `${MONTH_NAMES_RU[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    WEEKDAYS_RU.forEach(d => {
        const el = document.createElement('div');
        el.className = 'calendar-day-name'; el.textContent = d;
        grid.appendChild(el);
    });

    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startOffset; i++) {
        const el = document.createElement('div');
        el.className = 'calendar-day empty';
        grid.appendChild(el);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';

        const numEl = document.createElement('div');
        numEl.className = 'calendar-day-number'; numEl.textContent = day;
        dayEl.appendChild(numEl);

        const titles = state.calendar[dateStr] || [];
        if (titles.length > 0) {
            const booksDiv = document.createElement('div');
            booksDiv.className = 'calendar-day-books';
            titles.forEach(title => {
                const found = findBookByTitleLocal(title);
                if (!found) return;
                const b = found.book;
                if (b.cover) {
                    const img = document.createElement('img');
                    img.src = b.cover; img.className = 'calendar-mini-cover'; img.alt = ''; img.loading = 'lazy'; img.title = title;
                    booksDiv.appendChild(img);
                } else {
                    const fallback = document.createElement('div');
                    fallback.className = 'calendar-fallback-spine';
                    fallback.style.backgroundColor = b.color || '#ccc';
                    fallback.style.color = getContrastTextColor(b.color);
                    fallback.textContent = title; fallback.title = title;
                    booksDiv.appendChild(fallback);
                }
            });
            dayEl.appendChild(booksDiv);
        }
        dayEl.onclick = () => openCalendarModal(dateStr);
        grid.appendChild(dayEl);
    }
}

function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderCalendar();
}

function openCalendarModal(dateStr) {
    closeAllCustomDropdowns();
    selectedCalendarDateStr = dateStr;
    document.getElementById('calendar-modal-date').textContent = formatDateRu(dateStr);
    showCalendarEntriesView();
    document.getElementById('calendar-modal').style.display = 'flex';
}

function closeCalendarModal() {
    closeAllCustomDropdowns();
    document.getElementById('calendar-modal').style.display = 'none';
}

async function showCalendarEntriesView() {
    closeAllCustomDropdowns();
    document.getElementById('calendar-entries-view').style.display = 'block';
    document.getElementById('calendar-add-view').style.display = 'none';

    const list = document.getElementById('calendar-entries-list');
    list.innerHTML = '';
    const titles = state.calendar[selectedCalendarDateStr] || [];
    
    if (titles.length === 0) {
        list.innerHTML = '<p class="text-center" style="color:#666; font-size:14px; padding:20px 0;">Нет записей на этот день.</p>';
        return;
    }

    titles.forEach(title => {
        const found = findBookByTitleLocal(title);
        if (!found) return;
        const b = found.book;

        let coverHtml;
        if (b.cover) {
            coverHtml = `<img src="${escapeHtml(b.cover)}" class="calendar-entry-cover" alt="" loading="lazy">`;
        } else {
            const textColor = getContrastTextColor(b.color);
            coverHtml = `<div class="calendar-entry-cover" style="background-color:${escapeHtml(b.color || '#eee')}; color:${textColor}; display:flex; align-items:center; justify-content:center; text-align:center; font-size:12px; padding:5px; box-sizing:border-box;">${escapeHtml(title)}</div>`;
        }

        const dailyProg = b.dailyProgress && b.dailyProgress[selectedCalendarDateStr] ? b.dailyProgress[selectedCalendarDateStr] : { current: 0, total: b.volume || 0 };
        const percent = dailyProg.total > 0 ? Math.min(100, Math.round((dailyProg.current / dailyProg.total) * 100)) : 0;
        const progressHtml = dailyProg.total > 0 ? `
            <div class="calendar-entry-progress-container">
                <div class="calendar-entry-progress-bar">
                    <div class="calendar-entry-progress-fill" style="width:${percent}%;"></div>
                </div>
                <div class="calendar-entry-progress-text">${dailyProg.current} / ${dailyProg.total} (${percent}%)</div>
            </div>` : '';

        const safeId = b.id;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'calendar-entry-card';
        itemDiv.innerHTML = `
            <div class="calendar-entry-left">${coverHtml}</div>
            <div class="calendar-entry-right">
                <div class="calendar-entry-icons">
                    <button class="calendar-entry-icon-btn" data-action="details" data-id="${safeId}" title="Подробнее">
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </button>
                    <button class="calendar-entry-icon-btn" data-action="progress" data-id="${safeId}" title="Прогресс">
                        <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    </button>
                    <button class="calendar-entry-icon-btn" data-action="move" data-id="${safeId}" title="Перенести">
                        <svg viewBox="0 0 24 24"><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>
                    </button>
                    <button class="calendar-entry-icon-btn delete-icon" data-action="delete" data-id="${safeId}" title="Удалить">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
                <div class="calendar-entry-title">${escapeHtml(b.title)}</div>
                <div class="calendar-entry-author">${escapeHtml(b.author || '')}</div>
                ${progressHtml}
                <div class="calendar-entry-actions">
                    <button class="calendar-entry-btn" data-action="impression" data-id="${safeId}">Впечатление</button>
                    <button class="calendar-entry-btn" data-action="quote" data-id="${safeId}">Цитата</button>
                </div>
            </div>`;

        itemDiv.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                handleCalendarEntryAction(btn.dataset.action, btn.dataset.id);
            });
        });
        list.appendChild(itemDiv);
    });
}

async function handleCalendarEntryAction(action, bookId) {
    const book = await db.books.get(bookId);
    if (!book) return;

    if (action === 'details' && typeof openDetails === 'function') {
        closeCalendarModal();
        state.detailsOrigin = 'calendar';
        await openDetails(book.cabinet, book.slot);
    } else if (action === 'progress') {
        openProgressModal(bookId);
    } else if (action === 'move') {
        calendarEntryMove(book.title);
    } else if (action === 'delete') {
        await calendarEntryDelete(book.title);
    } else if (action === 'impression') {
        openCalendarImpressionModal(book.title);
    } else if (action === 'quote') {
        openCalendarQuoteModal(book.title);
    }
}

function showCalendarAddBookView() {
    closeAllCustomDropdowns();
    document.getElementById('calendar-entries-view').style.display = 'none';
    document.getElementById('calendar-add-view').style.display = 'block';

    const optionsContainer = document.getElementById('cal-dropdown-options');
    optionsContainer.innerHTML = '';
    document.getElementById('cal-selected-text').textContent = '-- Не выбрано --';
    document.getElementById('cal-selected-value').value = '';
    document.getElementById('calendar-book-select').classList.remove('open');

    let total = 0;
    const addGroup = (label, books) => {
        if (books.length === 0) return;
        total += books.length;
        const g = document.createElement('div');
        g.className = 'custom-select-group'; g.textContent = label;
        optionsContainer.appendChild(g);
        books.forEach(book => {
            if (!book) return;
            const opt = document.createElement('div');
            opt.className = 'custom-select-option'; opt.textContent = book.title;
            opt.onclick = (ev) => {
                ev.stopPropagation();
                document.getElementById('cal-selected-text').textContent = book.title;
                document.getElementById('cal-selected-value').value = book.title;
                document.getElementById('calendar-book-select').classList.remove('open');
            };
            optionsContainer.appendChild(opt);
        });
    };

    addGroup('Читаю', state.library.reading.filter(Boolean));
    addGroup('Прочитано', state.library.read.filter(Boolean));
    addGroup('В планах', state.library.planned.filter(Boolean));
    addGroup('На паузе', state.library.paused.filter(Boolean));
    addGroup('Брошено', state.library.dropped.filter(Boolean));

    if (total === 0) {
        const empty = document.createElement('div');
        empty.className = 'custom-select-option'; empty.textContent = 'Нет доступных книг в библиотеке';
        optionsContainer.appendChild(empty);
    }
}

async function saveCalendarPlan() {
    const title = document.getElementById('cal-selected-value').value;
    if (!title || title === 'Нет доступных книг в библиотеке') { showCalendarEntriesView(); return; }
    const current = state.calendar[selectedCalendarDateStr] || [];
    if (!current.includes(title)) {
        current.push(title);
        try {
            await setCalendarTitles(selectedCalendarDateStr, current);
            await syncCalendarFromDb();
            await renderCalendar();
            if (typeof syncAll === 'function') syncAll();
        } catch (err) {
            showToast('Не удалось сохранить: ' + err.message, 'error');
        }
    }
    showCalendarEntriesView();
}

async function openProgressModal(bookId) {
    const book = await db.books.get(bookId);
    if (!book) return;
    state.progressContext = { bookId, dateStr: selectedCalendarDateStr };
    document.getElementById('progress-book-title').textContent = `«${book.title}» (${formatDateRu(selectedCalendarDateStr)})`;
    const dailyProg = book.dailyProgress && book.dailyProgress[selectedCalendarDateStr] ? book.dailyProgress[selectedCalendarDateStr] : { current: '', total: book.volume || '' };
    document.getElementById('progress-current-page').value = dailyProg.current || '';
    document.getElementById('progress-total-pages').value = dailyProg.total || '';
    document.getElementById('progress-modal').style.display = 'flex';
}

function closeProgressModal() {
    document.getElementById('progress-modal').style.display = 'none';
    state.progressContext = null;
}

async function saveProgress() {
    if (!state.progressContext) return;
    const { bookId, dateStr } = state.progressContext;
    const current = parseInt(document.getElementById('progress-current-page').value) || 0;
    const total = parseInt(document.getElementById('progress-total-pages').value) || 0;

    try {
        const book = await db.books.get(bookId);
        if (!book) return;
        const dailyProgress = { ...(book.dailyProgress || {}) };
        dailyProgress[dateStr] = { current, total };
        await db.books.update(bookId, { dailyProgress, volume: total || book.volume || 0, updatedAt: Date.now() });
        await syncLibraryFromDb();
        closeProgressModal();
        await showCalendarEntriesView();
        if (typeof syncAll === 'function') syncAll();
    } catch (err) {
        showToast('Не удалось сохранить прогресс: ' + err.message, 'error');
    }
}

function openCalendarImpressionModal(title) {
    state.impressionContext = { type: 'calendar', title };
    document.getElementById('imp-modal-book-title').textContent = `«${title}»`;
    document.getElementById('imp-modal-text').value = '';
    document.getElementById('add-impression-modal').style.display = 'flex';
}

function closeAddImpressionModal() {
    document.getElementById('add-impression-modal').style.display = 'none';
    state.impressionContext = null;
}

async function saveCalendarImpression() {
    if (!state.impressionContext) return;
    const text = document.getElementById('imp-modal-text').value.trim();
    if (!text) return;
    try {
        if (state.impressionContext.type === 'calendar') {
            const found = findBookByTitleLocal(state.impressionContext.title);
            if (!found) { closeAddImpressionModal(); return; }
            const book = found.book;
            const impressions = Array.isArray(book.impressions) ? [...book.impressions] : [];
            impressions.push({ text, date: selectedCalendarDateStr });
            await db.books.update(book.id, { impressions, updatedAt: Date.now() });
            await syncLibraryFromDb();
            if (typeof syncAll === 'function') syncAll();
        } else if (state.impressionContext.type === 'details') {
            if (typeof saveImpressionFromDetails === 'function') await saveImpressionFromDetails(text);
        }
        closeAddImpressionModal();
        await showCalendarEntriesView();
    } catch (err) {
        showToast('Ошибка сохранения: ' + err.message, 'error');
    }
}

function openCalendarQuoteModal(title) {
    state.quoteContext = { type: 'calendar', title };
    document.getElementById('quote-modal-book-title').textContent = `«${title}»`;
    document.getElementById('quote-modal-text').value = '';
    document.getElementById('add-quote-modal').style.display = 'flex';
}

function closeAddQuoteModal() {
    document.getElementById('add-quote-modal').style.display = 'none';
    state.quoteContext = null;
}

async function saveCalendarQuote() {
    if (!state.quoteContext) return;
    const text = document.getElementById('quote-modal-text').value.trim();
    if (!text) return;
    try {
        if (state.quoteContext.type === 'calendar') {
            const found = findBookByTitleLocal(state.quoteContext.title);
            if (!found) { closeAddQuoteModal(); return; }
            const book = found.book;
            const quotes = Array.isArray(book.quotes) ? [...book.quotes] : [];
            quotes.push({ text, date: selectedCalendarDateStr });
            await db.books.update(book.id, { quotes, updatedAt: Date.now() });
            await syncLibraryFromDb();
            if (typeof syncAll === 'function') syncAll();
        }
        closeAddQuoteModal();
        await showCalendarEntriesView();
    } catch (err) {
        showToast('Ошибка сохранения: ' + err.message, 'error');
    }
}

function calendarEntryMove(title) {
    moveContext = { sourceDate: selectedCalendarDateStr, title };
    moveCalendarDate = new Date();
    renderMoveCalendar();
    document.getElementById('move-date-modal').style.display = 'flex';
}

function closeMoveDateModal() {
    document.getElementById('move-date-modal').style.display = 'none';
    moveContext = { sourceDate: null, title: null };
}

function renderMoveCalendar() {
    const grid = document.getElementById('move-date-grid');
    grid.innerHTML = '';
    const year = moveCalendarDate.getFullYear();
    const month = moveCalendarDate.getMonth();
    document.getElementById('move-date-month-year').textContent = `${MONTH_NAMES_RU[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    WEEKDAYS_RU.forEach(d => {
        const el = document.createElement('div');
        el.className = 'calendar-day-name'; el.textContent = d;
        grid.appendChild(el);
    });

    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startOffset; i++) {
        const el = document.createElement('div');
        el.className = 'calendar-day empty'; grid.appendChild(el);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.style.minHeight = '60px';

        const numEl = document.createElement('div');
        numEl.className = 'calendar-day-number'; numEl.textContent = day;
        dayEl.appendChild(numEl);
        dayEl.onclick = () => executeMoveDate(dateStr);
        grid.appendChild(dayEl);
    }
}

function changeMoveDateMonth(offset) {
    moveCalendarDate.setMonth(moveCalendarDate.getMonth() + offset);
    renderMoveCalendar();
}

async function executeMoveDate(newDateStr) {
    if (!moveContext.sourceDate || !moveContext.title) return;
    try {
        const sourceTitles = [...(state.calendar[moveContext.sourceDate] || [])];
        const idx = sourceTitles.indexOf(moveContext.title);
        if (idx > -1) {
            sourceTitles.splice(idx, 1);
            await setCalendarTitles(moveContext.sourceDate, sourceTitles);
        }
        const targetTitles = [...(state.calendar[newDateStr] || [])];
        if (!targetTitles.includes(moveContext.title)) targetTitles.push(moveContext.title);
        await setCalendarTitles(newDateStr, targetTitles);
        await syncCalendarFromDb();
        await renderCalendar();
        closeMoveDateModal();
        await showCalendarEntriesView();
        if (typeof syncAll === 'function') syncAll();
    } catch (err) {
        showToast('Ошибка переноса: ' + err.message, 'error');
    }
}

async function calendarEntryDelete(title) {
    try {
        const titles = [...(state.calendar[selectedCalendarDateStr] || [])];
        const idx = titles.indexOf(title);
        if (idx === -1) return;
        titles.splice(idx, 1);
        await setCalendarTitles(selectedCalendarDateStr, titles);
        await syncCalendarFromDb();
        await renderCalendar();
        await showCalendarEntriesView();
        if (typeof syncAll === 'function') syncAll();
    } catch (err) {
        showToast('Ошибка удаления: ' + err.message, 'error');
    }
}

function closeAllCustomDropdowns() {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
}

function toggleCustomDropdown(e, wrapperId) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    const isOpen = wrapper.classList.contains('open');
    document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        if (w.id !== wrapperId) w.classList.remove('open');
    });
    if (isOpen) wrapper.classList.remove('open');
    else wrapper.classList.add('open');
}
