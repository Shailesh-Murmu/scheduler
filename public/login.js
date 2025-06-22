const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(loginForm);
        const email = formData.get('email');
        const password = formData.get('password');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (result.success) {
                window.location.href = '/';
            } else {
                showError(result.message || 'Login failed');
            }
        } catch (error) {
            showError('Network error. Please try again.');
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.className = 'error-message';
        setTimeout(() => {
            errorMessage.className = 'error-hidden';
        }, 5000);
    }
});

togglePassword.addEventListener('click', function () {
    // Toggle the type attribute
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    // Toggle the eye icon/text
    this.textContent = type === 'password' ? '👁️' : '🙈';
});