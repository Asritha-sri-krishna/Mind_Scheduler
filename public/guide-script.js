// Theme Management
function applyTheme(theme) {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(theme + '-theme');

    const toggleBtn = document.getElementById('themeToggleBtn');
    toggleBtn.textContent = theme === 'dark' ? '🌙' : '🌞';

    localStorage.setItem('guide-theme', theme);
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('guide-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('guide-theme') || 'light';
    applyTheme(savedTheme);
    
    // Add smooth scrolling to anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('guide-theme') || 'light';
    applyTheme(savedTheme);

    // Add smooth scrolling to anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Event listener for theme toggle button (if you have one in guide.html)
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
});


// Twilio Access Request Functions
function requestTwilioAccess() {
    const modal = new bootstrap.Modal(document.getElementById('twilioModal'));
    modal.show();
}

// --- submitTwilioRequest: MODIFIED FOR MANUAL VERIFICATION FLOW ---
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

    const submitBtn = document.querySelector('#twilioModal .modal-footer button.btn-primary');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting...';

    fetch('/api/twilio-access-request', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errorData => {
                throw new Error(errorData.message || 'Server responded with an error.');
            }).catch(() => {
                throw new Error(`HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            document.getElementById('referenceId').textContent = data.referenceId || 'N/A (Existing User)';

            const requestModal = bootstrap.Modal.getInstance(document.getElementById('twilioModal'));
            const successModal = new bootstrap.Modal(document.getElementById('successModal'));

            requestModal.hide();
            setTimeout(() => {
                successModal.show();
            }, 300);

            form.reset();
            console.log("Submission successful:", data.message);

            // Customize the success modal message based on backend response
            const thankYouMessage = document.querySelector('#successModal .modal-body h4');
            const leadParagraph = document.querySelector('#successModal .modal-body .lead');
            const infoParagraph = document.querySelector('#successModal .modal-body p:nth-of-type(2)');

            if (data.isNewUser) {
                thankYouMessage.textContent = 'Request Submitted!';
                leadParagraph.textContent = 'Your SMS access request has been successfully received.';
                infoParagraph.textContent = 'We will review your request and contact you directly via the provided email or phone number to verify your details and set up SMS access. Please allow 24 hours for us to get in touch.';
            } else { // Existing user
                thankYouMessage.textContent = 'Welcome Back!';
                leadParagraph.textContent = 'Your request has been noted.';
                infoParagraph.textContent = 'You are already an existing user for SMS access. We\'ll be in touch if further action is needed regarding your previous request.';
            }

        } else {
            alert('Request failed: ' + (data.message || 'Unknown error from server.'));
        }
    })
    .catch(error => {
        console.error('Error submitting request:', error);
        alert('There was an error submitting your request: ' + error.message);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    });
}

// --- Functions no longer needed with manual verification ---
// You can definitively remove these from guide-script.js
/*
function generateReferenceId() { ... }
function sendTwilioRequestEmail(formData) { ... }
*/

// Additional utility functions (Your existing code)
function copyReferenceId() {
    const referenceId = document.getElementById('referenceId').textContent;
    navigator.clipboard.writeText(referenceId).then(() => {
        const originalText = document.getElementById('referenceId').textContent;
        document.getElementById('referenceId').textContent = 'Copied!';
        setTimeout(() => {
            document.getElementById('referenceId').textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}


// Initialize scroll animations when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(addScrollAnimations, 500);
});

// Add click tracking for analytics (optional - Your existing code)
function trackFeatureClick(featureName) {
    console.log(`User clicked on feature: ${featureName}`);
}

// Add event listeners for feature tracking (Your existing code)
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('click', () => {
            const featureName = card.querySelector('h3').textContent;
            trackFeatureClick(featureName);
        });
    });
});

// ... (rest of your existing guide-script.js code) ...



// Smooth reveal animations for cards
function addScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all feature cards
    document.querySelectorAll('.feature-card, .card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
}



