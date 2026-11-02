const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const fishNames = ['guppy', 'molly', 'cupang', 'cawangBlack', 'cawangWhite'];
const fishLabels = {
    guppy: 'Guppy',
    molly: 'Molly',
    cupang: 'Cupang',
    cawangBlack: 'Cawang Black',
    cawangWhite: 'Cawang White'
};
const STORAGE_KEY = 'SHehati';
const LOGIN_KEY = 'chommellFarmLoggedIn';
const whatsappNumber = '6287727114562';

function createEmptyDailyItems() {
    return Object.fromEntries(fishNames.map((name) => [name, { income: 0, expense: 0, sold: 0 }]));
}

function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDailyEntry(entry = {}) {
    const items = entry.items && typeof entry.items === 'object' ? entry.items : {};
    const normalizedItems = createEmptyDailyItems();
    fishNames.forEach((name) => {
        const item = items[name] || {};
        normalizedItems[name] = {
            income: Math.max(0, safeNumber(item.income)),
            expense: Math.max(0, safeNumber(item.expense)),
            sold: Math.max(0, safeNumber(item.sold))
        };
    });
    return { date: String(entry.date || ''), items: normalizedItems };
}

function createDefaultData() {
    return {
        monthly: monthLabels.map((month) => ({ month, income: 0, expense: 0, stock: 0 })),
        fish: Object.fromEntries(fishNames.map((name) => [name, { stock: 0 }])),
        daily: [],
        customers: [],
        queueCounter: 0,
        queueDate: ''
    };
}

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateValue(dateValue, options = { day: '2-digit', month: 'long', year: 'numeric' }) {
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('id-ID', options);
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function loadState() {
    const defaults = createDefaultData();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaults;

    try {
        const parsed = JSON.parse(saved);
        const fish = Object.fromEntries(fishNames.map((name) => [
            name,
            { stock: Math.max(0, safeNumber(parsed.fish?.[name]?.stock)) }
        ]));
        const dailyByDate = new Map();
        (Array.isArray(parsed.daily) ? parsed.daily : []).forEach((entry) => {
            const normalized = normalizeDailyEntry(entry);
            if (!normalized.date) return;
            const existing = dailyByDate.get(normalized.date);
            if (existing) {
                fishNames.forEach((name) => {
                    ['income', 'expense', 'sold'].forEach((field) => {
                        existing.items[name][field] += normalized.items[name][field];
                    });
                });
            } else {
                dailyByDate.set(normalized.date, normalized);
            }
        });
        let daily = Array.from(dailyByDate.values())
            .filter((entry) => {
                const totals = getDailyTotals([entry]);
                return totals.income || totals.expense || totals.sold;
            })
            .sort((a, b) => a.date.localeCompare(b.date));
        const dailyTotals = getDailyTotals(daily);
        const legacyMonthly = Array.isArray(parsed.monthly) ? parsed.monthly : [];
        if (!dailyTotals.income && !dailyTotals.expense && legacyMonthly.some((month) => safeNumber(month.income) || safeNumber(month.expense))) {
            const year = new Date().getFullYear();
            daily = legacyMonthly.slice(0, 12).flatMap((month, index) => {
                const income = Math.max(0, safeNumber(month.income));
                const expense = Math.max(0, safeNumber(month.expense));
                if (!income && !expense) return [];
                const items = createEmptyDailyItems();
                fishNames.forEach((name, fishIndex) => {
                    items[name].income = Math.floor(income / fishNames.length) + (fishIndex < income % fishNames.length ? 1 : 0);
                    items[name].expense = Math.floor(expense / fishNames.length) + (fishIndex < expense % fishNames.length ? 1 : 0);
                });
                return [{ date: localDateKey(new Date(year, index, 1)), items }];
            });
        } else if (!dailyTotals.income && !dailyTotals.expense) {
            const items = createEmptyDailyItems();
            fishNames.forEach((name) => {
                items[name].income = Math.max(0, safeNumber(parsed.fish?.[name]?.income));
                items[name].expense = Math.max(0, safeNumber(parsed.fish?.[name]?.expense));
            });
            if (getDailyTotals([{ items }]).income || getDailyTotals([{ items }]).expense) {
                daily = [{ date: localDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), items }];
            }
        }
        return {
            ...defaults,
            fish,
            daily,
            customers: Array.isArray(parsed.customers)
                ? parsed.customers.filter((customer) => customer && typeof customer.name === 'string')
                    .map((customer) => ({ name: customer.name, address: String(customer.address || '') }))
                : [],
            queueCounter: Math.max(0, Math.floor(safeNumber(parsed.queueCounter))),
            queueDate: typeof parsed.queueDate === 'string' ? parsed.queueDate : ''
        };
    } catch (error) {
        console.error('Data tersimpan tidak dapat dibaca. Dashboard dimulai dengan data kosong.', error);
        return defaults;
    }
}

