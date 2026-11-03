// js/utils.js
// ============================================================
// Утилиты (без зависимостей). Подключается ПЕРВЫМ.
// ============================================================

/**
 * Экранирование HTML для защиты от XSS.
 * Обязательно применять ко всему пользовательскому тексту,
 * который попадает в innerHTML / шаблонные строки.
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
 * Debounce — откладывает вызов fn до тех пор, пока не пройдёт ms мс
 * без новых вызовов. Используется для поиска по базе XLSX и ввода автора.
 */
function debounce(fn, ms = 200) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/**
 * Форматирует ISO-дату 'YYYY-MM-DD' → 'DD.MM.YYYY'.
 * Если на вход приходит что-то другое — возвращает как есть.
 */
function formatDateRu(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/**
 * Сегодняшняя дата в формате DD.MM.YYYY (для «впечатлений» и цитат).
 */
function getTodayDateStr() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/**
 * Сегодняшняя дата в формате YYYY-MM-DD (для ключей календаря).
 */
function getTodayIsoStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Нормализация строки для поиска совпадений:
 * нижний регистр, удаление пунктуации, схлопывание пробелов.
 */
function normalizeString(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^а-яёa-z0-9\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Определяет цвет текста (чёрный или белый) для читаемости на фоне hex.
 */
function getContrastTextColor(hexColor) {
    const hex = (hexColor || '#fcfaf5').replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) || 0;
    const g = parseInt(hex.substr(2, 2), 16) || 0;
    const b = parseInt(hex.substr(4, 2), 16) || 0;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#000' : '#fff';
}

/**
 * Сжимает изображение в JPEG-Data URL.
 * Это ключевая функция для перехода на IndexedDB: раньше файл 2 МБ
 * сохранялся как есть, теперь 5 МБ фотография превращается в ~150–300 КБ,
 * что позволяет хранить сотни обложек без переполнения квоты.
 *
 * @param {File} file — файл из <input type="file">
 * @param {number} maxWidth — максимальная ширина в px (по умолчанию 800)
 * @param {number} quality — качество JPEG 0..1 (по умолчанию 0.75)
 * @returns {Promise<string>} — data URL 'data:image/jpeg;base64,...'
 */
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
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                // Белый фон — чтобы прозрачные PNG не становились чёрными в JPEG
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
 * Читает файл как data URL без сжатия (для GIF-анимаций, SVG и т.п.).
 */
function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('Нет файла'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Ошибка чтения'));
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

/**
 * Проверяет, является ли значение валидным URL картинки (data/http/https).
 */
function isImageUrl(str) {
    if (!str || typeof str !== 'string') return false;
    return str.startsWith('data:image/') || /^https?:\/\//i.test(str);
}

/**
 * Обновляет URL-параметр без перезагрузки страницы (не используется сейчас,
 * но пригодится при добавлении hash-роутинга для кнопки «Назад» Android).
 */
function updateUrlHash(pageId) {
    try {
        if (location.hash !== '#/' + pageId) {
            history.replaceState(null, '', '#/' + pageId);
        }
    } catch (_) { /* noop */ }
}
