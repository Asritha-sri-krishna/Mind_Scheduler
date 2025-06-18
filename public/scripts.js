// API Configuration
const API_URL = 'http://localhost:3000/api';
let authToken = null;
let currentUser = null;

// API Helper Functions
async function apiCall(endpoint, method = 'GET', body = null) {
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (authToken) {
        config.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Theme Management
function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeToggleBtn');
    
    body.classList.toggle('dark-mode');
    
    if (body.classList.contains('dark-mode')) {
        themeBtn.textContent = '🌙';
        localStorage.setItem('theme', 'dark');
    } else {
        themeBtn.textContent = '🌞';
        localStorage.setItem('theme', 'light');
    }
}

// Views Management
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

// Data Management - API Functions
async function saveUserMoodData() {
    if (!currentUser || !authToken) return;
    
    try {
        await apiCall('/user/mood', 'PUT', { moodData });
    } catch (error) {
        console.error('Failed to save mood data:', error);
    }
}

async function saveUserTasks() {
    if (!currentUser || !authToken) return;
    
    try {
        await apiCall('/user/tasks', 'PUT', { tasks });
    } catch (error) {
        console.error('Failed to save tasks:', error);
    }
}

// Authentication - Updated for API
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await apiCall('/login', 'POST', { email, password });
        
        // Store token
        authToken = response.token;
        localStorage.setItem('authToken', authToken);
        
        // Set current user
        currentUser = response.user;
        
        // Load user data
        moodData = response.user.moodData || {};
        tasks = response.user.tasks || [];
        
        onLoginSuccess();
    } catch (error) {
        alert(error.message || 'Login failed. Please try again.');
    }
});

document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;

    if (!email || !password) {
        alert('Please enter both email and password.');
        return;
    }

    try {
        await apiCall('/signup', 'POST', { email, password });
        alert('Signup successful! You can now log in.');
        document.getElementById('signupForm').reset();
    } catch (error) {
        alert(error.message || 'Signup failed. Please try again.');
    }
});

// On successful login
function onLoginSuccess() {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('mainNav').classList.remove('d-none');
    document.getElementById('userEmailDisplay').textContent = currentUser.email;

    showView('dashboard');
    renderCalendar();
    renderTasks();
    renderMoodChart();
    renderMoodPieChart();

    // Reset login fields
    document.getElementById('loginForm').reset();
}

// Logout
function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    
    document.getElementById('authView').classList.remove('hidden');
    document.getElementById('mainNav').classList.add('d-none');
    showView('authView');
    
    // Clear forms
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
}

// Mood Calendar functionality
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let moodData = {};

function renderCalendar() {
    const now = new Date(currentYear, currentMonth);
    document.getElementById('monthYear').textContent = now.toLocaleDateString('en', { month: 'long', year: 'numeric' });
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const key = `${currentYear}-${currentMonth}-${i}`;
        const div = document.createElement('div');
        div.className = 'calendar-day';
        if (moodData[key]) div.classList.add(moodData[key]);
        div.textContent = i;
        div.onclick = () => setMood(i);
        calendar.appendChild(div);
    }
}

function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar();
}

function setMood(day) {
    const mood = prompt('Enter mood (happy, sad, neutral):');
    if (mood && ['happy', 'sad', 'neutral'].includes(mood.toLowerCase())) {
        const key = `${currentYear}-${currentMonth}-${day}`;
        moodData[key] = mood.toLowerCase();
        saveUserMoodData(); // Changed to API call
        renderCalendar();
        renderMoodChart();
        renderMoodPieChart();
    }
}

// Task Noter functionality
let tasks = [];

function addTask() {
    const taskInput = document.getElementById('taskInput');
    if (taskInput.value.trim() === '') return;
    tasks.push({ text: taskInput.value.trim(), completed: false, date: new Date().toISOString() });
    taskInput.value = '';
    saveUserTasks(); // Changed to API call
    renderTasks();
}

