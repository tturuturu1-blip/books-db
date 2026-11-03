// js/wishlist.js
// ============================================================
// Списки желаний: рендер, добавление/редактирование книг,
// перенос между списками и в «Выполнено», контекстное меню.
// Требует: utils.js, db.js, app.js.
// ============================================================

let wishlistContext = { listId: null, bookId: null };
let editingWishlistBookContext = { listId: null, bookId: null };

// ============================================================
// РЕНДЕР
// ============================================================

async function renderWishlist() {
    const container = document.getElementById('wishlist-container');
    container.innerHTML = '';

    if (state.wishlist.length === 0) {
        container.innerHTML = '<p class="text-center">У вас пока нет списков желаний.</p>';
        return;
    }

    state.wishlist.forEach(list => {
        const card = document.createElement('div');
        card.className = 'wishlist-card';

        const header = document.createElement('div');
        header.className = 'wishlist-header';
        header.innerHTML = `
            <div class="collection-title">${escapeHtml(list.name)}</div>
            <div class="wishlist-header-actions">
                <button class="icon-btn" data-act="edit" title="Переименовать">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                </button>
                <button class="icon-btn" data-act="delete" title="Удалить список">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                <button class="icon-btn" data-act="add" title="Добавить книгу">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>`;
        header.querySelector('[data-act="edit"]').onclick = () => editWishlistName(list.id);
        header.querySelector('[data-act="delete"]').onclick = () => deleteWishlist(list.id);
        header.querySelector('[data-act="add"]').onclick = () => openWishlistBookModal(list.id);
        card.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'wishlist-books-grid';
        const books = Array.isArray(list.books) ? list.books : [];
        if (books.length === 0) {
            grid.innerHTML = '<div style="font-size:12px; color:#888; width:100%; padding:10px 0;">Пусто</div>';
        } else {
            grid.innerHTML = books.map(book => createWishlistBookHtml(list.id, book, false)).join('');
        }
        card.appendChild(grid);

        const completed = Array.isArray(list.completed) ? list.completed : [];
        if (completed.length > 0) {
            const h = document.createElement('div');
            h.style.cssText = 'margin-top:15px; margin-bottom:10px; font-weight:600; color:#28a745; border-top:1px dashed #ccc; padding-top:15px;';
            h.textContent = 'Выполнено';
            card.appendChild(h);

            const g = document.createElement('div');
            g.className = 'wishlist-books-grid';
            g.innerHTML = completed.map(book => createWishlistBookHtml(list.id, book, true)).join('');
            card.appendChild(g);
        }

        container.appendChild(card);
    });
}

function createWishlistBookHtml(listId, book, isCompleted) {
    const title = escapeHtml(book.title || '');
    const bookId = book.id;

    let coverHtml;
    if (book.cover) {
        coverHtml = `<img src="${escapeHtml(book.cover)}" class="wishlist-cover" alt="${title}" loading="lazy">`;
    } else {
        coverHtml = `<div class="wishlist-cover" style="background-color:#eee; color:#333;">
            <span style="font-family:'Playfair Display',serif; font-size:9px; font-weight:600; line-height:1.1; max-height:80%; overflow:hidden; text-align:center; padding:2px;">${title}</span>
        </div>`;
    }

    const checkboxHtml = isCompleted
        ? `<div class="wishlist-checkbox checked" onclick="event.stopPropagation(); moveToUncompleted('${listId}', '${bookId}')" title="Вернуть">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
           </div>`
        : `<div class="wishlist-checkbox" onclick="event.stopPropagation(); moveToCompleted('${listId}', '${bookId}')" title="Отметить как выполнено">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
           </div>`;

    return `<div class="wishlist-book-item">
        ${checkboxHtml}
        <div onclick="openWishlistContextMenu(event, '${listId}', '${bookId}')">
            ${coverHtml}
        </div>
        <div class="wishlist-book-title">${title}</div>
    </div>`;
}

// ============================================================
// CRUD СПИСКОВ
// ============================================================

async function createWishlist() {
    const name = document.getElementById('new-wishlist-name').value.trim();
    if (!name) return;
    try {
        await db.wishlists.add({ name, books: [], completed: [] });
        document.getElementById('new-wishlist-name').value = '';
        await syncWishlistFromDb();
        await renderWishlist();
    } catch (err) {
        console.error('Ошибка создания списка:', err);
        alert('Не удалось создать список: ' + err.message);
    }
}

