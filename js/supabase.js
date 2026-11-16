// js/supabase.js
// ============================================================
// Инициализация Supabase, управление авторизацией и сессией.
// ============================================================

const SUPABASE_URL = 'https://qkllomoiarqatvwhipnm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_phCimARsbn_uVtFPLAjACg_ZiR4cayi'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (вызывается один раз при загрузке страницы)
// ============================================================
function initAuth() {
    initPasswordToggle();
    createForgotPasswordModal();

    // Слушаем изменения состояния авторизации (например, обновление токена)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log(`[Auth Event] ${event}`);
        
        if (event === 'SIGNED_OUT') {
            currentUser = null;
        } else if (event === 'TOKEN_REFRESHED') {
            currentUser = session?.user || null;
        } else if (event === 'SIGNED_IN') {
            // Если пользователь вошел в другой вкладке, обновляем данные
            if (currentUser?.id !== session?.user?.id && session?.user) {
                onAuthSuccess(session);
            }
        }
    });

    // Проверяем сессию при возврате на вкладку
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && currentUser) {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            if (error || !session) {
                showToast('Сессия истекла. Войдите заново.', 'error');
                await handleLogout(false); // false = без подтверждения
            }
        }
    });
}

// ============================================================
// АВТОРИЗАЦИЯ (Вход и Регистрация)
// ============================================================
async function handleAuth(action) {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!email || !password) {
        showAuthError('Введите Email и пароль');
        return;
    }

    if (!isOnline()) {
        showAuthError('Нет подключения к интернету. Проверьте сеть.');
        return;
    }

    errorEl.style.display = 'none';
    
    // Блокируем кнопки (правка 3 и 8)
    const loginBtn = document.querySelector('.auth-buttons .btn-save');
    const registerBtn = document.querySelector('.auth-buttons .btn-cancel');
    const originalLoginText = loginBtn.textContent;
    const originalRegText = registerBtn.textContent;

    loginBtn.disabled = true; loginBtn.style.opacity = '0.7';
    registerBtn.disabled = true; registerBtn.style.opacity = '0.7';
    
    if (action === 'login') loginBtn.textContent = 'Вход...';
    if (action === 'register') registerBtn.textContent = 'Регистрация...';

    try {
        console.log(`[Auth] Попытка ${action} для ${email}`);
        
        if (action === 'login') {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await onAuthSuccess(data.session);
        } else if (action === 'register') {
            const { data, error } = await supabaseClient.auth.signUp({ 
                email, 
                password,
                options: {
                    // Динамический URL (правка 5)
                    emailRedirectTo: window.location.origin + window.location.pathname
                }
            });
            if (error) throw error;
            
            if (data.session) {
                await onAuthSuccess(data.session);
            } else {
                // На случай, если Confirm Email всё-таки включится в будущем
                showToast('Регистрация успешна! Проверьте почту.', 'success');
                document.getElementById('auth-password').value = '';
            }
        }
    } catch (err) {
        console.error('[Auth Error]:', err);
        showAuthError(translateAuthError(err.message));
    } finally {
        // Разблокируем кнопки
        loginBtn.disabled = false; loginBtn.style.opacity = '1';
        registerBtn.disabled = false; registerBtn.style.opacity = '1';
        loginBtn.textContent = originalLoginText;
        registerBtn.textContent = originalRegText;
    }
}

function showAuthError(msg) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
}

// ============================================================
// УСПЕШНЫЙ ВХОД
// ============================================================
async function onAuthSuccess(session) {
    currentUser = session.user;
    console.log(`[Auth] Успешный вход: ${currentUser.email}`);

    // Сбрасываем состояние перед загрузкой новых данных (правка 2)
    if (typeof resetAppState === 'function') resetAppState();
    
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    
    const emailElement = document.getElementById('sidebar-user-email');
    if (emailElement && currentUser) {
        emailElement.textContent = currentUser.email;
    }

    showToast('С возвращением!', 'success');
    
    if (typeof initAppAfterAuth === 'function') {
        await initAppAfterAuth();
    }
}

// ============================================================
// ВЫХОД ИЗ АККАУНТА
// ============================================================
async function handleLogout(askConfirm = true) {
    if (askConfirm) {
        const isConfirmed = await showConfirm('Выход', 'Вы уверены, что хотите выйти?');
        if (!isConfirmed) return;
    }
    
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        
        // Очищаем локальную базу данных (правка 1 - КРИТИЧНО!)
        await clearLocalDatabase();
        
        // Сбрасываем состояние
        if (typeof resetAppState === 'function') resetAppState();
        
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('auth-password').value = '';
        
        showToast('Вы вышли из аккаунта', 'info');
    } catch (err) {
        showToast('Ошибка выхода: ' + err.message, 'error');
    }
}

