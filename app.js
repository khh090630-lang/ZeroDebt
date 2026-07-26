const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwTQrXCfpyb-LmO5f5mpn8Nwoq0HINKxg-B23eILdwyqHf_ACLtJWucTFm-El4eOdptCQ/exec';

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
    history: {},
    lastGeneratedDate: null,
    streak: 0,
    lastCompletedDate: null
};

let fullSchedule = {};
let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth();

// DOM Elements
const availCheckboxes = document.querySelectorAll('.avail-day');
const availMultiplierInput = document.getElementById('availMultiplier');
const addAvailPeriodBtn = document.getElementById('addAvailPeriodBtn');
const availPeriodList = document.getElementById('availPeriodList');
const addBlackoutPeriodBtn = document.getElementById('addBlackoutPeriodBtn');
const blackoutPeriodList = document.getElementById('blackoutPeriodList');

const addGoalForm = document.getElementById('addGoalForm');
const goalUnitString = document.getElementById('goalUnitString');
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

const editGoalModal = document.getElementById('editGoalModal');
const editGoalForm = document.getElementById('editGoalForm');
const editGoalId = document.getElementById('editGoalId');
const editGoalName = document.getElementById('editGoalName');
const editGoalDeadline = document.getElementById('editGoalDeadline');
const editGoalPriority = document.getElementById('editGoalPriority');
const editGoalTotalUnits = document.getElementById('editGoalTotalUnits');
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
    if (typeof fullSchedule !== 'undefined' && Object.keys(fullSchedule).length > 0) {
        state.fullSchedule = fullSchedule;
    }
    saveDataLocalOnly();
    syncDataToCloud();
}

function setupEventListeners() {
    const prevBtn = document.getElementById('prevMonthBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentCalMonth--;
            if (currentCalMonth < 0) {
                currentCalMonth = 11;
                currentCalYear--;
            }
            renderCalendar();
        });
    }
    
    const nextBtn = document.getElementById('nextMonthBtn');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentCalMonth++;
            if (currentCalMonth > 11) {
                currentCalMonth = 0;
                currentCalYear++;
            }
            renderCalendar();
        });
    }

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

    if (editGoalForm) {
        editGoalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEditGoal();
        });
    }

    // Actions
    addUnexpectedBtn.addEventListener('click', postponeRemainingTasks);
    
    const undoBtn = document.getElementById('undoPostponeBtn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (lastPrePostponeState) {
                state = lastPrePostponeState;
                lastPrePostponeState = null;
                undoBtn.style.display = 'none';
                saveData();
                renderAll();
                showToast('미루기가 취소되어 이전 상태로 복구되었습니다.', 'success');
            }
        });
    }
    // Sync
    syncBtn.addEventListener('click', () => {
        fetchDataFromCloud();
    });
}

