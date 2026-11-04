// js/library.js
// ============================================================
// Шкафы, полки, плитка, книга-модал, drag & drop, контекстное меню,
// «Читаю сейчас», рекомендации, поиск.
// Требует: utils.js, db.js, app.js.
// ============================================================

let draggedItem = null; 
let tempSpineImage = '';

async function renderLibrary() {
    if (state.libraryViewMode === 'grid') {
        document.getElementById('cabinets-container').style.display = 'none';
        document.getElementById('grid-view-container').classList.add('active');
        renderGridView();
    } else {
        document.getElementById('cabinets-container').style.display = 'flex';
        document.getElementById('grid-view-container').classList.remove('active');
        renderShelvesView();
    }
}

function renderShelvesView() {
    const container = document.getElementById('cabinets-container');
    container.innerHTML = '';
    const query = state.searchQuery || '';

    CABINETS.forEach(cab => {
        const totalSlots = state.library[cab].length;
        const subCabinetsCount = Math.ceil(totalSlots / TOTAL_SLOTS);

        for (let c = 0; c < subCabinetsCount; c++) {
            const cabinetDiv = document.createElement('div');
            cabinetDiv.className = 'cabinet';

            const labelDiv = document.createElement('div');
            labelDiv.className = 'cabinet-label';
            
            if (subCabinetsCount > 1) {
                labelDiv.textContent = `${CABINET_LABELS[cab]} ${c + 1}/${subCabinetsCount}`;
            } else {
                labelDiv.textContent = CABINET_LABELS[cab];
            }
            
            cabinetDiv.appendChild(labelDiv);

            for (let s = 0; s < SHELVES_PER_CABINET; s++) {
                const shelfDiv = document.createElement('div');
                shelfDiv.className = 'shelf';
                const booksWrapper = document.createElement('div');
                booksWrapper.className = 'books-wrapper';

                for (let i = 0; i < SLOTS_PER_SHELF; i++) {
                    const globalSlot = c * TOTAL_SLOTS + s * SLOTS_PER_SHELF + i;
                    const heightClass = globalSlot % 4 === 0 ? 'h-tall' : (globalSlot % 3 === 0 ? 'h-short' : '');
                    
                    let book = state.library[cab][globalSlot];
                    if (query && book) {
                        const match = (book.title && book.title.toLowerCase().includes(query)) || 
                                      (book.author && book.author.toLowerCase().includes(query));
                        if (!match) book = null;
                    }
                    
                    booksWrapper.appendChild(createBookElement(cab, globalSlot, heightClass, book));
                }
                shelfDiv.appendChild(booksWrapper);
                cabinetDiv.appendChild(shelfDiv);
            }

            const legsDiv = document.createElement('div');
            legsDiv.className = 'cabinet-legs';
            cabinetDiv.appendChild(legsDiv);
            container.appendChild(cabinetDiv);
        }
    });

    // --- НАДЕЖНАЯ ЛОГИКА БЕСКОНЕЧНОЙ ПРОКРУТКИ ---
    const cabinets = Array.from(container.children);
    if (cabinets.length > 2) {
        const prependClones = cabinets.slice(-2).map(c => c.cloneNode(true));
        const appendClones = cabinets.slice(0, 2).map(c => c.cloneNode(true));
        
        prependClones.forEach(clone => container.insertBefore(clone, container.firstChild));
        appendClones.forEach(clone => container.appendChild(clone));

        container.style.scrollSnapType = 'none';
        
        requestAnimationFrame(() => {
            container.scrollLeft = cabinets[0].offsetLeft;
            setTimeout(() => {
                container.style.scrollSnapType = 'x mandatory';
            }, 50);
        });

        let scrollTimeout;
        let isResetting = false;
        
        container.onscroll = () => {
            if (isResetting) return;
            clearTimeout(scrollTimeout);
            
            scrollTimeout = setTimeout(() => {
                const maxScroll = container.scrollWidth - container.clientWidth;
                const currentScroll = container.scrollLeft;
                
                const firstOriginal = cabinets[0];
                const lastOriginal = cabinets[cabinets.length - 1];
                const originalWidth = lastOriginal.offsetLeft + lastOriginal.offsetWidth - firstOriginal.offsetLeft;

                let targetScroll = null;

                if (currentScroll >= maxScroll - 30) {
                    targetScroll = currentScroll - originalWidth;
                } else if (currentScroll <= 30) {
                    targetScroll = currentScroll + originalWidth;
                }

                if (targetScroll !== null) {
                    isResetting = true;
                    container.style.scrollSnapType = 'none';
                    container.style.scrollBehavior = 'auto';
                    container.scrollLeft = targetScroll;
                    
                    requestAnimationFrame(() => {
                        container.style.scrollBehavior = '';
                        container.style.scrollSnapType = 'x mandatory';
                        setTimeout(() => { isResetting = false; }, 50);
                    });
                }
            }, 150); 
        };
    }

    // --- ДЕЛЕГИРОВАНИЕ СОБЫТИЙ (РАБОТАЕТ ДЛЯ КЛОНОВ) ---
    // Вместо назначения onclick на каждую книгу, мы ловим клик на контейнере.
    container.onclick = (e) => {
        const bookDiv = e.target.closest('.book');
        if (!bookDiv) return;
        e.stopPropagation();
        
        const cab = bookDiv.dataset.cabinet;
        const slot = parseInt(bookDiv.dataset.slot);
        const isEmpty = bookDiv.classList.contains('empty');
        
        if (isEmpty) {
            openBookModal(cab, slot, true, false);
        } else {
            openContextMenu(e, cab, slot);
        }
    };

    container.addEventListener('dragstart', (e) => {
        const bookDiv = e.target.closest('.book');
        if (!bookDiv || bookDiv.classList.contains('empty')) return;
        draggedItem = { cabinet: bookDiv.dataset.cabinet, slot: parseInt(bookDiv.dataset.slot) };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
    });

    container.addEventListener('dragover', (e) => {
        if (e.target.closest('.book')) e.preventDefault();
    });

    container.addEventListener('drop', (e) => {
        const bookDiv = e.target.closest('.book');
        if (!bookDiv) return;
        e.preventDefault();
        handleDrop(e, bookDiv.dataset.cabinet, parseInt(bookDiv.dataset.slot));
    });
}

