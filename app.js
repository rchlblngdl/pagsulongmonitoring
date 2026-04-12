// ============================================
// IMPORTANT: REPLACE WITH YOUR DEPLOYED APPS SCRIPT URL
// ============================================
const API_URL = 'https://script.google.com/macros/s/AKfycbzc_C9xs6GiyX2Bq6-0cixdSXIrJgYaEFddAYsv7fUADJTzPRVlEvpJN_8yfYWNWs5l_w/exec';

const majorEvents = ["PM", "WS", "TG", "HARANA", "COMBINED PM/WS", "LORD SUPPER", "CNY", "SPBB DAY 1", "SPBB DAY 2", "SPBB DAY 3"];
const minorEvents = ["24/7", "LMI", "MCGI CARES", "SK EVENING", "SK AFTERNOON"];
const statusOptions = ["PF", "PNF", "A", "NR"];

let members = [];
let attendanceData = [];
let currentBatch = "";
let availableBatches = [];
let traineeCount = 1;

function showMessage(el, msg, type) {
    let div = document.getElementById(el);
    if (div) div.innerHTML = `<div class="${type === 'success' ? 'success-msg' : 'error-msg'}">${msg}</div>`;
    setTimeout(() => { if (div) div.innerHTML = ''; }, 3000);
}

async function apiCall(method, params = {}) {
    try {
        let url = `${API_URL}?action=${params.action || ''}`;
        if (method === 'GET') {
            const response = await fetch(url);
            return await response.json();
        } else {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            return await response.json();
        }
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: error.message };
    }
}

async function loadBatches() {
    const result = await apiCall('GET', { action: 'getBatches' });
    if (result.success) {
        availableBatches = result.batches;
        currentBatch = result.currentBatch;
        updateBatchUI();
        return true;
    }
    return false;
}

async function loadMembers() {
    const result = await apiCall('GET', { action: 'getMembers', batch: currentBatch });
    if (result.success && result.members) {
        members = result.members;
        renderMembersGrid();
        renderAttendanceTable();
        updateFilters();
        return true;
    }
    return false;
}

async function loadAttendance() {
    const result = await apiCall('GET', { action: 'getAttendance', batch: currentBatch });
    if (result.success && result.records) {
        attendanceData = result.records;
        renderSummary();
        loadRecords();
        return true;
    }
    return false;
}

async function addRecord(record) {
    return await apiCall('POST', { action: 'addAttendance', record: record, batch: currentBatch });
}

async function createBatch(batchName, trainees) {
    return await apiCall('POST', { action: 'createBatch', batchName: batchName, trainees: trainees });
}

async function switchToBatch(batchName) {
    const result = await apiCall('POST', { action: 'switchBatch', batchName: batchName });
    if (result.success) {
        currentBatch = batchName;
        await loadMembers();
        await loadAttendance();
        updateBatchUI();
        showMessage('formMessage', `Switched to ${batchName}`, 'success');
    }
}

function updateBatchUI() {
    document.getElementById('currentBatchLabel').innerText = currentBatch;
    document.getElementById('formBatchName').innerText = currentBatch;
    document.getElementById('summaryBatchName').innerText = currentBatch;
    document.getElementById('recordsBatchName').innerText = currentBatch;
    const select = document.getElementById('batchSelect');
    select.innerHTML = availableBatches.map(b => `<option value="${b}" ${b === currentBatch ? 'selected' : ''}>${b}</option>`).join('');
}

function renderMembersGrid() {
    const grid = document.getElementById('membersGrid');
    if (members.length === 0) {
        grid.innerHTML = '<div class="loading">No members found</div>';
        return;
    }
    grid.innerHTML = members.map(m => `
        <div class="member-card">
            <h3>${m.name}</h3>
            <p>${m.locale}</p>
            <span class="voice-badge">${m.voice}</span>
        </div>
    `).join('');
}

