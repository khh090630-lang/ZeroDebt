const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwTQrXCfpyb-LmO5f5mpn8Nwoq0HINKxg-B23eILdwyqHf_ACLtJWucTFm-El4eOdptCQ/exec';

const SUBJECT_COLORS = { '수학': '#3498DB', '과학': '#2ECC71', '영어': '#F39C12', '국어': '#9B59B6' };
const LEGACY_SUBJECT_NAMES = { math: '수학', science: '과학', english: '영어', korean: '국어' };

function getSubjectColor(subjectName) {
    if (SUBJECT_COLORS[subjectName]) return SUBJECT_COLORS[subjectName];
    let hash = 0;
    for (let i = 0; i < subjectName.length; i++) {
        hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777215)).toString(16);
    return '#' + '000000'.substring(0, 6 - color.length) + color;
}

let state = {
    settings: {
        availDays: [], // 0-6
        availMultiplier: 2.0,
        availPeriods: [], // { start, end }
        blackoutPeriods: [], // { start, end }
        notificationTimes: [] // ["09:00", "20:00"]
    },
    goals: [], // { id, subject, name, totalUnits, unitTime, startDate, deadline, completedUnits }
    tasks: [], // Generated tasks for today { id, goalId, subject, name, units, duration, completed }
    history: {},
    lastGeneratedDate: null,
    streak: 0,
    lastCompletedDate: null,
    exp: 0,
    perfectDays: 0,
    tier: '브론즈 (Bronze)'
};

const TIERS = [
    { name: '아이언 (Iron)', icon: '⚪', minExp: -Infinity, minDays: 0, minLevel: 1, minStreak: 0, color: '#475569' },
    { name: '브론즈 (Bronze)', icon: '🥉', minExp: 0, minDays: 0, minLevel: 1, minStreak: 0, color: '#b45309' },
    { name: '실버 (Silver)', icon: '🥈', minExp: 2500, minDays: 5, minLevel: 3, minStreak: 0, color: '#94a3b8' },
    { name: '골드 (Gold)', icon: '🥇', minExp: 7500, minDays: 15, minLevel: 8, minStreak: 0, color: '#facc15' },
    { name: '플래티넘 (Platinum)', icon: '🏅', minExp: 17500, minDays: 35, minLevel: 18, minStreak: 3, color: '#2dd4bf' },
    { name: '에메랄드 (Emerald)', icon: '❇️', minExp: 32500, minDays: 65, minLevel: 33, minStreak: 5, color: '#10b981' },
    { name: '다이아몬드 (Diamond)', icon: '💎', minExp: 57500, minDays: 115, minLevel: 58, minStreak: 7, color: '#3b82f6' },
    { name: '마스터 (Master)', icon: '🔮', minExp: 92500, minDays: 185, minLevel: 93, minStreak: 10, color: '#8b5cf6' },
    { name: '그랜드마스터 (GM)', icon: '🔥', minExp: 142500, minDays: 285, minLevel: 143, minStreak: 15, color: '#ef4444' },
    { name: '챌린저 (Challenger)', icon: '👑', minExp: 217500, minDays: 435, minLevel: 218, minStreak: 21, color: '#f59e0b' }
];

let advanceDaysTracker = 0;

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

const notificationTimeInput = document.getElementById('notificationTimeInput');
const addNotificationTimeBtn = document.getElementById('addNotificationTimeBtn');
const notificationTimeList = document.getElementById('notificationTimeList');
const testEmailBtn = document.getElementById('testEmailBtn');

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
const editGoalSubject = document.getElementById('editGoalSubject');
const editGoalName = document.getElementById('editGoalName');
const editGoalStartDate = document.getElementById('editGoalStartDate');
const editGoalDeadline = document.getElementById('editGoalDeadline');

const editGoalTotalUnits = document.getElementById('editGoalTotalUnits');
// Initialization
function init() {
    loadData();
    setupEventListeners();
    
    // One-time EXP restore due to sync bug
    if (state.exp < 0) {
        state.exp = 400;
        saveDataLocalOnly();
    }
    
    const todayStr = getTodayStr();
    
    // Always auto-sync on load to get the freshest data from cloud
    if (SYNC_URL) {
        document.body.style.opacity = '0.5'; // Loading state
        showToast('클라우드에서 최신 데이터를 불러오는 중...', 'warning');
        fetch(SYNC_URL + '?action=load&t=' + Date.now())
            .then(res => res.json())
            .then(data => {
                if (data && data.settings) {
                    if (state.goals && state.goals.length > 0 && (!data.goals || data.goals.length === 0)) {
                        console.warn("Cloud data is empty. Skipping overwrite to protect local data.");
                    } else {
                        state = data;
                        saveDataLocalOnly();
                    }
                }
            })
            .catch(err => console.error(err))
            .finally(() => {
                document.body.style.opacity = '1';
                checkAndGenerateTasks();
                renderAll();
            });
    } else {
        checkAndGenerateTasks();
        renderAll();
    }
}