function editWishlistName(listId) {
    const list = state.wishlist.find(l => l.id === listId);
    if (!list) return;
    state.editContext.editListTarget = { type: 'wishlist', id: listId };
    document.getElementById('edit-list-name-title').textContent = 'Редактировать список';
    document.getElementById('edit-list-name-input').value = list.name;
    document.getElementById('edit-list-name-modal').style.display = 'flex';
}

async function deleteWishlist(listId) {
    const list = state.wishlist.find(l => l.id === listId);
    if (!list) return;
    if (!confirm(`Удалить список «${list.name}»?`)) return;
    try {
        await deleteWishlistDb(listId);
        await syncWishlistFromDb();
        await renderWishlist();
    } catch (err) {
        console.error('Ошибка удаления:', err);
        alert('Не удалось удалить: ' + err.message);
    }
}

// Алиас — чтобы не конфликтовать с именем функции из db.js
const deleteWishlistDb = window.deleteWishlist || async function () {};
// Но у нас deleteWishlist из db.js уже перекрыта. Переименуем db-функцию:
// (см. db.js — там `deleteWishlist` экспортируется; во избежание конфликта
//  используем прямую ссылку на db)
async function _deleteWishlistRecord(id) { await db.wishlists.delete(id); }

// ============================================================
// ПЕРЕМЕЩЕНИЕ В «ВЫПОЛНЕНО» И ОБРАТНО
// ============================================================

async function moveToCompleted(listId, bookId) {
    try {
        const list = await db.wishlists.get(Number(listId));
        if (!list) return;
        const idx = (list.books || []).findIndex(b => b.id === bookId);
        if (idx === -1) return;
        const [book] = list.books.splice(idx, 1);
        if (!Array.isArray(list.completed)) list.completed = [];
        list.completed.push(book);
        await db.wishlists.put(list);
        await syncWishlistFromDb();
        await renderWishlist();
    } catch (err) {
        console.error('Ошибка переноса в «Выполнено»:', err);
    }
}

async function moveToUncompleted(listId, bookId) {
    try {
        const list = await db.wishlists.get(Number(listId));
        if (!list || !Array.isArray(list.completed)) return;
        const idx = list.completed.findIndex(b => b.id === bookId);
        if (idx === -1) return;
        const [book] = list.completed.splice(idx, 1);
        if (!Array.isArray(list.books)) list.books = [];
        list.books.push(book);
        await db.wishlists.put(list);
        await syncWishlistFromDb();
        await renderWishlist();
    } catch (err) {
        console.error('Ошибка возврата:', err);
    }
}

// ============================================================
// КОНТЕКСТНОЕ МЕНЮ WISHLIST
// ============================================================

function openWishlistContextMenu(e, listId, bookId) {
    e.stopPropagation();
    wishlistContext = { listId: Number(listId), bookId };
    const menu = document.getElementById('wishlist-context-menu');
    let x = e.clientX, y = e.clientY;
    if (x + 190 > window.innerWidth) x = window.innerWidth - 200;
    if (y + 150 > window.innerHeight) y = window.innerHeight - 160;
    menu.style.top = y + 'px';
    menu.style.left = x + 'px';
    menu.classList.add('show');
}

function _findWishlistBook(list, bookId) {
    if (!list) return null;
    if (Array.isArray(list.books)) {
        const b = list.books.find(x => x.id === bookId);
        if (b) return b;
    }
    if (Array.isArray(list.completed)) {
        return list.completed.find(x => x.id === bookId) || null;
    }
    return null;
}

async function ctxWishlistDetails() {
    document.getElementById('wishlist-context-menu').classList.remove('show');
    const { listId, bookId } = wishlistContext;
    const list = state.wishlist.find(l => l.id === listId);
    if (!list) return;
    const book = _findWishlistBook(list, bookId);
    if (!book) return;
    if (typeof openDetails === 'function') {
        await openDetails(null, null, book, 'wishlist');
    }
}

function ctxWishlistEdit() {
    document.getElementById('wishlist-context-menu').classList.remove('show');
    const { listId, bookId } = wishlistContext;
    openWishlistBookModal(listId, bookId);
}

function ctxWishlistMove() {
    document.getElementById('wishlist-context-menu').classList.remove('show');
    const { listId, bookId } = wishlistContext;
    const optionsContainer = document.getElementById('move-to-list-options');
    optionsContainer.innerHTML = '';
    const targets = state.wishlist.filter(l => l.id !== listId);
    if (targets.length === 0) {
        optionsContainer.innerHTML = '<p class="text-center" style="color:#888;">Нет других списков</p>';
    } else {
        targets.forEach(list => {
            const btn = document.createElement('button');
            btn.className = 'btn-save';
            btn.textContent = list.name;
            btn.onclick = () => executeMoveWishlistToList(listId, bookId, list.id);
            optionsContainer.appendChild(btn);
        });
    }
    document.getElementById('move-to-list-modal').style.display = 'flex';
}

