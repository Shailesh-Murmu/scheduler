document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgotPasswordForm');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = form.email.value;

        try {
            const response = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const result = await response.json();
            if (result.success) {
                alert('Password reset link sent to your email');
                window.location.href = '/login';
            } else {
                showError(result.message || 'Failed to send reset link');
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
