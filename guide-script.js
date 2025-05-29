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

// Twilio Access Request Functions
function requestTwilioAccess() {
    const modal = new bootstrap.Modal(document.getElementById('twilioModal'));
    modal.show();
}

function generateReferenceId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `SMS-${timestamp}-${randomStr}`.toUpperCase();
}

function submitTwilioRequest() {
    const form = document.getElementById('twilioAccessForm');
    
    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Get form data
    const formData = {
        name: document.getElementById('userName').value,
        email: document.getElementById('userEmail').value,
        phone: document.getElementById('userPhone').value,
        company: document.getElementById('userCompany').value,
        useCase: document.getElementById('useCase').value,
        expectedVolume: document.getElementById('expectedVolume').value,
        timestamp: new Date().toISOString(),
        referenceId: generateReferenceId()
    };
    
    // Save to localStorage for demo purposes
    // In production, this would be sent to your server
    const existingRequests = JSON.parse(localStorage.getItem('twilioRequests') || '[]');
    existingRequests.push(formData);
    localStorage.setItem('twilioRequests', JSON.stringify(existingRequests));
    
    // Show reference ID
    document.getElementById('referenceId').textContent = formData.referenceId;
    
    // Hide request modal and show success modal
    const requestModal = bootstrap.Modal.getInstance(document.getElementById('twilioModal'));
    const successModal = new bootstrap.Modal(document.getElementById('successModal'));
    
    requestModal.hide();
    setTimeout(() => {
        successModal.show();
    }, 300);
    
    // Reset form
    form.reset();
    
    // Send email (simulated)
    sendTwilioRequestEmail(formData);
}

function sendTwilioRequestEmail(formData) {
    // In a real application, this would send an actual email
    // For now, we'll just simulate it with a console log and alert
    
    console.log('Twilio Access Request Submitted:', formData);
    
    // Simulate email sending
    const emailContent = `
New Twilio SMS Access Request

Reference ID: ${formData.referenceId}
Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone}
Company: ${formData.company || 'Not provided'}
Use Case: ${formData.useCase}
Expected Volume: ${formData.expectedVolume}
Submitted: ${new Date(formData.timestamp).toLocaleString()}

Please review and setup SMS access for this user.
    `;
    
    // In production, replace this with actual email sending code
    // Example: EmailJS, server-side API call, etc.
    
    setTimeout(() => {
        console.log('Email would be sent with content:', emailContent);
        
        // You can replace this with actual email service
        // For demo purposes, we'll show an alert
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('Demo mode: Email sending simulated');
        }
    }, 1000);
}

// Additional utility functions
function copyReferenceId() {
    const referenceId = document.getElementById('referenceId').textContent;
    navigator.clipboard.writeText(referenceId).then(() => {
        // Show temporary success message
        const originalText = document.getElementById('referenceId').textContent;
        document.getElementById('referenceId').textContent = 'Copied!';
        setTimeout(() => {
            document.getElementById('referenceId').textContent = originalText;
        }, 2000);
    });
}

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

// Initialize scroll animations when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(addScrollAnimations, 500);
});

// Add click tracking for analytics (optional)
function trackFeatureClick(featureName) {
    console.log(`User clicked on feature: ${featureName}`);
    // In production, you might send this to Google Analytics or other tracking service
}

// Add event listeners for feature tracking
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('click', () => {
            const featureName = card.querySelector('h3').textContent;
            trackFeatureClick(featureName);
        });
    });
});