async function executeMoveWishlistToList(sourceListId, bookId, targetListId) {
    try {
        const src = await db.wishlists.get(Number(sourceListId));
        const target = await db.wishlists.get(Number(targetListId));
        if (!src || !target) return;

        let book = (src.books || []).find(b => b.id === bookId);
        if (book) {
            src.books = src.books.filter(b => b.id !== bookId);
        } else if (Array.isArray(src.completed)) {
            book = src.completed.find(b => b.id === bookId);
            if (book) src.completed = src.completed.filter(b => b.id !== bookId);
        }
        if (!book) return;

        if (!Array.isArray(target.books)) target.books = [];
        if (!target.books.some(b => b.title === book.title)) {
            target.books.push(book);
        }
        await db.wishlists.put(src);
        await db.wishlists.put(target);
        await syncWishlistFromDb();
        await renderWishlist();
    } catch (err) {
        console.error('Ошибка перемещения:', err);
    }
    document.getElementById('move-to-list-modal').style.display = 'none';
}

async function ctxWishlistDelete() {
    document.getElementById('wishlist-context-menu').classList.remove('show');
    const { listId, bookId } = wishlistContext;
    try {
        const list = await db.wishlists.get(Number(listId));
        if (!list) return;
        if (Array.isArray(list.books)) list.books = list.books.filter(b => b.id !== bookId);
        if (Array.isArray(list.completed)) list.completed = list.completed.filter(b => b.id !== bookId);
        await db.wishlists.put(list);
        await syncWishlistFromDb();
        await renderWishlist();
    } catch (err) {
        console.error('Ошибка удаления книги из списка:', err);
    }
}

// ============================================================
// МОДАЛ КНИГИ В WISHLIST
// ============================================================

function openWishlistBookModal(listId, bookId = null) {
    editingWishlistBookContext = { listId: Number(listId), bookId };
    const isEdit = bookId !== null;

    document.getElementById('wishlist-book-modal-title').textContent = isEdit ? 'Редактировать книгу' : 'Добавить книгу';

    const titleInput = document.getElementById('wishlist-book-title');
    const authorsContainer = document.getElementById('wishlist-author-inputs-container');
    authorsContainer.innerHTML = '';

    let titleVal = '';
    let authorsArr = [''];
    let coverVal = '';

    if (isEdit) {
        const list = state.wishlist.find(l => l.id === Number(listId));
        const book = list ? _findWishlistBook(list, bookId) : null;
        if (book) {
            titleVal = book.title || '';
            if (book.author) {
                const arr = String(book.author).split(',').map(a => a.trim()).filter(Boolean);
                if (arr.length > 0) authorsArr = arr;
            }
            coverVal = book.cover || '';
        }
    }

    titleInput.value = titleVal;
    authorsArr.forEach((a, i) => addWishlistAuthorRow(i === 0, a));

    const statusEl = document.getElementById('wishlist-cover-status');
    statusEl.textContent = '';
    statusEl.style.color = '';

    document.getElementById('wishlist-book-cover-url').value = coverVal;
    if (coverVal) {
        document.getElementById('wishlist-book-cover-preview').src = coverVal;
        document.getElementById('wishlist-book-cover-preview-container').style.display = 'flex';
    } else {
        document.getElementById('wishlist-book-cover-preview').src = '';
        document.getElementById('wishlist-book-cover-preview-container').style.display = 'none';
    }

    document.getElementById('wishlist-book-modal').style.display = 'flex';
    if (!isEdit) setTimeout(() => titleInput.focus(), 100);
}

function closeWishlistBookModal() {
    closeAllCustomDropdowns();
    document.getElementById('wishlist-book-modal').style.display = 'none';
}

function addWishlistAuthorRow(isFirst, value) {
    const container = document.getElementById('wishlist-author-inputs-container');
    const row = document.createElement('div');
    row.className = 'author-row';
    const removeBtn = !isFirst ? `
        <button type="button" class="remove-author-btn" onclick="this.closest('.author-row').remove()">
            <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>` : '';
    row.innerHTML = `
        <div class="author-input-wrap">
            <input type="text" class="wishlist-author-input" value="${escapeHtml(value || '')}" autocomplete="off"
                   oninput="handleAuthorSearch(this)" onfocus="handleAuthorSearch(this)" placeholder="Начните вводить...">
            <div class="custom-dropdown author-suggestions"></div>
        </div>
        ${removeBtn}
        <button type="button" class="add-author-btn" onclick="addWishlistAuthorRow(false)">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>`;
    container.appendChild(row);
}