const state = loadState();
let activeEditor = 'daily';
const analyticsTableBody = document.getElementById('analyticsTableBody');
const dailyLedgerBody = document.getElementById('dailyLedgerBody');
const editorForm = document.getElementById('editorForm');
const toast = document.getElementById('toast');

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Data gagal disimpan ke penyimpanan browser.', error);
        notify('Data gagal disimpan. Periksa ruang penyimpanan browser.');
        throw error;
    }
}

function notify(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(notify.timeoutId);
    notify.timeoutId = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function vibrateAction() {
    if ('vibrate' in navigator) navigator.vibrate([35, 20, 45]);
}

function getDailyTotals(entries) {
    return entries.reduce((totals, entry) => {
        fishNames.forEach((name) => {
            const item = entry.items[name];
            totals.income += item.income;
            totals.expense += item.expense;
            totals.sold += item.sold;
        });
        return totals;
    }, { income: 0, expense: 0, sold: 0 });
}

function currentMonthEntries() {
    const currentMonth = localDateKey(new Date()).slice(0, 7);
    return state.daily.filter((entry) => entry.date.startsWith(currentMonth));
}

function updateSummaryCards() {
    const entries = currentMonthEntries();
    const totals = getDailyTotals(entries);
    const stock = fishNames.reduce((sum, name) => sum + state.fish[name].stock, 0);
    document.getElementById('incomeTotal').textContent = formatRupiah(totals.income);
    document.getElementById('expenseTotal').textContent = formatRupiah(totals.expense);
    document.getElementById('netTotal').textContent = formatRupiah(totals.income - totals.expense);
    document.getElementById('stockTotal').textContent = stock.toLocaleString('id-ID');

    const cardIds = {
        guppy: ['guppyStock', 'guppyIncome', 'guppyExpense'],
        molly: ['mollyStock', 'mollyIncome', 'mollyExpense'],
        cupang: ['cupangStock', 'cupangIncome', 'cupangExpense'],
        cawangWhite: ['channaStock', 'channaIncome', 'channaExpense'],
        cawangBlack: ['blackCawangStock', 'blackCawangIncome', 'blackCawangExpense']
    };
    const pillOrder = ['guppy', 'molly', 'cupang', 'cawangWhite', 'cawangBlack'];
    fishNames.forEach((name) => {
        const fishTotals = entries.reduce((sum, entry) => ({
            income: sum.income + entry.items[name].income,
            expense: sum.expense + entry.items[name].expense
        }), { income: 0, expense: 0 });
        const [stockId, incomeId, expenseId] = cardIds[name];
        document.getElementById(stockId).textContent = state.fish[name].stock.toLocaleString('id-ID');
        document.getElementById(incomeId).textContent = formatRupiah(fishTotals.income);
        document.getElementById(expenseId).textContent = formatRupiah(fishTotals.expense);
    });
    document.querySelectorAll('.fish-card .pill').forEach((pill, index) => {
        const name = pillOrder[index];
        const income = entries.reduce((sum, entry) => sum + entry.items[name].income, 0);
        pill.textContent = formatRupiah(income);
    });
}

function renderMonthlyTable() {
    const year = new Date().getFullYear();
    const monthlyTotals = monthLabels.map((month, monthIndex) => {
        const entries = state.daily.filter((entry) => {
            const date = new Date(`${entry.date}T00:00:00`);
            return date.getFullYear() === year && date.getMonth() === monthIndex;
        });
        return { month, ...getDailyTotals(entries) };
    });
    analyticsTableBody.innerHTML = monthlyTotals.map((month) => `
        <tr>
            <td>${month.month} ${year}</td>
            <td class="month-income">${formatRupiah(month.income)}</td>
            <td class="month-expense">${formatRupiah(month.expense)}</td>
            <td class="month-net">${formatRupiah(month.income - month.expense)}</td>
        </tr>
    `).join('');
}

function renderDailyLedger() {
    const entries = currentMonthEntries().sort((a, b) => a.date.localeCompare(b.date));
    if (!entries.length) {
        dailyLedgerBody.innerHTML = '<tr><td colspan="5">Belum ada catatan harian untuk bulan ini.</td></tr>';
        return;
    }
    const totals = getDailyTotals(entries);
    dailyLedgerBody.innerHTML = entries.map((entry) => {
        const dayTotals = getDailyTotals([entry]);
        return `<tr>
            <td>${formatDateValue(entry.date)}</td>
            <td class="month-income">${formatRupiah(dayTotals.income)}</td>
            <td class="month-expense">${formatRupiah(dayTotals.expense)}</td>
            <td class="month-net">${formatRupiah(dayTotals.income - dayTotals.expense)}</td>
            <td>${dayTotals.sold.toLocaleString('id-ID')} ekor</td>
        </tr>`;
    }).join('') + `<tr>
        <td><strong>Total bulan ini</strong></td>
        <td class="month-income"><strong>${formatRupiah(totals.income)}</strong></td>
        <td class="month-expense"><strong>${formatRupiah(totals.expense)}</strong></td>
        <td class="month-net"><strong>${formatRupiah(totals.income - totals.expense)}</strong></td>
        <td><strong>${totals.sold.toLocaleString('id-ID')} ekor</strong></td>
    </tr>`;
}

function renderEditor() {
    document.querySelectorAll('.editor-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.editor === activeEditor);
    });
    if (activeEditor === 'daily') {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        editorForm.innerHTML = Array.from({ length: days }, (_, index) => {
            const date = localDateKey(new Date(year, month, index + 1));
            const entry = state.daily.find((item) => item.date === date) || { date, items: createEmptyDailyItems() };
            const formattedDate = formatDateValue(date, { weekday: 'long', day: 'numeric', month: 'long' });
            return `<div class="field month-field">
                <label>${formattedDate}</label>
                <div class="item-daily-grid">
                    ${fishNames.map((name) => `<div class="item-input-box">
                        <span class="sub-label">${fishLabels[name]}</span>
                        <div class="item-input-stack">
                            <label>Pemasukan
                                <input data-scope="daily" data-date="${date}" data-fish="${name}" data-field="income" type="number" min="0" step="1" value="${entry.items[name].income}" />
                            </label>
                            <label>Pengeluaran
                                <input data-scope="daily" data-date="${date}" data-fish="${name}" data-field="expense" type="number" min="0" step="1" value="${entry.items[name].expense}" />
                            </label>
                            <label>Jumlah terjual (ekor)
                                <input data-scope="daily" data-date="${date}" data-fish="${name}" data-field="sold" type="number" min="0" step="1" value="${entry.items[name].sold}" />
                            </label>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
        }).join('');
        return;
    }

    const fishName = activeEditor;
    const fish = state.fish[fishName];
    editorForm.innerHTML = `<div class="field">
        <label for="fishStockInput">Stok ${fishLabels[fishName]} (ekor)</label>
        <input id="fishStockInput" data-scope="fish" data-fish="${fishName}" data-field="stock" type="number" min="0" step="1" value="${fish.stock}" />
    </div>
    <p class="editor-help">Pemasukan dan pengeluaran tiap jenis ikan dihitung otomatis dari catatan harian.</p>`;
}

