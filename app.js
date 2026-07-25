const SYNC_URL = 'https://script.google.com/macros/s/AKfycbx-6hTQxNX8a-jorCVmg_U60gkEfZAUpzfp1oeYMiO9nFbh4IahKY4G_lqBtlwwnb9tjA/exec';

const SUBJECT_COLORS = { math: '#3498DB', science: '#2ECC71', english: '#F39C12', korean: '#9B59B6' };
const SUBJECT_NAMES = { math: '수학', science: '과학', english: '영어', korean: '국어' };

let state = {
    settings: {
        availDays: [], // 0-6
        availMultiplier: 2.0,
        availPeriods: [], // { start, end }
        blackoutPeriods: [] // { start, end }
    },
    goals: [], // { id, subject, name, totalUnits, unitTime, deadline, priority, completedUnits }
    tasks: [], // Generated tasks for today { id, goalId, subject, name, units, duration, priority, completed }
    lastGeneratedDate: null,
    streak: 0,
    lastCompletedDate: null
};

// DOM Elements
const availCheckboxes = document.querySelectorAll('.avail-day');
const availMultiplierInput = document.getElementById('availMultiplier');
const addAvailPeriodBtn = document.getElementById('addAvailPeriodBtn');
const availPeriodList = document.getElementById('availPeriodList');
const addBlackoutPeriodBtn = document.getElementById('addBlackoutPeriodBtn');
const blackoutPeriodList = document.getElementById('blackoutPeriodList');

const addGoalForm = document.getElementById('addGoalForm');
const goalsTableBody = document.querySelector('#goalsTable tbody');

const taskList = document.getElementById('taskList');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const todayEstimatedTime = document.getElementById('todayEstimatedTime');
const todayTaskCount = document.getElementById('todayTaskCount');

const addUnexpectedBtn = document.getElementById('addUnexpectedBtn');
const streakCount = document.getElementById('streakCount');
const gardenEmoji = document.getElementById('gardenEmoji');
const gardenText = document.getElementById('gardenText');
const toastContainer = document.getElementById('toastContainer');
const confettiContainer = document.getElementById('confetti');

const syncBtn = document.getElementById('syncBtn');

// Initialization
function init() {
    loadData();
    setupEventListeners();
    
    // Auto-fetch from cloud if local state is completely empty
    if (state.goals.length === 0) {
        fetchDataFromCloud();
    }
    
    checkAndGenerateTasks();
    renderAll();
}

function loadData() {
    const savedData = localStorage.getItem('zeroDebtData_v2');
    if (savedData) {
        state = JSON.parse(savedData);
    }
    
    // Sync UI with settings
    availCheckboxes.forEach(cb => {
        cb.checked = state.settings.availDays.includes(parseInt(cb.value));
    });
    availMultiplierInput.value = state.settings.availMultiplier;
}

function saveDataLocalOnly() {
    localStorage.setItem('zeroDebtData_v2', JSON.stringify(state));
}

function saveData() {
    saveDataLocalOnly();
    syncDataToCloud();
}

function setupEventListeners() {
    // Settings
    availCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateSettings);
    });
    availMultiplierInput.addEventListener('change', updateSettings);
    
    addAvailPeriodBtn.addEventListener('click', () => addPeriod('avail'));
    addBlackoutPeriodBtn.addEventListener('click', () => addPeriod('blackout'));

    // Goals
    addGoalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addGoal();
    });

    // Actions
    addUnexpectedBtn.addEventListener('click', postponeRemainingTasks);
    
    // Sync
    syncBtn.addEventListener('click', () => {
        fetchDataFromCloud();
    });
}