// ============================================================
// ПРОВЕРКА СЕССИИ ПРИ ЗАГРУЗКЕ
// ============================================================
async function checkSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        
        if (session) {
            await onAuthSuccess(session);
        }
    } catch (err) {
        console.error('[Auth] Ошибка проверки сессии:', err);
        showToast('Не удалось восстановить сессию', 'error');
    }
}

// ============================================================
// ВОССТАНОВЛЕНИЕ ПАРОЛЯ (Забыли пароль?)
// ============================================================
async function handleForgotPassword() {
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) {
        showToast('Введите email', 'error');
        return;
    }

    if (!isOnline()) {
        showToast('Нет подключения к интернету', 'error');
        return;
    }

    const btn = document.getElementById('forgot-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Отправка...';

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });
        if (error) throw error;
        
        showToast('Письмо для сброса пароля отправлено на почту', 'success');
        document.getElementById('forgot-password-modal').style.display = 'none';
    } catch (err) {
        showToast('Ошибка: ' + translateAuthError(err.message), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Отправить ссылку';
    }
}

// Создаем модалку динамически (чтобы не менять HTML)
function createForgotPasswordModal() {
    if (document.getElementById('forgot-password-modal')) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'forgot-password-modal';
    modal.innerHTML = `
        <div class="modal modal-narrow">
            <button class="modal-close-x" onclick="document.getElementById('forgot-password-modal').style.display='none'">✕</button>
            <h2>Восстановление пароля</h2>
            <p class="text-center mb-15">Введите ваш Email, и мы отправим ссылку для сброса пароля.</p>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="forgot-email" placeholder="you@example.com">
            </div>
            <div class="btn-group" style="justify-content: center;">
                <button class="btn-cancel" onclick="document.getElementById('forgot-password-modal').style.display='none'">Отмена</button>
                <button class="btn-save" id="forgot-submit-btn" onclick="handleForgotPassword()">Отправить ссылку</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Добавляем ссылку "Забыли пароль?" на экран входа
    const passwordGroup = document.getElementById('auth-password').closest('.form-group');
    if (passwordGroup) {
        const forgotLink = document.createElement('a');
        forgotLink.href = '#';
        forgotLink.textContent = 'Забыли пароль?';
        forgotLink.style.cssText = 'display: block; text-align: right; font-size: 12px; color: #888; text-decoration: none; margin-top: 5px;';
        forgotLink.onclick = (e) => {
            e.preventDefault();
            document.getElementById('forgot-password-modal').style.display = 'flex';
        };
        passwordGroup.appendChild(forgotLink);
    }
}

// ============================================================
// «ГЛАЗИК» ДЛЯ ПАРОЛЯ
// ============================================================
function initPasswordToggle() {
    const toggleBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('auth-password');
    if (toggleBtn && passwordInput) {
        // Убираем старый обработчик, если он был в HTML
        toggleBtn.onclick = null; 
        toggleBtn.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            this.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
        });
    }
}

// ============================================================
// ПЕРЕВОД ОШИБОК (правка 6)
// ============================================================
function translateAuthError(msg) {
    if (!msg) return 'Неизвестная ошибка';
    const m = msg.toLowerCase();
    
    if (m.includes('invalid login credentials')) return 'Неверный Email или пароль';
    if (m.includes('user already registered')) return 'Пользователь с таким Email уже существует';
    if (m.includes('password should be at least')) return 'Пароль слишком короткий (минимум 6 символов)';
    if (m.includes('email not confirmed')) return 'Email не подтвержден. Проверьте почту.';
    if (m.includes('email rate limit exceeded')) return 'Слишком много попыток. Попробуйте позже.';
    if (m.includes('unable to validate email address')) return 'Некорректный формат Email';
    if (m.includes('signup requires a valid password')) return 'Введите корректный пароль';
    if (m.includes('network error') || m.includes('fetch')) return 'Ошибка сети. Проверьте интернет.';
    if (m.includes('user not found')) return 'Пользователь не найден';
    
    return msg; // Если не знаем перевод, возвращаем оригинал
}

// ============================================================
// ОЧИСТКА ЛОКАЛЬНОЙ БД (для безопасности при выходе)
// ============================================================
async function clearLocalDatabase() {
    if (typeof db === 'undefined') return;
    try {
        await db.transaction('rw', [db.books, db.calendar, db.collections, db.wishlists], async () => {
            await db.books.clear();
            await db.calendar.clear();
            await db.collections.clear();
            await db.wishlists.clear();
        });
        console.log('[DB] Локальная база очищена');
    } catch (err) {
        console.error('[DB] Ошибка очистки:', err);
    }
}

// Запуск инициализации при загрузке страницы
window.addEventListener('load', () => {
    // Небольшая задержка, чтобы DOM и другие скрипты успели загрузиться
    setTimeout(initAuth, 100);
});