function loadData() {
    const savedData = localStorage.getItem('zeroDebtData_v2');
    if (savedData) {
        state = JSON.parse(savedData);
        state.exp = state.exp || 0;
        state.perfectDays = state.perfectDays || 0;
        state.tier = state.tier || '브론즈 (Bronze)';
        
        // Clean up legacy properties and add default startDate
        if (state.goals) {
            state.goals.forEach(g => {
                if (LEGACY_SUBJECT_NAMES[g.subject]) g.subject = LEGACY_SUBJECT_NAMES[g.subject];
                if (!g.startDate) g.startDate = (g.deadline < getTodayStr()) ? g.deadline : getTodayStr();
                delete g.priority;
                delete g.allocationMode;
            });
        }
        if (state.tasks) {
            state.tasks.forEach(t => {
                if (LEGACY_SUBJECT_NAMES[t.subject]) t.subject = LEGACY_SUBJECT_NAMES[t.subject];
                if (t.priority !== undefined) {
                    delete t.priority;
                }
            });
        }
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
    
    const advanceTasksBtn = document.getElementById('advanceTasksBtn');
    if (advanceTasksBtn) {
        advanceTasksBtn.addEventListener('click', () => {
            advanceTomorrowTasks();
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
    document.getElementById('dayResetHour').addEventListener('change', updateSettings);
    
    addAvailPeriodBtn.addEventListener('click', () => addPeriod('avail'));
    addBlackoutPeriodBtn.addEventListener('click', () => addPeriod('blackout'));
    
    addNotificationTimeBtn.addEventListener('click', addNotificationTime);
    testEmailBtn.addEventListener('click', sendTestEmail);

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
    syncBtn.addEventListener('click', async () => {
        // Prevent pushing empty state on a new device, which would wipe the cloud data
        if (!state.goals || state.goals.length === 0) {
            await fetchDataFromCloud(true);
        } else {
            // Push local state first, then pull
            await syncDataToCloud();
            fetchDataFromCloud(true);
        }
    });
}

// Sync Functions
async function syncDataToCloud() {
    if (!SYNC_URL) return;
    
    try {
        await fetch(SYNC_URL, {
            method: 'POST',
            mode: 'no-cors',
            keepalive: true,
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
            if (state.goals && state.goals.length > 0 && (!data.goals || data.goals.length === 0)) {
                showToast('클라우드 데이터가 비어있어 로컬 데이터를 보호합니다.', 'warning');
                return;
            }
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
    const resetHour = (state && state.settings && state.settings.dayResetHour) ? parseInt(state.settings.dayResetHour) : 0;
    const offsetMs = resetHour * 60 * 60 * 1000;
    let calculatedStr = new Date(Date.now() - offsetMs - tzOffset).toISOString().split('T')[0];
    
    // Prevent time from moving backwards if a new day has already been generated
    if (state && state.lastGeneratedDate && calculatedStr < state.lastGeneratedDate) {
        return state.lastGeneratedDate;
    }
    return calculatedStr;
}

function updateSettings() {
    state.settings.availDays = Array.from(availCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));
    state.settings.availMultiplier = parseFloat(availMultiplierInput.value) || 1.0;
    state.settings.dayResetHour = parseInt(document.getElementById('dayResetHour').value) || 0;
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

function addNotificationTime() {
    const timeVal = notificationTimeInput.value;
    if (timeVal) {
        if (!state.settings.notificationTimes) state.settings.notificationTimes = [];
        if (!state.settings.notificationTimes.includes(timeVal)) {
            state.settings.notificationTimes.push(timeVal);
            state.settings.notificationTimes.sort();
            saveData();
            renderSettings();
            showToast('알림 시간이 추가되었습니다.', 'success');
        }
        notificationTimeInput.value = '';
    } else {
        showToast('시간을 입력해주세요.', 'warning');
    }
}

function removeNotificationTime(index) {
    state.settings.notificationTimes.splice(index, 1);
    saveData();
    renderSettings();
    showToast('알림 시간이 삭제되었습니다.', 'success');
}

async function sendTestEmail() {
    showToast('테스트 이메일을 발송 중입니다...', 'info');
    try {
        await fetch(SYNC_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: 'test_email', state: state }),
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            }
        });
        // no-cors 요청은 항상 opaque 응답이 오므로 에러가 나지 않았다면 성공으로 간주합니다.
        showToast('테스트 알림이 발송되었습니다!', 'success');
        fireConfetti();
    } catch (e) {
        console.error('Test email error:', e);
        showToast('발송 중 오류가 발생했습니다. (앱스 스크립트 배포 버전을 확인해주세요)', 'error');
    }
}

function isDateInPeriods(dateStr, periods) {
    return periods.some(p => dateStr >= p.start && dateStr <= p.end);
}

function addGoal() {
    let startDateVal = document.getElementById('goalStartDate').value || getTodayStr();
    let deadlineVal = document.getElementById('goalDeadline').value;
    if (!deadlineVal) deadlineVal = getTodayStr();
    
    if (startDateVal > deadlineVal) {
        showToast('시작일은 마감일보다 늦을 수 없습니다.', 'warning');
        return;
    }
    if (deadlineVal < getTodayStr()) {
        showToast('마감일은 오늘 이후여야 합니다.', 'warning');
        return;
    }

    const newGoal = {
        id: 'g_' + Date.now(),
        type: document.getElementById('goalType').value || 'long',
        subject: document.getElementById('goalSubject').value,
        name: document.getElementById('goalName').value,
        totalUnits: parseInt(document.getElementById('goalTotalUnits').value),
        minsPerUnit: parseFloat(document.getElementById('goalMinsPerUnit').value || 10),
        unitString: goalUnitString.value || '단위',
        startDate: startDateVal,
        deadline: deadlineVal,

        completedUnits: 0
    };

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
        if (state.lastGeneratedDate) {
            // Resolve yesterday's EXP and Perfect Days
            const res = calculateTodayExp(state.tasks);
            state.exp += res.expChange;
            
            if (res.isPerfect) {
                state.perfectDays++;
                state.streak++;
                state.lastCompletedDate = state.lastGeneratedDate;
                
                // Amnesty Rule for Iron (Reset negative exp to 0 upon perfect day)
                if (state.exp < 0) {
                    state.exp = 0;
                }
            } else {
                state.streak = 0;
            }
            
            checkTierPromotion(true);
        }
        
        advanceDaysTracker = 0;
        distributeGoalsForToday();
    }
}

function getCurrentTierInfo() {
    let tierName = state.tier || '브론즈 (Bronze)';
    return TIERS.find(t => t.name === tierName) || TIERS[1];
}

function calculateTodayExp(tasksObj) {
    let baseMins = 0;
    let completedMins = 0;
    let advanceBonusExp = 0;
    
    tasksObj.forEach(t => {
        let minsPerUnit = t.minsPerUnit || 10;
        let total = t.units * minsPerUnit;
        
        let completedUnits = t.subtasks ? t.subtasks.filter(Boolean).length : 0;
        let comp = completedUnits * minsPerUnit;
        
        if (t.advanceDays && t.advanceDays > 0) {
            advanceBonusExp += comp * (t.advanceDays + 1); // 2x, 3x, 4x...
        } else {
            baseMins += total;
            completedMins += comp;
        }
    });
    
    let isPerfect = false;
    let expChange = 0;
    
    if (baseMins > 0) {
        if (completedMins === baseMins) {
            expChange = baseMins; // 1.0x
            isPerfect = true;
        } else if (completedMins === 0) {
            expChange = -baseMins; // Penalty to drop to Iron
        } else {
            expChange = Math.floor(completedMins * 0.5); // 0.5x, no penalty
        }
    } else if (tasksObj.length > 0 && baseMins === 0) {
        // Only advanced tasks completed today?
        isPerfect = true; 
    }
    
    expChange += advanceBonusExp;
    return { expChange, isPerfect, advanceBonusExp };
}

function checkTierPromotion(showAnimation = false) {
    let oldTierStr = state.tier || '브론즈 (Bronze)';
    
    // Find the highest tier the user qualifies for fully (including streak)
    let qualifiedTierIndex = 0;
    for (let i = TIERS.length - 1; i >= 0; i--) {
        if (state.exp >= TIERS[i].minExp && 
            state.perfectDays >= TIERS[i].minDays && 
            state.streak >= TIERS[i].minStreak) {
            qualifiedTierIndex = i;
            break;
        }
    }
    
    let currentTierIndex = TIERS.findIndex(t => t.name === oldTierStr);
    if (currentTierIndex === -1) currentTierIndex = 1;
    
    if (qualifiedTierIndex > currentTierIndex) {
        // Promotion!
        state.tier = TIERS[qualifiedTierIndex].name;
    } else if (qualifiedTierIndex < currentTierIndex) {
        // Demotion check: Only drop if exp or days fell below maintenance requirements for current tier
        let newTierIndex = currentTierIndex;
        while (newTierIndex > 1) { // 1 is Bronze
            if (state.exp >= TIERS[newTierIndex].minExp && 
                state.perfectDays >= TIERS[newTierIndex].minDays) {
                break; // Met maintenance reqs
            }
            newTierIndex--;
        }
        state.tier = TIERS[newTierIndex].name;
    }
    
    let current = getCurrentTierInfo();
    
    if (oldTierStr !== current.name) {
        saveData();
        if (showAnimation) {
            const overlay = document.getElementById('promotionOverlay');
            if (overlay) {
                document.getElementById('promoIcon').innerText = current.icon;
                
                // Compare indices to check if it's promotion or demotion
                let oldIndex = TIERS.findIndex(t => t.name === oldTierStr);
                let newIndex = TIERS.findIndex(t => t.name === current.name);
                
                if (newIndex > oldIndex) {
                    document.getElementById('promoTitle').innerText = '승급을 축하합니다!';
                    fireConfetti();
                } else {
                    document.getElementById('promoTitle').innerText = '티어가 강등되었습니다...';
                }
                
                document.getElementById('promoDesc').innerText = `${current.name} 티어 달성!`;
                overlay.style.display = 'flex';
            }
        }
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
    const { schedule } = simulateSchedule(true, oldTasks); 
    
    let todaySimTasks = schedule[todayStr] || [];
    let newTasks = [];
    
    todaySimTasks.forEach(simTask => {
        let existingTask = oldTasks.find(t => t.goalId === simTask.goalId);
        let goal = state.goals.find(g => g.id === simTask.goalId);
        if (!goal) return;
        let uStr = goal.unitString || '단위';
        
        if (existingTask) {
            let completedCount = existingTask.subtasks ? existingTask.subtasks.filter(Boolean).length : 0;
            if (existingTask.completed !== undefined) {
                 completedCount = existingTask.completed;
                 existingTask.subtasks = new Array(existingTask.units).fill(existingTask.completed);
                 delete existingTask.completed;
                 delete existingTask.duration;
            }
            if (!existingTask.subtasks) {
                 existingTask.subtasks = new Array(existingTask.units).fill(false);
            }
            // Use the max of existing checkboxes or history log to recover lost checkboxes
            completedCount = Math.max(completedCount, goal.completedToday || 0);
            
            // Ensure we never shrink the task below what was already completed today
            let finalUnits = Math.max(simTask.units, completedCount);
            
            if (existingTask.units !== finalUnits) {
                let newSubtasks = new Array(finalUnits).fill(false);
                let actualChecked = existingTask.subtasks.filter(Boolean).length;
                
                for (let i = 0; i < Math.min(existingTask.subtasks.length, finalUnits); i++) {
                    newSubtasks[i] = existingTask.subtasks[i];
                }
                
                // If history says we did more, fill them in
                let checksToAdd = completedCount - actualChecked;
                for (let i = 0; i < finalUnits && checksToAdd > 0; i++) {
                    if (!newSubtasks[i]) {
                        newSubtasks[i] = true;
                        checksToAdd--;
                    }
                }
                
                existingTask.subtasks = newSubtasks;
                existingTask.units = finalUnits;
                existingTask.name = existingTask.name.replace(/\(\d+.*\)/, `(${finalUnits}${uStr})`);
            }
            existingTask.unitString = uStr;
            existingTask.minsPerUnit = goal.minsPerUnit || (goal.totalMins ? (goal.totalMins / goal.totalUnits) : 10);
            newTasks.push(existingTask);
        } else {
            let completedToday = goal.completedToday || 0;
            let finalUnits = Math.max(simTask.units, completedToday);
            let subtasks = new Array(finalUnits).fill(false);
            for(let i=0; i < completedToday; i++) subtasks[i] = true;
            
            newTasks.push({
                id: 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                goalId: goal.id,
                subject: goal.subject,
                name: `${goal.name} (${finalUnits}${uStr})`,
                units: finalUnits,
                unitString: uStr,
                subtasks: subtasks,
                expanded: false,
                minsPerUnit: goal.minsPerUnit || (goal.totalMins ? (goal.totalMins / goal.totalUnits) : 10)
            });
        }
    });
    
    // Recover any tasks that were removed by the new simulation but already had completed items today
    oldTasks.forEach(oldT => {
        let completedCount = oldT.subtasks ? oldT.subtasks.filter(Boolean).length : (oldT.completed || 0);
        if (completedCount > 0 && !newTasks.find(t => t.goalId === oldT.goalId)) {
            let goal = state.goals.find(g => g.id === oldT.goalId);
            if (!goal) return;
            let uStr = goal.unitString || '단위';
            oldT.units = completedCount;
            if (oldT.subtasks) {
                oldT.subtasks = oldT.subtasks.slice(0, completedCount);
                oldT.subtasks.fill(true); // force all kept items to be checked
            } else {
                oldT.subtasks = new Array(completedCount).fill(true);
            }
            oldT.name = oldT.name.replace(/\(\d+.*\)/, `(${completedCount}${uStr})`);
            newTasks.push(oldT);
        }
    });
    
    newTasks.sort((a, b) => {
        let goalA = state.goals.find(g => g.id === a.goalId);
        let goalB = state.goals.find(g => g.id === b.goalId);
        if (!goalA || !goalB) return 0;
        return goalA.deadline.localeCompare(goalB.deadline);
    });
    
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

window.toggleAllSubtasks = function(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const goal = state.goals.find(g => g.id === task.goalId);
    const allChecked = task.subtasks.every(Boolean);
    const targetState = !allChecked;
    const todayStr = getTodayStr();

    if (!state.history) state.history = {};
    if (!state.history[todayStr]) state.history[todayStr] = {};

    task.subtasks.forEach((isChecked, idx) => {
        if (isChecked !== targetState) {
            task.subtasks[idx] = targetState;
            if (goal) {
                goal.completedUnits += targetState ? 1 : -1;
                if (!state.history[todayStr][goal.subject]) state.history[todayStr][goal.subject] = 0;
                state.history[todayStr][goal.subject] += targetState ? 1 : -1;
                if (state.history[todayStr][goal.subject] <= 0) {
                    delete state.history[todayStr][goal.subject];
                }
            }
        }
    });

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
    if (state.settings.dayResetHour !== undefined) {
        document.getElementById('dayResetHour').value = state.settings.dayResetHour;
    }

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
    
    if (notificationTimeList) {
        notificationTimeList.innerHTML = '';
        if (state.settings.notificationTimes) {
            state.settings.notificationTimes.forEach((t, i) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${t}</span> <button onclick="removeNotificationTime(${i})"><i class="fa-solid fa-xmark"></i></button>`;
                notificationTimeList.appendChild(li);
            });
        }
    }
}

function renderGoals() {
    const filterSelect = document.getElementById('goalFilterSubject');
    const selectedFilter = filterSelect ? filterSelect.value : 'all';

    if (filterSelect) {
        const uniqueSubjects = [...new Set(state.goals.map(g => g.subject))];
        filterSelect.innerHTML = '<option value="all">모든 과목 보기</option>';
        uniqueSubjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            if (sub === selectedFilter) opt.selected = true;
            filterSelect.appendChild(opt);
        });
    }

    goalsTableBody.innerHTML = '';
    
    if (state.goals.length === 0) {
        goalsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">등록된 목표가 없습니다.</td></tr>';
        return;
    }

    const filteredGoals = selectedFilter === 'all' ? state.goals : state.goals.filter(g => g.subject === selectedFilter);

    if (filteredGoals.length === 0) {
        goalsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">해당 과목의 목표가 없습니다.</td></tr>';
        return;
    }

    const groupedGoals = {};
    filteredGoals.forEach(goal => {
        if (!groupedGoals[goal.subject]) groupedGoals[goal.subject] = [];
        groupedGoals[goal.subject].push(goal);
    });

    Object.keys(groupedGoals).forEach(subject => {
        const subjectColor = getSubjectColor(subject);
        
        // Render Group Header
        const headerTr = document.createElement('tr');
        headerTr.className = 'subject-goal-header';
        headerTr.style.backgroundColor = '#f1f5f9';
        headerTr.style.cursor = 'pointer';
        headerTr.onclick = function() {
            const icon = this.querySelector('i.fa-chevron-down');
            const isOpen = icon.parentElement.classList.contains('open');
            if (isOpen) {
                icon.parentElement.classList.remove('open');
            } else {
                icon.parentElement.classList.add('open');
            }
            
            let nextTr = this.nextElementSibling;
            while(nextTr && nextTr.classList.contains('subject-goal-content')) {
                nextTr.style.display = isOpen ? 'none' : 'table-row';
                nextTr = nextTr.nextElementSibling;
            }
        };
        headerTr.innerHTML = `
            <td colspan="5" style="padding: 10px 15px; border-left: 4px solid ${subjectColor};">
                <div style="display: flex; justify-content: space-between; align-items: center;" class="open">
                    <div style="font-weight: 700; color: #334155;">
                        <i class="fa-solid fa-tag" style="color: ${subjectColor}"></i> ${subject}
                    </div>
                    <button class="toggle-subject-btn open" style="background:none; border:none; color:#64748b; font-size:1.1rem; pointer-events:none;"><i class="fa-solid fa-chevron-down" style="transition: transform 0.3s;"></i></button>
                </div>
            </td>
        `;
        goalsTableBody.appendChild(headerTr);

        // Render Goals
        groupedGoals[subject].forEach(goal => {
            const tr = document.createElement('tr');
            tr.className = 'subject-goal-content';
            tr.style.display = 'table-row';
            
            let gType = goal.type || 'long';
            let badgeHtml = '';
            if (gType === 'daily') badgeHtml = '<span class="badge" style="background-color: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 5px;">매일</span>';
            if (gType === 'short') badgeHtml = '<span class="badge" style="background-color: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 5px;">단기</span>';

            const progressPercent = Math.min(100, Math.round((goal.completedUnits / goal.totalUnits) * 100));
            
            let progressHtml = '';
            if (gType === 'daily') {
                progressHtml = `<div style="font-size: 0.8rem; text-align: right;">매일 ${goal.totalUnits}${goal.unitString || '개'}</div>
                                <div class="goal-progress-bar" style="background-color: #e2e8f0; display:flex; justify-content:center; align-items:center; font-size: 0.65rem; color: #64748b; font-weight: bold;">진행 중</div>`;
            } else {
                progressHtml = `<div style="font-size: 0.8rem; text-align: right;">${goal.completedUnits} / ${goal.totalUnits}${goal.unitString || '개'} (${progressPercent}%)</div>
                                <div class="goal-progress-bar"><div class="goal-progress-fill" style="width: ${progressPercent}%"></div></div>`;
            }
            
            tr.innerHTML = `
                <td><span style="color: ${subjectColor}; font-weight: 600;">${goal.subject}</span></td>
                <td style="font-weight: 600;">${badgeHtml}${goal.name}</td>
                <td>
                    ${progressHtml}
                </td>
                <td>
                    <div style="font-size: 0.85rem; color: #666; font-weight: 500;">
                        ${goal.startDate || '시작일 미정'} <br>~ ${goal.deadline}
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" style="margin-right: 5px; padding: 4px 8px; font-size: 0.8rem;" onclick="openEditModal('${goal.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline-danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="removeGoal('${goal.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            goalsTableBody.appendChild(tr);
        });
    });
}

function renderTasks() {
    taskList.innerHTML = '';
    
    if (state.tasks.length === 0) {
        taskList.innerHTML = '<li style="text-align:center; color:#888; padding:20px;">오늘 할당된 임무가 없습니다. 푹 쉬세요!</li>';
        return;
    }

    const groupedTasks = {};
    state.tasks.forEach(task => {
        if (!groupedTasks[task.subject]) groupedTasks[task.subject] = [];
        groupedTasks[task.subject].push(task);
    });

    Object.keys(groupedTasks).forEach(subject => {
        const subjectColor = getSubjectColor(subject);
        
        const groupContainer = document.createElement('div');
        groupContainer.className = 'subject-group';
        
        const groupHeader = document.createElement('div');
        groupHeader.className = 'subject-group-header open';
        groupHeader.style.borderLeft = `4px solid ${subjectColor}`;
        groupHeader.innerHTML = `
            <div style="font-weight: 700; color: #334155;">
                <i class="fa-solid fa-tag" style="color: ${subjectColor}"></i> ${subject}
            </div>
            <button class="toggle-subject-btn open" onclick="this.parentElement.nextElementSibling.classList.toggle('open'); this.classList.toggle('open');"><i class="fa-solid fa-chevron-down"></i></button>
        `;
        
        const groupContent = document.createElement('ul');
        groupContent.className = 'subject-group-content open';
        
        groupedTasks[subject].forEach(task => {
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
                    </div>
                    <div class="task-progress-container">
                        <div class="task-progress-bar"><div class="task-progress-fill" style="width: ${progressPercent}%"></div></div>
                        <div class="task-progress-text" style="white-space:nowrap;">${checkedCount}/${task.units}${task.unitString || '단위'}</div>
                        <button class="btn btn-sm btn-outline-primary" style="margin-right:5px; padding:2px 6px; font-size:0.75rem;" onclick="toggleAllSubtasks('${task.id}')" title="전체완수"><i class="fa-solid fa-check-double"></i></button>
                        <button class="toggle-subtasks-btn ${task.expanded ? 'open' : ''}" onclick="toggleExpandTask('${task.id}')"><i class="fa-solid fa-chevron-down"></i></button>
                    </div>
                </div>
                <ul class="subtasks-list ${task.expanded ? 'open' : ''}">
                    ${subtasksHtml}
                </ul>
            `;
            groupContent.appendChild(li);
        });
        
        groupContainer.appendChild(groupHeader);
        groupContainer.appendChild(groupContent);
        taskList.appendChild(groupContainer);
    });
}

function renderSummary() {
    const baseTasks = state.tasks.filter(t => !t.advanceDays || t.advanceDays === 0);
    const advancedTasks = state.tasks.filter(t => t.advanceDays && t.advanceDays > 0);
    
    const baseTotalMins = baseTasks.reduce((sum, t) => sum + (t.units * (t.minsPerUnit || 10)), 0);
    const baseCompletedMins = baseTasks.reduce((sum, t) => {
        let done = t.subtasks ? t.subtasks.filter(Boolean).length : 0;
        return sum + (done * (t.minsPerUnit || 10));
    }, 0);
    
    const advTotalMins = advancedTasks.reduce((sum, t) => sum + (t.units * (t.minsPerUnit || 10)), 0);
    
    if(todayEstimatedTime) {
        todayEstimatedTime.parentElement.style.display = 'block';
        let rTotal = Math.round(baseTotalMins);
        let text = `${Math.floor(rTotal / 60)}시간 ${rTotal % 60}분`;
        if (advTotalMins > 0) {
            let advR = Math.round(advTotalMins);
            text += ` (+당겨온 ${Math.floor(advR / 60)}시간 ${advR % 60}분)`;
        }
        todayEstimatedTime.innerText = text;
    }
    
    let rTotal2 = Math.round(baseTotalMins);
    let text2 = `${Math.floor(rTotal2 / 60)}시간 ${rTotal2 % 60}분`;
    if (advTotalMins > 0) {
        let advR2 = Math.round(advTotalMins);
        text2 += ` (+당겨온 ${Math.floor(advR2 / 60)}시간 ${advR2 % 60}분)`;
    }
    todayTaskCount.innerText = text2;
    
    let percentage = baseTotalMins > 0 ? Math.round((baseCompletedMins / baseTotalMins) * 100) : 0;
    
    // If there are no base tasks but there are advanced tasks, show 100% since base is clear
    if (baseTotalMins === 0 && advTotalMins > 0) {
        percentage = 100;
    }
    
    progressBar.style.width = `${percentage}%`;
    progressText.innerText = `${percentage}%`;
}

function renderGarden() {
    streakCount.innerText = state.streak;
    
    const tierIconContainer = document.getElementById('tierIconContainer');
    const tierName = document.getElementById('tierName');
    const expProgressBar = document.getElementById('expProgressBar');
    const expProgressText = document.getElementById('expProgressText');
    const pdProgressBar = document.getElementById('pdProgressBar');
    const pdProgressText = document.getElementById('pdProgressText');
    const tierNextReq = document.getElementById('tierNextReq');
    
    // Update Level
    state.level = Math.floor(state.exp / 1000) + 1;
    const userLevelBadge = document.getElementById('userLevelBadge');
    if (userLevelBadge) {
        userLevelBadge.innerText = `Lv.${state.level}`;
    }

    let currentTier = getCurrentTierInfo();
    let nextTierIndex = TIERS.findIndex(t => t.name === currentTier.name) + 1;
    let nextTier = TIERS[nextTierIndex];
    
    if (tierIconContainer) tierIconContainer.innerText = currentTier.icon;
    if (tierName) {
        tierName.innerText = currentTier.name;
        tierName.style.color = currentTier.color;
    }
    
    if (nextTier) {
        let minExpPrev = currentTier.minExp === -Infinity ? 0 : currentTier.minExp;
        let expReq = nextTier.minExp - minExpPrev;
        let expProgValue = Math.max(0, state.exp - minExpPrev);
        
        let minDaysPrev = currentTier.minDays;
        let daysReq = nextTier.minDays - minDaysPrev;
        let pdProgValue = Math.max(0, state.perfectDays - minDaysPrev);
        
        let streakDiff = Math.max(0, nextTier.minStreak - state.streak);
        let expDiff = Math.max(0, nextTier.minExp - state.exp);
        let pdDiff = Math.max(0, nextTier.minDays - state.perfectDays);

        if (tierNextReq) {
            if (expDiff === 0 && pdDiff === 0 && streakDiff === 0) {
                tierNextReq.innerText = '조건 달성! 곧 승급합니다!';
            } else {
                let reqStr = '다음 티어: ';
                if (expDiff > 0) reqStr += `${expDiff} EXP `;
                if (pdDiff > 0) reqStr += `${pdDiff}회 완수 `;
                if (streakDiff > 0 && expDiff === 0 && pdDiff === 0) reqStr += `${streakDiff}일 연속달성 `;
                tierNextReq.innerText = reqStr + '필요';
            }
        }
        
        let expProg = expReq > 0 ? Math.min(100, Math.max(0, (expProgValue / expReq) * 100)) : 100;
        if (expProgressBar) expProgressBar.style.width = `${expProg}%`;
        if (expProgressText) expProgressText.innerText = `${expProgValue} / ${expReq}`;
        
        let daysProg = daysReq > 0 ? Math.min(100, Math.max(0, (pdProgValue / daysReq) * 100)) : 100;
        if (pdProgressBar) pdProgressBar.style.width = `${daysProg}%`;
        if (pdProgressText) pdProgressText.innerText = `${pdProgValue} / ${daysReq}`;
        
    } else {
        if (tierNextReq) tierNextReq.innerText = '최고 티어에 도달했습니다!';
        if (expProgressBar) expProgressBar.style.width = '100%';
        if (expProgressText) expProgressText.innerText = 'MAX';
        if (pdProgressBar) pdProgressBar.style.width = '100%';
        if (pdProgressText) pdProgressText.innerText = 'MAX';
    }
    
    // Update Today's predicted EXP
    const { expChange } = calculateTodayExp(state.tasks);
    const todayExpAmount = document.getElementById('todayExpAmount');
    if (todayExpAmount) {
        todayExpAmount.innerText = `${expChange > 0 ? '+' : ''}${expChange} EXP`;
        if (expChange < 0) {
            todayExpAmount.style.color = '#ef4444'; // red
        } else {
            todayExpAmount.style.color = '#3b82f6'; // blue
        }
    }
    
    // Update Advance button visibility
    const advanceTasksContainer = document.getElementById('advanceTasksContainer');
    let hasIncomplete = state.tasks.some(t => t.subtasks && t.subtasks.includes(false));
    if (advanceTasksContainer) {
        if (state.tasks.length > 0 && !hasIncomplete) {
            advanceTasksContainer.style.display = 'block';
            const btnText = document.getElementById('advanceBtnText');
            if (btnText) {
                btnText.innerText = `${advanceDaysTracker > 0 ? '다'.repeat(advanceDaysTracker) : ''}내일 분량 당겨하기 (EXP ${advanceDaysTracker + 2}배 보너스!)`;
            }
        } else {
            advanceTasksContainer.style.display = 'none';
        }
    }
}

function advanceTomorrowTasks() {
    advanceDaysTracker++;
    const todayStr = getTodayStr();
    
    let d = new Date();
    d.setDate(d.getDate() + advanceDaysTracker);
    const targetStr = d.toISOString().split('T')[0];
    
    const { schedule } = simulateSchedule(true);
    let advanceSimTasks = schedule[targetStr] || [];
    
    if (advanceSimTasks.length === 0) {
        showToast('더 이상 당겨올 분량이 없습니다.', 'warning');
        advanceDaysTracker--;
        return;
    }
    
    let addedCount = 0;
    advanceSimTasks.forEach(simTask => {
        let existingTask = state.tasks.find(t => t.goalId === simTask.goalId && t.advanceDays === advanceDaysTracker);
        let goal = state.goals.find(g => g.id === simTask.goalId);
        if (!goal) return;
        
        let uStr = goal.unitString || '단위';
        
        if (!existingTask) {
            state.tasks.push({
                id: 'task_adv_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                goalId: goal.id,
                subject: goal.subject,
                name: `${goal.name} (당겨하기: ${simTask.units}${uStr})`,
                units: simTask.units,
                units: simTask.units,
                unitString: uStr,
                subtasks: new Array(simTask.units).fill(false),
                expanded: false,
                minsPerUnit: goal.minsPerUnit || (goal.totalMins ? (goal.totalMins / goal.totalUnits) : 10),
                advanceDays: advanceDaysTracker
            });
            addedCount++;
        }
    });
    
    if (addedCount > 0) {
        saveData();
        renderAll();
        showToast(`${advanceDaysTracker > 1 ? advanceDaysTracker+'일 뒤' : '내일'}의 분량을 당겨왔습니다! 완료 시 EXP ${advanceDaysTracker + 1}배 획득!`, 'success');
    } else {
        showToast('추가로 당겨올 수 있는 분량이 없습니다.', 'warning');
        advanceDaysTracker--;
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

function simulateSchedule(ignoreTodayState = false, oldTasks = []) {
    const todayStr = getTodayStr();
    let simDate = new Date(todayStr);
    
    let maxDate = new Date(todayStr);
    state.goals.forEach(g => {
        let d = new Date(g.deadline);
        if (d > maxDate) maxDate = d;
    });
    
    const schedule = {};
    let simGoals = state.goals.map(g => {
        let completedToday = 0;
        let oldTask = oldTasks.find(t => t.goalId === g.id);
        if (oldTask) {
            completedToday = oldTask.subtasks ? oldTask.subtasks.filter(Boolean).length : (oldTask.completed || 0);
        }
        return {
            ...g,
            simCompleted: Math.max(0, g.completedUnits - completedToday),
            completedToday: completedToday
        };
    });
    
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
    
    // PRE-CALCULATE BASELINE SCHEDULES (ORIGINAL WORKLOAD)
    const baselineSchedules = {};
    simGoals.forEach(goal => {
        baselineSchedules[goal.id] = {};
        let goalType = goal.type || 'long';
        if (goalType === 'daily') return; // Daily has fixed baseline

        let goalStartDateStr = goal.startDate || getTodayStr();
        let currentDate = new Date(goalStartDateStr);
        let deadlineDate = new Date(goal.deadline);
        
        if (currentDate > deadlineDate) return;
        
        let totalWeightGoal = 0;
        for (let d = new Date(currentDate); d <= deadlineDate; d.setUTCDate(d.getUTCDate() + 1)) {
            totalWeightGoal += getWeightOfDay(d.toISOString().split('T')[0]);
        }
        
        if (totalWeightGoal === 0) return;
        
        let accWeight = 0;
        let prevAssigned = 0;
        
        for (let d = new Date(currentDate); d <= deadlineDate; d.setUTCDate(d.getUTCDate() + 1)) {
            const dStr = d.toISOString().split('T')[0];
            const w = getWeightOfDay(dStr);
            if (w > 0) {
                accWeight += w;
                let target = Math.round(goal.totalUnits * accWeight / totalWeightGoal);
                let assign = target - prevAssigned;
                if (assign > 0) {
                    baselineSchedules[goal.id][dStr] = assign;
                }
                prevAssigned = target;
            }
        }
    });

    // PRE-CALCULATE INDEPENDENT SCHEDULES (REQUIRED CAPACITY POOL)
    const independentSchedules = {}; 
    
    simGoals.forEach(goal => {
        independentSchedules[goal.id] = {};
        let goalType = goal.type || 'long';
        let remainingUnits = goalType === 'daily' ? goal.totalUnits : goal.totalUnits - goal.simCompleted; 
        if (goalType !== 'daily' && remainingUnits <= 0) return;
        
        let goalStartDateStr = goal.startDate || getTodayStr();
        let simDateStr = simDate.toISOString().split('T')[0];
        let startToUse = simDateStr > goalStartDateStr ? simDateStr : goalStartDateStr;
        let currentDate = new Date(startToUse);
        let deadlineDate = new Date(goal.deadline);
        
        if (currentDate > deadlineDate) {
            if (goalType !== 'daily') independentSchedules[goal.id][currentDate.toISOString().split('T')[0]] = remainingUnits;
            return;
        }

        if (goalType === 'daily') {
            for (let d = new Date(currentDate); d <= deadlineDate; d.setUTCDate(d.getUTCDate() + 1)) {
                independentSchedules[goal.id][d.toISOString().split('T')[0]] = goal.totalUnits;
            }
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
            let required_capacity = 0;
            let baseline_capacity = 0;
            
            simGoals.forEach(goal => {
                let gType = goal.type || 'long';
                
                // Add required capacity
                if (independentSchedules[goal.id] && independentSchedules[goal.id][dStr]) {
                    required_capacity += independentSchedules[goal.id][dStr];
                }
                
                // Add baseline capacity (Original workload memory)
                if (gType === 'daily') {
                    if (dStr >= (goal.startDate || getTodayStr()) && dStr <= goal.deadline) {
                        baseline_capacity += goal.totalUnits;
                    }
                } else {
                    if (baselineSchedules[goal.id] && baselineSchedules[goal.id][dStr]) {
                        baseline_capacity += baselineSchedules[goal.id][dStr];
                    }
                }
            });
            
            // Maintain the workload high even if some goals are finished early
            let total_capacity = Math.max(required_capacity, baseline_capacity);
            
            let activeGoals = simGoals.filter(g => {
                let gType = g.type || 'long';
                return (gType === 'daily' || g.simCompleted < g.totalUnits) && dStr >= (g.startDate || getTodayStr());
            });
            
            if (total_capacity > 0 && activeGoals.length > 0) {
                let assignments = {};
                let remaining_capacity = total_capacity;
                
                // Phase 1: Give goals their exact planned quota
                for (let goal of activeGoals) {
                    if (independentSchedules[goal.id] && independentSchedules[goal.id][dStr]) {
                        let planned = independentSchedules[goal.id][dStr];
                        if (goal.type !== 'daily') {
                            planned = Math.min(planned, goal.totalUnits - goal.simCompleted);
                        }
                        if (planned > remaining_capacity) planned = remaining_capacity; // Safety cap
                        if (planned > 0) {
                            assignments[goal.id] = planned;
                            goal.simCompleted += planned;
                            remaining_capacity -= planned;
                        }
                    }
                }
                
                // Phase 2: Give any remaining capacity to active goals (Earliest Deadline First)
                if (remaining_capacity > 0) {
                     let unfinishedGoals = activeGoals.filter(g => {
                         let gType = g.type || 'long';
                         return gType !== 'daily' && g.totalUnits - g.simCompleted > 0;
                     });
                     unfinishedGoals.sort((a, b) => {
                        return a.deadline.localeCompare(b.deadline);
                     });
                     
                     while (remaining_capacity > 0 && unfinishedGoals.length > 0) {
                        let progressed = false;
                        for (let i = 0; i < unfinishedGoals.length; i++) {
                            if (remaining_capacity <= 0) break;
                            let goal = unfinishedGoals[i];
                            if (goal.type !== 'daily' && goal.simCompleted >= goal.totalUnits) {
                                unfinishedGoals.splice(i, 1);
                                i--;
                                continue;
                            }
                            
                            if (!assignments[goal.id]) assignments[goal.id] = 0;
                            
                            assignments[goal.id]++;
                            goal.simCompleted++;
                            remaining_capacity--;
                            
                            if (goal.totalUnits - goal.simCompleted <= 0) {
                                unfinishedGoals.splice(i, 1);
                                i--;
                            }
                        }
                    }
                }
                
                activeGoals.sort((a, b) => {
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
    
    let oldTasksForCal = (state.lastGeneratedDate === todayStr) ? (state.tasks || []) : [];
    const { schedule } = simulateSchedule(true, oldTasksForCal);
    fullSchedule = schedule;

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
                taskDiv.style.backgroundColor = getSubjectColor(t.subject);
                taskDiv.innerText = `${t.subject} ${t.units}${t.unitString || '단위'}`;
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
    document.getElementById('editGoalType').value = goal.type || 'long';
    onGoalTypeChange('edit');
    editGoalSubject.value = goal.subject;
    editGoalName.value = goal.name;
    editGoalStartDate.value = goal.startDate || getTodayStr();
    editGoalDeadline.value = goal.deadline;

    editGoalTotalUnits.value = goal.totalUnits;
    document.getElementById('editGoalUnitString').value = goal.unitString || '단위';
    document.getElementById('editGoalMinsPerUnit').value = goal.minsPerUnit || (goal.totalMins ? Math.round(goal.totalMins / goal.totalUnits) : 10);
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
    
    let startDateVal = editGoalStartDate.value || getTodayStr();
    let deadlineVal = editGoalDeadline.value;
    if (!deadlineVal) deadlineVal = getTodayStr();
    
    if (startDateVal > deadlineVal) {
        showToast('시작일은 마감일보다 늦을 수 없습니다.', 'warning');
        return;
    }
    
    goal.type = document.getElementById('editGoalType').value || 'long';
    goal.subject = editGoalSubject.value;
    goal.name = editGoalName.value;
    goal.startDate = startDateVal;
    goal.deadline = deadlineVal;

    goal.totalUnits = newTotal;
    goal.unitString = document.getElementById('editGoalUnitString').value || '단위';
    goal.minsPerUnit = parseFloat(document.getElementById('editGoalMinsPerUnit').value || 10);
    
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

// Tier Info Popup Logic
window.toggleTierPopup = function(event) {
    event.stopPropagation();
    const popup = document.getElementById('tierInfoPopup');
    const tbody = document.getElementById('tierInfoTableBody');
    
    if (popup.style.display === 'block') {
        popup.style.display = 'none';
        return;
    }
    
    if (tbody) {
        tbody.innerHTML = '';
        TIERS.forEach((tier, index) => {
            const tr = document.createElement('tr');
            let prevTier = index > 0 ? TIERS[index - 1] : tier;
            let reqExp = index <= 1 ? '-' : '+' + (tier.minExp - prevTier.minExp);
            let reqDays = index <= 1 ? '-' : '+' + (tier.minDays - prevTier.minDays);
            
            tr.innerHTML = `
                <td style="padding: 5px 0; font-weight: 600; color: ${tier.color};">${tier.name}</td>
                <td style="text-align: right;">${reqExp}</td>
                <td style="text-align: right;">${reqDays}</td>
                <td style="text-align: center;">Lv.${tier.minLevel}</td>
                <td style="text-align: right;">${tier.minStreak > 0 ? tier.minStreak + '회' : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    popup.style.display = 'block';
};

// Close popup when clicking outside
document.addEventListener('click', function(event) {
    const popup = document.getElementById('tierInfoPopup');
    if (popup && popup.style.display === 'block' && !event.target.closest('#tierInfoPopup') && !event.target.closest('.fa-circle-info')) {
        popup.style.display = 'none';
    }
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.nav-btn[onclick="switchTab('${tabId}')"]`).classList.add('active');
}
window.switchTab = switchTab;
window.resetAppData = function() {
    if (confirm("정말로 모든 앱 데이터(목표, 경험치, 기록 등)를 0으로 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) {
        localStorage.removeItem('zeroDebtData_v2');
        alert("모든 데이터가 초기화되었습니다. 페이지를 새로고침합니다.");
        location.reload();
    }
}

init();



// Tier Info Modal Logic
const tierInfoModal = document.getElementById('tierInfoModal');
window.openTierInfoModal = function() {
    const tbody = document.getElementById('tierInfoTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        TIERS.forEach(tier => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="color: ${tier.color}; font-weight: bold;">${tier.icon} ${tier.name}</span></td>
                <td style="text-align:right;">${tier.minExp === -Infinity ? '0' : tier.minExp.toLocaleString()}</td>
                <td style="text-align:right;">${tier.minDays}일</td>
            `;
            tbody.appendChild(tr);
        });
    }
    if (tierInfoModal) tierInfoModal.style.display = 'flex';
};
window.closeTierInfoModal = function() {
    if (tierInfoModal) tierInfoModal.style.display = 'none';
};

window.onclick = function(event) {
    if (event.target == editGoalModal) {
        closeEditModal();
    }
    if (event.target == tierInfoModal) {
        closeTierInfoModal();
    }
};
