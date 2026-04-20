// ===== AUTH PAGE JAVASCRIPT =====

document.addEventListener('DOMContentLoaded', function() {
    initAuthTabs();
    initPasswordToggles();
    initFormValidation();
    initFormSubmission();
    initPasswordStrength();
});

// ===== TAB SWITCHING =====
function initAuthTabs() {
    const tabs = document.querySelectorAll('.auth-tab');
    const tabIndicator = document.querySelector('.auth-tab-indicator');
    const loginForm = document.querySelector('.login-form');
    const signupForm = document.querySelector('.signup-form');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const isSignup = this.classList.contains('signup');
            
            // Update tab active states
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Move indicator
            if (tabIndicator) {
                if (isSignup) {
                    tabIndicator.style.transform = 'translateX(100%)';
                } else {
                    tabIndicator.style.transform = 'translateX(0)';
                }
            }
            
            // Slide forms
            if (loginForm && signupForm) {
                if (isSignup) {
                    loginForm.classList.add('slide-out');
                    loginForm.classList.remove('active');
                    signupForm.classList.remove('slide-out');
                    signupForm.classList.add('active');
                } else {
                    signupForm.classList.add('slide-out');
                    signupForm.classList.remove('active');
                    loginForm.classList.remove('slide-out');
                    loginForm.classList.add('active');
                }
            }
        });
    });
}

// ===== PASSWORD TOGGLE =====
function initPasswordToggles() {
    const toggles = document.querySelectorAll('.password-toggle');
    
    toggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            const inputId = this.getAttribute('data-input');
            const input = document.getElementById(inputId) || this.closest('.input-wrapper').querySelector('input');
            
            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                    this.classList.add('visible');
                    this.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
                } else {
                    input.type = 'password';
                    this.classList.remove('visible');
                    this.innerHTML = '<i class="fa-solid fa-eye"></i>';
                }
            }
        });
    });
}

// ===== FORM VALIDATION =====
function initFormValidation() {
    const inputs = document.querySelectorAll('.auth-form input[type="text"], .auth-form input[type="email"], .auth-form input[type="password"]');
    
    inputs.forEach(input => {
        // Validation patterns
        const patterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            phone: /^[\d\s\-+()]{10,}$/,
            name: /^[\a-zA-Z\s]{2,}$/,
            password: /^.{8,}$/
        };
        
        input.addEventListener('blur', function() {
            const type = this.name || this.type;
            const value = this.value.trim();
            
            if (!value) {
                this.classList.remove('valid', 'error');
                return false;
            }
            
            if (patterns[type]) {
                if (patterns[type].test(value)) {
                    this.classList.add('valid');
                    this.classList.remove('error');
                } else {
                    this.classList.remove('valid');
                    this.classList.add('error');
                }
            }
            
            return patterns[type] ? patterns[type].test(value) : true;
        });
        
        input.addEventListener('input', function() {
            this.classList.remove('error');
        });
    });
}

// ===== PASSWORD STRENGTH =====
function initPasswordStrength() {
    const passwordInput = document.getElementById('signup-password');
    const strengthBars = document.querySelectorAll('.strength-bar');
    const strengthText = document.querySelector('.strength-text');
    
    if (!passwordInput) return;
    
    passwordInput.addEventListener('input', function() {
        const password = this.value;
        let strength = 0;
        
        // Calculate strength
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^a-zA-Z0-9]/.test(password)) strength++;
        
        // Update bars
        strengthBars.forEach((bar, index) => {
            bar.classList.remove('weak', 'medium', 'strong');
            
            if (password.length === 0) return;
            
            if (index < 2) {
                if (strength >= 2) bar.classList.add('weak');
            } else if (index < 4) {
                if (strength >= 3) bar.classList.add('medium');
            } else {
                if (strength >= 5) bar.classList.add('strong');
            }
        });
        
        // Update text
        if (strengthText) {
            if (password.length === 0) {
                strengthText.textContent = '';
                strengthText.className = 'strength-text';
            } else if (strength < 3) {
                strengthText.textContent = 'Weak password';
                strengthText.className = 'strength-text weak';
            } else if (strength < 5) {
                strengthText.textContent = 'Medium password';
                strengthText.className = 'strength-text medium';
            } else {
                strengthText.textContent = 'Strong password';
                strengthText.className = 'strength-text strong';
            }
        }
    });
}

