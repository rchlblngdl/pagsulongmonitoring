// ============================================
// SUPABASE CONFIGURATION
// ============================================
// Replace these with your actual Supabase credentials
const SUPABASE_URL = 'https://oeulcaagmuijiyuufmlf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldWxjYWFnbXVpaml5dXVmbWxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODg4MDksImV4cCI6MjA5MTU2NDgwOX0.dZsUZKTOCiNZTEhehLpzv1-xC8MRni9ei47ONWbsAnQ';

let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

const majorEvents = ["PM", "WS", "TG", "HARANA", "COMBINED PM/WS", "LORD SUPPER", "CNY", "SPBB DAY 1", "SPBB DAY 2", "SPBB DAY 3"];
const minorEvents = ["24/7", "LMI", "MCGI CARES", "SK EVENING", "SK AFTERNOON"];
const statusOptions = ["Present/Function", "Present(not Function)", "Present", "PNF(other Task)", "Absent", "No Report"];

let members = [];
let attendanceData = [];
let currentBatch = "";
let availableBatches = [];
let traineeCount = 1;
let currentWeekIndex = 0;
let weekRanges = [];

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function getCurrentBatchFromDb() {
    const { data, error } = await getSupabase()
        .from('batches')
        .select('name')
        .eq('is_current', true)
        .single();

    if (error || !data) return 'Batch13';
    return data.name;
}

async function setCurrentBatchInDb(batchName) {
    // Clear current flag first
    await getSupabase()
        .from('batches')
        .update({ is_current: false })
        .eq('is_current', true);

    // Set new current batch
    const { error } = await getSupabase()
        .from('batches')
        .update({ is_current: true })
        .eq('name', batchName);

    return !error;
}

async function loadBatches() {
    const { data, error } = await getSupabase()
        .from('batches')
        .select('name')
        .order('name');

    if (error) {
        console.error('Error loading batches:', error);
        return false;
    }

    availableBatches = data.map(b => b.name);
    currentBatch = await getCurrentBatchFromDb();
    updateBatchUI();
    return true;
}

async function loadMembers() {
    const { data: batchData, error: batchError } = await getSupabase()
        .from('batches')
        .select('id')
        .eq('name', currentBatch)
        .single();

    if (batchError || !batchData) {
        members = [];
        renderMembersGrid();
        renderAttendanceTable();
        updateFilters();
        return true;
    }

    const { data, error } = await getSupabase()
        .from('members')
        .select('*')
        .eq('batch_id', batchData.id)
        .order('name');

    if (error) {
        console.error('Error loading members:', error);
        return false;
    }

    members = data.map(m => ({
        id: m.id,
        name: m.name,
        locale: m.locale,
        voice: m.voice
    }));

    renderMembersGrid();
    renderAttendanceTable();
    updateFilters();
    return true;
}

async function loadAttendance() {
    const { data: batchData, error: batchError } = await getSupabase()
        .from('batches')
        .select('id')
        .eq('name', currentBatch)
        .single();

    if (batchError || !batchData) {
        attendanceData = [];
        renderSummary();
        loadRecords();
        return true;
    }

    const { data, error } = await getSupabase()
        .from('attendance')
        .select('*')
        .eq('batch_id', batchData.id)
        .order('date', { ascending: false });

    if (error) {
        console.error('Error loading attendance:', error);
        return false;
    }

    attendanceData = data.map(r => ({
        id: r.id,
        name: r.name,
        date: r.date,
        category: r.category,
        event: r.event,
        status: r.status,
        reason: r.reason,
        timestamp: r.timestamp
    }));

    renderSummary();
    loadRecords();
    return true;
}

