const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");
const togglePassword = document.getElementById("togglePassword");

document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  const errorMessage = document.getElementById("error-message");

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(signupForm);
    const email = formData.get("email");
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    if (password !== confirmPassword) {
      showError("Passwords do not match");
      return;
    }

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (result.success) {
        alert("Account created successfully! Please login.");
        window.location.href = "/login";
      } else {
        showError(result.message || "Signup failed");
      }
    } catch (error) {
      showError("Network error. Please try again.");
    }
  });

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.className = "error-message";
    setTimeout(() => {
      errorMessage.className = "error-hidden";
    }, 5000);
  }
});

togglePassword.addEventListener("click", function () {
  // Toggle the type attribute

  const type =
    passwordInput.getAttribute("type") === "password" ? "text" : "password";
  passwordInput.setAttribute("type", type);
  // Toggle the eye icon/text
  this.textContent = type === "password" ? "👁️" : "🙈";
});
toggleConfirmPassword.addEventListener("click", function () {
  // Toggle the type attribute

  const type =
    confirmPasswordInput.getAttribute("type") === "password"
      ? "text"
      : "password";
  confirmPasswordInput.setAttribute("type", type);
  // Toggle the eye icon/text
  this.textContent = type === "password" ? "👁️" : "🙈";
});
