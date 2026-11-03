// js/details.js
// ============================================================

let currentCoverData = '';

async function openDetails(category, index, customBook = null, source = 'library') {
    let book, detailTarget;
    if (source === 'wishlist') {
        book = customBook;
        if (!book) return;
        detailTarget = { source: 'wishlist', book };
    } else {
        book = customBook || state.library[category][index];
        if (!book) return;
        detailTarget = { source: 'library', category, index, bookId: book.id, book };
    }
    state.editContext.detailTarget = detailTarget;
    state.detailsOrigin = state.currentPage;
    state.isEditingDetails = false;

    document.getElementById('det-title').textContent = book.title || '';
    document.getElementById('det-author').textContent = book.author || 'Неизвестен';
    const genCover = document.getElementById('det-cover-generated');
    genCover.style.backgroundColor = book.color || '#fcfaf5';
    const textColor = getContrastTextColor(book.color || '#fcfaf5');
    document.getElementById('gen-title').textContent = book.title || '';
    document.getElementById('gen-title').style.color = textColor;
    document.getElementById('gen-author').textContent = book.author || 'Неизвестен';
    document.getElementById('gen-author').style.color = textColor;

    currentCoverData = book.cover || '';
    updateCoverPreview();
    await refreshDetailsView();

    const btn = document.getElementById('top-action-btn');
    document.getElementById('page-details').classList.remove('edit-mode');
    btn.classList.remove('active'); btn.title = 'Редактировать'; btn.innerHTML = ICON_EDIT;
    await navigateTo('details');
}

function updateCoverPreview() {
    const img = document.getElementById('det-cover-img');
    const genCover = document.getElementById('det-cover-generated');
    if (currentCoverData) {
        img.src = currentCoverData; img.style.display = 'block'; genCover.style.display = 'none';
    } else {
        img.src = ''; img.style.display = 'none'; genCover.style.display = 'flex';
    }
}