// Sync Functions
async function syncDataToCloud() {
    if (!SYNC_URL) return;
    
    try {
        fetch(SYNC_URL, {
            method: 'POST',
            mode: 'no-cors',
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
        unitString: goalUnitString.value || '단위',
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
    distributeGoalsForToday(true);
    renderAll();
}

function distributeGoalsForToday(isForce = false) {
    const todayStr = getTodayStr();
    
    // Always start with current tasks for today if they exist
    let oldTasks = (state.lastGeneratedDate === todayStr || isForce) ? [...state.tasks] : [];
    
    // Run simulation to get globally optimal quotas for today
    const { schedule } = simulateSchedule(true); 
    
    let todaySimTasks = schedule[todayStr] || [];
    let newTasks = [];
    
    todaySimTasks.forEach(simTask => {
        let existingTask = oldTasks.find(t => t.goalId === simTask.goalId);
        let goal = state.goals.find(g => g.id === simTask.goalId);
        if (!goal) return;
        let uStr = goal.unitString || '단위';
        
        if (existingTask) {
            if (existingTask.completed !== undefined) {
                 existingTask.subtasks = new Array(existingTask.units).fill(existingTask.completed);
                 delete existingTask.completed;
                 delete existingTask.duration;
            }
            if (!existingTask.subtasks) {
                 existingTask.subtasks = new Array(existingTask.units).fill(false);
            }
            
            if (existingTask.units !== simTask.units) {
                let newSubtasks = new Array(simTask.units).fill(false);
                for (let i = 0; i < Math.min(existingTask.subtasks.length, simTask.units); i++) {
                    newSubtasks[i] = existingTask.subtasks[i];
                }
                existingTask.subtasks = newSubtasks;
                existingTask.units = simTask.units;
                existingTask.name = existingTask.name.replace(/\(\d+.*\)/, `(${simTask.units}${uStr})`);
            }
            existingTask.unitString = uStr;
            newTasks.push(existingTask);
        } else {
            newTasks.push({
                id: 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                goalId: goal.id,
                subject: goal.subject,
                name: `${goal.name} (${simTask.units}${uStr})`,
                units: simTask.units,
                priority: goal.priority,
                unitString: uStr,
                subtasks: new Array(simTask.units).fill(false),
                expanded: false
            });
        }
    });
    
    newTasks.sort((a, b) => a.priority - b.priority);
    
    state.tasks = newTasks;
    state.lastGeneratedDate = todayStr;
    saveData();
}

function postponeRemainingTasks() {
    const hasIncomplete = state.tasks.some(t => t.subtasks && t.subtasks.includes(false));
    if (!hasIncomplete) {
        showToast('미룰 임무가 없습니다.', 'warning');
        return;
    }
    
    lastPrePostponeState = JSON.parse(JSON.stringify(state));
    const undoBtn = document.getElementById('undoPostponeBtn');
    if (undoBtn) undoBtn.style.display = 'inline-block';
    
    state.tasks = state.tasks.filter(t => {
        if(!t.subtasks) return false;
        const checkedCount = t.subtasks.filter(Boolean).length;
        if (checkedCount === 0) return false;
        
        t.subtasks = new Array(checkedCount).fill(true);
        t.units = checkedCount;
        t.name = t.name.replace(/\(\d+단위\)/, `(${checkedCount}단위)`);
        return true;
    });
    
    saveData();
    renderAll();
    showToast('미완료 분량이 남은 일정에 1/n로 재분배되었습니다.', 'success');
}

window.toggleExpandTask = function(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        task.expanded = !task.expanded;
        saveDataLocalOnly();
        renderTasks(); 
    }
};

window.toggleSubtask = function(taskId, idx) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const goal = state.goals.find(g => g.id === task.goalId);
    task.subtasks[idx] = !task.subtasks[idx];
    
    const todayStr = getTodayStr();
    if (!state.history) state.history = {};
    if (!state.history[todayStr]) state.history[todayStr] = {};
    
    if (goal) {
        goal.completedUnits += task.subtasks[idx] ? 1 : -1;
        if (!state.history[todayStr][goal.subject]) state.history[todayStr][goal.subject] = 0;
        state.history[todayStr][goal.subject] += task.subtasks[idx] ? 1 : -1;
        if (state.history[todayStr][goal.subject] <= 0) {
            delete state.history[todayStr][goal.subject];
        }
    }
    
    saveData();
    renderAll();
    checkStreak();
};

function checkStreak() {
    if (state.tasks.length > 0) {
        const allDone = state.tasks.every(t => t.subtasks && t.subtasks.every(Boolean));
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
    simulateSchedule();
    renderCalendar();
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
                <div style="font-size: 0.8rem; text-align: right;">${goal.completedUnits} / ${goal.totalUnits}${goal.unitString || '단위'} (${progressPercent}%)</div>
                <div class="goal-progress-bar"><div class="goal-progress-fill" style="width: ${progressPercent}%"></div></div>
            </td>
            <td>${goal.deadline}</td>
            <td>${goal.priority}순위</td>
            <td>
                <button class="btn btn-sm btn-primary" style="margin-right: 5px;" onclick="openEditModal('${goal.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-danger" onclick="removeGoal('${goal.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
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
        if (task.completed !== undefined) {
             task.subtasks = new Array(task.units).fill(task.completed);
             delete task.completed;
        }
        if (task.expanded === undefined) task.expanded = false;

        const checkedCount = task.subtasks.filter(Boolean).length;
        const allDone = checkedCount === task.units;
        const progressPercent = Math.round((checkedCount / task.units) * 100) || 0;

        const li = document.createElement('li');
        li.className = `task-item subject-${task.subject} ${allDone ? 'completed' : ''}`;
        
        let subtasksHtml = task.subtasks.map((isChecked, idx) => `
            <li class="subtask-item ${isChecked ? 'completed' : ''}">
                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSubtask('${task.id}', ${idx})">
                ${idx + 1} ${task.unitString || '단위'}
            </li>
        `).join('');

        li.innerHTML = `
            <div class="task-header">
                <div class="task-header-left">
                    <div class="task-desc">${task.name}</div>
                    <div class="task-meta">
                        <span style="color: ${SUBJECT_COLORS[task.subject]}"><i class="fa-solid fa-tag"></i> ${SUBJECT_NAMES[task.subject]}</span>
                        <span>🔥 ${task.priority}순위</span>
                    </div>
                </div>
                <div class="task-progress-container">
                    <div class="task-progress-bar"><div class="task-progress-fill" style="width: ${progressPercent}%"></div></div>
                    <div class="task-progress-text">${checkedCount}/${task.units}${task.unitString || '단위'}</div>
                    <button class="toggle-subtasks-btn ${task.expanded ? 'open' : ''}" onclick="toggleExpandTask('${task.id}')"><i class="fa-solid fa-chevron-down"></i></button>
                </div>
            </div>
            <ul class="subtasks-list ${task.expanded ? 'open' : ''}">
                ${subtasksHtml}
            </ul>
        `;
        taskList.appendChild(li);
    });
}

