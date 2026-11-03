// js/collections.js
// ============================================================

let selectedCollectionId = null;

async function renderCollections() {
    const container = document.getElementById('collections-list');
    container.innerHTML = '';
    if (state.collections.length === 0) { container.innerHTML = '<p class="text-center">У вас пока нет коллекций.</p>'; return; }

    state.collections.forEach(col => {
        const card = document.createElement('div');
        card.className = 'collection-card';

        let booksHtml;
        const booksArr = Array.isArray(col.books) ? col.books : [];
        if (booksArr.length === 0) booksHtml = '<div style="font-size:12px; color:#888;">Пусто</div>';
        else {
            booksHtml = booksArr.map(title => {
                const found = findBookByTitleLocal(title);
                const cover = found?.book?.cover;
                if (cover) return `<div class="collection-book-item"><img src="${escapeHtml(cover)}" class="collection-book-cover" alt="" loading="lazy"><div class="collection-book-title">${escapeHtml(title)}</div></div>`;
                return `<span style="display:inline-block; background:#ddd; padding:2px 8px; border-radius:10px; font-size:12px; margin:2px;">${escapeHtml(title)}</span>`;
            }).join('');
        }

        card.innerHTML = `
            <div class="collection-header">
                <div class="collection-title">${escapeHtml(col.name)}</div>
                <div class="collection-header-actions">
                    <button class="icon-btn" data-act="edit" title="Переименовать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
                    <button class="icon-btn" data-act="delete" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    <button class="icon-btn" data-act="add" title="Добавить книгу"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                </div>
            </div>
            <div style="margin-bottom:10px; display:flex; flex-wrap:wrap; align-items:flex-end;">${booksHtml}</div>`;
        card.querySelector('[data-act="edit"]').onclick = () => editCollectionName(col.id);
        card.querySelector('[data-act="delete"]').onclick = () => deleteCollection(col.id);
        card.querySelector('[data-act="add"]').onclick = () => openCollectionModal(col.id);
        container.appendChild(card);
    });
}

async function createCollection() {
    const name = document.getElementById('new-collection-name').value.trim();
    if (!name) return;
    try {
        await db.collections.add({ id: generateUUID(), name, books: [], updatedAt: Date.now() });
        document.getElementById('new-collection-name').value = '';
        await syncCollectionsFromDb(); await renderCollections();
        if (typeof syncAll === 'function') syncAll();
    } catch (err) { showToast('Не удалось создать: ' + err.message, 'error'); }
}

function editCollectionName(colId) {
    const col = state.collections.find(c => c.id === colId);
    if (!col) return;
    state.editContext.editListTarget = { type: 'collection', id: colId };
    document.getElementById('edit-list-name-title').textContent = 'Редактировать коллекцию';
    document.getElementById('edit-list-name-input').value = col.name;
    document.getElementById('edit-list-name-modal').style.display = 'flex';
}

async function deleteCollection(colId) {
    const col = state.collections.find(c => c.id === colId);
    if (!col) return;
    if (!await showConfirm('Удалить коллекцию', `Удалить коллекцию «${col.name}»?`)) return;
    try {
        await db.collections.delete(colId);
        await syncCollectionsFromDb(); await renderCollections();
        if (typeof syncAll === 'function') syncAll();
    } catch (err) { showToast('Не удалось удалить: ' + err.message, 'error'); }
}

function openCollectionModal(colId) {
    closeAllCustomDropdowns();
    selectedCollectionId = colId;
    const col = state.collections.find(c => c.id === colId);
    if (!col) return;
    document.getElementById('col-modal-name').textContent = col.name;

    const optionsContainer = document.getElementById('collection-dropdown-options');
    optionsContainer.innerHTML = '';
    document.getElementById('col-select-book').value = '';
    document.getElementById('collection-selected-text').textContent = '-- Выберите книгу --';
    document.getElementById('collection-custom-select').classList.remove('open');

    let total = 0;
    const addGroup = (label, books) => {
        if (!books.length) return;
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
                document.getElementById('collection-selected-text').textContent = book.title;
                document.getElementById('col-select-book').value = book.title;
                document.getElementById('collection-custom-select').classList.remove('open');
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
        empty.className = 'custom-select-option'; empty.textContent = 'Нет доступных книг';
        optionsContainer.appendChild(empty);
    }
    document.getElementById('collection-modal').style.display = 'flex';
}

function closeCollectionModal() {
    closeAllCustomDropdowns();
    document.getElementById('collection-modal').style.display = 'none';
}

async function addBookToCollection() {
    const title = document.getElementById('col-select-book').value;
    if (!title || title === 'Нет доступных книг') return;
    try {
        const col = await db.collections.get(selectedCollectionId);
        if (!col) return;
        if (!Array.isArray(col.books)) col.books = [];
        if (!col.books.includes(title)) {
            col.books.push(title);
            col.updatedAt = Date.now();
            await db.collections.put(col);
            await syncCollectionsFromDb(); await renderCollections();
            if (typeof syncAll === 'function') syncAll();
        }
        closeCollectionModal();
    } catch (err) { showToast('Не удалось добавить: ' + err.message, 'error'); }
}