function createBookElement(cabinet, slot, heightClass, bookData) {
    const book = bookData;
    const bookDiv = document.createElement('div');
    let dynamicWidthClass = '';
    if (book && book.title) {
        const len = book.title.length;
        if (len > 22) dynamicWidthClass = 'extra-wide-spine';
        else if (len > 14) dynamicWidthClass = 'wide-spine';
    }

    bookDiv.className = `book ${heightClass} ${dynamicWidthClass}`;
    
    // Добавляем data-атрибуты для делегирования событий
    bookDiv.dataset.cabinet = cabinet;
    bookDiv.dataset.slot = slot;

    if (book) {
        bookDiv.draggable = true;
        bookDiv.classList.add('filled');

        if (book.spineImage) {
            bookDiv.style.backgroundColor = 'transparent';
            bookDiv.style.border = 'none';
            bookDiv.style.boxShadow = 'none';
            const img = document.createElement('img');
            img.src = book.spineImage;
            img.className = 'book-img-spine';
            img.alt = book.title || '';
            bookDiv.appendChild(img);
        } else {
            bookDiv.style.backgroundColor = book.color || '#fcfaf5';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'spine-content';

            if (book.pattern) {
                const topP = document.createElement('div');
                topP.className = 'spine-pattern';
                topP.textContent = book.pattern;
                contentDiv.appendChild(topP);
            }
            const textDiv = document.createElement('div');
            textDiv.className = 'spine-text';
            textDiv.textContent = book.title || '';
            textDiv.style.color = getContrastTextColor(book.color || '#fcfaf5');
            contentDiv.appendChild(textDiv);

            if (book.pattern) {
                const botP = document.createElement('div');
                botP.className = 'spine-pattern';
                botP.textContent = book.pattern;
                contentDiv.appendChild(botP);
            }
            bookDiv.appendChild(contentDiv);
        }
        bookDiv.title = `${book.title || ''} — ${book.author || ''}`;
    } else {
        bookDiv.classList.add('empty');
    }
    return bookDiv;
}