async function refreshDetailsView() {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    if (!book) return;
    const isEditing = state.isEditingDetails;

    document.getElementById('det-title').textContent = book.title || '';
    document.getElementById('det-author').textContent = book.author || '';
    document.getElementById('det-edit-title').value = book.title || '';
    currentCoverData = book.cover || '';
    updateCoverPreview();

    const authorsContainer = document.getElementById('det-author-inputs-container');
    if (!isEditing || authorsContainer.children.length === 0) {
        authorsContainer.innerHTML = '';
        let authorsArr = book.author ? String(book.author).split(',').map(a => a.trim()).filter(Boolean) : [''];
        if (authorsArr.length === 0) authorsArr = [''];
        authorsArr.forEach((a, i) => addDetailAuthorRow(i === 0, a));
    }

    const genresContainer = document.getElementById('det-genres-inputs-container');
    const genresValEl = document.getElementById('val-det-genres');
    const genresWrapper = genresValEl.parentElement;
    const genresArr = Array.isArray(book.genres) ? book.genres : [];
    genresValEl.textContent = genresArr.join(', ');
    genresWrapper.style.display = (genresArr.length === 0 && !isEditing) ? 'none' : '';
    if (!isEditing || genresContainer.children.length === 0) {
        genresContainer.innerHTML = '';
        const arr = genresArr.length > 0 ? genresArr : [''];
        arr.forEach((g, i) => addDetailGenreRow(i === 0, g));
    }

    const tagsContainer = document.getElementById('det-tags-inputs-container');
    const tagsValEl = document.getElementById('val-det-tags');
    const tagsWrapper = tagsValEl.parentElement;
    const tagsArr = Array.isArray(book.tags) ? book.tags : [];
    tagsValEl.textContent = tagsArr.join(', ');
    tagsWrapper.style.display = (tagsArr.length === 0 && !isEditing) ? 'none' : '';
    if (!isEditing || tagsContainer.children.length === 0) {
        tagsContainer.innerHTML = '';
        const arr = tagsArr.length > 0 ? tagsArr : [''];
        arr.forEach((t, i) => addDetailTagRow(i === 0, t));
    }

    const fields = [
        { input: 'det-series', val: 'val-det-series', key: 'series' },
        { input: 'det-volume', val: 'val-det-volume', key: 'volume' },
        { input: 'det-subseries', val: 'val-det-subseries', key: 'subseries' },
        { input: 'det-year', val: 'val-det-year', key: 'year' },
        { input: 'det-country', val: 'val-det-country', key: 'country' },
        { input: 'det-start-date', val: 'val-det-start-date', key: 'startDate', isDate: true },
        { input: 'det-end-date', val: 'val-det-end-date', key: 'endDate', isDate: true },
        { input: 'det-annotation', val: 'val-det-annotation', key: 'annotation' },
        { input: 'det-summary', val: 'val-det-summary', key: 'summary' },
        { input: 'det-timeline', val: 'val-det-timeline', key: 'timeline' },
        { input: 'det-worldMap', val: 'val-det-worldMap', key: 'worldMap' }
    ];

    fields.forEach(f => {
        const valEl = document.getElementById(f.val);
        const inputEl = document.getElementById(f.input);
        const wrapper = valEl.parentElement;
        const value = book[f.key] || '';
        inputEl.value = value;

        if (f.isDate && value) valEl.textContent = formatDateRu(value);
        else valEl.textContent = value;

        if (!value && !isEditing) {
            valEl.classList.add('empty');
            if (wrapper && (wrapper.classList.contains('profile-field') || wrapper.classList.contains('annotation-block'))) wrapper.style.display = 'none';
        } else {
            valEl.classList.remove('empty');
            if (wrapper && (wrapper.classList.contains('profile-field') || wrapper.classList.contains('annotation-block'))) wrapper.style.display = '';
        }
    });

    const formatVal = book.format || '';
    document.getElementById('val-det-format').textContent = formatVal;
    document.getElementById('format-selected-text').textContent = formatVal || 'Не выбрано';
    document.getElementById('det-format').value = formatVal;
    const formats = formatVal.split(',').map(f => f.trim()).filter(Boolean);
    document.querySelectorAll('#format-dropdown-options .custom-select-option').forEach(opt => {
        opt.classList.toggle('selected', formats.includes(opt.textContent));
    });
    const formatWrapper = document.getElementById('val-det-format').parentElement;
    formatWrapper.style.display = (!formatVal && !isEditing) ? 'none' : '';

    const rating = Number(book.rating) || 0;
    const valRatingEl = document.getElementById('val-det-rating');
    if (rating > 0) valRatingEl.innerHTML = '★'.repeat(rating) + '<span style="color:#ccc;">' + '★'.repeat(10 - rating) + '</span>';
    else valRatingEl.innerHTML = '';
    const ratingWrapper = document.getElementById('rating-view-wrapper');
    ratingWrapper.style.display = (!isEditing && rating === 0) ? 'none' : 'block';
    document.querySelectorAll('#star-rating .star').forEach(star => {
        star.classList.toggle('active', parseInt(star.getAttribute('data-value')) <= rating);
    });
    document.getElementById('det-rating').value = rating;

    const impressions = Array.isArray(book.impressions) ? book.impressions : [];
    renderImpressionsList(impressions);
    checkBlockVisibility('block-impressions', [], impressions);

    checkBlockVisibility('block-tracker', [book.startDate, book.endDate]);
    checkBlockVisibility('block-plot', [book.summary, book.timeline, book.worldMap]);

    const characters = Array.isArray(book.characters) ? book.characters : [];
    renderCharactersList(characters);
    checkBlockVisibility('block-characters', [], characters);

    const quotes = Array.isArray(book.quotes) ? book.quotes : [];
    renderQuotesList(quotes);
    checkBlockVisibility('block-quotes', [], quotes);

    const terms = Array.isArray(book.terms) ? book.terms : [];
    renderTermsList(terms);
    checkBlockVisibility('block-terms', [], terms);

    document.querySelectorAll('.detail-list-item-delete').forEach(btn => {
        btn.style.display = isEditing ? 'flex' : 'none';
    });
}