// Sync Functions
async function syncDataToCloud() {
    if (!SYNC_URL) return;
    
    try {
        await fetch(SYNC_URL, {
            method: 'POST',
            body: JSON.stringify(state),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
    } catch (e) {
        console.error('Sync failed:', e);
    }
}

async function fetchDataFromCloud() {
    if (!SYNC_URL) return;
    
    showToast('클라우드에서 데이터를 불러오는 중...', 'warning');
    
    try {
        const response = await fetch(SYNC_URL);
        const data = await response.json();
        
        if (data && data.settings) {
            state = data;
            saveDataLocalOnly();
            
            availCheckboxes.forEach(cb => {
                cb.checked = state.settings.availDays.includes(parseInt(cb.value));
            });
            availMultiplierInput.value = state.settings.availMultiplier || 1.0;
            
            checkAndGenerateTasks();
            renderAll();
            showToast('데이터를 성공적으로 불러왔습니다!', 'success');
        } else {
            showToast('클라우드에 저장된 올바른 데이터가 없습니다.', 'danger');
        }
    } catch (e) {
        console.error('Fetch failed:', e);
        showToast('데이터 불러오기에 실패했습니다.', 'danger');
    }
}

function getTodayStr() {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzOffset).toISOString().split('T')[0];
}

function updateSettings() {
    state.settings.availDays = Array.from(availCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));
    state.settings.availMultiplier = parseFloat(availMultiplierInput.value) || 1.0;
    saveData();
    forceRegenerateTasks();
}

function addPeriod(type) {
    const startInput = document.getElementById(`${type}StartDate`);
    const endInput = document.getElementById(`${type}EndDate`);
    const start = startInput.value;
    const end = endInput.value;
    
    if (start && end && start <= end) {
        if (type === 'avail') {
            state.settings.availPeriods.push({ start, end });
        } else {
            state.settings.blackoutPeriods.push({ start, end });
        }
        saveData();
        startInput.value = '';
        endInput.value = '';
        forceRegenerateTasks();
    } else {
        showToast('유효한 날짜 범위를 입력해주세요.', 'warning');
    }
}

function removePeriod(type, index) {
    if (type === 'avail') {
        state.settings.availPeriods.splice(index, 1);
    } else {
        state.settings.blackoutPeriods.splice(index, 1);
    }
    saveData();
    forceRegenerateTasks();
}

function isDateInPeriods(dateStr, periods) {
    return periods.some(p => dateStr >= p.start && dateStr <= p.end);
}

function addGoal() {
    const newGoal = {
        id: 'g_' + Date.now(),
        subject: document.getElementById('goalSubject').value,
        name: document.getElementById('goalName').value,
        totalUnits: parseInt(document.getElementById('goalTotalUnits').value),
        unitTime: parseInt(document.getElementById('goalUnitTime').value),
        deadline: document.getElementById('goalDeadline').value,
        priority: parseInt(document.getElementById('goalPriority').value),
        completedUnits: 0
    };

    if (newGoal.deadline < getTodayStr()) {
        showToast('마감일은 오늘 이후여야 합니다.', 'warning');
        return;
    }

    state.goals.push(newGoal);
    saveData();
    
    addGoalForm.reset();
    showToast('새로운 목표가 등록되었습니다.', 'success');
    forceRegenerateTasks();
}

function removeGoal(id) {
    state.goals = state.goals.filter(g => g.id !== id);
    // Remove associated incomplete tasks for today
    state.tasks = state.tasks.filter(t => t.goalId !== id || t.completed);
    saveData();
    renderAll();
}

// Scheduling Logic
function getWeightOfDay(dateStr) {
    if (isDateInPeriods(dateStr, state.settings.blackoutPeriods)) return 0;
    
    let weight = 1.0;
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay(); 
    
    if (state.settings.availDays.includes(dayOfWeek) || isDateInPeriods(dateStr, state.settings.availPeriods)) {
        weight = state.settings.availMultiplier;
    }
    return weight;
}

function checkAndGenerateTasks() {
    const todayStr = getTodayStr();
    if (state.lastGeneratedDate !== todayStr) {
        distributeGoalsForToday();
    }
}

function forceRegenerateTasks() {
    // Regenerates today's quotas, keeping completed tasks intact
    distributeGoalsForToday(true);
    renderAll();
}