function renderGridView() {
    const container = document.getElementById('grid-view-container');
    container.innerHTML = '';
    const query = state.searchQuery || '';

    CABINETS.forEach(cab => {
        let books = state.library[cab].filter(b => b !== null);
        if (query) {
            books = books.filter(b => 
                (b.title && b.title.toLowerCase().includes(query)) || 
                (b.author && b.author.toLowerCase().includes(query))
            );
        }
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'grid-cabinet-group';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'grid-cabinet-header';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'grid-cabinet-title';
        titleDiv.textContent = CABINET_LABELS[cab];
        headerDiv.appendChild(titleDiv);

        const addBtn = document.createElement('button');
        addBtn.className = 'block-add-btn';
        addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        addBtn.title = 'Добавить книгу';
        addBtn.onclick = (e) => { e.stopPropagation(); openAddBookFromGrid(cab); };
        headerDiv.appendChild(addBtn);
        groupDiv.appendChild(headerDiv);

        const wrapper = document.createElement('div');
        wrapper.className = 'grid-books-wrapper';

        if (books.length === 0) {
            wrapper.innerHTML = '<div style="color:#888; font-style:italic; font-size:14px; padding:10px 0;">Пусто</div>';
        } else {
            books.forEach(book => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'grid-book-item';
                const realIndex = state.library[cab].indexOf(book);
                itemDiv.onclick = (e) => { e.stopPropagation(); openContextMenu(e, cab, realIndex); };

                let coverHtml;
                if (book.cover) {
                    coverHtml = `<img src="${escapeHtml(book.cover)}" class="grid-book-cover" alt="${escapeHtml(book.title)}" loading="lazy">`;
                } else {
                    const textColor = getContrastTextColor(book.color);
                    coverHtml = `<div class="grid-book-cover" style="background-color:${escapeHtml(book.color || '#eee')}; color:${textColor};">
                        <span style="font-family:'Playfair Display',serif; font-size:11px; font-weight:600; line-height:1.1; max-height:80%; overflow:hidden; padding:2px; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical;">${escapeHtml(book.title)}</span>
                    </div>`;
                }
                itemDiv.innerHTML = `${coverHtml}<div class="grid-book-title">${escapeHtml(book.title)}</div>`;
                wrapper.appendChild(itemDiv);
            });
        }
        groupDiv.appendChild(wrapper);
        container.appendChild(groupDiv);
    });
}

async function handleDrop(e, targetCabinet, targetSlot) {
    if (!draggedItem) return;
    const src = draggedItem;
    draggedItem = null;
    if (src.cabinet === targetCabinet && src.slot === targetSlot) return;

    const srcBook = state.library[src.cabinet][src.slot];
    const targetBook = state.library[targetCabinet][targetSlot];
    if (!srcBook) return;

    try {
        if (targetBook) {
            await db.transaction('rw', db.books, async () => {
                await db.books.update(srcBook.id, { cabinet: targetCabinet, slot: targetSlot, updatedAt: Date.now() });
                await db.books.update(targetBook.id, { cabinet: src.cabinet, slot: src.slot, updatedAt: Date.now() });
            });
        } else {
            await db.books.update(srcBook.id, { cabinet: targetCabinet, slot: targetSlot, updatedAt: Date.now() });
        }
        await syncLibraryFromDb();
        invalidateAuthorCache(); invalidateGenreCache(); invalidateTagsCache();
        await renderLibrary();
        if (typeof syncAll === 'function') syncAll();
    } catch (err) {
        showToast('Не удалось переместить книгу', 'error');
    }
}

function openContextMenu(e, cabinet, slot) {
    state.editContext = { ...state.editContext, category: cabinet, index: slot, bookId: state.library[cabinet][slot]?.id || null };
    const menu = document.getElementById('context-menu');
    let x = e.clientX, y = e.clientY;
    if (x + 190 > window.innerWidth) x = window.innerWidth - 200;
    if (y + 150 > window.innerHeight) y = window.innerHeight - 160;
    menu.style.top = y + 'px'; menu.style.left = x + 'px';
    menu.classList.add('show');
}

async function ctxDetails() {
    document.getElementById('context-menu').classList.remove('show');
    const { category, index } = state.editContext;
    if (typeof openDetails === 'function') await openDetails(category, index);
}

async function ctxEdit() {
    document.getElementById('context-menu').classList.remove('show');
    const { category, index } = state.editContext;
    openBookModal(category, index, false, state.libraryViewMode === 'grid');
}

