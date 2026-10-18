const SYNC_URL = 'https://script.google.com/macros/s/AKfycbwTQrXCfpyb-LmO5f5mpn8Nwoq0HINKxg-B23eILdwyqHf_ACLtJWucTFm-El4eOdptCQ/exec';

const SUBJECT_COLORS = { '수학': '#3498DB', '과학': '#2ECC71', '영어': '#F39C12', '국어': '#9B59B6' };
const LEGACY_SUBJECT_NAMES = { math: '수학', science: '과학', english: '영어', korean: '국어' };

function getSubjectColor(subjectName) {
    if (!subjectName) return '#3b82f6';
    if (SUBJECT_COLORS[subjectName]) return SUBJECT_COLORS[subjectName];
    let hash = 0;
    for (let i = 0; i < subjectName.length; i++) {
        hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777215)).toString(16);
    return '#' + '000000'.substring(0, 6 - color.length) + color;
}

function getDefaultState() {
    return {
        settings: {
            availDays: [], // 0-6
            availMultiplier: 2.0,
            availPeriods: [], // { start, end }
            blackoutPeriods: [], // { start, end }
            notificationTimes: [], // ["09:00", "20:00"]
            dayResetHour: 0
        },
        goals: [], // { id, type, subject, name, totalUnits, minsPerUnit, unitString, startDate, deadline, completedUnits }
        tasks: [], // Generated tasks for today
        history: {},
        fullSchedule: {},
        lastGeneratedDate: null,
        streak: 0,
        lastCompletedDate: null,
        exp: 0,
        level: 1,
        perfectDays: 0,
        tier: '브론즈 (Bronze)'
    };
}

let state = getDefaultState();

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
let lastPrePostponeState = null;

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

const downloadBtn = document.getElementById('downloadBtn');
const uploadBtn = document.getElementById('uploadBtn');

const editGoalModal = document.getElementById('editGoalModal');
const editGoalForm = document.getElementById('editGoalForm');
const editGoalId = document.getElementById('editGoalId');
const editGoalSubject = document.getElementById('editGoalSubject');
const editGoalName = document.getElementById('editGoalName');
const editGoalStartDate = document.getElementById('editGoalStartDate');
const editGoalDeadline = document.getElementById('editGoalDeadline');
const editGoalTotalUnits = document.getElementById('editGoalTotalUnits');

function normalizeState(raw) {
    const def = getDefaultState();
    if (!raw || typeof raw !== 'object') return def;

    const s = {
        ...def,
        ...raw,
        settings: {
            ...def.settings,
            ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {})
        }
    };

    s.settings.availDays = Array.isArray(s.settings.availDays)
        ? s.settings.availDays.map(d => parseInt(d, 10)).filter(d => !isNaN(d))
        : [];
    s.settings.availMultiplier = parseFloat(s.settings.availMultiplier) || 2.0;
    s.settings.availPeriods = Array.isArray(s.settings.availPeriods) ? s.settings.availPeriods : [];
    s.settings.blackoutPeriods = Array.isArray(s.settings.blackoutPeriods) ? s.settings.blackoutPeriods : [];
    s.settings.notificationTimes = Array.isArray(s.settings.notificationTimes) ? s.settings.notificationTimes : [];
    s.settings.dayResetHour = parseInt(s.settings.dayResetHour, 10) || 0;

    s.exp = typeof s.exp === 'number' && !isNaN(s.exp) ? s.exp : 0;
    s.perfectDays = typeof s.perfectDays === 'number' && !isNaN(s.perfectDays) ? s.perfectDays : 0;
    s.streak = typeof s.streak === 'number' && !isNaN(s.streak) ? s.streak : 0;
    s.tier = s.tier || '브론즈 (Bronze)';
    s.history = (s.history && typeof s.history === 'object') ? s.history : {};
    s.fullSchedule = (s.fullSchedule && typeof s.fullSchedule === 'object') ? s.fullSchedule : {};

    const fallbackToday = new Date(Date.now() - (new Date()).getTimezoneOffset() * 60000).toISOString().split('T')[0];

    s.goals = Array.isArray(s.goals) ? s.goals.filter(g => g && typeof g === 'object').map(g => {
        const subj = LEGACY_SUBJECT_NAMES[g.subject] || g.subject || '기타';
        const deadline = (typeof g.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.deadline)) ? g.deadline : fallbackToday;
        const startDate = (typeof g.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.startDate))
            ? g.startDate
            : (deadline < fallbackToday ? deadline : fallbackToday);
        const totalUnits = Math.max(1, parseInt(g.totalUnits, 10) || 1);
        const completedUnits = Math.max(0, parseInt(g.completedUnits, 10) || 0);
        const minsPerUnit = Math.max(0.1, parseFloat(g.minsPerUnit || (g.totalMins ? g.totalMins / totalUnits : 10)) || 10);
        return {
            id: g.id || ('g_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
            type: g.type || 'long',
            subject: subj,
            name: g.name || '목표',
            totalUnits: totalUnits,
            completedUnits: completedUnits,
            minsPerUnit: minsPerUnit,
            unitString: g.unitString || '단위',
            startDate: startDate,
            deadline: deadline
        };
    }) : [];

    s.tasks = Array.isArray(s.tasks) ? s.tasks.filter(t => t && typeof t === 'object').map(t => {
        const subj = LEGACY_SUBJECT_NAMES[t.subject] || t.subject || '기타';
        const units = Math.max(1, parseInt(t.units, 10) || 1);
        let subtasks = Array.isArray(t.subtasks) ? t.subtasks.map(Boolean) : [];
        if (t.completed !== undefined && subtasks.length === 0) {
            subtasks = new Array(units).fill(Boolean(t.completed));
        }
        if (subtasks.length !== units) {
            const resized = new Array(units).fill(false);
            for (let i = 0; i < Math.min(subtasks.length, units); i++) {
                resized[i] = subtasks[i];
            }
            subtasks = resized;
        }
        const taskObj = {
            id: t.id || ('task_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
            goalId: t.goalId,
            subject: subj,
            name: t.name || `${subj} (${units}${t.unitString || '단위'})`,
            units: units,
            unitString: t.unitString || '단위',
            subtasks: subtasks,
            expanded: Boolean(t.expanded),
            minsPerUnit: Math.max(0.1, parseFloat(t.minsPerUnit) || 10)
        };
        if (t.advanceDays && t.advanceDays > 0) {
            taskObj.advanceDays = parseInt(t.advanceDays, 10);
        }
        return taskObj;
    }) : [];

    return s;
}