async function addRecord(record) {
    const { data: batchData } = await getSupabase()
        .from('batches')
        .select('id')
        .eq('name', currentBatch)
        .single();

    if (!batchData) return { success: false, error: 'Batch not found' };

    const { data, error } = await getSupabase()
        .from('attendance')
        .insert([{
            batch_id: batchData.id,
            name: record.name,
            date: record.date,
            category: record.category,
            event: record.event,
            status: record.status,
            reason: record.reason || ''
        }])
        .select()
        .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: data.id };
}

async function createBatch(batchName, trainees) {
    // Create batch entry
    const { data: batchData, error: batchError } = await getSupabase()
        .from('batches')
        .insert([{ name: batchName, is_current: true }])
        .select()
        .single();

    if (batchError) return { success: false, error: batchError.message };

    // Clear current flag for other batches
    await getSupabase()
        .from('batches')
        .update({ is_current: false })
        .neq('id', batchData.id);

    // Add members
    if (trainees.length > 0) {
        const membersToInsert = trainees.map(t => ({
            batch_id: batchData.id,
            name: t.name,
            locale: t.locale,
            voice: t.voice
        }));

        const { error: membersError } = await getSupabase()
            .from('members')
            .insert(membersToInsert);

        if (membersError) console.error('Error adding members:', membersError);
    }

    return { success: true, batch: batchName };
}

async function switchToBatch(batchName) {
    await setCurrentBatchInDb(batchName);
    currentBatch = batchName;
    await loadMembers();
    await loadAttendance();
    updateBatchUI();
    showMessage('formMessage', `Switched to ${batchName}`, 'success');
}

async function deleteRecord(id) {
    const { error } = await getSupabase()
        .from('attendance')
        .delete()
        .eq('id', id);

    return !error;
}

async function deleteAllRecords() {
    const { data: batchData } = await getSupabase()
        .from('batches')
        .select('id')
        .eq('name', currentBatch)
        .single();

    if (!batchData) return { success: false };

    const { error } = await getSupabase()
        .from('attendance')
        .delete()
        .eq('batch_id', batchData.id);

    return { success: !error };
}

async function deleteBatch(batchName) {
    const { data: batchData, error: batchError } = await getSupabase()
        .from('batches')
        .select('id')
        .eq('name', batchName)
        .single();

    if (batchError || !batchData) {
        showMessage('formMessage', 'Batch not found', 'error');
        return false;
    }

    // Delete attendance records
    await getSupabase()
        .from('attendance')
        .delete()
        .eq('batch_id', batchData.id);

    // Delete members
    await getSupabase()
        .from('members')
        .delete()
        .eq('batch_id', batchData.id);

    // Delete the batch itself
    const { error } = await getSupabase()
        .from('batches')
        .delete()
        .eq('id', batchData.id);

    if (error) {
        showMessage('formMessage', 'Failed to delete batch', 'error');
        return false;
    }

    return true;
}

// ============================================
// UI FUNCTIONS (same as before, adapted for Supabase)
// ============================================

function showMessage(el, msg, type) {
    let div = document.getElementById(el);
    if (div) div.innerHTML = `<div class="${type === 'success' ? 'success-msg' : 'error-msg'}">${msg}</div>`;
    setTimeout(() => { if (div) div.innerHTML = ''; }, 3000);
}

function updateBatchUI() {
    document.getElementById('currentBatchLabel').innerText = currentBatch;
    document.getElementById('formBatchName').innerText = currentBatch;
    document.getElementById('summaryBatchName').innerText = currentBatch;
    document.getElementById('recordsBatchName').innerText = currentBatch;
    document.getElementById('weeklyBatchName').innerText = currentBatch;
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
                <input type="text" class="reason-input" data-name="${m.name}" placeholder="Enter reason">
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.status-select').forEach(s => {
        s.addEventListener('change', function () {
            let reason = document.querySelector(`.reason-input[data-name="${this.dataset.name}"]`);
            if (this.value === 'PNF(other Task)' || this.value === 'Absent') {
                reason.required = true;
                reason.placeholder = "Required: Enter reason...";
            } else {
                reason.required = false;
                reason.placeholder = "Enter reason";
            }
        });
    });
}