async function ctxDelete() {
    document.getElementById('context-menu').classList.remove('show');
    const { category, index } = state.editContext;
    const book = state.library[category][index];
    if (!book || !book.id) return;
    if (!await showConfirm('Удалить книгу', `Удалить «${book.title}» навсегда?`)) return;
    
    try {
        await deleteBookRecord(book.id);
        await syncLibraryFromDb();
        invalidateAuthorCache(); invalidateGenreCache(); invalidateTagsCache();
        await renderLibrary();
        if (typeof syncAll === 'function') syncAll();
        showToast('Книга удалена', 'success');
    } catch (err) {
        showToast('Ошибка удаления: ' + err.message, 'error');
    }
}

function ctxMoveToCabinet() {
    document.getElementById('context-menu').classList.remove('show');
    state.editContext.moveSource = { ...state.editContext };
    document.getElementById('move-cabinet-modal').style.display = 'flex';
}

function closeMoveCabinetModal() {
    closeAllCustomDropdowns();
    document.getElementById('move-cabinet-modal').style.display = 'none';
}

async function executeMoveToCabinet(targetCab) {
    const src = state.editContext.moveSource;
    if (!src) return;
    const { category, index } = src;
    const book = state.library[category][index];
    if (!book || !book.id) { closeMoveCabinetModal(); return; }
    if (targetCab === category) { closeMoveCabinetModal(); return; }

    const targetGrid = state.library[targetCab];
    const emptySlot = targetGrid.findIndex(b => b === null);
    if (emptySlot === -1) {
        showToast('В этом шкафу нет свободного места', 'error');
        closeMoveCabinetModal();
        return;
    }

    try {
        await db.books.update(book.id, { cabinet: targetCab, slot: emptySlot, updatedAt: Date.now() });
        await syncLibraryFromDb();
        await renderLibrary();
        if (typeof syncAll === 'function') syncAll();
    } catch (err) {
        showToast('Не удалось перенести: ' + err.message, 'error');
    }
    closeMoveCabinetModal();
}

function openAddBookFromGrid(cabinet) {
    const emptySlot = state.library[cabinet].findIndex(b => b === null);
    if (emptySlot !== -1) openBookModal(cabinet, emptySlot, true, true);
    else showToast('В этом разделе нет свободного места', 'error');
}

function openBookModal(cabinet, slot, isNew, isGrid) {
    state.editContext.category = cabinet;
    state.editContext.index = slot;
    state.editContext.isNew = isNew;
    state.editContext.isGrid = isGrid;

    const book = isNew ? null : state.library[cabinet][slot];
    state.editContext.bookId = book?.id || null;

    document.getElementById('book-modal-title').textContent = isNew ? 'Добавить книгу' : 'Редактировать книгу';
    document.getElementById('book-title').value = book ? book.title : '';

    if (isGrid) {
        document.getElementById('spine-customization-section').style.display = 'none';
        document.getElementById('image-upload-label').textContent = 'Добавить обложку';
        tempSpineImage = book?.cover || '';
    } else {
        document.getElementById('spine-customization-section').style.display = 'block';
        document.getElementById('image-upload-label').textContent = 'Добавить корешок';
        document.getElementById('book-color').value = book?.color || '#fcfaf5';
        tempSpineImage = book?.spineImage || '';
    }

    const authorsContainer = document.getElementById('author-inputs-container');
    authorsContainer.innerHTML = '';
    let authorsArr = [''];
    if (book && book.author) {
        const split = book.author.split(',').map(a => a.trim()).filter(Boolean);
        if (split.length > 0) authorsArr = split;
    }
    authorsArr.forEach((a, i) => addAuthorRow(i === 0, a));

    document.getElementById('book-pattern').value = '';
    document.querySelectorAll('#patterns-grid .pattern-option').forEach(el => el.classList.remove('selected'));
    if (book && book.pattern && !isGrid) {
        document.getElementById('book-pattern').value = book.pattern;
        document.querySelectorAll('#patterns-grid .pattern-option').forEach(el => {
            if (el.textContent === book.pattern) el.classList.add('selected');
        });
    }

    updateModalSpineUI();
    document.getElementById('book-modal').style.display = 'flex';
    if (isNew) setTimeout(() => document.getElementById('book-title')?.focus(), 100);
}

