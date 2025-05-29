# 🧠 Mind Scheduler

Mind Scheduler is a comprehensive web application designed to enhance mental wellness and productivity. It allows users to track moods, manage daily tasks, analyze emotional trends, and schedule SMS reminders—all within a clean and responsive interface. The application also includes both light and dark modes to enhance user experience and accessibility.

## 🌟 Key Features

- 📅 **Mood Calendar:** Track daily moods via an interactive calendar. Easily switch between months and identify long-term emotional trends.
- ✅ **Task Noter:** Add, edit, and delete tasks using a minimalist to-do list interface to efficiently organize your day.
- 📊 **Mood Analytics:** View mood trends and distributions with interactive charts. Includes line and pie charts powered by Chart.js.
- 📲 **SMS Reminders:** Schedule meeting reminders using a built-in form. Automatically send SMS alerts via backend integration.
- 🌗 **Dark Mode:** Toggle between light and dark themes to match your environment or preferences.
- 🔐 **Login/Signup System:** Personalized task lists for each user stored locally.

## 🛠️ Technologies Used

- **Frontend:** HTML, CSS (Bootstrap), JavaScript  
- **Backend:** JavaScript (Node.js), Fetch API (for communicating with SMS services)
- **Libraries:**
  - `Chart.js` for mood analytics and visualizations
  - Twilio : for sending SMS reminders

## 💻 Start the Application  
- Open `index.html` in your preferred browser to launch the app interface.

## 📲 Enable SMS Reminders  
- Set up a basic Node.js server with Twilio API credentials.  
- Update `smsSender.js` with your Twilio Account SID, Auth Token, and a valid sender phone number.

## 🎯 Future Enhancements  
- ✅ Google/Email login support  
- 📱 PWA (Progressive Web App) version  
- ☁️ Cloud sync for tasks/moods across devices  
- 🔐 End-to-end encryption for mood and task data

## 📜 License  
- This project is open-source under the MIT License.