function checkBlockVisibility(blockId, fields, array = null) {
    const isEditing = state.isEditingDetails;
    const block = document.getElementById(blockId);
    if (!block) return;
    if (isEditing) { block.classList.remove('is-empty'); block.style.display = 'block'; return; }
    let hasData = false;
    if (fields) fields.forEach(f => { if (f && String(f).trim() !== '') hasData = true; });
    if (array && array.length > 0) hasData = true;
    if (hasData) { block.classList.remove('is-empty'); block.style.display = 'block'; }
    else { block.classList.add('is-empty'); block.style.display = 'none'; }
}

async function saveDetails() {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    if (!book) return;

    const newTitle = document.getElementById('det-edit-title').value.trim();
    if (!newTitle) { showToast('Название не может быть пустым', 'error'); return; }
    const authors = Array.from(document.querySelectorAll('.det-author-input')).map(i => i.value.trim()).filter(Boolean);
    if (authors.length === 0) { showToast('Укажите хотя бы одного автора', 'error'); return; }

    const genres = Array.from(document.querySelectorAll('.det-genre-input')).map(i => i.value.trim()).filter(Boolean);
    const tags = Array.from(document.querySelectorAll('.det-tag-input')).map(i => i.value.trim()).filter(Boolean);
    const endDateVal = document.getElementById('det-end-date').value;

    const updated = {
        ...book,
        title: newTitle, author: authors.join(', '), cover: currentCoverData || '',
        genres, tags,
        series: document.getElementById('det-series').value,
        subseries: document.getElementById('det-subseries').value,
        volume: parseInt(document.getElementById('det-volume').value) || 0,
        year: document.getElementById('det-year').value,
        country: document.getElementById('det-country').value,
        format: document.getElementById('det-format').value,
        startDate: document.getElementById('det-start-date').value,
        endDate: endDateVal,
        rating: parseInt(document.getElementById('det-rating').value) || 0,
        annotation: document.getElementById('det-annotation').value,
        summary: document.getElementById('det-summary').value,
        timeline: document.getElementById('det-timeline').value,
        worldMap: document.getElementById('det-worldMap').value,
        updatedAt: Date.now()
    };

    try {
        if (target.source === 'library') {
            const shouldMoveToRead = endDateVal && target.category !== 'read';
            let moved = false;
            if (shouldMoveToRead) {
                const emptySlot = state.library.read.findIndex(b => b === null);
                if (emptySlot !== -1) {
                    updated.cabinet = 'read'; updated.slot = emptySlot; moved = true;
                }
            }
            await db.books.put(updated);
            await syncLibraryFromDb();
            await syncCalendarFromDb();
            if (moved) state.editContext.detailTarget = { source: 'library', category: 'read', index: updated.slot, bookId: updated.id, book: updated };
            else state.editContext.detailTarget.book = updated;
        } else if (target.source === 'wishlist') {
            const lists = await getWishlists();
            for (const list of lists) {
                let found = false;
                list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return { ...b, ...updated }; } return b; });
                list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return { ...b, ...updated }; } return b; });
                if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
            }
            await syncWishlistFromDb();
        }
        invalidateAuthorCache(); invalidateGenreCache(); invalidateTagsCache();
        state.isEditingDetails = false;
        document.getElementById('page-details').classList.remove('edit-mode');
        const btn = document.getElementById('top-action-btn');
        btn.classList.remove('active'); btn.title = 'Редактировать'; btn.innerHTML = ICON_EDIT;
        
        document.getElementById('det-genres-inputs-container').innerHTML = '';
        document.getElementById('det-tags-inputs-container').innerHTML = '';
        document.getElementById('det-author-inputs-container').innerHTML = '';
        await refreshDetailsView();
        await renderLibrary();
        if (typeof syncAll === 'function') syncAll();
        showToast('Данные сохранены', 'success');
    } catch (err) {
        showToast('Ошибка сохранения: ' + err.message, 'error');
    }
}