function distributeGoalsForToday(keepCompleted = false) {
    const todayStr = getTodayStr();
    let newTasks = keepCompleted ? state.tasks.filter(t => t.completed) : [];
    
    state.goals.forEach(goal => {
        if (goal.completedUnits >= goal.totalUnits) return;
        
        let totalWeight = 0;
        let todayWeight = getWeightOfDay(todayStr);
        
        if (todayWeight === 0) return; // Blackout day today, no tasks assigned.
        
        let currentDate = new Date(todayStr);
        let deadlineDate = new Date(goal.deadline);
        
        // Priority 1: Artificial earlier deadline to create buffer
        if (goal.priority === 1) {
            let diffDays = (deadlineDate - currentDate) / (1000 * 60 * 60 * 24);
            if (diffDays > 4) {
                 deadlineDate = new Date(currentDate.getTime() + (diffDays * 0.75) * 24 * 60 * 60 * 1000);
            }
        }
        
        for (let d = new Date(currentDate); d <= deadlineDate; d.setUTCDate(d.getUTCDate() + 1)) {
            const dStr = d.toISOString().split('T')[0];
            totalWeight += getWeightOfDay(dStr);
        }
        
        if (totalWeight === 0) totalWeight = todayWeight; // Overdue fallback
        
        // Calculate units assigned to today based on weight proportion
        const remainingUnits = goal.totalUnits - goal.completedUnits;
        let dailyQuota = Math.ceil((remainingUnits / totalWeight) * todayWeight);
        
        if (dailyQuota > remainingUnits) dailyQuota = remainingUnits;
        
        // If keepCompleted, subtract what we already did today for this goal
        if (keepCompleted) {
            const alreadyDoneToday = newTasks.filter(t => t.goalId === goal.id).reduce((sum, t) => sum + t.units, 0);
            dailyQuota -= alreadyDoneToday;
        }
        
        if (dailyQuota > 0) {
            newTasks.push({
                id: 't_' + goal.id + '_' + Date.now() + Math.random(),
                goalId: goal.id,
                subject: goal.subject,
                name: `${goal.name} (${dailyQuota}단위)`,
                units: dailyQuota,
                duration: dailyQuota * goal.unitTime,
                priority: goal.priority,
                completed: false
            });
        }
    });
    
    newTasks.sort((a, b) => a.priority - b.priority);
    state.tasks = newTasks;
    state.lastGeneratedDate = todayStr;
    saveData();
}

function postponeRemainingTasks() {
    const incompleteTasks = state.tasks.filter(t => !t.completed);
    if (incompleteTasks.length === 0) {
        showToast('미룰 임무가 없습니다.', 'warning');
        return;
    }
    
    // Remove uncompleted tasks from today
    state.tasks = state.tasks.filter(t => t.completed);
    saveData();
    renderAll();
    showToast('미완료 분량이 남은 일정에 1/n로 재분배되었습니다.', 'success');
}

function toggleTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const goal = state.goals.find(g => g.id === task.goalId);
    
    if (task.completed) {
        task.completed = false;
        if (goal) goal.completedUnits -= task.units;
    } else {
        task.completed = true;
        if (goal) goal.completedUnits += task.units;
    }
    
    saveData();
    renderAll();
    checkStreak();
}

function checkStreak() {
    if (state.tasks.length > 0) {
        const allDone = state.tasks.every(t => t.completed);
        const todayStr = getTodayStr();
        
        if (allDone && state.lastCompletedDate !== todayStr) {
            state.streak++;
            state.lastCompletedDate = todayStr;
            saveData();
            fireConfetti();
        } else if (!allDone && state.lastCompletedDate === todayStr) {
            state.streak = Math.max(0, state.streak - 1);
            state.lastCompletedDate = null;
            saveData();
        }
        renderGarden();
    }
}

// Rendering
function renderAll() {
    renderSettings();
    renderGoals();
    renderTasks();
    renderSummary();
    renderGarden();
}

