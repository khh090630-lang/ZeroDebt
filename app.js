const SUBJECT_COLORS = {
    math: '#3498DB',
    science: '#2ECC71',
    english: '#F39C12',
    korean: '#9B59B6'
};

const SUBJECT_NAMES = {
    math: '수학',
    science: '과학',
    english: '영어',
    korean: '국어'
};

let state = {
    tasks: [], // { id, subject, name, duration, priority, completed, dayOfWeek, isDebt }
    streak: 0,
    lastCompletedDate: null,
    availableTime: 300
};

// DOM Elements
const addTaskForm = document.getElementById('addTaskForm');
const taskList = document.getElementById('taskList');
const debtList = document.getElementById('debtList');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const availableTimeInput = document.getElementById('availableTime');
const gardenEmoji = document.getElementById('gardenEmoji');
const gardenText = document.getElementById('gardenText');
const streakCount = document.getElementById('streakCount');
const toastContainer = document.getElementById('toastContainer');

const addUnexpectedBtn = document.getElementById('addUnexpectedBtn');
const unexpectedModal = document.getElementById('unexpectedModal');
const cancelUnexpected = document.getElementById('cancelUnexpected');
const confirmUnexpected = document.getElementById('confirmUnexpected');
const unexpectedDurationInput = document.getElementById('unexpectedDuration');

const testDeadlineBtn = document.getElementById('testDeadlineBtn');
const confettiContainer = document.getElementById('confetti');

// Initialization
function init() {
    loadData();
    setupEventListeners();
    renderAll();
}

function loadData() {
    const savedData = localStorage.getItem('zeroDebtData');
    if (savedData) {
        state = JSON.parse(savedData);
    }
    availableTimeInput.value = state.availableTime;
}

function saveData() {
    state.availableTime = parseInt(availableTimeInput.value) || 300;
    localStorage.setItem('zeroDebtData', JSON.stringify(state));
}

function setupEventListeners() {
    addTaskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addTask();
    });

    availableTimeInput.addEventListener('change', () => {
        saveData();
    });

    addUnexpectedBtn.addEventListener('click', () => {
        unexpectedModal.classList.add('active');
        unexpectedDurationInput.value = '';
        unexpectedDurationInput.focus();
    });

    cancelUnexpected.addEventListener('click', () => {
        unexpectedModal.classList.remove('active');
    });

    confirmUnexpected.addEventListener('click', () => {
        const duration = parseInt(unexpectedDurationInput.value);
        if (duration > 0) {
            unexpectedModal.classList.remove('active');
            handleUnexpectedEvent(duration);
        }
    });

    testDeadlineBtn.addEventListener('click', simulateDeadline);
}

function getCurrentDayOfWeek() {
    let day = new Date().getDay(); // 0(Sun) - 6(Sat)
    return day === 0 ? 6 : day - 1; // Map to 0(Mon) - 6(Sun)
}

function addTask() {
    const subject = document.getElementById('taskSubject').value;
    const name = document.getElementById('taskName').value;
    const duration = parseInt(document.getElementById('taskDuration').value);
    const priority = parseInt(document.getElementById('taskPriority').value);

    const newTask = {
        id: Date.now().toString(),
        subject,
        name,
        duration,
        priority,
        completed: false,
        dayOfWeek: getCurrentDayOfWeek(),
        isDebt: false
    };

    state.tasks.push(newTask);
    saveData();
    
    // Reset form
    document.getElementById('taskName').value = '';
    document.getElementById('taskDuration').value = '';
    
    renderAll();
}

function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveData();
        renderAll();
        checkStreak();
    }
}

function checkStreak() {
    const todayTasks = state.tasks.filter(t => t.dayOfWeek === getCurrentDayOfWeek() && !t.isDebt);
    if (todayTasks.length > 0) {
        const allDone = todayTasks.every(t => t.completed);
        const todayStr = new Date().toDateString();
        
        if (allDone && state.lastCompletedDate !== todayStr) {
            state.streak++;
            state.lastCompletedDate = todayStr;
            saveData();
            fireConfetti();
        } else if (!allDone && state.lastCompletedDate === todayStr) {
            // Reverted
            state.streak = Math.max(0, state.streak - 1);
            state.lastCompletedDate = null;
            saveData();
        }
        
        // Update garden UI immediately based on new streak state
        renderGarden();
    }
}