function saveCurrentEditor() {
    if (activeEditor === 'daily') {
        const editedEntries = new Map();
        editorForm.querySelectorAll('[data-scope="daily"]').forEach((input) => {
            const { date, fish: fishName, field } = input.dataset;
            if (!editedEntries.has(date)) {
                const existing = state.daily.find((entry) => entry.date === date);
                editedEntries.set(date, existing ? normalizeDailyEntry(existing) : {
                    date,
                    items: createEmptyDailyItems()
                });
            }
            editedEntries.get(date).items[fishName][field] = Math.max(0, safeNumber(input.value));
        });
        state.daily = state.daily.filter((entry) => !editedEntries.has(entry.date))
            .concat(Array.from(editedEntries.values()))
            .filter((entry) => {
                const totals = getDailyTotals([entry]);
                return totals.income || totals.expense || totals.sold;
            })
            .sort((a, b) => a.date.localeCompare(b.date));
    } else {
        const input = editorForm.querySelector('[data-scope="fish"]');
        state.fish[activeEditor].stock = Math.max(0, Math.floor(safeNumber(input.value)));
    }
    saveState();
    renderMonthlyTable();
    renderDailyLedger();
    updateSummaryCards();
    notify('Data berhasil disimpan');
}

function renderCustomers() {
    const customerList = document.getElementById('customerList');
    if (!state.customers.length) {
        customerList.innerHTML = '<p class="empty-customers">Belum ada pelanggan. Tambahkan nama toko dan alamatnya.</p>';
        return;
    }
    customerList.innerHTML = state.customers.map((customer, index) => `
        <form class="customer-row" data-customer-index="${index}">
            <label class="field">Nama toko
                <input name="name" maxlength="100" required value="${escapeHTML(customer.name)}" />
            </label>
            <label class="field">Alamat toko
                <input name="address" maxlength="240" required value="${escapeHTML(customer.address)}" />
            </label>
            <div class="customer-actions">
                <button class="mini-btn" type="submit">Simpan</button>
                <button class="ghost-btn delete-customer-btn" type="button" data-index="${index}">Hapus</button>
            </div>
        </form>
    `).join('');
}

