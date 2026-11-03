// js/stats.js
// ============================================================

const _chartInstances = {};

function _destroyChart(id) {
    if (_chartInstances[id]) {
        try { _chartInstances[id].destroy(); } catch (_) {}
        delete _chartInstances[id];
    }
}

const CHART_COLORS = ['#8b6f47', '#a67c52', '#c19a6b', '#5a7d6e', '#7a8f7d', '#9b7e93', '#b599a8', '#7a7a8c', '#a2a2c2', '#8c7e6d', '#b0a89a', '#6d7a8c', '#8a6d6d', '#a89a8a', '#7d8a7a'];

async function _computeStatCounts() {
    const books = await getAllBooks();
    let readCount = 0, readingCount = 0, plannedCount = 0, droppedCount = 0;
    let totalRating = 0, ratedCount = 0;

    books.forEach(b => {
        if (b.cabinet === 'read') {
            readCount++;
            if (b.rating > 0) { totalRating += b.rating; ratedCount++; }
        } else if (b.cabinet === 'reading') readingCount++;
        else if (b.cabinet === 'planned') plannedCount++;
        else if (b.cabinet === 'dropped') droppedCount++;
    });

    const wishlists = await getWishlists();
    const wishlistCount = wishlists.reduce((acc, l) => acc + (Array.isArray(l.books) ? l.books.length : 0) + (Array.isArray(l.completed) ? l.completed.length : 0), 0);
    const collections = await getCollections();

    return { readCount, readingCount, plannedCount, droppedCount, avgRating: ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : '0.0', wishlistCount, collectionsCount: collections.length };
}

async function renderStats() {
    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    const c = await _computeStatCounts();

    // Обновляем виджет цели
    const goal = parseInt(localStorage.getItem('readingGoal')) || 0;
    const goalText = document.getElementById('goal-text');
    const goalFill = document.getElementById('goal-progress-fill');
    
    if (goal > 0) {
        const percent = Math.min(100, Math.round((c.readCount / goal) * 100));
        goalFill.style.width = `${percent}%`;
        goalText.textContent = `${c.readCount} / ${goal} книг (${percent}%)`;
    } else {
        goalFill.style.width = '0%';
        goalText.textContent = 'Цель не задана';
    }

    const cards = [
        { label: 'Всего прочитано', value: c.readCount },
        { label: 'Читаю сейчас', value: c.readingCount },
        { label: 'В планах', value: c.plannedCount },
        { label: 'Брошено', value: c.droppedCount },
        { label: 'Средняя оценка', value: c.avgRating },
        { label: 'Коллекций', value: c.collectionsCount },
        { label: 'В списке желаний', value: c.wishlistCount }
    ];

    cards.forEach(card => {
        const el = document.createElement('div');
        el.className = 'stat-card';
        el.innerHTML = `<div class="stat-number">${escapeHtml(String(card.value))}</div><div class="stat-label">${escapeHtml(card.label)}</div>`;
        container.appendChild(el);
    });

    if (typeof Chart !== 'undefined') await _renderAllCharts();
}

async function _renderAllCharts() {
    const readBooks = state.library.read.filter(Boolean);
    await _renderBooksByMonthChart(readBooks);
    _renderRatingsChart(readBooks);
    _renderGenresChart(readBooks);
    _renderFormatsChart(readBooks);
}

async function _renderBooksByMonthChart(readBooks) {
    const id = 'chart-books-by-month';
    _destroyChart(id);
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
        months.push({ key, label, count: 0 });
    }

    readBooks.forEach(b => {
        if (!b.endDate) return;
        const key = String(b.endDate).slice(0, 7);
        const m = months.find(x => x.key === key);
        if (m) m.count++;
    });

    _chartInstances[id] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: months.map(m => m.label),
            datasets: [{ label: 'Книг', data: months.map(m => m.count), backgroundColor: 'rgba(139, 111, 71, 0.7)', borderColor: '#8b6f47', borderWidth: 1, borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }, x: { ticks: { maxRotation: 45, minRotation: 45, font: { size: 10 } } } }
        }
    });
}

function _renderRatingsChart(readBooks) {
    const id = 'chart-ratings';
    _destroyChart(id);
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const ratings = new Array(10).fill(0);
    readBooks.forEach(b => {
        const r = Number(b.rating) || 0;
        if (r >= 1 && r <= 10) ratings[r - 1]++;
    });

    _chartInstances[id] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            datasets: [{ label: 'Книг', data: ratings, backgroundColor: ratings.map((v, i) => `rgba(139, 111, 71, ${0.3 + (i / 9) * 0.5})`), borderColor: '#8b6f47', borderWidth: 1, borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } } }
    });
}

function _renderGenresChart(readBooks) {
    const id = 'chart-genres';
    _destroyChart(id);
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const counts = {};
    readBooks.forEach(b => {
        if (!Array.isArray(b.genres)) return;
        b.genres.forEach(g => { if (g) counts[g] = (counts[g] || 0) + 1; });
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (sorted.length === 0) { _renderEmptyChart(canvas, 'Нет данных по жанрам'); return; }

    _chartInstances[id] = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: sorted.map(e => e[0]),
            datasets: [{ data: sorted.map(e => e[1]), backgroundColor: CHART_COLORS.slice(0, sorted.length), borderColor: '#fcfaf5', borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
}

function _renderFormatsChart(readBooks) {
    const id = 'chart-formats';
    _destroyChart(id);
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const counts = {};
    readBooks.forEach(b => {
        const format = (b.format || '').trim();
        if (!format) return;
        format.split(',').map(f => f.trim()).filter(Boolean).forEach(f => { counts[f] = (counts[f] || 0) + 1; });
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) { _renderEmptyChart(canvas, 'Нет данных по форматам'); return; }

    _chartInstances[id] = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: sorted.map(e => e[0]),
            datasets: [{ data: sorted.map(e => e[1]), backgroundColor: CHART_COLORS.slice(0, sorted.length), borderColor: '#fcfaf5', borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
}

function _renderEmptyChart(canvas, message) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#aaa'; ctx.font = '14px Montserrat, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}
