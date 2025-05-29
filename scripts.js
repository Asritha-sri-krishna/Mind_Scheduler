// Theme Management
// Theme toggle function
function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeToggleBtn');
    
    // Toggle dark-mode class (matching your CSS)
    body.classList.toggle('dark-mode');
    
    // Update button icon
    if (body.classList.contains('dark-mode')) {
        themeBtn.textContent = '🌙';
        localStorage.setItem('theme', 'dark');
    } else {
        themeBtn.textContent = '🌞';
        localStorage.setItem('theme', 'light');
    }
}

// Load saved theme on page load
document.addEventListener('DOMContentLoaded', function() {
    const savedTheme = localStorage.getItem('theme');
    const themeBtn = document.getElementById('themeToggleBtn');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeBtn.textContent = '🌙';
    }
});

// Utility: Simple SHA-256 hashing via SubtleCrypto (async)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Persistent State
let currentUser = null;

// Views Management
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

// Data Management
function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

function loadUsers() {
    return JSON.parse(localStorage.getItem('users')) || {};
}

function saveUserData(email, dataKey, dataValue) {
    const allData = JSON.parse(localStorage.getItem('userData') || '{}');
    allData[email] = allData[email] || {};
    allData[email][dataKey] = dataValue;
    localStorage.setItem('userData', JSON.stringify(allData));
}

function loadUserData(email, dataKey) {
    const allData = JSON.parse(localStorage.getItem('userData') || '{}');
    return allData[email] ? allData[email][dataKey] : null;
}

// Authentication
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    const users = loadUsers();
    if (!users[email]) {
        alert('User does not exist. Please sign up first.');
        return;
    }
    const hashedPwd = await hashPassword(password);

    if (users[email].passwordHash === hashedPwd) {
        currentUser = email;
        onLoginSuccess();
    } else {
        alert('Invalid email or password.');
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
    const users = loadUsers();
    if (users[email]) {
        alert('User already exists. Please log in.');
        return;
    }
    const hashedPwd = await hashPassword(password);
    users[email] = { passwordHash: hashedPwd };
    saveUsers(users);
    alert('Signup successful! You can now log in.');
    document.getElementById('signupForm').reset();
});

// On successful login
function onLoginSuccess() {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('mainNav').classList.remove('d-none');
    document.getElementById('userEmailDisplay').textContent = currentUser;

    // Load saved data
    moodData = loadUserData(currentUser, 'moodData') || {};
    tasks = loadUserData(currentUser, 'tasks') || [];

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
    // Save current data before logout
    if(currentUser) {
        saveUserData(currentUser, 'moodData', moodData);
        saveUserData(currentUser, 'tasks', tasks);
    }

    currentUser = null;
    document.getElementById('authView').classList.remove('hidden');
    document.getElementById('mainNav').classList.add('d-none');
    showView('authView');
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
        saveUserData(currentUser, 'moodData', moodData);
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
    saveUserData(currentUser, 'tasks', tasks);
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
    saveUserData(currentUser, 'tasks', tasks);
    renderTasks();
}

function editTask(index) {
    const newText = prompt('Edit task:', tasks[index].text);
    if (newText) {
        tasks[index].text = newText.trim();
        saveUserData(currentUser, 'tasks', tasks);
        renderTasks();
    }
}

function deleteTask(index) {
    if (confirm('Are you sure you want to delete this task?')) {
        tasks.splice(index, 1);
        saveUserData(currentUser, 'tasks', tasks);
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

// SMS Reminder functionality
document.addEventListener('DOMContentLoaded', function() {
    const reminderForm = document.getElementById('reminderForm');
    const phoneInput = document.getElementById('phoneInput');
    const meetingTimeInput = document.getElementById('meetingTimeInput');
    const currentDate = new Date();

    if (reminderForm) {
        reminderForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const phone = phoneInput.value.trim();
            const time = meetingTimeInput.value.trim();

            if(!phone || !time){
                alert('Please enter valid phone number and meeting time');
                return;
            }

            const now = new Date();
            const [hours, minutes] = time.split(':').map(Number);
            const meetingDateTime = new Date(currentDate);
            meetingDateTime.setHours(hours, minutes, 0, 0);

            const delay = meetingDateTime.getTime() - now.getTime();
            if(delay < 0){
                alert('Meeting time is in the past. Reminder not set.');
                return;
            }

            fetch('http://localhost:3000/schedule-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message: `Reminder: You have a meeting at ${time}`, delay }),
            })
            .then(res => res.json())
            .then(data => {
                if(data.success) alert('SMS reminder scheduled!');
                else alert('Failed to schedule SMS reminder.');
            }).catch(err => {
                console.error(err);
                alert('Error scheduling SMS reminder.');
            });
        });
    }
});