function closeBookModal() {
    closeAllCustomDropdowns();
    document.getElementById('book-modal').style.display = 'none';
    document.querySelectorAll('.author-suggestions').forEach(el => el.classList.remove('show'));
}

function updateModalSpineUI() {
    document.getElementById('modal-spine-url').value = '';
    const statusEl = document.getElementById('cover-status');
    if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }
    const preview = document.getElementById('modal-spine-preview');
    const img = document.getElementById('modal-spine-img');
    if (tempSpineImage) { img.src = tempSpineImage; preview.style.display = 'flex'; }
    else { img.src = ''; preview.style.display = 'none'; }
}

async function handleSpineFileInModal(event) {
    const file = event.target.files[0];
    const statusEl = document.getElementById('cover-status');
    if (!file) return;
    try {
        statusEl.textContent = 'Обработка…'; statusEl.style.color = '#888';
        tempSpineImage = await compressImage(file, 800, 0.75);
        statusEl.textContent = '✓ Готово'; statusEl.style.color = '#28a745';
        document.getElementById('modal-spine-img').src = tempSpineImage;
        document.getElementById('modal-spine-preview').style.display = 'flex';
    } catch (err) {
        statusEl.textContent = '✗ ' + (err.message || 'Ошибка'); statusEl.style.color = '#d9534f';
    }
    event.target.value = '';
}

function applySpineUrlInModal() {
    const url = document.getElementById('modal-spine-url').value.trim();
    const statusEl = document.getElementById('cover-status');
    if (!url) { statusEl.textContent = ''; return; }
    if (!isImageUrl(url)) { statusEl.textContent = '✗ Некорректная ссылка'; statusEl.style.color = '#d9534f'; return; }
    statusEl.textContent = 'Загрузка…'; statusEl.style.color = '#888';
    const img = new Image();
    img.onload = () => {
        tempSpineImage = url;
        statusEl.textContent = '✓ Готово'; statusEl.style.color = '#28a745';
        document.getElementById('modal-spine-img').src = url;
        document.getElementById('modal-spine-preview').style.display = 'flex';
    };
    img.onerror = () => {
        statusEl.textContent = '✗ Ошибка загрузки'; statusEl.style.color = '#d9534f';
        document.getElementById('modal-spine-preview').style.display = 'none';
    };
    img.src = url;
}

async function saveBook() {
    const title = document.getElementById('book-title').value.trim();
    const authorInputs = document.querySelectorAll('.book-author-input');
    const authors = Array.from(authorInputs).map(i => i.value.trim()).filter(Boolean);
    const author = authors.join(', ');

    if (!title) { showToast('Введите название книги', 'error'); return; }
    if (!author) { showToast('Введите хотя бы одного автора', 'error'); return; }

    const { category, index, isNew, isGrid, bookId } = state.editContext;
    const existing = isNew ? null : state.library[category][index];

    const record = {
        id: bookId || generateUUID(),
        cabinet: category,
        slot: index,
        title, author,
        color: isGrid ? (existing?.color || '#fcfaf5') : document.getElementById('book-color').value,
        pattern: isGrid ? '' : document.getElementById('book-pattern').value,
        spineImage: isGrid ? '' : (tempSpineImage || ''),
        cover: isGrid ? (tempSpineImage || '') : (existing?.cover || ''),
        rating: existing?.rating || 0,
        genres: existing?.genres || [],
        tags: existing?.tags || [],
        series: existing?.series || '',
        subseries: existing?.subseries || '',
        volume: existing?.volume || 0,
        year: existing?.year || '',
        country: existing?.country || '',
        format: existing?.format || '',
        startDate: existing?.startDate || '',
        endDate: existing?.endDate || '',
        annotation: existing?.annotation || '',
        summary: existing?.summary || '',
        timeline: existing?.timeline || '',
        worldMap: existing?.worldMap || '',
        impressions: existing?.impressions || [],
        quotes: existing?.quotes || [],
        characters: existing?.characters || [],
        terms: existing?.terms || [],
        dailyProgress: existing?.dailyProgress || {},
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now()
    };

    try {
        await saveBookRecord(record);
        await syncLibraryFromDb();
        invalidateAuthorCache(); invalidateGenreCache(); invalidateTagsCache();
        await renderLibrary();
        closeBookModal();
        if (typeof syncAll === 'function') syncAll();
        showToast('Книга сохранена', 'success');
    } catch (err) {
        showToast('Не удалось сохранить: ' + err.message, 'error');
    }
}