function renderSettings() {
    availPeriodList.innerHTML = '';
    state.settings.availPeriods.forEach((p, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.start} ~ ${p.end}</span> <button onclick="removePeriod('avail', ${i})"><i class="fa-solid fa-xmark"></i></button>`;
        availPeriodList.appendChild(li);
    });
    
    blackoutPeriodList.innerHTML = '';
    state.settings.blackoutPeriods.forEach((p, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.start} ~ ${p.end}</span> <button onclick="removePeriod('blackout', ${i})"><i class="fa-solid fa-xmark"></i></button>`;
        blackoutPeriodList.appendChild(li);
    });
}

function renderGoals() {
    goalsTableBody.innerHTML = '';
    
    if (state.goals.length === 0) {
        goalsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">등록된 목표가 없습니다.</td></tr>';
        return;
    }

    state.goals.forEach(goal => {
        const tr = document.createElement('tr');
        const progressPercent = Math.min(100, Math.round((goal.completedUnits / goal.totalUnits) * 100));
        
        tr.innerHTML = `
            <td><span style="color: ${SUBJECT_COLORS[goal.subject]}; font-weight: 600;">${SUBJECT_NAMES[goal.subject]}</span></td>
            <td style="font-weight: 600;">${goal.name}</td>
            <td>
                <div style="font-size: 0.8rem; text-align: right;">${goal.completedUnits} / ${goal.totalUnits} (${progressPercent}%)</div>
                <div class="goal-progress-bar"><div class="goal-progress-fill" style="width: ${progressPercent}%"></div></div>
            </td>
            <td>${goal.deadline}</td>
            <td>${goal.priority}순위</td>
            <td><button class="btn btn-sm btn-danger" onclick="removeGoal('${goal.id}')"><i class="fa-solid fa-trash"></i></button></td>
        `;
        goalsTableBody.appendChild(tr);
    });
}

function renderTasks() {
    taskList.innerHTML = '';
    
    if (state.tasks.length === 0) {
        taskList.innerHTML = '<li style="text-align:center; color:#888; padding:20px;">오늘 할당된 임무가 없습니다. 푹 쉬세요!</li>';
        return;
    }

    state.tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item subject-${task.subject} ${task.completed ? 'completed' : ''}`;
        
        li.innerHTML = `
            <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask('${task.id}')">
            <div class="task-details">
                <div class="task-desc">${task.name}</div>
                <div class="task-meta">
                    <span style="color: ${SUBJECT_COLORS[task.subject]}"><i class="fa-solid fa-tag"></i> ${SUBJECT_NAMES[task.subject]}</span>
                    <span><i class="fa-regular fa-clock"></i> 예상 ${task.duration}분</span>
                    <span>🔥 ${task.priority}순위</span>
                </div>
            </div>
        `;
        taskList.appendChild(li);
    });
}

function renderSummary() {
    const totalDuration = state.tasks.reduce((sum, t) => sum + t.duration, 0);
    const totalUnits = state.tasks.reduce((sum, t) => sum + t.units, 0);
    const completedUnits = state.tasks.filter(t => t.completed).reduce((sum, t) => sum + t.units, 0);
    
    todayEstimatedTime.innerText = `${totalDuration}분`;
    todayTaskCount.innerText = `${totalUnits} 단위`;
    
    let percentage = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
    progressBar.style.width = `${percentage}%`;
    progressText.innerText = `${percentage}%`;
}

function renderGarden() {
    streakCount.innerText = state.streak;
    
    const totalUnits = state.tasks.reduce((sum, t) => sum + t.units, 0);
    const completedUnits = state.tasks.filter(t => t.completed).reduce((sum, t) => sum + t.units, 0);
    
    let percentage = totalUnits > 0 ? (completedUnits / totalUnits) * 100 : 0;
    
    if (totalUnits === 0) {
        gardenEmoji.innerText = '💤';
        gardenText.innerText = '오늘은 휴식일입니다!';
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

// Expose to window for inline HTML handlers
window.removePeriod = removePeriod;
window.removeGoal = removeGoal;
window.toggleTask = toggleTask;

init();