function handleUnexpectedEvent(unexpectedTime) {
    const available = parseInt(availableTimeInput.value) || 300;
    
    // Get pending tasks for today
    let pendingTasks = state.tasks.filter(t => !t.completed && t.dayOfWeek === getCurrentDayOfWeek());
    
    const totalPendingTime = pendingTasks.reduce((sum, t) => sum + t.duration, 0);
    
    if (totalPendingTime + unexpectedTime > available) {
        // Need to postpone Priority 3 tasks
        const p3Tasks = pendingTasks.filter(t => t.priority === 3 && !t.isDebt);
        
        let postponedTime = 0;
        let postponedCount = 0;
        
        p3Tasks.forEach(t => {
            t.isDebt = true; // Mark as debt
            postponedTime += t.duration;
            postponedCount++;
        });
        
        if (postponedCount > 0) {
            showToast(`⚠️ 가용 시간 초과: 우선순위 3번 임무가 내일로 연기되었습니다. (내일 학습량 +${postponedTime}분 증가)`, 'danger');
            saveData();
            renderAll();
        } else {
            showToast('⚠️ 가용 시간은 초과되었지만 미룰 수 있는 3순위 임무가 없습니다.', 'warning');
        }
    } else {
        showToast('돌발 변수가 추가되었으나 가용 시간 내에 처리 가능합니다.', 'success');
    }
}

function simulateDeadline() {
    const pendingTasks = state.tasks.filter(t => !t.completed && t.dayOfWeek === getCurrentDayOfWeek() && !t.isDebt);
    if (pendingTasks.length > 0) {
        showToast(`⏰ 마감 1시간 전! 미완료 임무 ${pendingTasks.length}개. 지금 미루면 내일의 부채로 이월됩니다.`, 'danger');
    } else {
        showToast('🎉 모든 임무를 완료했습니다! 편안한 밤 되세요.', 'success');
    }
}

// Rendering
function renderAll() {
    renderTasks();
    renderDebt();
    updateProgress();
    renderCalendar();
    renderGarden();
}

function renderTasks() {
    taskList.innerHTML = '';
    const todayTasks = state.tasks.filter(t => t.dayOfWeek === getCurrentDayOfWeek() && !t.isDebt);
    
    if (todayTasks.length === 0) {
        taskList.innerHTML = '<li style="text-align:center; color:#888; padding:20px;">오늘 등록된 임무가 없습니다.</li>';
        return;
    }

    // Sort by priority (1 is highest)
    todayTasks.sort((a, b) => a.priority - b.priority);

    todayTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item subject-${task.subject} ${task.completed ? 'completed' : ''}`;
        
        li.innerHTML = `
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask('${task.id}')">
            <div class="task-details">
                <div class="task-desc">${task.name}</div>
                <div class="task-meta">
                    <span style="color: ${SUBJECT_COLORS[task.subject]}"><i class="fa-solid fa-tag"></i> ${SUBJECT_NAMES[task.subject]}</span>
                    <span><i class="fa-regular fa-clock"></i> ${task.duration}분</span>
                    <span>🔥 ${task.priority}순위</span>
                </div>
            </div>
        `;
        taskList.appendChild(li);
    });
}

function renderDebt() {
    debtList.innerHTML = '';
    // Debts are tasks marked as isDebt
    const debtTasks = state.tasks.filter(t => t.isDebt && !t.completed);
    
    if (debtTasks.length === 0) {
        debtList.innerHTML = '<li style="text-align:center; color:#888; padding:20px;">내일로 미뤄진 부채가 없습니다! 🎉</li>';
        return;
    }

    debtTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item subject-${task.subject}`;
        
        li.innerHTML = `
            <input type="checkbox" onchange="toggleTask('${task.id}')">
            <div class="task-details">
                <div class="task-desc">${task.name}</div>
                <div class="task-meta">
                    <span style="color: ${SUBJECT_COLORS[task.subject]}"><i class="fa-solid fa-tag"></i> ${SUBJECT_NAMES[task.subject]}</span>
                    <span><i class="fa-regular fa-clock"></i> ${task.duration}분</span>
                    <span style="color: #E74C3C"><i class="fa-solid fa-triangle-exclamation"></i> 부채</span>
                </div>
            </div>
        `;
        debtList.appendChild(li);
    });
}