function addAuthorRow(isFirst, value) {
    const container = document.getElementById('author-inputs-container');
    const row = document.createElement('div');
    row.className = 'author-row';
    const removeBtnHtml = !isFirst ? `
        <button type="button" class="remove-author-btn" onclick="this.closest('.author-row').remove()" title="Удалить автора">
            <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>` : '';
    row.innerHTML = `
        <div class="author-input-wrap">
            <input type="text" class="book-author-input" value="${escapeHtml(value || '')}" autocomplete="off" placeholder="Начните вводить..." oninput="handleAuthorSearch(this)" onfocus="handleAuthorSearch(this)">
            <div class="custom-dropdown author-suggestions"></div>
        </div>
        ${removeBtnHtml}
        <button type="button" class="add-author-btn" onclick="addAuthorRow(false)" title="Добавить автора">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>`;
    container.appendChild(row);
}

const _handleAuthorSearchDebounced = debounce((input) => handleSuggestSearch(input, getAllAuthors), 180);
function handleAuthorSearch(input) { _handleAuthorSearchDebounced(input); }

function handleSuggestSearch(input, getListFunc) {
    const query = input.value.toLowerCase().trim();
    const dropdown = input.nextElementSibling;
    dropdown.innerHTML = '';
    if (query.length === 0) { dropdown.classList.remove('show'); return; }
    const matches = getListFunc().filter(a => a.toLowerCase().includes(query)).slice(0, 12);
    if (matches.length === 0) { dropdown.classList.remove('show'); return; }
    matches.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = item;
        div.onmousedown = (e) => { e.preventDefault(); input.value = item; dropdown.classList.remove('show'); };
        dropdown.appendChild(div);
    });
    dropdown.classList.add('show');
}

const _handleTitleSearchDebounced = debounce(async (input) => {
    const query = input.value.toLowerCase().trim();
    const dropdown = input.nextElementSibling;
    if (!dropdown) return;
    if (query.length < 2) { dropdown.classList.remove('show'); return; }
    if (!cachedDbBooks) {
        dropdown.innerHTML = '<div class="suggestion-item" style="color:#888; font-style:italic;">Загрузка базы…</div>';
        dropdown.classList.add('show');
    }
    const books = await fetchDbBooks();
    if (input.value.toLowerCase().trim() !== query) return;
    dropdown.innerHTML = '';
    if (!books || books.length === 0) { dropdown.classList.remove('show'); return; }
    const matches = new Set();
    books.forEach(b => {
        const title = b['Название'] || b['Title'] || '';
        if (title && title.toLowerCase().includes(query)) matches.add(title);
    });
    const arr = Array.from(matches).slice(0, 15);
    if (arr.length === 0) { dropdown.classList.remove('show'); return; }
    arr.forEach(title => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = title;
        div.onmousedown = (e) => {
            e.preventDefault();
            input.value = title;
            dropdown.classList.remove('show');
            const matchBook = books.find(b => (b['Название'] || b['Title'] || '') === title);
            if (matchBook) {
                const authorField = matchBook['Автор(ы)'] || matchBook['Автор'] || matchBook['Author'] || '';
                if (authorField) {
                    const authorInput = document.querySelector('.book-author-input');
                    if (authorInput && !authorInput.value.trim()) authorInput.value = String(authorField).split(',')[0].trim();
                }
            }
        };
        dropdown.appendChild(div);
    });
    dropdown.classList.add('show');
}, 220);
function handleTitleSearch(input) { _handleTitleSearchDebounced(input); }

const PATTERNS = ['✦','✧','★','☆','☽','☾','☼','☄','⚝','⚹','⛢','♃','♄','♅','♆','♇','⚡','⚗','⚖','⚔','⚱','⚜','♠','♣','♥','♦','♫','☕','✈','⚓','☁','☂','☎','✉','✂','✎','☯','☮','☘','✿','❀','❁','❃','❋','✤','✥','✱','✲','✳','✴'];

