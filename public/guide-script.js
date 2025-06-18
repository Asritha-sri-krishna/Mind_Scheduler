// --- guide-script.js (CORRECTED) ---

// --- Theme Management ---
function applyTheme(theme) {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(theme + '-theme');

    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
        toggleBtn.textContent = theme === 'dark' ? '🌙' : '🌞';
    }

    localStorage.setItem('guide-theme', theme);
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('guide-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

// --- Smooth Reveal Animations ---
function addScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .card').forEach(card => {
        observer.observe(card);
    });
}

// --- Twilio Access Request Functions ---
function requestTwilioAccess() {
    const modal = new bootstrap.Modal(document.getElementById('twilioModal'));
    modal.show();
}

function submitTwilioRequest() {
    const form = document.getElementById('twilioAccessForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const formData = {
        userName: document.getElementById('userName').value,
        userEmail: document.getElementById('userEmail').value,
        userPhone: document.getElementById('userPhone').value,
        userCompany: document.getElementById('userCompany').value,
    };

    const submitBtn = document.querySelector('#twilioModal .modal-footer .btn-primary');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting...';

    // --- The endpoint we will create in server.js ---
    fetch('/api/twilio-access-request', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message || 'Server error'); });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            const requestModal = bootstrap.Modal.getInstance(document.getElementById('twilioModal'));
            const successModal = new bootstrap.Modal(document.getElementById('successModal'));
            
            // Set up the success modal content BEFORE showing it
            document.getElementById('referenceId').textContent = data.referenceId || 'N/A';
            const thankYouMessage = document.querySelector('#successModal .modal-body h4');
            const leadParagraph = document.querySelector('#successModal .modal-body .lead');
            const infoParagraph = document.querySelector('#successModal .modal-body p:nth-of-type(2)');

            if (data.isNewUser) {
                thankYouMessage.textContent = 'Request Submitted!';
                leadParagraph.textContent = 'Your SMS access request has been successfully received.';
                infoParagraph.textContent = 'We will review your request and contact you directly to verify your details. Please allow 24 hours for us to get in touch.';
            } else {
                thankYouMessage.textContent = 'Welcome Back!';
                leadParagraph.textContent = 'You are already in our system.';
                infoParagraph.textContent = 'We have noted your renewed interest. We\'ll be in touch if further action is needed.';
            }

            requestModal.hide();
            // Wait for the first modal to fully hide before showing the next one
            requestModal._element.addEventListener('hidden.bs.modal', () => {
                successModal.show();
            }, { once: true });

            form.reset();
        } else {
            alert('Request failed: ' + (data.message || 'Unknown error.'));
        }
    })
    .catch(error => {
        console.error('Error submitting request:', error);
        alert('There was an error: ' + error.message);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    });
}

// =================================================================
// --- SINGLE, UNIFIED INITIALIZATION FUNCTION ---
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Theme
    const savedTheme = localStorage.getItem('guide-theme') || 'light';
    applyTheme(savedTheme);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // 2. Initialize Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // 3. Initialize Scroll Animations (with a small delay to ensure content is laid out)
    setTimeout(addScrollAnimations, 100);

    // 4. Initialize Twilio Modal Submit Button Listener
    const submitTwilioBtn = document.querySelector('#twilioModal .modal-footer .btn-primary');
    if (submitTwilioBtn) {
        submitTwilioBtn.addEventListener('click', submitTwilioRequest);
    }
});