function syncSettingsControls() {
    availCheckboxes.forEach(cb => {
        cb.checked = state.settings.availDays.includes(parseInt(cb.value, 10));
    });
    if (availMultiplierInput) {
        availMultiplierInput.value = state.settings.availMultiplier || 2.0;
    }
    const dayResetInput = document.getElementById('dayResetHour');
    if (dayResetInput) {
        dayResetInput.value = state.settings.pendingDayResetHour !== undefined
            ? state.settings.pendingDayResetHour
            : (state.settings.dayResetHour || 0);
    }
}

// Initialization
function init() {
    loadData();
    setupEventListeners();

    // 먼저 로컬 데이터로 즉시 화면을 렌더링하여 터치/클릭이 지체 없이 작동하도록 보장
    checkAndGenerateTasks();
    renderAll();

    // 방금 전체 초기화를 수행한 경우 클라우드 구버전 데이터가 덮어쓰지 않도록 보호하고 클라우드도 다시 초기화
    if (localStorage.getItem('zeroDebtJustReset') === 'true' || sessionStorage.getItem('zeroDebtJustReset') === 'true') {
        sessionStorage.removeItem('zeroDebtJustReset');
        if (SYNC_URL) {
            syncDataToCloud({ action: 'reset', isReset: true });
        }
        return;
    }

    // 백그라운드에서 클라우드 최신 데이터 동기화
    if (SYNC_URL) {
        fetchDataFromCloud(false);
    }
}

function loadData() {
    try {
        const savedData = localStorage.getItem('zeroDebtData_v2');
        if (savedData) {
            state = normalizeState(JSON.parse(savedData));
        } else {
            state = getDefaultState();
        }
    } catch (e) {
        console.error('Failed to parse local data, resetting to default:', e);
        state = getDefaultState();
    }
    syncSettingsControls();
}

function saveDataLocalOnly() {
    try {
        localStorage.setItem('zeroDebtData_v2', JSON.stringify(state));
    } catch (e) {
        console.error('Local save error:', e);
    }
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
    if (availMultiplierInput) {
        availMultiplierInput.addEventListener('change', updateSettings);
    }
    const dayResetHourInput = document.getElementById('dayResetHour');
    if (dayResetHourInput) {
        dayResetHourInput.addEventListener('change', updateSettings);
    }

    if (addAvailPeriodBtn) addAvailPeriodBtn.addEventListener('click', () => addPeriod('avail'));
    if (addBlackoutPeriodBtn) addBlackoutPeriodBtn.addEventListener('click', () => addPeriod('blackout'));

    if (addNotificationTimeBtn) addNotificationTimeBtn.addEventListener('click', addNotificationTime);
    if (testEmailBtn) testEmailBtn.addEventListener('click', sendTestEmail);

    // Goals
    if (addGoalForm) {
        addGoalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addGoal();
        });
    }

    if (editGoalForm) {
        editGoalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEditGoal();
        });
    }

    // Actions
    if (addUnexpectedBtn) {
        addUnexpectedBtn.addEventListener('click', postponeRemainingTasks);
    }

    const undoBtn = document.getElementById('undoPostponeBtn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (lastPrePostponeState) {
                state = normalizeState(lastPrePostponeState);
                lastPrePostponeState = null;
                undoBtn.style.display = 'none';
                saveData();
                renderAll();
                showToast('미루기가 취소되어 이전 상태로 복구되었습니다.', 'success');
            }
        });
    }

    // Sync
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            localStorage.removeItem('zeroDebtJustReset');
            await fetchDataFromCloud(true);
        });
    }

    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            await syncDataToCloud();
            showToast('수동 업로드 완료!', 'success');
        });
    }
}

