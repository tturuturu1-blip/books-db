// js/utils.js
// ============================================================
// Утилиты (без зависимостей). Подключается ПЕРВЫМ.
// ============================================================

/**
 * Экранирует HTML-спецсимволы для безопасной вставки в DOM.
 * Защищает от XSS-атак.
 */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Откладывает вызов функции до тех пор, пока не пройдёт ms миллисекунд без новых вызовов.
 * Полезно для поиска при вводе с клавиатуры.
 * @param {boolean} immediate - если true, вызов произойдёт сразу, а последующие будут отложены.
 */
function debounce(fn, ms = 200, immediate = false) {
    let timer = null;
    return function (...args) {
        const callNow = immediate && !timer;
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            if (!immediate) fn.apply(this, args);
        }, ms);
        if (callNow) fn.apply(this, args);
    };
}

/**
 * Ограничивает частоту вызова функции (не чаще, чем раз в ms мс).
 * Полезно для кнопок, где важно не пропустить первое нажатие.
 */
function throttle(fn, ms = 100) {
    let lastCall = 0;
    let timer = null;
    return function (...args) {
        const now = Date.now();
        const remaining = ms - (now - lastCall);
        if (remaining <= 0) {
            if (timer) { clearTimeout(timer); timer = null; }
            lastCall = now;
            fn.apply(this, args);
        } else if (!timer) {
            timer = setTimeout(() => {
                lastCall = Date.now();
                timer = null;
                fn.apply(this, args);
            }, remaining);
        }
    };
}

/**
 * Ограничивает вызов функции до одного раза за кадр (обычно 60 раз в секунду).
 * Идеален для обработки прокрутки/изменения размера окна.
 */
function rafThrottle(fn) {
    let scheduled = false;
    let lastArgs = null;
    return function (...args) {
        lastArgs = args;
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            fn.apply(this, lastArgs);
        });
    };
}

/**
 * Форматирует дату из технического вида (ГГГГ-ММ-ДД[ с временем]) в человеческий (ДД.ММ.ГГГГ).
 * Если пришла дата с временем ("2024-05-20T10:30:00"), время отбрасывается.
 * Если формат не распознан — возвращает исходную строку как есть.
 */
function formatDateRu(dateStr) {
    if (!dateStr) return '';
    // Отрезаем время, если оно есть
    const cleanDate = String(dateStr).split('T')[0].split(' ')[0];
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return String(dateStr);
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/**
 * Возвращает сегодняшнюю дату в техническом формате ISO (ГГГГ-ММ-ДД).
 * Используется для хранения в БД, для input[type=date] и для ключей календаря.
 * ⚠️ НЕ ИСПОЛЬЗОВАТЬ для показа пользователю — для этого есть formatDateRu().
 */
function getTodayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Нормализует строку для поиска/сравнения: приводит к нижнему регистру,
 * убирает спецсимволы.
 * @param {boolean} strict - если true, удаляет и пробелы (для жёсткого сравнения).
 */
function normalizeString(s, strict = false) {
    let result = String(s || '').toLowerCase();
    if (strict) {
        result = result.replace(/[^а-яёa-z0-9]/gi, '');
    } else {
        result = result.replace(/[^а-яёa-z0-9\s]/gi, '').replace(/\s+/g, ' ');
    }
    return result.trim();
}

/**
 * Возвращает чёрный или белый цвет текста для контраста на заданном фоне.
 * Поддерживает 3-символьный и 6-символьный hex. Невалидный формат → чёрный.
 */
function getContrastTextColor(hexColor) {
    if (!hexColor) return '#000';
    const hex = String(hexColor).replace('#', '').trim();
    let r, g, b;
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        return '#000';
    }
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '#000';
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#000' : '#fff';
}

/**
 * Сжимает изображение: уменьшает до maxWidth, конвертирует в JPEG с качеством quality.
 * Возвращает base64 data URL.
 */
function compressImage(file, maxWidth = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('Нет файла'));
        if (!file.type || !file.type.startsWith('image/')) return reject(new Error('Не изображение'));
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
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                // Белый фон — чтобы прозрачные PNG не стали чёрными
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                try {
                    resolve(canvas.toDataURL('image/jpeg', quality));
                } catch (err) {
                    reject(err);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Проверяет, что строка похожа на URL изображения (http(s) или base64).
 */
function isImageUrl(str) {
    if (!str || typeof str !== 'string') return false;
    return str.startsWith('data:image/') || /^https?:\/\//i.test(str);
}

/**
 * Обновляет URL-хэш при навигации.
 * Использует pushState — это позволяет кнопке «Назад» в браузере
 * возвращать пользователя на предыдущий экран приложения.
 * ⚠️ В app.js нужно добавить обработчик window.addEventListener('popstate', ...)
 */
function updateUrlHash(pageId) {
    try {
        const newHash = '#/' + pageId;
        if (location.hash !== newHash) {
            history.pushState({ page: pageId }, '', newHash);
        }
    } catch (_) { /* игнорируем — в некоторых песочницах pushState запрещён */ }
}

/**
 * Генерирует UUID v4.
 * Использует crypto.randomUUID() если доступен, иначе — надёжный fallback.
 */
function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Показывает всплывающее уведомление (тост) внизу экрана.
 * Цвета задаются через CSS-классы .toast-success / .toast-error / .toast-info.
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
}

/**
 * Кастомное модальное окно подтверждения.
 * Возвращает Promise<boolean>. Если открывается новое окно, пока предыдущее ещё не закрыто,
 * предыдущий промис разрешается как false (никаких «зависаний»).
 */
let _confirmResolve = null;
function showConfirm(title, text) {
    return new Promise((resolve) => {
        // Если предыдущее окно не было закрыто — отклоняем его
        if (_confirmResolve) {
            _confirmResolve(false);
            _confirmResolve = null;
        }
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

/**
 * Обрезает текст до maxLength символов, добавляя суффикс.
 */
function truncateText(text, maxLength = 15, suffix = '...') {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength).trim() + suffix;
}

/**
 * Возвращает случайный «книжный» цвет из палитры.
 * Используется, когда пользователь не выбрал цвет корешка.
 */
function getRandomBookColor() {
    const colors = [
        '#fcfaf5', '#e8d8c8', '#d4c4b0', '#c8b8a4',
        '#a8d8d0', '#b8c8e0', '#e0c8d8', '#f0e0c8',
        '#c8e0d8', '#e0d8f0', '#f0d8d8', '#d8e0c8'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Форматирует число с разделителями разрядов.
 * 1000 → "1 000", 1000000 → "1 000 000".
 */
function formatNumber(num) {
    const n = Number(num);
    if (!isFinite(n)) return '0';
    try {
        return n.toLocaleString('ru-RU');
    } catch (_) {
        return String(n);
    }
}

/**
 * Копирует текст в буфер обмена.
 * Использует современный API, с fallback на execCommand для старых браузеров.
 * Возвращает true при успехе.
 */
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return true;
        }
        // Fallback для старых браузеров
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    } catch (err) {
        console.error('Копирование не удалось:', err);
        return false;
    }
}

/**
 * Простой асинхронный «сон».
 * Использование: await sleep(500); — подождёт полсекунды.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Проверяет, есть ли интернет.
 */
function isOnline() {
    return typeof navigator !== 'undefined' && navigator.onLine !== false;
}