function renderSummary() {
    const totalUnits = state.tasks.reduce((sum, t) => sum + t.units, 0);
    const completedUnits = state.tasks.reduce((sum, t) => sum + (t.subtasks ? t.subtasks.filter(Boolean).length : 0), 0);
    
    if(todayEstimatedTime) todayEstimatedTime.parentElement.style.display = 'none';
    todayTaskCount.innerText = `${totalUnits} 단위`;
    
    let percentage = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
    progressBar.style.width = `${percentage}%`;
    progressText.innerText = `${percentage}%`;
}

function renderGarden() {
    streakCount.innerText = state.streak;
    
    const totalUnits = state.tasks.reduce((sum, t) => sum + t.units, 0);
    const completedUnits = state.tasks.reduce((sum, t) => sum + (t.subtasks ? t.subtasks.filter(Boolean).length : 0), 0);
    
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

function simulateSchedule(ignoreTodayState = false) {
    const todayStr = getTodayStr();
    let simDate = new Date(todayStr);
    
    let maxDate = new Date(todayStr);
    state.goals.forEach(g => {
        let d = new Date(g.deadline);
        if (d > maxDate) maxDate = d;
    });
    
    const schedule = {};
    let simGoals = state.goals.map(g => ({...g, simCompleted: g.completedUnits}));
    
    if (!ignoreTodayState) {
        schedule[todayStr] = state.tasks.map(t => ({ 
            subject: t.subject, 
            units: t.units,
            unitString: t.unitString || '단위',
            goalId: t.goalId
        }));
        simGoals.forEach(g => {
            const t = state.tasks.find(task => task.goalId === g.id);
            if (t) g.simCompleted += t.units;
        });
        simDate.setUTCDate(simDate.getUTCDate() + 1);
    }
    
    // PRE-CALCULATE INDEPENDENT SCHEDULES (CAPACITY POOL)
    const independentSchedules = {}; 
    
    simGoals.forEach(goal => {
        independentSchedules[goal.id] = {};
        let remainingUnits = goal.totalUnits - goal.simCompleted; 
        if (remainingUnits <= 0) return;
        
        let currentDate = new Date(simDate.toISOString().split('T')[0]);
        let deadlineDate = new Date(goal.deadline);
        
        if (currentDate > deadlineDate) {
            independentSchedules[goal.id][currentDate.toISOString().split('T')[0]] = remainingUnits;
            return;
        }
        
        let totalWeightGoal = 0;
        for (let d = new Date(currentDate); d <= deadlineDate; d.setUTCDate(d.getUTCDate() + 1)) {
            totalWeightGoal += getWeightOfDay(d.toISOString().split('T')[0]);
        }
        
        if (totalWeightGoal === 0) {
            independentSchedules[goal.id][currentDate.toISOString().split('T')[0]] = remainingUnits;
            return;
        }
        
        let accWeight = 0;
        let prevAssigned = 0;
        
        for (let d = new Date(currentDate); d <= deadlineDate; d.setUTCDate(d.getUTCDate() + 1)) {
            const dStr = d.toISOString().split('T')[0];
            const w = getWeightOfDay(dStr);
            if (w > 0) {
                accWeight += w;
                let target = Math.round(remainingUnits * accWeight / totalWeightGoal);
                let assign = target - prevAssigned;
                if (assign > 0) {
                    independentSchedules[goal.id][dStr] = assign;
                }
                prevAssigned = target;
            }
        }
    });

    while (simDate <= maxDate) {
        const dStr = simDate.toISOString().split('T')[0];
        let todayWeight = getWeightOfDay(dStr);
        let dailyTasks = [];
        
        if (todayWeight > 0) {
            let total_capacity = 0;
            simGoals.forEach(goal => {
                if (independentSchedules[goal.id] && independentSchedules[goal.id][dStr]) {
                    total_capacity += independentSchedules[goal.id][dStr];
                }
            });
            
            let activeGoals = simGoals.filter(g => g.simCompleted < g.totalUnits);
            
            if (total_capacity > 0 && activeGoals.length > 0) {
                let groupedByPriority = {};
                for (let goal of activeGoals) {
                    if (!groupedByPriority[goal.priority]) groupedByPriority[goal.priority] = [];
                    groupedByPriority[goal.priority].push(goal);
                }
                
                let sortedPriorities = Object.keys(groupedByPriority).map(Number).sort((a, b) => a - b);
                let remaining_capacity = total_capacity;
                let assignments = {};
                
                for (let p of sortedPriorities) {
                    if (remaining_capacity <= 0) break;
                    
                    let activeInGroup = [...groupedByPriority[p]];
                    activeInGroup.sort((a, b) => {
                        let diff = (b.totalUnits - b.simCompleted) - (a.totalUnits - a.simCompleted);
                        if (diff !== 0) return diff;
                        return a.deadline.localeCompare(b.deadline);
                    });
                    
                    while (remaining_capacity > 0 && activeInGroup.length > 0) {
                        for (let i = 0; i < activeInGroup.length; i++) {
                            if (remaining_capacity <= 0) break;
                            
                            let goal = activeInGroup[i];
                            if (!assignments[goal.id]) assignments[goal.id] = 0;
                            
                            assignments[goal.id]++;
                            goal.simCompleted++;
                            remaining_capacity--;
                            
                            if (goal.totalUnits - goal.simCompleted <= 0) {
                                activeInGroup.splice(i, 1);
                                i--;
                            }
                        }
                    }
                }
                
                activeGoals.sort((a, b) => {
                    if (a.priority !== b.priority) return a.priority - b.priority;
                    return a.deadline.localeCompare(b.deadline);
                });
                
                for (let goal of activeGoals) {
                    if (assignments[goal.id] > 0) {
                        dailyTasks.push({ 
                            subject: goal.subject, 
                            units: assignments[goal.id],
                            unitString: goal.unitString || '단위',
                            goalId: goal.id
                        });
                    }
                }
            }
        }
        schedule[dStr] = dailyTasks;
        simDate.setUTCDate(simDate.getUTCDate() + 1);
    }
    
    if (!ignoreTodayState) {
        fullSchedule = schedule;
    }
    return { schedule, maxDate };
}

function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const monthLabel = document.getElementById('calendarMonthLabel');
    if (!calendarGrid || !monthLabel) return;
    
    calendarGrid.innerHTML = '';
    monthLabel.innerText = `${currentCalYear}년 ${currentCalMonth + 1}월`;
    
    const todayStr = getTodayStr();
    
    const firstDay = new Date(currentCalYear, currentCalMonth, 1);
    const lastDay = new Date(currentCalYear, currentCalMonth + 1, 0);
    
    const startOffset = firstDay.getDay(); // 0 is Sunday
    const totalDays = lastDay.getDate();
    
    for (let i = 0; i < startOffset; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell empty';
        calendarGrid.appendChild(cell);
    }
    
    for (let day = 1; day <= totalDays; day++) {
        const monthStr = String(currentCalMonth + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const dStr = `${currentCalYear}-${monthStr}-${dayStr}`;
        
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        if (dStr < todayStr) cell.classList.add('past');
        if (getWeightOfDay(dStr) === 0) cell.classList.add('blackout');
        if (dStr === todayStr) cell.style.border = '2px solid var(--primary-color)';
        
        const dateSpan = document.createElement('div');
        dateSpan.className = 'calendar-date';
        dateSpan.innerHTML = `<span>${day}일</span>`;
        if (dStr === todayStr) dateSpan.innerHTML += `<span style="color:var(--success-color)">오늘</span>`;
        cell.appendChild(dateSpan);
        
        let tasksForDay = [];
        if (dStr < todayStr) {
            if (state.history && state.history[dStr]) {
                for (let subject in state.history[dStr]) {
                    tasksForDay.push({ subject, units: state.history[dStr][subject] });
                }
            }
        } else {
            if (fullSchedule && fullSchedule[dStr]) {
                tasksForDay = fullSchedule[dStr];
            }
        }
        
        if (tasksForDay.length > 0) {
            tasksForDay.forEach(t => {
                const taskDiv = document.createElement('div');
                taskDiv.className = 'calendar-task';
                taskDiv.style.backgroundColor = SUBJECT_COLORS[t.subject] || '#999';
                taskDiv.innerText = `${SUBJECT_NAMES[t.subject] || t.subject} ${t.units}${t.unitString || '단위'}`;
                cell.appendChild(taskDiv);
            });
        }
        
        calendarGrid.appendChild(cell);
    }
}

function openEditModal(goalId) {
    const goal = state.goals.find(g => g.id === goalId);
    if (!goal) return;
    
    editGoalId.value = goal.id;
    editGoalName.value = goal.name;
    editGoalDeadline.value = goal.deadline;
    editGoalPriority.value = goal.priority;
    editGoalTotalUnits.value = goal.totalUnits;
    document.getElementById('editGoalUnitString').value = goal.unitString || '단위';
    editGoalTotalUnits.min = goal.completedUnits;
    
    editGoalModal.style.display = 'flex';
}

function closeEditModal() {
    editGoalModal.style.display = 'none';
    editGoalForm.reset();
}

function saveEditGoal() {
    const id = editGoalId.value;
    const goal = state.goals.find(g => g.id === id);
    if (!goal) return;
    
    const newTotal = parseInt(editGoalTotalUnits.value);
    if (newTotal < goal.completedUnits) {
        showToast('총 분량은 현재 완료된 분량보다 작을 수 없습니다.', 'warning');
        return;
    }
    
    goal.name = editGoalName.value;
    goal.deadline = editGoalDeadline.value;
    goal.priority = parseInt(editGoalPriority.value);
    goal.totalUnits = newTotal;
    goal.unitString = document.getElementById('editGoalUnitString').value || '단위';
    
    closeEditModal();
    forceRegenerateTasks();
    saveData();
    showToast('목표가 수정되었습니다.', 'success');
}

// Expose to window for inline HTML handlers
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.removePeriod = removePeriod;
window.removeGoal = removeGoal;

init();