function updateProgress() {
    const todayTasks = state.tasks.filter(t => t.dayOfWeek === getCurrentDayOfWeek() && !t.isDebt);
    const total = todayTasks.length;
    const completed = todayTasks.filter(t => t.completed).length;
    
    let percentage = 0;
    if (total > 0) {
        percentage = Math.round((completed / total) * 100);
    }
    
    progressBar.style.width = `${percentage}%`;
    progressText.innerText = `${percentage}%`;
}

function renderCalendar() {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    
    days.forEach((day, index) => {
        const dayBlock = document.getElementById(`cal-${day}`);
        // Get tasks for this day (index)
        const dayTasks = state.tasks.filter(t => t.dayOfWeek === index);
        
        if (dayTasks.length === 0) {
            dayBlock.style.background = 'rgba(0,0,0,0.05)';
            return;
        }

        let totalDuration = dayTasks.reduce((sum, t) => sum + t.duration, 0);
        
        // Group by subject
        let subjectDurations = { math:0, science:0, english:0, korean:0 };
        dayTasks.forEach(t => {
            subjectDurations[t.subject] += t.duration;
        });

        // Generate linear gradient string
        let gradientStops = [];
        let currentPercent = 0;
        
        for (const [subject, duration] of Object.entries(subjectDurations)) {
            if (duration > 0) {
                const percent = (duration / totalDuration) * 100;
                const color = SUBJECT_COLORS[subject];
                gradientStops.push(`${color} ${currentPercent}%`);
                currentPercent += percent;
                gradientStops.push(`${color} ${currentPercent}%`);
            }
        }

        if (gradientStops.length > 0) {
            dayBlock.style.background = `linear-gradient(to bottom, ${gradientStops.join(', ')})`;
        } else {
            dayBlock.style.background = 'rgba(0,0,0,0.05)';
        }
    });
}

function renderGarden() {
    streakCount.innerText = state.streak;
    
    const todayTasks = state.tasks.filter(t => t.dayOfWeek === getCurrentDayOfWeek() && !t.isDebt);
    const total = todayTasks.length;
    const completed = todayTasks.filter(t => t.completed).length;
    
    let percentage = total > 0 ? (completed / total) * 100 : 0;
    
    if (total === 0) {
        gardenEmoji.innerText = '💤';
        gardenText.innerText = '오늘은 푹 쉬세요!';
        gardenEmoji.style.transform = 'scale(1)';
    } else if (percentage === 0) {
        gardenEmoji.innerText = '🌱';
        gardenText.innerText = '씨앗이 심어졌어요. 시작해볼까요?';
        gardenEmoji.style.transform = 'scale(1)';
    } else if (percentage < 100) {
        gardenEmoji.innerText = '🌿';
        gardenText.innerText = '새싹이 자라나고 있어요!';
        gardenEmoji.style.transform = 'scale(1.2)';
    } else {
        gardenEmoji.innerText = '🌳';
        gardenText.innerText = '울창한 나무로 자랐어요! 완벽합니다!';
        gardenEmoji.style.transform = 'scale(1.5)';
    }
}

function showToast(message, type = 'danger') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'danger') icon = 'fa-triangle-exclamation';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'warning') icon = 'fa-circle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function fireConfetti() {
    const colors = ['#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#E74C3C'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animation = `fall ${Math.random() * 3 + 2}s linear forwards`;
        confettiContainer.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 5000);
    }
}

// Make toggleTask global since it's used in HTML inline handler
window.toggleTask = toggleTask;

// Run init
init();