// Sync Functions
async function syncDataToCloud(extraPayload = {}) {
    if (!SYNC_URL) return;

    const payload = { ...state, ...extraPayload };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
        await fetch(SYNC_URL, {
            method: 'POST',
            mode: 'no-cors',
            keepalive: true,
            signal: controller.signal,
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
    } catch (e) {
        console.error('Sync failed:', e);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchDataFromCloud(showUserToast = true) {
    if (!SYNC_URL) return;

    if (showUserToast) {
        showToast('클라우드에서 데이터를 불러오는 중...', 'warning');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(SYNC_URL + '?action=load&t=' + Date.now(), {
            signal: controller.signal
        });
        const data = await response.json();

        if (data && typeof data === 'object' && Object.keys(data).length > 0 && data.settings) {
            // 방금 로컬에서 초기화한 상태인데 클라우드에 아직 이전 목표가 남아있는 경우 덮어쓰기 방지
            if (localStorage.getItem('zeroDebtJustReset') === 'true' && !data.isReset) {
                await syncDataToCloud({ action: 'reset', isReset: true });
                return;
            }
            if (data.isReset) {
                localStorage.removeItem('zeroDebtJustReset');
            }
            if (!data.isReset && state.goals && state.goals.length > 0 && (!data.goals || data.goals.length === 0)) {
                if (showUserToast) {
                    showToast('클라우드 데이터가 비어있어 로컬 데이터를 보호합니다.', 'warning');
                }
                return;
            }
            state = normalizeState(data);
            saveDataLocalOnly();
            syncSettingsControls();
            checkAndGenerateTasks();
            renderAll();
            if (showUserToast) {
                showToast('데이터를 성공적으로 불러왔습니다!', 'success');
            }
        } else {
            if (showUserToast) {
                showToast('클라우드에 저장된 데이터가 없습니다.', 'warning');
            }
        }
    } catch (e) {
        console.error('Fetch failed:', e);
        if (showUserToast) {
            showToast('데이터 불러오기에 실패했습니다.', 'danger');
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

function getTodayStr() {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const resetHour = (state && state.settings && state.settings.dayResetHour) ? parseInt(state.settings.dayResetHour, 10) : 0;
    const offsetMs = resetHour * 60 * 60 * 1000;
    let calculatedStr = new Date(Date.now() - offsetMs - tzOffset).toISOString().split('T')[0];

    // Prevent time from moving backwards if a new day has already been generated
    if (state && state.lastGeneratedDate && calculatedStr < state.lastGeneratedDate) {
        return state.lastGeneratedDate;
    }
    return calculatedStr;
}

function updateSettings() {
    localStorage.removeItem('zeroDebtJustReset');
    state.settings.availDays = Array.from(availCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value, 10));
    state.settings.availMultiplier = parseFloat(availMultiplierInput.value) || 1.0;

    let oldTodayStr = getTodayStr();
    let oldResetHour = state.settings.dayResetHour || 0;

    let newResetHour = parseInt(document.getElementById('dayResetHour').value, 10) || 0;
    state.settings.dayResetHour = newResetHour;
    let newTodayStr = getTodayStr();

    if (newTodayStr > oldTodayStr) {
        state.settings.dayResetHour = oldResetHour;
        state.settings.pendingDayResetHour = newResetHour;
        showToast('새로운 하루의 끝 시간은 다음 날부터 적용됩니다.', 'info');
    } else {
        delete state.settings.pendingDayResetHour;
    }

    saveData();
    forceRegenerateTasks();
}

function addPeriod(type) {
    localStorage.removeItem('zeroDebtJustReset');
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
    localStorage.removeItem('zeroDebtJustReset');
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
        showToast('테스트 알림이 발송되었습니다!', 'success');
        fireConfetti();
    } catch (e) {
        console.error('Test email error:', e);
        showToast('발송 중 오류가 발생했습니다. (앱스 스크립트 배포 버전을 확인해주세요)', 'error');
    }
}

function isDateInPeriods(dateStr, periods) {
    if (!Array.isArray(periods)) return false;
    return periods.some(p => p && dateStr >= p.start && dateStr <= p.end);
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
        subject: document.getElementById('goalSubject').value.trim(),
        name: document.getElementById('goalName').value.trim(),
        totalUnits: Math.max(1, parseInt(document.getElementById('goalTotalUnits').value, 10) || 1),
        minsPerUnit: Math.max(0.1, parseFloat(document.getElementById('goalMinsPerUnit').value || 10)),
        unitString: (goalUnitString.value || '단위').trim(),
        startDate: startDateVal,
        deadline: deadlineVal,
        completedUnits: 0
    };

    delete state.isReset;
    localStorage.removeItem('zeroDebtJustReset');
    state.goals.push(newGoal);

    addGoalForm.reset();
    onGoalTypeChange('add');
    forceRegenerateTasks();
    showToast('새로운 목표가 등록되었습니다.', 'success');
}

function removeGoal(id) {
    state.goals = state.goals.filter(g => g.id !== id);
    // 삭제된 목표의 미완료 할 일 제거 (이미 오늘 전부 완수한 기록만 유지하거나 제거)
    state.tasks = state.tasks.filter(t => t.goalId !== id);
    forceRegenerateTasks();
    saveData();
    showToast('목표가 삭제되었습니다.', 'success');
}

// Scheduling Logic
function getWeightOfDay(dateStr) {
    if (isDateInPeriods(dateStr, state.settings.blackoutPeriods)) return 0;

    let weight = 1.0;
    const dateObj = new Date(dateStr + 'T00:00:00Z');
    const dayOfWeek = dateObj.getUTCDay();

    if (state.settings.availDays.includes(dayOfWeek) || isDateInPeriods(dateStr, state.settings.availPeriods)) {
        weight = state.settings.availMultiplier;
    }
    return weight;
}

function checkAndGenerateTasks() {
    let todayStr = getTodayStr();

    // Recover advanceDaysTracker from existing tasks on reload
    if (state.lastGeneratedDate === todayStr && advanceDaysTracker === 0 && state.tasks) {
        state.tasks.forEach(t => {
            if (t.advanceDays && t.advanceDays > advanceDaysTracker) {
                advanceDaysTracker = t.advanceDays;
            }
        });
    }

    if (state.lastGeneratedDate !== todayStr) {
        if (state.settings && state.settings.pendingDayResetHour !== undefined) {
            state.settings.dayResetHour = state.settings.pendingDayResetHour;
            delete state.settings.pendingDayResetHour;
            todayStr = getTodayStr();
        }

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
    if (!Array.isArray(tasksObj)) return { expChange: 0, isPerfect: false, advanceBonusExp: 0 };
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
    } else if (tasksObj.length > 0 && baseMins === 0 && advanceBonusExp > 0) {
        isPerfect = true;
    }

    expChange += Math.round(advanceBonusExp);
    expChange = Math.round(expChange);
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
        state.tier = TIERS[qualifiedTierIndex].name;
    } else if (qualifiedTierIndex < currentTierIndex) {
        let newTierIndex = currentTierIndex;
        while (newTierIndex > 0) {
            if (state.exp >= TIERS[newTierIndex].minExp &&
                state.perfectDays >= TIERS[newTierIndex].minDays) {
                break;
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
    checkAndGenerateTasks();
    advanceDaysTracker = 0;
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
        let existingTask = oldTasks.find(t => t.goalId === simTask.goalId && !t.advanceDays);
        if (!existingTask) {
            existingTask = oldTasks.find(t => t.goalId === simTask.goalId);
        }
        let goal = state.goals.find(g => g.id === simTask.goalId);
        if (!goal) return;
        let uStr = goal.unitString || '단위';
        if (existingTask) {
            if (existingTask.advanceDays !== undefined) {
                delete existingTask.advanceDays;
            }
            let completedCount = existingTask.subtasks ? existingTask.subtasks.filter(Boolean).length : 0;
            if (existingTask.completed !== undefined) {
                completedCount = existingTask.completed ? existingTask.units : 0;
                existingTask.subtasks = new Array(existingTask.units).fill(Boolean(existingTask.completed));
                delete existingTask.completed;
                delete existingTask.duration;
            }
            if (!existingTask.subtasks) {
                existingTask.subtasks = new Array(existingTask.units).fill(false);
            }
            completedCount = Math.max(completedCount, goal.completedToday || 0);

            let finalUnits = Math.max(1, Math.max(simTask.units, completedCount));

            if (existingTask.units !== finalUnits) {
                let newSubtasks = new Array(finalUnits).fill(false);
                let actualChecked = existingTask.subtasks.filter(Boolean).length;

                for (let i = 0; i < Math.min(existingTask.subtasks.length, finalUnits); i++) {
                    newSubtasks[i] = existingTask.subtasks[i];
                }

                let checksToAdd = completedCount - actualChecked;
                for (let i = 0; i < finalUnits && checksToAdd > 0; i++) {
                    if (!newSubtasks[i]) {
                        newSubtasks[i] = true;
                        checksToAdd--;
                    }
                }

                existingTask.subtasks = newSubtasks;
                existingTask.units = finalUnits;
            }
            existingTask.subject = goal.subject;
            existingTask.name = `${goal.name} (${finalUnits}${uStr})`;
            existingTask.unitString = uStr;
            existingTask.minsPerUnit = goal.minsPerUnit || (goal.totalMins ? (goal.totalMins / goal.totalUnits) : 10);
            newTasks.push(existingTask);
        } else {
            let completedToday = goal.completedToday || 0;
            let finalUnits = Math.max(1, Math.max(simTask.units, completedToday));
            let subtasks = new Array(finalUnits).fill(false);
            for (let i = 0; i < Math.min(finalUnits, completedToday); i++) subtasks[i] = true;

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
        let completedCount = oldT.subtasks ? oldT.subtasks.filter(Boolean).length : (oldT.completed ? oldT.units : 0);
        if (completedCount > 0 && !newTasks.find(t => t.goalId === oldT.goalId)) {
            let goal = state.goals.find(g => g.id === oldT.goalId);
            if (!goal) return;
            let uStr = goal.unitString || '단위';
            oldT.units = completedCount;
            if (oldT.advanceDays !== undefined) {
                delete oldT.advanceDays;
            }
            oldT.subtasks = new Array(completedCount).fill(true);
            oldT.subject = goal.subject;
            oldT.name = `${goal.name} (${completedCount}${uStr})`;
            oldT.unitString = uStr;
            newTasks.push(oldT);
        }
    });

    newTasks.sort((a, b) => {
        let goalA = state.goals.find(g => g.id === a.goalId);
        let goalB = state.goals.find(g => g.id === b.goalId);
        if (!goalA || !goalB) return 0;
        return (goalA.deadline || '').localeCompare(goalB.deadline || '');
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
        if (!t.subtasks) return false;
        const checkedCount = t.subtasks.filter(Boolean).length;
        if (checkedCount === 0) return false;

        const uStr = t.unitString || '단위';
        t.subtasks = new Array(checkedCount).fill(true);
        t.units = checkedCount;
        t.name = t.name.replace(/\((?:당겨하기:\s*)?\d+[^)]*\)/, `(${t.advanceDays ? '당겨하기: ' : ''}${checkedCount}${uStr})`);
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
        goal.completedUnits = Math.max(0, goal.completedUnits + (task.subtasks[idx] ? 1 : -1));
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
                goal.completedUnits = Math.max(0, goal.completedUnits + (targetState ? 1 : -1));
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
    const dayResetInput = document.getElementById('dayResetHour');
    if (dayResetInput) {
        if (state.settings.pendingDayResetHour !== undefined) {
            dayResetInput.value = state.settings.pendingDayResetHour;
        } else if (state.settings.dayResetHour !== undefined) {
            dayResetInput.value = state.settings.dayResetHour;
        }
    }

    if (availPeriodList) {
        availPeriodList.innerHTML = '';
        state.settings.availPeriods.forEach((p, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.start} ~ ${p.end}</span> <button type="button" onclick="removePeriod('avail', ${i})"><i class="fa-solid fa-xmark"></i></button>`;
            availPeriodList.appendChild(li);
        });
    }

    if (blackoutPeriodList) {
        blackoutPeriodList.innerHTML = '';
        state.settings.blackoutPeriods.forEach((p, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.start} ~ ${p.end}</span> <button type="button" onclick="removePeriod('blackout', ${i})"><i class="fa-solid fa-xmark"></i></button>`;
            blackoutPeriodList.appendChild(li);
        });
    }

    if (notificationTimeList) {
        notificationTimeList.innerHTML = '';
        if (state.settings.notificationTimes) {
            state.settings.notificationTimes.forEach((t, i) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${t}</span> <button type="button" onclick="removeNotificationTime(${i})"><i class="fa-solid fa-xmark"></i></button>`;
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

    if (!goalsTableBody) return;
    goalsTableBody.innerHTML = '';

    if (state.goals.length === 0) {
        goalsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">등록된 목표가 없습니다.</td></tr>';
        return;
    }

    const filteredGoals = (selectedFilter === 'all' || !state.goals.some(g => g.subject === selectedFilter))
        ? state.goals
        : state.goals.filter(g => g.subject === selectedFilter);

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
            while (nextTr && nextTr.classList.contains('subject-goal-content')) {
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
                    <button type="button" class="toggle-subject-btn open" style="background:none; border:none; color:#64748b; font-size:1.1rem; pointer-events:none;"><i class="fa-solid fa-chevron-down" style="transition: transform 0.3s;"></i></button>
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
                    <button type="button" class="btn btn-sm btn-outline-primary" style="margin-right: 5px; padding: 4px 8px; font-size: 0.8rem;" onclick="openEditModal('${goal.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="removeGoal('${goal.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            goalsTableBody.appendChild(tr);
        });
    });
}

function renderTasks() {
    if (!taskList) return;
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
        groupHeader.onclick = function() {
            const contentEl = this.nextElementSibling;
            const btnEl = this.querySelector('.toggle-subject-btn');
            if (contentEl) contentEl.classList.toggle('open');
            if (btnEl) btnEl.classList.toggle('open');
        };
        groupHeader.innerHTML = `
            <div style="font-weight: 700; color: #334155;">
                <i class="fa-solid fa-tag" style="color: ${subjectColor}"></i> ${subject}
            </div>
            <button type="button" class="toggle-subject-btn open"><i class="fa-solid fa-chevron-down"></i></button>
        `;

        const groupContent = document.createElement('ul');
        groupContent.className = 'subject-group-content open';

        groupedTasks[subject].forEach(task => {
            if (task.completed !== undefined) {
                task.subtasks = new Array(task.units).fill(Boolean(task.completed));
                delete task.completed;
            }
            if (task.expanded === undefined) task.expanded = false;

            const checkedCount = task.subtasks.filter(Boolean).length;
            const allDone = checkedCount === task.units;
            const progressPercent = Math.round((checkedCount / task.units) * 100) || 0;

            const li = document.createElement('li');
            li.className = `task-item subject-${task.subject} ${allDone ? 'completed' : ''}`;
            li.style.borderLeftColor = subjectColor;

            let subtasksHtml = task.subtasks.map((isChecked, idx) => `
                <li class="subtask-item ${isChecked ? 'completed' : ''}">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSubtask('${task.id}', ${idx})">
                    ${idx + 1} ${task.unitString || '단위'}
                </li>
            `).join('');

            li.innerHTML = `
                <div class="task-header">
                    <div class="task-header-left" style="cursor:pointer;" onclick="toggleExpandTask('${task.id}')">
                        <div class="task-desc">${task.name}</div>
                    </div>
                    <div class="task-progress-container">
                        <div class="task-progress-bar"><div class="task-progress-fill" style="width: ${progressPercent}%"></div></div>
                        <div class="task-progress-text" style="white-space:nowrap;">${checkedCount}/${task.units}${task.unitString || '단위'}</div>
                        <button type="button" class="btn btn-sm btn-outline-primary" style="margin-right:5px; padding:2px 6px; font-size:0.75rem;" onclick="toggleAllSubtasks('${task.id}')" title="전체완수"><i class="fa-solid fa-check-double"></i></button>
                        <button type="button" class="toggle-subtasks-btn ${task.expanded ? 'open' : ''}" onclick="toggleExpandTask('${task.id}')"><i class="fa-solid fa-chevron-down"></i></button>
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

    if (todayEstimatedTime) {
        todayEstimatedTime.parentElement.style.display = 'block';
        let rTotal = Math.round(baseTotalMins);
        let text = `${Math.floor(rTotal / 60)}시간 ${rTotal % 60}분`;
        if (advTotalMins > 0) {
            let advR = Math.round(advTotalMins);
            text += ` (+당겨온 ${Math.floor(advR / 60)}시간 ${advR % 60}분)`;
        }
        todayEstimatedTime.innerText = text;
    }

    if (todayTaskCount) {
        let rTotal2 = Math.round(baseTotalMins);
        let text2 = `${Math.floor(rTotal2 / 60)}시간 ${rTotal2 % 60}분`;
        if (advTotalMins > 0) {
            let advR2 = Math.round(advTotalMins);
            text2 += ` (+당겨온 ${Math.floor(advR2 / 60)}시간 ${advR2 % 60}분)`;
        }
        todayTaskCount.innerText = text2;
    }

    let percentage = baseTotalMins > 0 ? Math.round((baseCompletedMins / baseTotalMins) * 100) : 0;

    if (baseTotalMins === 0 && advTotalMins > 0) {
        percentage = 100;
    }

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.innerText = `${percentage}%`;
}

function renderGarden() {
    if (streakCount) streakCount.innerText = state.streak;

    const tierIconContainer = document.getElementById('tierIconContainer');
    const tierName = document.getElementById('tierName');
    const expProgressBar = document.getElementById('expProgressBar');
    const expProgressText = document.getElementById('expProgressText');
    const pdProgressBar = document.getElementById('pdProgressBar');
    const pdProgressText = document.getElementById('pdProgressText');
    const tierNextReq = document.getElementById('tierNextReq');
    const totalExpDisplay = document.getElementById('totalExpDisplay');

    if (totalExpDisplay) {
        totalExpDisplay.innerText = `총 ${state.exp} EXP`;
    }

    // Update Level
    state.level = Math.max(1, Math.floor(state.exp / 1000) + 1);
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
            todayExpAmount.style.color = '#ef4444';
        } else {
            todayExpAmount.style.color = '#3b82f6';
        }
    }

    // Update Advance button visibility
    const advanceTasksContainer = document.getElementById('advanceTasksContainer');
    let hasIncomplete = state.tasks.some(t => t.subtasks && t.subtasks.includes(false));
    if (advanceTasksContainer) {
        if (state.goals && state.goals.length > 0 && !hasIncomplete) {
            advanceTasksContainer.style.display = 'block';
            const btnText = document.getElementById('advanceBtnText');
            if (btnText) {
                let dayStr = '내일';
                if (advanceDaysTracker === 1) dayStr = '모레';
                else if (advanceDaysTracker === 2) dayStr = '글피';
                else if (advanceDaysTracker > 2) dayStr = `${advanceDaysTracker + 1}일 후`;
                btnText.innerText = `${dayStr} 분량 당겨오기 (EXP ${advanceDaysTracker + 2}배 보너스!)`;
            }
        } else {
            advanceTasksContainer.style.display = 'none';
        }
    }
}

function advanceTomorrowTasks() {
    checkAndGenerateTasks();
    advanceDaysTracker++;
    const todayStr = getTodayStr();

    let d = new Date(todayStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + advanceDaysTracker);
    const targetStr = d.toISOString().split('T')[0];

    const { schedule } = simulateSchedule(true, state.tasks);
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
        showToast(`${advanceDaysTracker > 1 ? advanceDaysTracker + '일 뒤' : '내일'}의 분량을 당겨왔습니다! 완료 시 EXP ${advanceDaysTracker + 1}배 획득!`, 'success');
    } else {
        showToast('추가로 당겨올 수 있는 분량이 없습니다.', 'warning');
        advanceDaysTracker--;
    }
}

function showToast(message, type = 'danger') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-info-circle';
    if (type === 'danger' || type === 'error') icon = 'fa-triangle-exclamation';
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
    if (!confettiContainer) return;
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
    let simDate = new Date(todayStr + 'T00:00:00Z');

    let maxDate = new Date(todayStr + 'T00:00:00Z');
    state.goals.forEach(g => {
        let d = new Date((g.deadline || todayStr) + 'T00:00:00Z');
        if (!isNaN(d.getTime()) && d > maxDate) maxDate = d;
    });

    const schedule = {};
    let simGoals = state.goals.map(g => {
        let completedToday = 0;
        let oldTasksForGoal = oldTasks.filter(t => t.goalId === g.id);
        oldTasksForGoal.forEach(oldTask => {
            completedToday += oldTask.subtasks ? oldTask.subtasks.filter(Boolean).length : (oldTask.completed ? oldTask.units : 0);
        });
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
            const tasksForGoal = state.tasks.filter(task => task.goalId === g.id);
            const assignedUnits = tasksForGoal.reduce((sum, task) => sum + task.units, 0);
            g.simCompleted += assignedUnits;
        });
        simDate.setUTCDate(simDate.getUTCDate() + 1);
    }

    // PRE-CALCULATE BASELINE SCHEDULES (ORIGINAL WORKLOAD)
    const baselineSchedules = {};
    simGoals.forEach(goal => {
        baselineSchedules[goal.id] = {};
        let goalType = goal.type || 'long';
        if (goalType === 'daily') return;

        let goalStartDateStr = goal.startDate || todayStr;
        let currentDate = new Date(goalStartDateStr + 'T00:00:00Z');
        let deadlineDate = new Date((goal.deadline || todayStr) + 'T00:00:00Z');

        if (isNaN(currentDate.getTime()) || isNaN(deadlineDate.getTime()) || currentDate > deadlineDate) return;

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

        let goalStartDateStr = goal.startDate || todayStr;
        let simDateStr = simDate.toISOString().split('T')[0];
        let startToUse = simDateStr > goalStartDateStr ? simDateStr : goalStartDateStr;
        let currentDate = new Date(startToUse + 'T00:00:00Z');
        let deadlineDate = new Date((goal.deadline || todayStr) + 'T00:00:00Z');

        if (isNaN(currentDate.getTime()) || isNaN(deadlineDate.getTime())) return;

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

                if (independentSchedules[goal.id] && independentSchedules[goal.id][dStr]) {
                    required_capacity += independentSchedules[goal.id][dStr];
                }

                if (gType === 'daily') {
                    if (dStr >= (goal.startDate || todayStr) && dStr <= goal.deadline) {
                        baseline_capacity += goal.totalUnits;
                    }
                } else {
                    if (baselineSchedules[goal.id] && baselineSchedules[goal.id][dStr]) {
                        baseline_capacity += baselineSchedules[goal.id][dStr];
                    }
                }
            });

            let total_capacity = Math.max(required_capacity, baseline_capacity);

            let activeGoals = simGoals.filter(g => {
                let gType = g.type || 'long';
                return (gType === 'daily' || g.simCompleted < g.totalUnits) && dStr >= (g.startDate || todayStr);
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
                        if (planned > remaining_capacity) planned = remaining_capacity;
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
                        return (a.deadline || '').localeCompare(b.deadline || '');
                    });

                    while (remaining_capacity > 0 && unfinishedGoals.length > 0) {
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
                    return (a.deadline || '').localeCompare(b.deadline || '');
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

    const startOffset = firstDay.getDay();
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
    if (typeof onGoalTypeChange === 'function') onGoalTypeChange('edit');
    editGoalSubject.value = goal.subject;
    editGoalName.value = goal.name;
    editGoalStartDate.value = goal.startDate || getTodayStr();
    editGoalDeadline.value = goal.deadline;

    editGoalTotalUnits.value = goal.totalUnits;
    document.getElementById('editGoalUnitString').value = goal.unitString || '단위';
    document.getElementById('editGoalMinsPerUnit').value = goal.minsPerUnit || (goal.totalMins ? Math.round(goal.totalMins / goal.totalUnits) : 10);
    editGoalTotalUnits.min = Math.max(1, goal.completedUnits);

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

    const newTotal = parseInt(editGoalTotalUnits.value, 10);
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
    goal.subject = editGoalSubject.value.trim();
    goal.name = editGoalName.value.trim();
    goal.startDate = startDateVal;
    goal.deadline = deadlineVal;

    goal.totalUnits = newTotal;
    goal.unitString = (document.getElementById('editGoalUnitString').value || '단위').trim();
    goal.minsPerUnit = Math.max(0.1, parseFloat(document.getElementById('editGoalMinsPerUnit').value || 10));

    closeEditModal();
    forceRegenerateTasks();
    saveData();
    showToast('목표가 수정되었습니다.', 'success');
}

// Expose to window for inline HTML handlers
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.removePeriod = removePeriod;
window.removeNotificationTime = removeNotificationTime;
window.removeGoal = removeGoal;

// Tier Info Popup Logic
window.toggleTierPopup = function(event) {
    if (event) event.stopPropagation();
    const popup = document.getElementById('tierInfoPopup');
    const tbody = document.getElementById('tierInfoTableBody');
    if (!popup) return;

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
                <td style="padding: 5px 0; font-weight: 600; color: ${tier.color};">${tier.icon} ${tier.name}</td>
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
    if (popup && popup.style.display === 'block' && !event.target.closest('#tierInfoPopup') && !event.target.closest('.fa-circle-info') && !event.target.closest('#tierInfoBtn')) {
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

    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');

    const targetBtn = document.querySelector(`.nav-btn[onclick="switchTab('${tabId}')"]`);
    if (targetBtn) targetBtn.classList.add('active');
}
window.switchTab = switchTab;

window.resetAppData = async function() {
    if (!confirm("정말로 모든 앱 데이터(목표, 경험치, 기록 등)를 0으로 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) {
        return;
    }

    const resetBtn = document.getElementById('resetAppBtn');
    const originalBtnHtml = resetBtn ? resetBtn.innerHTML : '';
    if (resetBtn) {
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 초기화 중...';
    }

    fullSchedule = {};
    advanceDaysTracker = 0;
    lastPrePostponeState = null;

    const undoBtn = document.getElementById('undoPostponeBtn');
    if (undoBtn) undoBtn.style.display = 'none';

    state = {
        ...getDefaultState(),
        lastGeneratedDate: getTodayStr(),
        isReset: true,
        resetAt: Date.now()
    };

    localStorage.removeItem('zeroDebtData_v2');
    saveDataLocalOnly();
    localStorage.setItem('zeroDebtJustReset', 'true');
    sessionStorage.setItem('zeroDebtJustReset', 'true');

    syncSettingsControls();
    if (addGoalForm) addGoalForm.reset();
    renderAll();

    if (SYNC_URL) {
        try {
            await syncDataToCloud({ action: 'reset', isReset: true });
        } catch (e) {
            console.error('Cloud reset failed:', e);
        }
    }

    if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.innerHTML = originalBtnHtml || '<i class="fa-solid fa-trash-can"></i> 앱 데이터 전체 초기화';
    }

    switchTab('tab-dashboard');
    showToast('모든 앱 데이터가 0(초기 상태)으로 초기화되었습니다.', 'success');
};

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

init();