function updateMasterEvent() {
    let select = document.getElementById('masterEvent');
    let allEvents = [...majorEvents, ...minorEvents];
    select.innerHTML = '<option value="">-- Select Event --</option>' + allEvents.map(e => `<option value="${e}">${e}</option>`).join('');
}

function getCategoryFromEvent(event) {
    return majorEvents.includes(event) ? 'Major' : 'Minor';
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

    attendanceData.forEach(r => {
        if (r.category === category && (r.status === 'Present/Function' || r.status === 'Present') && counts[r.name]) {
            counts[r.name][r.event]++;
        }
    });

    document.getElementById(headerId).innerHTML = `
        <tr>
            <th>NAME / VOICE</th>
            ${events.map(e => `<th>${e}</th>`).join('')}
        </tr>
    `;

    document.getElementById(bodyId).innerHTML = members.map(m => {
        return `
            <tr>
                <td>
                    <strong>${m.name}</strong><br>
                    <small>${m.voice}</small>
                </td>
                ${events.map(e => `<td><strong>${counts[m.name][e]}</strong></td>`).join('')}
            </tr>
        `;
    }).join('');
}

function loadRecords() {
    let filtered = attendanceData.filter(r => {
        if (document.getElementById('filterName').value && r.name !== document.getElementById('filterName').value) return false;
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

    document.getElementById('recordsTable').innerHTML = `
        <table class="records-table">
            <thead>
                <tr>
                    <th>DATE</th>
                    <th>NAME</th>
                    <th>EVENT</th>
                    <th>STATUS</th>
                    <th>REASON</th>
                    <th>ACTION</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map((r, i) => {
                    const origIndex = attendanceData.indexOf(r);
                    return `
                    <tr>
                        <td>
                            ${formatDate(r.date)}<br>
                            <small>${getDayName(r.date)}</small>
                        </td>
                        <td>${r.name}</td>
                        <td>${r.event}</td>
                        <td><span class="status-${r.status === 'Present/Function' || r.status === 'Present' ? 'pf' : r.status.toLowerCase()}">${r.status}</span></td>
                        <td>${r.reason || '-'}</td>
                        <td><button onclick="deleteRecord(${origIndex})" class="btn-danger delete-btn">Delete</button></td>
                    </tr>
                `;
            }).join('')}
            </tbody>
        </table>
        <p class="records-count">Total: ${filtered.length} records</p>
    `;
}

function computeWeekRanges() {
    weekRanges = [
        { start: '2026-04-01', end: '2026-04-04', label: 'April 1 – 4' },
        { start: '2026-04-06', end: '2026-04-11', label: 'April 6 – 11' },
        { start: '2026-04-13', end: '2026-04-18', label: 'April 13 – 18' },
        { start: '2026-04-20', end: '2026-04-25', label: 'April 20 – 25' },
        { start: '2026-04-27', end: '2026-04-30', label: 'April 27 – 30' }
    ];
}

function normalizeEvent(name) {
    return name.split(/\s+/).join(' ').trim().toUpperCase();
}

function renderWeeklyReport() {
    // Only compute default ranges if none exist yet
    if (weekRanges.length === 0) {
        computeWeekRanges();
    }

    if (weekRanges.length === 0) {
        document.getElementById('weeklyTable').innerHTML = '<div class="loading">No records found</div>';
        document.getElementById('weeklyHeader').style.display = 'none';
        return;
    }

    if (currentWeekIndex >= weekRanges.length) currentWeekIndex = weekRanges.length - 1;
    if (currentWeekIndex < 0) currentWeekIndex = 0;

    const week = weekRanges[currentWeekIndex];
    const weekNum = currentWeekIndex + 1;

    document.getElementById('weeklyHeader').style.display = 'block';
    document.getElementById('weeklyWeekNum').textContent = 'Week ' + weekNum;
    document.getElementById('weeklyWeekLabel').textContent = week.label;

    renderWeeklyTableData();
}

function renderWeeklyTableData() {
    const week = weekRanges[currentWeekIndex];
    if (!week) return;

    const filtered = attendanceData.filter(r => r.date >= week.start && r.date <= week.end);

    // Iterate all days in week (string-based)
    const allDates = [];
    let d = week.start;
    while (d <= week.end) {
        allDates.push(d);
        const [y, m, day] = d.split('-').map(Number);
        const next = new Date(y, m - 1, day + 1);
        d = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    }

    // Map date -> sessions
    const daySessionsMap = new Map();
    allDates.forEach(dd => daySessionsMap.set(dd, []));

    filtered.forEach(r => {
        if (daySessionsMap.has(r.date)) {
            const sessions = daySessionsMap.get(r.date);
            const existing = sessions.find(s => s.event === r.event);
            if (existing) {
                existing.records.push(r);
            } else {
                sessions.push({ date: r.date, event: r.event, records: [r] });
            }
        }
    });

    // Sort sessions within each day
    allDates.forEach(dd => {
        daySessionsMap.get(dd).sort((a, b) => a.event.localeCompare(b.event));
    });

    let html = `<table class="weekly-table">
        <thead>
            <tr>
                <th class="grid-name-header" style="vertical-align:middle; text-align:center; width:180px;">NAME</th>
                ${allDates.map(dd => {
                    const sessions = daySessionsMap.get(dd);
                    const [y, m, day] = dd.split('-').map(Number);
                    const dow = new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                    if (sessions.length === 0) {
                        const mon = new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                        return `<th class="grid-session-header" style="font-size:11px; line-height:1.3;">
                            ${mon} ${day}<br>${dow}
                        </th>`;
                    }
                    return sessions.map(s => {
                        const [sy, sm, sday] = s.date.split('-').map(Number);
                        const mon = new Date(sy, sm - 1, sday).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                        const eventName = normalizeEvent(s.event);
                        return `<th class="grid-session-header" style="font-size:11px; line-height:1.4;">
                            ${mon} ${sday}<br><span style="font-size:10px; opacity:0.8;">${dow}</span><br>${eventName}
                        </th>`;
                    }).join('');
                }).join('')}
            </tr>
        </thead>
        <tbody>
            ${members.map(m => {
                return `<tr>
                    <td class="grid-name-cell"><strong>${m.name}</strong></td>
                    ${allDates.map(dd => {
                        const sessions = daySessionsMap.get(dd);
                        if (sessions.length === 0) {
                            return `<td></td>`;
                        }
                        return sessions.map(s => {
                            const memberRecords = s.records.filter(r => r.name === m.name);
                            if (memberRecords.length === 0) {
                                return `<td></td>`;
                            }
                            // Build status+reason string for each record
                            const cellParts = memberRecords.map(r => {
                                let initial = '';
                                if (r.status === 'Present/Function') initial = 'PF';
                                else if (r.status === 'Present(not Function)') initial = 'PNF';
                                else if (r.status === 'PNF(other Task)') initial = 'PNF/OT';
                                else if (r.status === 'Present') initial = 'P';
                                else if (r.status === 'Absent') initial = 'A';
                                // No Report = no initial

                                if (!initial) return '';
                                if (r.reason && r.reason.trim()) {
                                    return `${initial} - ${r.reason.trim()}`;
                                }
                                return initial;
                            }).filter(p => p);

                            if (cellParts.length === 0) return `<td></td>`;
                            return `<td>${cellParts.join(', ')}</td>`;
                        }).join('');
                    }).join('')}
                </tr>`;
            }).join('')}
        </tbody>
    </table>`;

    document.getElementById('weeklyTable').innerHTML = html;
}

// Navigation
document.getElementById('prevWeek')?.addEventListener('click', () => {
    currentWeekIndex--;
    renderWeeklyReport();
});

document.getElementById('nextWeek')?.addEventListener('click', () => {
    currentWeekIndex++;
    renderWeeklyReport();
});

window.deleteRecord = async function (index) {
    if (confirm('Delete this record?')) {
        const record = attendanceData[index];
        await supabaseDeleteRecord(record.id);
        await loadAttendance();
        showMessage('formMessage', 'Record deleted!', 'success');
    }
};

async function supabaseDeleteRecord(id) {
    await getSupabase().from('attendance').delete().eq('id', id);
}

function updateFilters() {
    let nameFilter = document.getElementById('filterName');
    nameFilter.innerHTML = '<option value="">All Members</option>' + members.map(m => `<option value="${m.name}">${m.name}</option>`).join('');

    let eventFilter = document.getElementById('filterEvent');
    eventFilter.innerHTML = '<option value="">All Events</option>' + [...majorEvents, ...minorEvents].map(e => `<option value="${e}">${e}</option>`).join('');
}

// Event Listeners
document.getElementById('submitAttendanceBtn').addEventListener('click', async () => {
    let date = document.getElementById('masterDate').value;
    let event = document.getElementById('masterEvent').value;

    if (!date || !event) {
        showMessage('formMessage', 'Fill all fields', 'error');
        return;
    }

    let category = getCategoryFromEvent(event);

    let errors = [], submitted = 0;
    for (let member of members) {
        let status = document.querySelector(`.status-select[data-name="${member.name}"]`)?.value;
        let reason = document.querySelector(`.reason-input[data-name="${member.name}"]`)?.value || '';

        if (!status) {
            errors.push(`${member.name}: No status`);
            continue;
        }
        if ((status === 'PNF(other Task)' || status === 'Absent') && !reason) {
            errors.push(`${member.name}: Reason required`);
            continue;
        }

        await addRecord({ name: member.name, date, category, event, status: status, reason });
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
    document.getElementById('newBatchName').value = '';
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
    let batchName = document.getElementById('newBatchName').value.trim();
    let trainees = [];

    if (!batchName) {
        alert('Please enter a batch name');
        return;
    }

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

document.getElementById('deleteBatchBtn').addEventListener('click', async () => {
    const batchToDelete = document.getElementById('batchSelect').value;
    if (confirm(`Are you sure you want to delete "${batchToDelete}"? This will remove all members and attendance records.`)) {
        const success = await deleteBatch(batchToDelete);
        if (success) {
            await loadBatches();
            if (availableBatches.length > 0) {
                await switchToBatch(availableBatches[0]);
            } else {
                currentBatch = '';
                members = [];
                attendanceData = [];
                renderMembersGrid();
                renderAttendanceTable();
                renderSummary();
                loadRecords();
                updateFilters();
                updateBatchUI();
            }
            showMessage('formMessage', `Deleted ${batchToDelete}`, 'success');
        }
    }
});

document.getElementById('refreshRecords').addEventListener('click', loadAttendance);

document.getElementById('exportCSV').addEventListener('click', () => {
    let csv = 'Name,Date,Category,Event,Status,Reason\n' + attendanceData.map(r => {
        return `"${r.name}","${r.date}","${r.category}","${r.event}","${r.status}","${r.reason || ''}"`;
    }).join('\n');

    let blob = new Blob([csv], { type: 'text/csv' });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentBatch}_attendance.csv`;
    a.click();
});

document.getElementById('deleteAll').addEventListener('click', async () => {
    if (confirm('Delete ALL records?')) {
        await deleteAllRecords();
        await loadAttendance();
    }
});

document.getElementById('filterName')?.addEventListener('change', loadRecords);
document.getElementById('filterEvent')?.addEventListener('change', loadRecords);
document.getElementById('dateFrom')?.addEventListener('change', loadRecords);
document.getElementById('dateTo')?.addEventListener('change', loadRecords);

// Weekly Report Week Editor
function openWeekEditor() {
    // Initialize defaults if needed
    if (weekRanges.length === 0) {
        computeWeekRanges();
    }

    var container = document.getElementById('weeksEditorContainer');
    var html = '';

    for (var i = 0; i < weekRanges.length; i++) {
        var w = weekRanges[i];
        html += '<div style="display:flex; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap;">';
        html += '<span style="width:60px; font-weight:600;">Week ' + (i + 1) + '</span>';
        html += '<div class="modal-form-group" style="margin:0; flex:1;">';
        html += '<label>Start Date</label>';
        html += '<input type="date" id="weekStart' + i + '" value="' + w.start + '">';
        html += '</div>';
        html += '<div class="modal-form-group" style="margin:0; flex:1;">';
        html += '<label>End Date</label>';
        html += '<input type="date" id="weekEnd' + i + '" value="' + w.end + '">';
        html += '</div>';
        html += '<div class="modal-form-group" style="margin:0; flex:1;">';
        html += '<label>Label</label>';
        html += '<input type="text" id="weekLabel' + i + '" value="' + w.label + '">';
        html += '</div>';
        html += '</div>';
    }

    container.innerHTML = html;
    document.getElementById('editWeeksModal').style.display = 'flex';
}

function saveWeeks() {
    // Read form values
    for (var i = 0; i < weekRanges.length; i++) {
        var startEl = document.getElementById('weekStart' + i);
        var endEl = document.getElementById('weekEnd' + i);
        var labelEl = document.getElementById('weekLabel' + i);

        if (startEl) weekRanges[i].start = startEl.value;
        if (endEl) weekRanges[i].end = endEl.value;
        if (labelEl) weekRanges[i].label = labelEl.value;
    }

    // Ensure index is valid
    if (currentWeekIndex >= weekRanges.length) {
        currentWeekIndex = weekRanges.length - 1;
    }
    if (currentWeekIndex < 0) currentWeekIndex = 0;

    // Close modal
    document.getElementById('editWeeksModal').style.display = 'none';

    // Show success alert
    alert('Date Saved!');

    // Re-render with new values
    renderWeeklyReport();
}

document.getElementById('saveWeeksBtn').addEventListener('click', saveWeeks);
document.getElementById('cancelWeeksBtn').addEventListener('click', function() {
    document.getElementById('editWeeksModal').style.display = 'none';
});
document.getElementById('cancelWeeksBtn')?.addEventListener('click', () => {
    document.getElementById('editWeeksModal').style.display = 'none';
});

// Weekly Report
document.getElementById('refreshWeekly')?.addEventListener('click', () => {
    loadAttendance().then(() => {
        renderWeeklyReport();
    });
});

document.getElementById('exportWeeklyJPG')?.addEventListener('click', async function () {
    if (weekRanges.length === 0) {
        computeWeekRanges();
    }
    if (weekRanges.length === 0) {
        alert('No data to export');
        return;
    }
    const el = document.getElementById('weeklyTable');
    if (!el || el.querySelector('.loading') || !el.querySelector('table')) {
        alert('No table to export');
        return;
    }
    const week = weekRanges[currentWeekIndex] || weekRanges[0];
    const weekNum = currentWeekIndex + 1;
    const headerEl = document.getElementById('weeklyHeader');
    const wrapper = document.createElement('div');
    wrapper.style.background = '#2FA084';
    wrapper.style.padding = '20px';
    wrapper.style.borderRadius = '8px';
    wrapper.style.fontFamily = 'Inter, sans-serif';
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';

    const headerClone = headerEl.cloneNode(true);
    headerClone.style.display = 'block';
    wrapper.appendChild(headerClone);

    const tableClone = el.querySelector('table')?.cloneNode(true);
    if (tableClone) {
        tableClone.style.background = '#fff';
        tableClone.style.width = 'auto';
        // Style all cells in the cloned table
        const cells = tableClone.querySelectorAll('td, th');
        cells.forEach(cell => {
            cell.style.backgroundColor = '#fff';
            cell.style.color = '#1E293B';
            cell.style.border = '1px solid #ccc';
        });
        // Style header cells specifically
        const headers = tableClone.querySelectorAll('th');
        headers.forEach(cell => {
            cell.style.backgroundColor = '#0F766E';
            cell.style.color = '#fff';
        });
        wrapper.appendChild(tableClone);
    }

    document.body.appendChild(wrapper);

    const canvas = await html2canvas(wrapper, {
        scale: 2,
        backgroundColor: '#2FA084',
        useCORS: true,
        width: wrapper.offsetWidth,
        height: wrapper.offsetHeight
    });

    document.body.removeChild(wrapper);

    const link = document.createElement('a');
    link.download = `${currentBatch}_week${weekNum}_report.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
});

document.getElementById('exportWeeklyCSV')?.addEventListener('click', () => {
    if (weekRanges.length === 0) {
        alert('No data to export');
        return;
    }
    const week = weekRanges[currentWeekIndex] || weekRanges[0];
    const weekNum = currentWeekIndex + 1;

    const filtered = attendanceData.filter(r => r.date >= week.start && r.date <= week.end);
    if (!filtered.length) {
        alert('No records for this week');
        return;
    }

    const sessions = [];
    const sessionMap = new Map();
    filtered.forEach(r => {
        const key = `${r.date}|${r.event}`;
        if (!sessionMap.has(key)) {
            sessionMap.set(key, { date: r.date, event: r.event, records: [] });
            sessions.push(sessionMap.get(key));
        }
        sessionMap.get(key).records.push(r);
    });
    sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Use initials logic for CSV
    let csv = 'Name,' + sessions.map(s => {
        const d = new Date(s.date);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
        return `"${dateStr} ${s.event}"`;
    }).join(',') + '\n';

    members.forEach(m => {
        const row = [m.name];
        sessions.forEach(s => {
            const memberRecords = s.records.filter(r => r.name === m.name);
            if (memberRecords.length === 0) {
                row.push('');
            } else {
                const cellParts = memberRecords.map(r => {
                    let initial = '';
                    if (r.status === 'Present/Function') initial = 'PF';
                    else if (r.status === 'Present(not Function)') initial = 'PNF';
                    else if (r.status === 'PNF(other Task)') initial = 'PNF/OT';
                    else if (r.status === 'Present') initial = 'P';
                    else if (r.status === 'Absent') initial = 'A';

                    if (!initial) return '';
                    if (r.reason && r.reason.trim()) {
                        return `${initial} - ${r.reason.trim()}`;
                    }
                    return initial;
                }).filter(p => p);

                row.push(cellParts.length > 0 ? cellParts.join('; ') : '');
            }
        });
        csv += row.join(',') + '\n';
    });

    let blob = new Blob([csv], { type: 'text/csv' });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentBatch}_week${weekNum}_report.csv`;
    a.click();
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.tab + 'Tab').classList.add('active');

        // Initialize weekly report when tab is shown
        if (this.dataset.tab === 'weekly') {
            currentWeekIndex = 0;
            renderWeeklyReport();
        }
    });
});

// Modal backdrop close
document.getElementById('createBatchModal').addEventListener('click', function (e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

document.getElementById('editWeeksModal').addEventListener('click', function (e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

// Initialize date
document.getElementById('masterDate').valueAsDate = new Date();

async function init() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        document.body.innerHTML = '<div style="padding:40px;text-align:center;"><h2>Supabase Not Configured</h2><p>Please update SUPABASE_URL and SUPABASE_ANON_KEY in app.supabase.js</p></div>';
        return;
    }
    await loadBatches();
    await loadMembers();
    await loadAttendance();
    updateMasterEvent();
}

init();