async function applyWishlistCoverUrl() {
    const url = document.getElementById('wishlist-book-cover-url').value.trim();
    const statusEl = document.getElementById('wishlist-cover-status');
    if (!url) { statusEl.textContent = ''; return; }
    if (!isImageUrl(url)) {
        statusEl.textContent = '✗ Некорректная ссылка';
        statusEl.style.color = '#d9534f';
        return;
    }
    statusEl.textContent = 'Загрузка...';
    statusEl.style.color = '#888';
    const img = new Image();
    img.onload = () => {
        document.getElementById('wishlist-book-cover-preview').src = url;
        document.getElementById('wishlist-book-cover-preview-container').style.display = 'flex';
        statusEl.textContent = '✓ Готово';
        statusEl.style.color = '#28a745';
    };
    img.onerror = () => {
        statusEl.textContent = '✗ Ошибка';
        statusEl.style.color = '#d9534f';
        document.getElementById('wishlist-book-cover-preview-container').style.display = 'none';
    };
    img.src = url;
}

async function handleWishlistCoverFile(event) {
    const file = event.target.files[0];
    const statusEl = document.getElementById('wishlist-cover-status');
    if (!file) return;
    try {
        statusEl.textContent = 'Обработка...';
        statusEl.style.color = '#888';
        const dataUrl = await compressImage(file, 800, 0.75);
        document.getElementById('wishlist-book-cover-url').value = dataUrl;
        document.getElementById('wishlist-book-cover-preview').src = dataUrl;
        document.getElementById('wishlist-book-cover-preview-container').style.display = 'flex';
        statusEl.textContent = '✓ Готово';
        statusEl.style.color = '#28a745';
    } catch (err) {
        statusEl.textContent = '✗ ' + (err.message || 'Ошибка');
        statusEl.style.color = '#d9534f';
    }
    event.target.value = '';
}

async function saveWishlistBook() {
    const title = document.getElementById('wishlist-book-title').value.trim();
    if (!title) { alert('Введите название'); return; }
    const authors = Array.from(document.querySelectorAll('.wishlist-author-input'))
        .map(i => i.value.trim()).filter(Boolean);
    const coverUrl = document.getElementById('wishlist-book-cover-url').value.trim();

    const { listId, bookId } = editingWishlistBookContext;
    const isEdit = bookId !== null;

    try {
        const list = await db.wishlists.get(listId);
        if (!list) return;

        if (isEdit) {
            const update = (b) => b.id === bookId ? { ...b, title, author: authors.join(', '), cover: coverUrl } : b;
            if (Array.isArray(list.books)) list.books = list.books.map(update);
            if (Array.isArray(list.completed)) list.completed = list.completed.map(update);
        } else {
            if (!Array.isArray(list.books)) list.books = [];
            list.books.push({
                id: 'book_' + Date.now() + Math.random().toString(36).slice(2, 9),
                title,
                author: authors.join(', '),
                cover: coverUrl
            });
        }
        await db.wishlists.put(list);
        await syncWishlistFromDb();
        await renderWishlist();
        closeWishlistBookModal();
    } catch (err) {
        console.error('Ошибка сохранения книги в wishlist:', err);
        alert('Не удалось сохранить: ' + err.message);
    }
}

// ============================================================
// ПЕРЕИМЕНОВАНИЕ СПИСКОВ (общий модал для collections + wishlist)
// ============================================================

function closeEditListNameModal() {
    document.getElementById('edit-list-name-modal').style.display = 'none';
    state.editContext.editListTarget = null;
}

async function saveEditedListName() {
    const target = state.editContext.editListTarget;
    if (!target) return;
    const newName = document.getElementById('edit-list-name-input').value.trim();
    if (!newName) return;

    try {
        if (target.type === 'collection') {
            const col = await db.collections.get(target.id);
            if (col) {
                col.name = newName;
                await db.collections.put(col);
            }
            await syncCollectionsFromDb();
            await renderCollections();
        } else if (target.type === 'wishlist') {
            const list = await db.wishlists.get(target.id);
            if (list) {
                list.name = newName;
                await db.wishlists.put(list);
            }
            await syncWishlistFromDb();
            await renderWishlist();
        }
        closeEditListNameModal();
    } catch (err) {
        console.error('Ошибка переименования:', err);
        alert('Не удалось сохранить: ' + err.message);
    }
}