async function handleCoverUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        currentCoverData = await compressImage(file, 800, 0.75);
        updateCoverPreview();
        document.getElementById('det-cover-url').value = '';
    } catch (err) { showToast('Ошибка обработки изображения', 'error'); }
    event.target.value = '';
}

function applyCoverUrl() {
    const url = document.getElementById('det-cover-url').value.trim();
    if (!url) return;
    if (!isImageUrl(url)) { showToast('Некорректная ссылка', 'error'); return; }
    currentCoverData = url; updateCoverPreview();
    document.getElementById('det-cover-file').value = '';
}

function addDetailAuthorRow(isFirst, value) {
    const container = document.getElementById('det-author-inputs-container');
    const row = document.createElement('div');
    row.className = 'author-row';
    const removeBtn = !isFirst ? `<button type="button" class="remove-author-btn" onclick="this.closest('.author-row').remove()"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>` : '';
    row.innerHTML = `
        <div class="author-input-wrap">
            <input type="text" class="det-author-input" value="${escapeHtml(value || '')}" autocomplete="off" oninput="handleAuthorSearch(this)" onfocus="handleAuthorSearch(this)" placeholder="Начните вводить...">
            <div class="custom-dropdown author-suggestions"></div>
        </div>
        ${removeBtn}
        <button type="button" class="add-author-btn" onclick="addDetailAuthorRow(false)">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>`;
    container.appendChild(row);
}
function addDetailGenreRow(isFirst, value) {
    const container = document.getElementById('det-genres-inputs-container');
    const row = document.createElement('div');
    row.className = 'author-row';
    const removeBtn = !isFirst ? `<button type="button" class="remove-author-btn" onclick="this.closest('.author-row').remove()"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>` : '';
    row.innerHTML = `
        <div class="author-input-wrap">
            <input type="text" class="det-genre-input" value="${escapeHtml(value || '')}" autocomplete="off" oninput="handleSuggestSearch(this, getAllGenres)" onfocus="handleSuggestSearch(this, getAllGenres)" placeholder="Начните вводить...">
            <div class="custom-dropdown author-suggestions"></div>
        </div>
        ${removeBtn}
        <button type="button" class="add-author-btn" onclick="addDetailGenreRow(false)">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>`;
    container.appendChild(row);
}
function addDetailTagRow(isFirst, value) {
    const container = document.getElementById('det-tags-inputs-container');
    const row = document.createElement('div');
    row.className = 'author-row';
    const removeBtn = !isFirst ? `<button type="button" class="remove-author-btn" onclick="this.closest('.author-row').remove()"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>` : '';
    row.innerHTML = `
        <div class="author-input-wrap">
            <input type="text" class="det-tag-input" value="${escapeHtml(value || '')}" autocomplete="off" oninput="handleSuggestSearch(this, getAllTags)" onfocus="handleSuggestSearch(this, getAllTags)" placeholder="Начните вводить...">
            <div class="custom-dropdown author-suggestions"></div>
        </div>
        ${removeBtn}
        <button type="button" class="add-author-btn" onclick="addDetailTagRow(false)">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>`;
    container.appendChild(row);
}

function toggleFormatOption(el, value) {
    el.classList.toggle('selected');
    const selected = Array.from(document.querySelectorAll('#format-dropdown-options .custom-select-option.selected')).map(opt => opt.textContent);
    const val = selected.join(', ');
    document.getElementById('det-format').value = val;
    document.getElementById('format-selected-text').textContent = val || 'Не выбрано';
}

function initStarRating() {
    document.querySelectorAll('#star-rating .star').forEach(star => {
        star.addEventListener('click', (e) => {
            if (!state.isEditingDetails) return;
            const rating = parseInt(e.target.getAttribute('data-value'));
            document.getElementById('det-rating').value = rating;
            document.querySelectorAll('#star-rating .star').forEach(s => {
                s.classList.toggle('active', parseInt(s.getAttribute('data-value')) <= rating);
            });
        });
    });
}

