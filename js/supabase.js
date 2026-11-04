// js/supabase.js
// ============================================================
// Инициализация Supabase и управление авторизацией.
// ============================================================

// ⚠️ ВСТАВЬТЕ СЮДА ВАШИ ДАННЫЕ ИЗ SUPABASE (Project Settings -> API)
const SUPABASE_URL = 'https://qkllomoiarqatvwhipnm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QLHITkR1hP2627h-UreptA_JjNQCke'; 

// Инициализация клиента (переменная называется supabaseClient)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================

async function handleAuth(action) {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!email || !password) {
        errorEl.textContent = 'Введите Email и пароль';
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';
    
    try {
        if (action === 'login') {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await onAuthSuccess(data.session);
        } else if (action === 'register') {
            const { data, error } = await supabaseClient.auth.signUp({ 
                email, 
                password,
                options: {
                    // Перенаправляем на ваш реальный адрес GitHub Pages после регистрации
                    emailRedirectTo: 'https://tturuturu1-blip.github.io/knigobunt/'
                }
            });
            if (error) throw error;
            
            if (data.session) {
                await onAuthSuccess(data.session);
            } else {
                if (typeof showToast === 'function') {
                    showToast('Регистрация успешна! Проверьте почту для подтверждения.', 'success');
                }
            }
        }
    } catch (err) {
        console.error('Auth error:', err);
        errorEl.textContent = translateAuthError(err.message);
        errorEl.style.display = 'block';
    }
}

async function onAuthSuccess(session) {
    currentUser = session.user;
    
    // Скрываем экран входа, показываем приложение
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    
    // Отображаем email пользователя в сайдбаре
    const emailElement = document.getElementById('sidebar-user-email');
    if (emailElement && currentUser) {
        emailElement.textContent = currentUser.email;
    }

    // Показываем тост
    if (typeof showToast === 'function') {
        showToast('С возвращением!', 'success');
    }
    
    // Запускаем приложение
    if (typeof initAppAfterAuth === 'function') {
        await initAppAfterAuth();
    }
}

async function handleLogout() {
    // Используем кастомный диалог подтверждения
    const confirmMsg = 'Вы уверены, что хотите выйти?';
    const isConfirmed = typeof showConfirm === 'function' ? await showConfirm('Выход', confirmMsg) : confirm(confirmMsg);
    
    if (!isConfirmed) return;
    
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        
        // Возвращаем экран авторизации
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('auth-password').value = '';
        
        // Очищаем локальные кеши state
        if (typeof resetAppState === 'function') resetAppState();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Ошибка выхода: ' + err.message, 'error');
        }
    }
}

function translateAuthError(msg) {
    if (msg.includes('Invalid login credentials')) return 'Неверный Email или пароль';
    if (msg.includes('User already registered')) return 'Пользователь с таким Email уже существует';
    if (msg.includes('Password should be at least 6 characters')) return 'Пароль должен быть не менее 6 символов';
    if (msg.includes('Email not confirmed')) return 'Email не подтвержден. Проверьте почту.';
    if (msg.includes('email rate limit exceeded')) return 'Слишком много попыток. Попробуйте позже.';
    return msg;
}

// Проверка сессии при загрузке страницы
async function checkSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (session) {
        await onAuthSuccess(session);
    }
}