function renderAttendanceTable() {
    if (members.length === 0) {
        document.getElementById('attendanceTableBody').innerHTML = '<tr><td colspan="3">No members found</td></tr>';
        return;
    }
    document.getElementById('attendanceTableBody').innerHTML = members.map(m => `
        <tr>
            <td>
                <strong>${m.name}</strong><br>
                <small>${m.voice} | ${m.locale}</small>
            </td>
            <td>
                <select class="status-select" data-name="${m.name}">
                    <option value="">-- Select --</option>
                    ${statusOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
            </td>
            <td>
                <input type="text" class="reason-input" data-name="${m.name}" placeholder="Reason for PNF or Absent">
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.status-select').forEach(s => {
        s.addEventListener('change', function () {
            let reason = document.querySelector(`.reason-input[data-name="${this.dataset.name}"]`);
            if (this.value === 'PNF' || this.value === 'A') {
                reason.required = true;
                reason.placeholder = "Required: Enter reason...";
            } else {
                reason.required = false;
                reason.placeholder = "Reason for PNF or Absent";
            }
        });
    });
}

function updateMasterEvent() {
    let cat = document.getElementById('masterCategory').value;
    let events = cat === 'Major' ? majorEvents : (cat === 'Minor' ? minorEvents : []);
    let select = document.getElementById('masterEvent');
    select.innerHTML = '<option value="">-- Select Event --</option>' + events.map(e => `<option value="${e}">${e}</option>`).join('');
}

function renderSummary() {
    renderCategory('Major', majorEvents, 'majorHeader', 'majorBody');
    renderCategory('Minor', minorEvents, 'minorHeader', 'minorBody');
}

function renderCategory(category, events, headerId, bodyId) {
    let counts = {};
    members.forEach(m => {
        counts[m.name] = {};
        events.forEach(e => counts[m.name][e] = 0);
    });

    // FIX: Store data uses 'P' for PF status (converted on submit)
    attendanceData.forEach(r => {
        if (r.category === category && r.status === 'P' && counts[r.name]) {
            counts[r.name][r.event]++;
        }
    });

    document.getElementById(headerId).innerHTML = `
        <tr>
            <th>NAME / VOICE</th>
            ${events.map(e => `<th>${e}</th>`).join('')}
            <th>RATE</th>
            <th>REMARKS</th>
        </tr>
    `;

    let maxPossible = events.length;
    document.getElementById(bodyId).innerHTML = members.map(m => {
        let total = events.reduce((s, e) => s + counts[m.name][e], 0);
        let rate = maxPossible > 0 ? (total / maxPossible * 100).toFixed(1) : 0;
        let remarks = rate >= 80 ? 'COMPLETE' : 'INCOMPLETE';
        return `
            <tr>
                <td>
                    <strong>${m.name}</strong><br>
                    <small>${m.voice}</small>
                </td>
                ${events.map(e => `<td><strong>${counts[m.name][e]}</strong></td>`).join('')}
                <td><strong>${rate}%</strong></td>
                <td class="${remarks === 'COMPLETE' ? 'complete' : 'incomplete'}">${remarks}</td>
            </tr>
        `;
    }).join('');
}

function loadRecords() {
    let filtered = attendanceData.filter(r => {
        if (document.getElementById('filterName').value && r.name !== document.getElementById('filterName').value) return false;
        if (document.getElementById('filterCategory').value && r.category !== document.getElementById('filterCategory').value) return false;
        if (document.getElementById('filterEvent').value && r.event !== document.getElementById('filterEvent').value) return false;
        if (document.getElementById('dateFrom').value && r.date < document.getElementById('dateFrom').value) return false;
        if (document.getElementById('dateTo').value && r.date > document.getElementById('dateTo').value) return false;
        return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!filtered.length) {
        document.getElementById('recordsTable').innerHTML = '<div class="loading">No records found</div>';
        return;
    }

    function formatDate(d) {
        if (!d) return '';
        let date = new Date(d);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function getDayName(d) {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-US', { weekday: 'long' });
    }

    // FIX: Status display - stored as 'P' but display as 'PF'
    document.getElementById('recordsTable').innerHTML = `
        <table class="records-table">
            <thead>
                <tr>
                    <th>DATE</th>
                    <th>NAME</th>
                    <th>CATEGORY</th>
                    <th>EVENT</th>
                    <th>STATUS</th>
                    <th>REASON</th>
                    <th>ACTION</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map((r, i) => `
                    <tr>
                        <td>
                            ${formatDate(r.date)}<br>
                            <small>${getDayName(r.date)}</small>
                        </td>
                        <td>${r.name}</td>
                        <td>${r.category === 'Major' ? 'Major' : 'Minor'}</td>
                        <td>${r.event}</td>
                        <td><span class="status-${r.status === 'P' ? 'pf' : r.status.toLowerCase()}">${r.status === 'P' ? 'PF' : r.status}</span></td>
                        <td>${r.reason || '-'}</td>
                        <td><button onclick="deleteRecord(${i})" class="btn-danger delete-btn">Delete</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <p class="records-count">Total: ${filtered.length} records</p>
    `;
}

window.deleteRecord = async function (index) {
    if (confirm('Delete this record?')) {
        const record = attendanceData[index];
        await apiCall('POST', { action: 'deleteRecord', id: record.id, batch: currentBatch });
        await loadAttendance();
        showMessage('formMessage', 'Record deleted!', 'success');
    }
};

function updateFilters() {
    let nameFilter = document.getElementById('filterName');
    nameFilter.innerHTML = '<option value="">All Members</option>' + members.map(m => `<option value="${m.name}">${m.name}</option>`).join('');

    let eventFilter = document.getElementById('filterEvent');
    eventFilter.innerHTML = '<option value="">All Events</option>' + [...majorEvents, ...minorEvents].map(e => `<option value="${e}">${e}</option>`).join('');
}

// Event Listeners
document.getElementById('submitAttendanceBtn').addEventListener('click', async () => {
    let date = document.getElementById('masterDate').value;
    let category = document.getElementById('masterCategory').value;
    let event = document.getElementById('masterEvent').value;

    if (!date || !category || !event) {
        showMessage('formMessage', 'Fill all fields', 'error');
        return;
    }

    let errors = [], submitted = 0;
    for (let member of members) {
        let status = document.querySelector(`.status-select[data-name="${member.name}"]`)?.value;
        let reason = document.querySelector(`.reason-input[data-name="${member.name}"]`)?.value || '';

        if (!status) {
            errors.push(`${member.name}: No status`);
            continue;
        }
        if ((status === 'PNF' || status === 'A') && !reason) {
            errors.push(`${member.name}: Reason required`);
            continue;
        }

        // FIX: PF gets converted to P for storage consistency
        let storedStatus = status === 'PF' ? 'P' : status;
        await addRecord({ name: member.name, date, category, event, status: storedStatus, reason });
        submitted++;
    }

    if (errors.length) {
        showMessage('formMessage', `Errors:<br>${errors.join('<br>')}`, 'error');
    } else {
        showMessage('formMessage', `${submitted} records submitted!`, 'success');
    }

    document.querySelectorAll('.status-select').forEach(s => s.value = '');
    document.querySelectorAll('.reason-input').forEach(r => r.value = '');
    await loadAttendance();
});

document.getElementById('saveAsJpgBtn')?.addEventListener('click', async function () {
    const el = document.getElementById('summaryContent');
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#2FA084' });
    const link = document.createElement('a');
    link.download = `${currentBatch}_summary.png`;
    link.href = canvas.toDataURL();
    link.click();
});

document.getElementById('createBatchBtn').addEventListener('click', () => {
    traineeCount = 1;
    document.getElementById('traineesContainer').innerHTML = `
        <div class="modal-form-group">
            <label>Trainee 1 - Name:</label>
            <input type="text" id="traineeName1" placeholder="Full Name">
        </div>
        <div class="modal-form-group">
            <label>Locale:</label>
            <input type="text" id="traineeLocale1" placeholder="e.g., Bulihan">
        </div>
        <div class="modal-form-group">
            <label>Voice:</label>
            <input type="text" id="traineeVoice1" placeholder="e.g., Soprano 2">
        </div>
    `;
    let nextNum = availableBatches.length + 13;
    document.getElementById('newBatchName').value = `Batch${nextNum}`;
    document.getElementById('createBatchModal').style.display = 'flex';
});

document.getElementById('addTraineeBtn').addEventListener('click', () => {
    traineeCount++;
    const container = document.getElementById('traineesContainer');
    const div = document.createElement('div');
    div.className = 'modal-form-group';
    div.innerHTML = `
        <hr>
        <label>Trainee ${traineeCount} - Name:</label>
        <input type="text" id="traineeName${traineeCount}" placeholder="Full Name">
        <label>Locale:</label>
        <input type="text" id="traineeLocale${traineeCount}" placeholder="e.g., Bulihan">
        <label>Voice:</label>
        <input type="text" id="traineeVoice${traineeCount}" placeholder="e.g., Soprano 2">
        <button onclick="this.parentElement.remove()" class="btn-danger" style="margin-top:5px;">Remove</button>
    `;
    container.appendChild(div);
});

document.getElementById('modalConfirmBtn').addEventListener('click', async () => {
    let batchName = document.getElementById('newBatchName').value;
    let trainees = [];

    for (let i = 1; i <= traineeCount; i++) {
        let name = document.getElementById(`traineeName${i}`)?.value;
        if (name && name.trim()) {
            trainees.push({
                name: name.trim(),
                locale: document.getElementById(`traineeLocale${i}`)?.value || '',
                voice: document.getElementById(`traineeVoice${i}`)?.value || ''
            });
        }
    }

    if (trainees.length === 0) {
        alert('Add at least one trainee');
        return;
    }

    document.getElementById('createBatchModal').style.display = 'none';
    await createBatch(batchName, trainees);
    await loadBatches();
    await switchToBatch(batchName);
});

document.getElementById('modalCancelBtn').addEventListener('click', () => {
    document.getElementById('createBatchModal').style.display = 'none';
});

document.getElementById('switchBatchBtn').addEventListener('click', async () => {
    await switchToBatch(document.getElementById('batchSelect').value);
});

document.getElementById('refreshRecords').addEventListener('click', loadAttendance);

document.getElementById('exportCSV').addEventListener('click', () => {
    // FIX: Display 'PF' instead of 'P' in CSV export
    let csv = 'Name,Date,Category,Event,Status,Reason\n' + attendanceData.map(r => {
        let displayStatus = r.status === 'P' ? 'PF' : r.status;
        return `"${r.name}","${r.date}","${r.category}","${r.event}","${displayStatus}","${r.reason || ''}"`;
    }).join('\n');

    let blob = new Blob([csv], { type: 'text/csv' });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentBatch}_attendance.csv`;
    a.click();
});

document.getElementById('deleteAll').addEventListener('click', async () => {
    if (confirm('Delete ALL records?')) {
        await apiCall('POST', { action: 'deleteAll', batch: currentBatch });
        await loadAttendance();
    }
});

document.getElementById('masterCategory').addEventListener('change', updateMasterEvent);
document.getElementById('filterName')?.addEventListener('change', loadRecords);
document.getElementById('filterCategory')?.addEventListener('change', loadRecords);
document.getElementById('filterEvent')?.addEventListener('change', loadRecords);
document.getElementById('dateFrom')?.addEventListener('change', loadRecords);
document.getElementById('dateTo')?.addEventListener('change', loadRecords);

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.tab + 'Tab').classList.add('active');
    });
});

// Modal backdrop close
document.getElementById('createBatchModal').addEventListener('click', function (e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

// Initialize date
document.getElementById('masterDate').valueAsDate = new Date();

async function init() {
    await loadBatches();
    await loadMembers();
    await loadAttendance();
    updateMasterEvent();
}

init();