function renderImpressionsList(items) {
    const list = document.getElementById('impressions-list');
    list.innerHTML = '';
    if (!items || items.length === 0) { list.innerHTML = '<div style="color:#888; font-size:13px; font-style:italic;">Список впечатлений пуст.</div>'; return; }
    items.forEach((imp, idx) => {
        const div = document.createElement('div');
        div.className = 'detail-list-item';
        div.innerHTML = `
            <div class="detail-list-item-content">
                <div style="font-size:11px; color:#888; margin-bottom:4px;">${escapeHtml(formatDateRu(imp.date || ''))}</div>
                <div class="detail-list-item-desc">${escapeHtml(imp.text || '')}</div>
            </div>
            <button class="detail-list-item-delete" onclick="removeImpression(${idx})" title="Удалить">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`;
        list.appendChild(div);
    });
}

function openAddImpressionModalFromDetails() {
    if (!state.editContext.detailTarget) return;
    state.impressionContext = { type: 'details' };
    document.getElementById('imp-modal-book-title').textContent = state.editContext.detailTarget.book.title || '';
    document.getElementById('imp-modal-text').value = '';
    document.getElementById('add-impression-modal').style.display = 'flex';
}

async function saveImpressionFromDetails(text) {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    const impressions = Array.isArray(book.impressions) ? [...book.impressions] : [];
    impressions.push({ text, date: getTodayIsoStr() });
    const updated = { ...book, impressions, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated;
    await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

async function removeImpression(idx) {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    const impressions = Array.isArray(book.impressions) ? [...book.impressions] : [];
    impressions.splice(idx, 1);
    const updated = { ...book, impressions, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated;
    await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

function renderCharactersList(items) {
    const list = document.getElementById('characters-list');
    list.innerHTML = '';
    if (!items || items.length === 0) { list.innerHTML = '<div style="color:#888; font-size:13px; font-style:italic;">Список персонажей пуст.</div>'; return; }
    items.forEach((ch, idx) => {
        const div = document.createElement('div');
        div.className = 'detail-list-item';
        const imgHtml = ch.image ? `<img src="${escapeHtml(ch.image)}" class="detail-list-item-img" alt="">` : `<div class="detail-list-item-img" style="display:flex; align-items:center; justify-content:center; font-size:24px; color:#aaa;">👤</div>`;
        div.innerHTML = `
            ${imgHtml}
            <div class="detail-list-item-content">
                <div class="detail-list-item-title">${escapeHtml(ch.name || '')}</div>
                <div class="detail-list-item-role">${escapeHtml(ch.role || '')}</div>
            </div>
            <button class="detail-list-item-delete" onclick="removeCharacter(${idx})" title="Удалить">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`;
        list.appendChild(div);
    });
}

function openCharacterModal() { document.getElementById('char-name').value = ''; document.getElementById('char-role').value = 'Главный герой'; document.getElementById('char-image').value = ''; document.getElementById('character-modal').style.display = 'flex'; }
function closeCharacterModal() { document.getElementById('character-modal').style.display = 'none'; }

async function saveCharacter() {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const name = document.getElementById('char-name').value.trim();
    if (!name) return;
    const book = target.book;
    const characters = Array.isArray(book.characters) ? [...book.characters] : [];
    characters.push({ name, role: document.getElementById('char-role').value, image: document.getElementById('char-image').value.trim() });
    const updated = { ...book, characters, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated; closeCharacterModal(); await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

async function removeCharacter(idx) {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    const characters = Array.isArray(book.characters) ? [...book.characters] : [];
    characters.splice(idx, 1);
    const updated = { ...book, characters, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated; await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

function renderQuotesList(items) {
    const list = document.getElementById('quotes-list');
    list.innerHTML = '';
    if (!items || items.length === 0) { list.innerHTML = '<div style="color:#888; font-size:13px; font-style:italic;">Список цитат пуст.</div>'; return; }
    items.forEach((q, idx) => {
        const div = document.createElement('div');
        div.className = 'detail-list-item';
        div.innerHTML = `
            <div class="detail-list-item-content">
                <div style="font-size:11px; color:#888; margin-bottom:4px;">${escapeHtml(formatDateRu(q.date || ''))}</div>
                <div class="detail-list-item-desc" style="font-style:italic; font-family:'Playfair Display',serif;">«${escapeHtml(q.text || '')}»</div>
            </div>
            <button class="detail-list-item-delete" onclick="removeQuote(${idx})" title="Удалить">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`;
        list.appendChild(div);
    });
}

function openQuoteModal() { document.getElementById('quote-text').value = ''; document.getElementById('quote-modal').style.display = 'flex'; }
function closeQuoteModal() { document.getElementById('quote-modal').style.display = 'none'; }

async function saveQuote() {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const text = document.getElementById('quote-text').value.trim();
    if (!text) return;
    const book = target.book;
    const quotes = Array.isArray(book.quotes) ? [...book.quotes] : [];
    quotes.push({ text, date: getTodayIsoStr() });
    const updated = { ...book, quotes, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated; closeQuoteModal(); await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

async function removeQuote(idx) {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    const quotes = Array.isArray(book.quotes) ? [...book.quotes] : [];
    quotes.splice(idx, 1);
    const updated = { ...book, quotes, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated; await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

function renderTermsList(items) {
    const list = document.getElementById('terms-list');
    list.innerHTML = '';
    if (!items || items.length === 0) { list.innerHTML = '<div style="color:#888; font-size:13px; font-style:italic;">Список терминов пуст.</div>'; return; }
    items.forEach((t, idx) => {
        const div = document.createElement('div');
        div.className = 'detail-list-item';
        div.innerHTML = `
            <div class="detail-list-item-content">
                <div class="detail-list-item-title">${escapeHtml(t.name || '')}</div>
                <div class="detail-list-item-desc">${escapeHtml(t.def || '')}</div>
            </div>
            <button class="detail-list-item-delete" onclick="removeTerm(${idx})" title="Удалить">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`;
        list.appendChild(div);
    });
}

function openTermModal() { document.getElementById('term-name').value = ''; document.getElementById('term-def').value = ''; document.getElementById('term-modal').style.display = 'flex'; }
function closeTermModal() { document.getElementById('term-modal').style.display = 'none'; }

async function saveTerm() {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const name = document.getElementById('term-name').value.trim();
    const def = document.getElementById('term-def').value.trim();
    if (!name) return;
    const book = target.book;
    const terms = Array.isArray(book.terms) ? [...book.terms] : [];
    terms.push({ name, def });
    const updated = { ...book, terms, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated; closeTermModal(); await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

async function removeTerm(idx) {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    const terms = Array.isArray(book.terms) ? [...book.terms] : [];
    terms.splice(idx, 1);
    const updated = { ...book, terms, updatedAt: Date.now() };
    if (target.source === 'library') { await db.books.put(updated); await syncLibraryFromDb(); }
    else {
        const lists = await getWishlists();
        for (const list of lists) {
            let found = false;
            list.books = (list.books || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            list.completed = (list.completed || []).map(b => { if (b.id === book.id) { found = true; return updated; } return b; });
            if (found) { await db.wishlists.put({...list, updatedAt: Date.now()}); break; }
        }
        await syncWishlistFromDb();
    }
    target.book = updated; await refreshDetailsView();
    if (typeof syncAll === 'function') syncAll();
}

async function autoFillBookInfo() {
    const target = state.editContext.detailTarget;
    if (!target) return;
    const book = target.book;
    if (!book) return;

    const btn = document.getElementById('btn-auto-fill');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    btn.style.display = 'none';
    progressContainer.style.display = 'flex';

    const updateProgress = (val, text) => {
        progressBar.style.width = val + '%';
        progressText.textContent = text || (val + '%');
    };

    const primaryAuthor = book.author ? String(book.author).split(',')[0].trim() : '';
    const cleanTitle = String(book.title || '').replace(/[:"'!?.,]/g, '').trim();
    const cleanAuthor = primaryAuthor.split(' ')[0].replace(/[:"'!?.,]/g, '').trim();

    updateProgress(10, 'Загрузка базы...');

    try {
        const dbBooks = await fetchDbBooks();
        if (!dbBooks || dbBooks.length === 0) throw new Error('Не удалось загрузить book_info.xlsx');
        updateProgress(60, 'Поиск совпадений...');

        const getField = (obj, ...names) => {
            if (!obj || typeof obj !== 'object') return '';
            for (const name of names) {
                for (const key of Object.keys(obj)) {
                    if (key.toLowerCase().trim() === name.toLowerCase().trim()) return obj[key];
                }
            }
            return '';
        };

        const searchTitle = normalizeString(cleanTitle);
        const searchAuthor = normalizeString(cleanAuthor);
        const found = dbBooks.find(b => {
            const bTitle = normalizeString(getField(b, 'Название', 'Title', 'title', 'name'));
            const bAuthor = normalizeString(getField(b, 'Автор(ы)', 'Автор', 'Author', 'author', 'authors'));
            if (!bTitle) return false;
            const titleMatch = bTitle.includes(searchTitle) || searchTitle.includes(bTitle);
            const authorMatch = !searchAuthor || !bAuthor || bAuthor.includes(searchAuthor) || searchAuthor.includes(bAuthor);
            return titleMatch && authorMatch;
        });

        if (!found) { updateProgress(100, '❌ Не найдено'); return; }
        updateProgress(90, 'Заполнение...');

        const description = getField(found, 'Аннотация', 'Annotation', 'annotation', 'description', 'Описание');
        const pageCount = getField(found, 'Количество страниц (варианты)', 'Количество страниц', 'Pages', 'pages', 'pageCount');
        const year = getField(found, 'Год публикации', 'Год', 'Year', 'year');
        const country = getField(found, 'Страна', 'Country', 'country');
        const series = getField(found, 'Цикл', 'Series', 'series');
        const subseries = getField(found, 'Подцикл', 'Subseries', 'subseries');
        const genresRaw = getField(found, 'Жанры', 'Genres', 'genres', 'Категории', 'Categories');

        let genres = [];
        if (typeof genresRaw === 'string') genres = genresRaw.split(/[,;]/).map(g => g.trim()).filter(Boolean);
        else if (Array.isArray(genresRaw)) genres = genresRaw;

        if (genres.length > 0) {
            const genresContainer = document.getElementById('det-genres-inputs-container');
            genresContainer.innerHTML = '';
            genres.forEach((g, i) => addDetailGenreRow(i === 0, g));
        }
        if (pageCount) { const m = String(pageCount).match(/\d+/); if (m) document.getElementById('det-volume').value = m[0]; }
        if (year) { const m = String(year).match(/\d{4}/); if (m) document.getElementById('det-year').value = m[0]; }
        if (country) document.getElementById('det-country').value = country;
        if (series) document.getElementById('det-series').value = series;
        if (subseries) document.getElementById('det-subseries').value = subseries;
        if (description) {
            const tmp = document.createElement('div');
            tmp.innerHTML = String(description);
            const clean = (tmp.textContent || tmp.innerText || '').trim();
            if (clean) document.getElementById('det-annotation').value = clean;
        }
        updateProgress(100, '✅ Готово');
    } catch (err) {
        updateProgress(100, '⚠ ' + (err.message || 'Ошибка').slice(0, 40));
    } finally {
        setTimeout(() => {
            progressContainer.style.display = 'none';
            btn.style.display = 'flex';
            updateProgress(0);
        }, 2500);
    }
}