function renderTasks() {
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <span class="${task.completed ? 'completed' : ''}">${task.text} (${new Date(task.date).toLocaleString()})</span>
            <div>
                <button class="btn btn-sm btn-outline-success me-1" onclick="toggleComplete(${index})">${task.completed ? 'Undo' : 'Complete'}</button>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editTask(${index})">Edit</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteTask(${index})">Delete</button>
            </div>
        `;
        taskList.appendChild(li);
    });
}

function toggleComplete(index) {
    tasks[index].completed = !tasks[index].completed;
    saveUserTasks(); // Changed to API call
    renderTasks();
}

function editTask(index) {
    const newText = prompt('Edit task:', tasks[index].text);
    if (newText) {
        tasks[index].text = newText.trim();
        saveUserTasks(); // Changed to API call
        renderTasks();
    }
}

function deleteTask(index) {
    if (confirm('Are you sure you want to delete this task?')) {
        tasks.splice(index, 1);
        saveUserTasks(); // Changed to API call
        renderTasks();
    }
}

function viewPastTasks() {
    const pastTasks = tasks.filter(task => new Date(task.date) < new Date(new Date().setDate(new Date().getDate() - 1)));
    if (pastTasks.length) {
        alert(pastTasks.map(t => `${t.text} (${new Date(t.date).toLocaleDateString()}) - ${t.completed ? 'Completed' : 'Pending'}`).join('\n'));
    } else {
        alert('No past tasks found.');
    }
}

// Mood Analytics Charts
let moodLineChartInstance = null;
let moodPieChartInstance = null;

function renderMoodChart() {
    const ctx = document.getElementById('moodChart').getContext('2d');
    if (moodLineChartInstance) moodLineChartInstance.destroy();
    const labels = [];
    const scores = [];
    const last30Days = [...Array(30)].map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return date;
    }).reverse();

    last30Days.forEach(date => {
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        labels.push(date.toLocaleDateString());
        if (moodData[key]) {
            scores.push(moodData[key] === 'happy' ? 5 : moodData[key] === 'neutral' ? 3 : 1);
        } else {
            scores.push(0);
        }
    });

    moodLineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Mood Score (1-5)',
                data: scores,
                borderColor: 'rgba(75, 192, 192, 1)',
                fill: false
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderMoodPieChart() {
    const ctx = document.getElementById('moodPieChart').getContext('2d');
    if (moodPieChartInstance) moodPieChartInstance.destroy();
    const moodCounts = { happy: 0, sad: 0, neutral: 0 };
    Object.values(moodData).forEach(mood => {
        if (mood in moodCounts) moodCounts[mood]++;
    });

    moodPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Happy', 'Sad', 'Neutral'],
            datasets: [{
                label: 'Mood Distribution',
                data: [moodCounts.happy, moodCounts.sad, moodCounts.neutral],
                backgroundColor: [
                    'rgba(75, 192, 75, 0.6)',   // Happy - green
                    'rgba(255, 99, 132, 0.6)',  // Sad - red
                    'rgba(255, 206, 86, 0.6)'   // Neutral - yellow
                ],
                borderColor: [
                    'rgba(75, 192, 75, 1)',
                    'rgba(255, 99, 132, 1)',
                    'rgba(255, 206, 86, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: { enabled: true }
            }
        }
    });
}

// Load saved theme and check authentication on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Load theme
    const savedTheme = localStorage.getItem('theme');
    const themeBtn = document.getElementById('themeToggleBtn');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeBtn.textContent = '🌙';
    }

    // Check for saved token
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
        authToken = savedToken;
        try {
            // Verify token
            const response = await apiCall('/verify');
            if (response.valid) {
                // Load user data
                const userData = await apiCall('/user/data');
                currentUser = userData;
                moodData = userData.moodData || {};
                tasks = userData.tasks || [];
                
                // Show dashboard
                document.getElementById('authView').classList.add('hidden');
                document.getElementById('mainNav').classList.remove('d-none');
                document.getElementById('userEmailDisplay').textContent = userData.email;
                showView('dashboard');
                renderCalendar();
                renderTasks();
                renderMoodChart();
                renderMoodPieChart();
            }
        } catch (error) {
            // Token invalid, clear it
            localStorage.removeItem('authToken');
            authToken = null;
        }
    }
});  
// SMS REMAINDER FUNCTION 
document.addEventListener('DOMContentLoaded', function() {
    const reminderForm = document.getElementById('reminderForm');
    const phoneInput = document.getElementById('phoneInput');
    const meetingTimeInput = document.getElementById('meetingTimeInput');
    const currentDate = new Date();

    if (reminderForm) {
        reminderForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const phone = phoneInput.value.trim();
            const time = meetingTimeInput.value.trim();

            if (!phone || !time) {
                alert('Please enter a valid phone number and meeting time');
                return;
            }

            const now = new Date();
            const [hours, minutes] = time.split(':').map(Number);
            const meetingDateTime = new Date(currentDate);
            meetingDateTime.setHours(hours, minutes, 0, 0);

            const delay = meetingDateTime.getTime() - now.getTime();
            if (delay < 0) {
                alert('Meeting time is in the past. Reminder not set.');
                return;
            }

            try {
                const response = await fetch('http://localhost:3000/api/schedule-sms', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ phone, message: `Reminder: You have a meeting at ${time}`, delay }),
                });
                const data = await response.json();
                if (data.success) {
                    alert('SMS reminder scheduled!');
                } else {
                    alert('Failed to schedule SMS reminder.');
                }
            } catch (err) {
                console.error(err);
                alert('Error scheduling SMS reminder.');
            }
        });
    }
});