function generateWhatsAppMessage() {
    const entries = currentMonthEntries();
    const totals = getDailyTotals(entries);
    const summary = [
        `Laporan Chommell Farm - ${formatDateValue(localDateKey(new Date()), { month: 'long', year: 'numeric' })}`,
        `Pemasukan bulan ini: ${formatRupiah(totals.income)}`,
        `Pengeluaran bulan ini: ${formatRupiah(totals.expense)}`,
        `Keuntungan bulan ini: ${formatRupiah(totals.income - totals.expense)}`,
        `Ikan terjual: ${totals.sold} ekor`,
        `Stok aktif: ${fishNames.reduce((sum, name) => sum + state.fish[name].stock, 0)} ekor`,
        ...fishNames.map((name) => `${fishLabels[name]}: stok ${state.fish[name].stock} ekor`)
    ].join('\n');
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(summary)}`;
    const popup = window.open(url, '_blank');
    if (!popup) notify('Izinkan pop-up browser untuk membuka WhatsApp.');
    else {
        popup.opener = null;
        notify('Membuka WhatsApp');
    }
}

function resetData() {
    if (!window.confirm('Hapus seluruh catatan, stok, pelanggan, dan nomor antrean? Tindakan ini tidak dapat dibatalkan.')) return;
    const freshData = createDefaultData();
    state.monthly = freshData.monthly;
    state.fish = freshData.fish;
    state.daily = freshData.daily;
    state.customers = freshData.customers;
    state.queueCounter = freshData.queueCounter;
    state.queueDate = freshData.queueDate;
    saveState();
    renderMonthlyTable();
    renderDailyLedger();
    updateSummaryCards();
    renderEditor();
    renderCustomers();
    document.getElementById('queueTicket').hidden = true;
    notify('Semua data berhasil direset');
}

function exportSummary() {
    const year = new Date().getFullYear();
    const dailyRows = state.daily.filter((entry) => entry.date.startsWith(String(year))).map((entry) => {
        const fishIncome = fishNames.map((name) => entry.items[name].income);
        const fishExpense = fishNames.map((name) => entry.items[name].expense);
        const fishSold = fishNames.map((name) => entry.items[name].sold);
        const totals = getDailyTotals([entry]);
        return `<tr><td>${formatDateValue(entry.date)}</td>
            ${fishIncome.concat(fishExpense, fishSold).map((value) => `<td>${value}</td>`).join('')}
            <td>${totals.income}</td><td>${totals.expense}</td><td>${totals.income - totals.expense}</td><td>${totals.sold}</td>
        </tr>`;
    });
    const fishHeadings = [
        ...fishNames.map((name) => `Pemasukan ${fishLabels[name]}`),
        ...fishNames.map((name) => `Pengeluaran ${fishLabels[name]}`),
        ...fishNames.map((name) => `Terjual ${fishLabels[name]} (ekor)`)
    ];
    const annualRows = monthLabels.map((month, index) => {
        const entries = state.daily.filter((entry) => {
            const date = new Date(`${entry.date}T00:00:00`);
            return date.getFullYear() === year && date.getMonth() === index;
        });
        const totals = getDailyTotals(entries);
        return `<tr><td>${month} ${year}</td><td>${totals.income}</td><td>${totals.expense}</td><td>${totals.income - totals.expense}</td><td>${totals.sold}</td></tr>`;
    });
    const tableStyle = 'border-collapse:collapse;width:100%;margin-bottom:24px;';
    const cellStyle = 'border:1px solid #cbd5e1;padding:8px;text-align:left;';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;color:#173b32}th{background:#e8f1eb}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left}caption{text-align:left;font-size:18px;font-weight:bold;padding:10px}</style></head><body>
        <table style="${tableStyle}"><caption>Rekap keuangan bulanan Chommell Farm - ${year}</caption><thead><tr>${['Bulan', 'Pemasukan (Rp)', 'Pengeluaran (Rp)', 'Keuntungan (Rp)', 'Terjual (ekor)'].map((heading) => `<th style="${cellStyle}">${heading}</th>`).join('')}</tr></thead><tbody>${annualRows.join('')}</tbody></table>
        <table style="${tableStyle}"><caption>Rincian harian</caption><thead><tr>${['Tanggal', ...fishHeadings, 'Total pemasukan (Rp)', 'Total pengeluaran (Rp)', 'Keuntungan (Rp)', 'Total terjual (ekor)'].map((heading) => `<th style="${cellStyle}">${heading}</th>`).join('')}</tr></thead><tbody>${dailyRows.length ? dailyRows.join('') : `<tr><td colspan="${fishHeadings.length + 5}" style="${cellStyle}">Belum ada data untuk tahun ${year}</td></tr>`}</tbody></table></body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chommell-farm-rekap-${year}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Rekap Excel berhasil diekspor');
}

document.getElementById('loginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const error = document.getElementById('loginError');
    if (username !== 'slamet' || password !== 'slm') {
        error.textContent = 'Nama user atau password tidak sesuai.';
        return;
    }
    sessionStorage.setItem(LOGIN_KEY, 'true');
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('dashboardApp').hidden = false;
    error.textContent = '';
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(LOGIN_KEY);
    document.getElementById('dashboardApp').hidden = true;
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('loginPassword').value = '';
});

document.getElementById('saveDataBtn').addEventListener('click', () => {
    vibrateAction();
    saveCurrentEditor();
});
document.getElementById('sendWhatsAppBtn').addEventListener('click', () => {
    vibrateAction();
    generateWhatsAppMessage();
});
document.getElementById('downloadSummaryBtn').addEventListener('click', () => {
    vibrateAction();
    exportSummary();
});
document.getElementById('resetDataBtn').addEventListener('click', () => {
    vibrateAction();
    resetData();
});
document.getElementById('queueNumberBtn').addEventListener('click', () => {
    const today = localDateKey(new Date());
    if (state.queueDate !== today) state.queueCounter = 0;
    state.queueDate = today;
    state.queueCounter += 1;
    saveState();
    document.getElementById('queueNumberDisplay').textContent = `ANTREAN #${String(state.queueCounter).padStart(3, '0')}`;
    document.getElementById('queueDateDisplay').textContent = new Date().toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    document.getElementById('queueTicket').hidden = false;
});