// ===== FORM SUBMISSION =====
function initFormSubmission() {
    const loginForm = document.querySelector('.login-form');
    const signupForm = document.querySelector('.signup-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLogin(this);
        });
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleSignup(this);
        });
    }
}

function handleLogin(form) {
    const submitBtn = form.querySelector('.btn-submit');
    const email = form.querySelector('input[name="email"]');
    const password = form.querySelector('input[name="password"]');
    
    // Validate
    let isValid = true;
    
    if (!email.value.trim()) {
        email.classList.add('error');
        isValid = false;
    }
    
    if (!password.value) {
        password.classList.add('error');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show loading
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    // TODO: Add API call here
    // Example: 
    // fetch('/api/auth/login', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //         email: email.value,
    //         password: password.value
    //     })
    // })
    
    // Mock API call simulation
    setTimeout(function() {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        
        // Show success (for demo)
        showSuccess('Login successful! Redirecting...');
        
        // TODO: Redirect to dashboard or home page
        // window.location.href = '/dashboard';
    }, 2000);
}

function handleSignup(form) {
    const submitBtn = form.querySelector('.btn-submit');
    const name = form.querySelector('input[name="name"]');
    const email = form.querySelector('input[name="email"]');
    const password = form.querySelector('input[name="password"]');
    const confirmPassword = form.querySelector('input[name="confirm_password"]');
    const terms = form.querySelector('input[name="terms"]');
    
    // Validate
    let isValid = true;
    
    if (!name.value.trim() || name.value.trim().length < 2) {
        name.classList.add('error');
        isValid = false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.value)) {
        email.classList.add('error');
        isValid = false;
    }
    
    if (password.value.length < 8) {
        password.classList.add('error');
        isValid = false;
    }
    
    if (password.value !== confirmPassword.value) {
        confirmPassword.classList.add('error');
        isValid = false;
    }
    
    if (!terms.checked) {
        isValid = false;
        terms.closest('.terms-checkbox').style.color = 'var(--auth-danger)';
    }
    
    if (!isValid) return;
    
    // Show loading
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    // TODO: Add API call here
    // Example:
    // fetch('/api/auth/signup', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //         name: name.value,
    //         email: email.value,
    //         phone: form.querySelector('input[name="phone"]')?.value,
    //         password: password.value
    //     })
    // })
    
    // Mock API call simulation
    setTimeout(function() {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        
        // Show success (for demo)
        showSuccess('Account created successfully!');
        
        // TODO: Redirect to dashboard or verification page
        // window.location.href = '/dashboard';
    }, 2000);
}

// ===== SUCCESS MODAL =====
function showSuccess(message) {
    const modal = document.querySelector('.auth-success');
    const text = modal?.querySelector('.success-content p');
    
    if (text) {
        text.textContent = message;
    }
    
    if (modal) {
        modal.classList.add('active');
        
        // Auto close after redirect simulation
        setTimeout(function() {
            modal.classList.remove('active');
        }, 3000);
    }
}

// Close modal on click
document.addEventListener('click', function(e) {
    const modal = document.querySelector('.auth-success');
    if (modal && modal.classList.contains('active')) {
        if (e.target === modal || e.target.closest('.success-content')) {
            modal.classList.remove('active');
        }
    }
});

// ===== MAGNETIC BUTTON EFFECT (Optional) =====
function initMagneticButtons() {
    const buttons = document.querySelectorAll('.btn-submit, .social-btn');
    
    buttons.forEach(button => {
        button.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            this.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translate(0, 0)';
        });
    });
}

// Initialize magnetic buttons
initMagneticButtons();