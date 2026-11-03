// js/utils.js
// ============================================================
// Утилиты (без зависимостей). Подключается ПЕРВЫМ.
// ============================================================

function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function debounce(fn, ms = 200) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

function formatDateRu(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function getTodayDateStr() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function getTodayIsoStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeString(s) {
    return String(s || '').toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim();
}

function getContrastTextColor(hexColor) {
    const hex = (hexColor || '#fcfaf5').replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) || 0;
    const g = parseInt(hex.substr(2, 2), 16) || 0;
    const b = parseInt(hex.substr(4, 2), 16) || 0;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#000' : '#fff';
}

function compressImage(file, maxWidth = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('Нет файла'));
        if (!file.type.startsWith('image/')) return reject(new Error('Не изображение'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Некорректное изображение'));
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                try { resolve(canvas.toDataURL('image/jpeg', quality)); }
                catch (err) { reject(err); }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function isImageUrl(str) {
    if (!str || typeof str !== 'string') return false;
    return str.startsWith('data:image/') || /^https?:\/\//i.test(str);
}

function updateUrlHash(pageId) {
    try { if (location.hash !== '#/' + pageId) history.replaceState(null, '', '#/' + pageId); } catch (_) {}
}

// НОВОЕ: Генерация UUID для облачной синхронизации
function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// НОВОЕ: Всплывающие уведомления (Toast)
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'error') toast.style.backgroundColor = '#d9534f';
    if (type === 'success') toast.style.backgroundColor = '#28a745';
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Удаляем через 3 секунды (анимация занимает 0.3с)
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
}

// НОВОЕ: Кастомный Confirm
let _confirmResolve = null;
function showConfirm(title, text) {
    return new Promise((resolve) => {
        _confirmResolve = resolve;
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-text').textContent = text;
        document.getElementById('custom-confirm-modal').style.display = 'flex';
    });
}

function resolveConfirm(result) {
    document.getElementById('custom-confirm-modal').style.display = 'none';
    if (_confirmResolve) {
        _confirmResolve(result);
        _confirmResolve = null;
    }
}