document.querySelectorAll('.editor-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        vibrateAction();
        activeEditor = tab.dataset.editor;
        renderEditor();
    });
});
editorForm.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.dataset.scope) {
        event.target.value = String(Math.max(0, safeNumber(event.target.value)));
        saveCurrentEditor();
    }
});
document.getElementById('customerForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('customerName').value.trim();
    const address = document.getElementById('customerAddress').value.trim();
    if (!name || !address) return;
    state.customers.push({ name, address });
    saveState();
    event.currentTarget.reset();
    renderCustomers();
    notify('Pelanggan berhasil ditambahkan');
});
document.getElementById('customerList').addEventListener('submit', (event) => {
    if (!event.target.matches('.customer-row')) return;
    event.preventDefault();
    const index = Number(event.target.dataset.customerIndex);
    if (!state.customers[index]) return;
    const formData = new FormData(event.target);
    state.customers[index] = {
        name: String(formData.get('name') || '').trim(),
        address: String(formData.get('address') || '').trim()
    };
    saveState();
    renderCustomers();
    notify('Data pelanggan berhasil diperbarui');
});
document.getElementById('customerList').addEventListener('click', (event) => {
    const button = event.target.closest('.delete-customer-btn');
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!state.customers[index] || !window.confirm(`Hapus pelanggan "${state.customers[index].name}"?`)) return;
    state.customers.splice(index, 1);
    saveState();
    renderCustomers();
    notify('Pelanggan berhasil dihapus');
});

renderMonthlyTable();
renderDailyLedger();
updateSummaryCards();
renderEditor();
renderCustomers();
if (sessionStorage.getItem(LOGIN_KEY) === 'true') {
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('dashboardApp').hidden = false;
}