function initPatternsGrid() {
    const grid = document.getElementById('patterns-grid');
    if (!grid) return;
    grid.innerHTML = '';
    PATTERNS.forEach(p => {
        const div = document.createElement('div');
        div.className = 'pattern-option';
        div.textContent = p;
        div.onclick = () => {
            const currentValue = document.getElementById('book-pattern').value;
            if (currentValue === p) {
                document.getElementById('book-pattern').value = '';
                div.classList.remove('selected');
            } else {
                document.getElementById('book-pattern').value = p;
                grid.querySelectorAll('.pattern-option').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
            }
        };
        grid.appendChild(div);
    });
}

async function renderReadingNow() {
    const container = document.getElementById('reading-now-container');
    container.innerHTML = '';
    const books = state.library.reading.filter(Boolean);
    if (books.length === 0) {
        container.innerHTML = '<p class="text-center" style="font-size:1.2rem; color:#666; margin-top:50px;">Вы сейчас ничего не читаете.</p>';
        return;
    }
    books.forEach(book => {
        const slotIndex = state.library.reading.indexOf(book);
        let coverHtml;
        if (book.cover) {
            coverHtml = `<img src="${escapeHtml(book.cover)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" alt="">`;
        } else {
            const textColor = getContrastTextColor(book.color);
            coverHtml = `<div style="background-color:${escapeHtml(book.color || '#eee')}; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:5px; box-sizing:border-box; text-align:center;">
                <span style="font-family:'Playfair Display',serif; font-size:10px; font-weight:600; color:${textColor}; line-height:1.1; max-height:70%; overflow:hidden;">${escapeHtml(book.title)}</span>
            </div>`;
        }
        const card = document.createElement('div');
        card.className = 'reading-now-card';
        card.innerHTML = `
            <div class="reading-now-cover">${coverHtml}</div>
            <div class="reading-now-info">
                <h3>${escapeHtml(book.title)}</h3>
                <p>${escapeHtml(book.author || '')}</p>
                <button class="btn-save" style="padding:6px 12px; font-size:13px; flex-grow:0;" onclick="openDetailsFromReadingNow(${slotIndex})">Подробнее</button>
            </div>`;
        container.appendChild(card);
    });
}

async function openDetailsFromReadingNow(slotIndex) {
    if (typeof openDetails === 'function') await openDetails('reading', slotIndex);
}

const RECOMMENDATION_DB = [
    { title: 'Дюна', author: 'Фрэнк Герберт', color: '#c2a06c' },
    { title: '1984', author: 'Джордж Оруэлл', color: '#4a4a4a' },
    { title: 'Гарри Поттер и философский камень', author: 'Дж. К. Роулинг', color: '#7b3d2e' },
    { title: 'Хоббит', author: 'Дж. Р. Р. Толкин', color: '#2e5c3b' },
    { title: 'Убить пересмешника', author: 'Харпер Ли', color: '#8f6d4e' },
    { title: 'Гордость и предубеждение', author: 'Джейн Остин', color: '#d48c8c' },
    { title: 'Цветы для Элджернона', author: 'Дэниел Киз', color: '#a4b49b' },
    { title: 'Три товарища', author: 'Эрих Мария Ремарк', color: '#3a3f4d' }
];

async function renderRecommendations() {
    const container = document.getElementById('recommendations-container');
    container.innerHTML = '';
    const readTitles = new Set();
    state.library.read.forEach(b => { if (b) readTitles.add(b.title.toLowerCase()); });
    state.library.planned.forEach(b => { if (b) readTitles.add(b.title.toLowerCase()); });
    state.library.dropped.forEach(b => { if (b) readTitles.add(b.title.toLowerCase()); });
    state.library.reading.forEach(b => { if (b) readTitles.add(b.title.toLowerCase()); });

    const recs = RECOMMENDATION_DB.filter(b => !readTitles.has(b.title.toLowerCase())).slice(0, 5);
    if (recs.length === 0) {
        container.innerHTML = '<p class="text-center">Вы прочитали всё, что у нас есть в базе!</p>';
        return;
    }
    recs.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'rec-card';
        card.innerHTML = `
            <div style="width:30px; height:90px; background:${rec.color}; border-radius:2px; border:1px solid #333; flex-shrink:0;"></div>
            <div>
                <h3 style="margin-bottom:5px; font-size:1.1rem;">${escapeHtml(rec.title)}</h3>
                <p style="margin:0; color:#666; font-size:0.9rem;">${escapeHtml(rec.author)}</p>
            </div>`;
        container.appendChild(card);
    });
}
