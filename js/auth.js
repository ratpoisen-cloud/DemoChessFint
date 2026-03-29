// ==================== АВТОРИЗАЦИЯ ====================
// Отвечает за: вход/выход через Google и Email, состояние пользователя

window.setupAuth = function() {
    onAuthStateChanged(window.auth, (user) => {
        window.currentUser = user;
        const authGroup = document.getElementById('auth-buttons');
        const userInfo = document.getElementById('user-info');
        
        if (user) {
            authGroup?.classList.add('hidden');
            userInfo?.classList.remove('hidden');
            
            const userName = window.getUserName(user);
            document.getElementById('user-name').innerText = userName;
            
            const userPhoto = document.getElementById('user-photo');
            if (user.photoURL) {
                userPhoto.src = user.photoURL;
                userPhoto.style.display = 'block';
                const letterAvatar = document.querySelector('.letter-avatar');
                if (letterAvatar) letterAvatar.style.display = 'none';
            } else {
                userPhoto.style.display = 'none';
                let letterAvatar = document.querySelector('.letter-avatar');
                if (!letterAvatar) {
                    letterAvatar = document.createElement('div');
                    letterAvatar.className = 'letter-avatar';
                    userPhoto.parentNode.insertBefore(letterAvatar, userPhoto.nextSibling);
                }
                letterAvatar.style.display = 'flex';
                letterAvatar.innerText = userName.charAt(0).toUpperCase();
            }
            
            if (!new URLSearchParams(window.location.search).get('room')) {
                if (window.loadLobby) window.loadLobby(user);
            }
        } else {
            authGroup?.classList.remove('hidden');
            userInfo?.classList.add('hidden');
        }
    });

    // Google вход
    document.getElementById('login-google').onclick = () => signInWithPopup(window.auth, new GoogleAuthProvider());

    // Email модальное окно
    const emailModal = document.getElementById('email-modal');
    const emailError = document.getElementById('email-error');
    
    const showError = (msg) => {
        emailError.innerText = msg;
        emailError.classList.remove('hidden');
    };

    document.getElementById('login-email-trigger').onclick = () => {
        emailError.classList.add('hidden');
        emailModal.classList.remove('hidden');
    };
    
    document.getElementById('close-email-modal').onclick = () => emailModal.classList.add('hidden');

    // Вход по Email
    document.getElementById('login-email-btn').onclick = async () => {
        const email = document.getElementById('email-input').value.trim();
        const pass = document.getElementById('password-input').value;
        if (!email || !pass) return showError("Введите почту и пароль");

        try {
            await signInWithEmailAndPassword(window.auth, email, pass);
            emailModal.classList.add('hidden');
            document.getElementById('email-input').value = '';
            document.getElementById('password-input').value = '';
        } catch (err) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
                showError("Неверная почта или пароль");
            } else {
                showError("Ошибка входа: " + err.message);
            }
        }
    };

    // Регистрация по Email
    document.getElementById('register-email-btn').onclick = async () => {
        const email = document.getElementById('email-input').value.trim();
        const pass = document.getElementById('password-input').value;
        
        if (!email) return showError("Введите почту");
        if (pass.length < 6) return showError("Пароль должен быть от 6 символов");

        try {
            await createUserWithEmailAndPassword(window.auth, email, pass);
            emailModal.classList.add('hidden');
            document.getElementById('email-input').value = '';
            document.getElementById('password-input').value = '';
            alert("Аккаунт успешно создан!");
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                showError("Эта почта уже зарегистрирована");
            } else {
                showError("Ошибка регистрации: " + err.message);
            }
        }
    };

    // Выход
    document.getElementById('logout-btn').onclick = () => signOut(window.auth).then(() => location.href = location.origin + location.pathname);
};
