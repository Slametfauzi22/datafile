const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const fishNames = ['guppy', 'molly', 'cupang'];

function createEmptyDailyItems() {
    return {
        guppy: { income: 0, expense: 0 },
        molly: { income: 0, expense: 0 },
        cupang: { income: 0, expense: 0 }
    };
}

function normalizeDailyEntry(entry = {}) {
    const legacyIncome = safeNumber(entry.income);
    const legacyExpense = safeNumber(entry.expense);
    const items = entry.items && typeof entry.items === 'object' ? entry.items : {};
    const normalizedItems = createEmptyDailyItems();

    fishNames.forEach((fishName) => {
        const itemValue = items[fishName] || {};
        normalizedItems[fishName] = {
            income: safeNumber(itemValue.income ?? (legacyIncome > 0 ? legacyIncome / fishNames.length : 0)),
            expense: safeNumber(itemValue.expense ?? (legacyExpense > 0 ? legacyExpense / fishNames.length : 0))
        };
    });

    return {
        date: String(entry.date || ''),
        items: normalizedItems
    };
}

function buildDailySamplesForMonth(monthIndex, monthlyIncome, monthlyExpense) {
    const year = new Date().getFullYear();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const dailyIncomeBase = monthlyIncome / daysInMonth;
    const dailyExpenseBase = monthlyExpense / daysInMonth;

    return Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const wave = 1 + ((day + monthIndex) % 5) * 0.12;
        const totalIncome = Math.round(dailyIncomeBase * wave);
        const totalExpense = Math.round(dailyExpenseBase * (1 + ((day + monthIndex) % 4) * 0.08));

        const itemIncomeShare = totalIncome / fishNames.length;
        const itemExpenseShare = totalExpense / fishNames.length;

        return {
            date: new Date(year, monthIndex, day).toISOString().split('T')[0],
            items: {
                guppy: { income: Math.round(itemIncomeShare * 0.42), expense: Math.round(itemExpenseShare * 0.4) },
                molly: { income: Math.round(itemIncomeShare * 0.35), expense: Math.round(itemExpenseShare * 0.35) },
                cupang: { income: Math.round(itemIncomeShare * 0.23), expense: Math.round(itemExpenseShare * 0.25) }
            }
        };
    });
}

const defaultData = {
    monthly: [
        { month: 'Jan', income: 3200000, expense: 1800000, stock: 72 },
        { month: 'Feb', income: 3400000, expense: 1900000, stock: 74 },
        { month: 'Mar', income: 3600000, expense: 2100000, stock: 80 },
        { month: 'Apr', income: 3900000, expense: 2200000, stock: 82 },
        { month: 'Mei', income: 4300000, expense: 2400000, stock: 86 },
        { month: 'Jun', income: 4600000, expense: 2500000, stock: 90 },
        { month: 'Jul', income: 4900000, expense: 2700000, stock: 95 },
        { month: 'Ags', income: 5100000, expense: 2800000, stock: 99 },
        { month: 'Sep', income: 5300000, expense: 2900000, stock: 103 },
        { month: 'Okt', income: 5600000, expense: 3100000, stock: 108 },
        { month: 'Nov', income: 5900000, expense: 3300000, stock: 112 },
        { month: 'Des', income: 6200000, expense: 3500000, stock: 118 }
    ],
    fish: {
        guppy: { income: 5200000, expense: 2900000, stock: 120 },
        molly: { income: 5400000, expense: 3100000, stock: 115 },
        cupang: { income: 6100000, expense: 3600000, stock: 110 }
    },
    daily: [
        ...buildDailySamplesForMonth(0, 3200000, 1800000),
        ...buildDailySamplesForMonth(1, 3400000, 1900000),
        ...buildDailySamplesForMonth(2, 3600000, 2100000),
        ...buildDailySamplesForMonth(3, 3900000, 2200000),
        ...buildDailySamplesForMonth(4, 4300000, 2400000),
        ...buildDailySamplesForMonth(5, 4600000, 2500000),
        ...buildDailySamplesForMonth(6, 4900000, 2700000),
        ...buildDailySamplesForMonth(7, 5100000, 2800000),
        ...buildDailySamplesForMonth(8, 5300000, 2900000),
        ...buildDailySamplesForMonth(9, 5600000, 3100000),
        ...buildDailySamplesForMonth(10, 5900000, 3300000),
        ...buildDailySamplesForMonth(11, 6200000, 3500000)
    ]
};

const STORAGE_KEY = 'aqua-finance-dashboard';
const whatsappNumber = '6287727114562';

const state = loadState();
let activeEditor = 'monthly';

const analyticsTableBody = document.getElementById('analyticsTableBody');
const dailyLedgerBody = document.getElementById('dailyLedgerBody');
const editorForm = document.getElementById('editorForm');
const toast = document.getElementById('toast');

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function cloneData(data) {
    return JSON.parse(JSON.stringify(data));
}

function formatDateValue(dateValue) {
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return parsed.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthNameFromDate(dateValue) {
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    return monthLabels[date.getMonth()];
}

function syncMonthlyTotalsFromDailyLedger() {
    const monthlyTotals = new Map(
        monthLabels.map((month) => [month, { income: 0, expense: 0 }])
    );

    state.daily.forEach((entry) => {
        const normalizedEntry = normalizeDailyEntry(entry);
        const monthName = getMonthNameFromDate(normalizedEntry.date);
        if (!monthName) return;

        const current = monthlyTotals.get(monthName) || { income: 0, expense: 0 };

        fishNames.forEach((fishName) => {
            const item = normalizedEntry.items[fishName] || { income: 0, expense: 0 };
            const itemIncome = safeNumber(item.income);
            const itemExpense = safeNumber(item.expense);

            current.income += itemIncome;
            current.expense += itemExpense;
        });

        monthlyTotals.set(monthName, current);
    });

    state.monthly = state.monthly.map((entry) => {
        const totals = monthlyTotals.get(entry.month);
        const income = totals ? totals.income : safeNumber(entry.income);
        const expense = totals ? totals.expense : safeNumber(entry.expense);

        return {
            ...entry,
            income,
            expense,
            stock: safeNumber(entry.stock)
        };
    });
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            return cloneData(defaultData);
        }

        const parsed = JSON.parse(saved);
        const mergedMonthly = Array.isArray(parsed.monthly) && parsed.monthly.length === 12
            ? parsed.monthly
            : cloneData(defaultData.monthly);

        const normalizedDaily = Array.isArray(parsed.daily) && parsed.daily.length
            ? parsed.daily.map((entry) => normalizeDailyEntry(entry))
            : cloneData(defaultData.daily).map((entry) => normalizeDailyEntry(entry));

        return {
            monthly: mergedMonthly.map((item, index) => ({
                month: monthLabels[index],
                income: safeNumber(item.income),
                expense: safeNumber(item.expense),
                stock: safeNumber(item.stock)
            })),
            fish: {
                guppy: {
                    income: safeNumber(parsed?.fish?.guppy?.income ?? defaultData.fish.guppy.income),
                    expense: safeNumber(parsed?.fish?.guppy?.expense ?? defaultData.fish.guppy.expense),
                    stock: safeNumber(parsed?.fish?.guppy?.stock ?? defaultData.fish.guppy.stock)
                },
                molly: {
                    income: safeNumber(parsed?.fish?.molly?.income ?? defaultData.fish.molly.income),
                    expense: safeNumber(parsed?.fish?.molly?.expense ?? defaultData.fish.molly.expense),
                    stock: safeNumber(parsed?.fish?.molly?.stock ?? defaultData.fish.molly.stock)
                },
                cupang: {
                    income: safeNumber(parsed?.fish?.cupang?.income ?? defaultData.fish.cupang.income),
                    expense: safeNumber(parsed?.fish?.cupang?.expense ?? defaultData.fish.cupang.expense),
                    stock: safeNumber(parsed?.fish?.cupang?.stock ?? defaultData.fish.cupang.stock)
                }
            },
            daily: normalizedDaily
        };
    } catch (error) {
        return cloneData(defaultData);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function notify(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(notify.timeoutId);
    notify.timeoutId = setTimeout(() => toast.classList.remove('visible'), 1800);
}

function vibrateAction() {
    if ('vibrate' in navigator) {
        navigator.vibrate([35, 20, 45]);
    }
}

function getMonthlyProfit(entry) {
    return safeNumber(entry.income) - safeNumber(entry.expense);
}

function updateSummaryCards() {
    const totalIncome = state.monthly.reduce((sum, item) => sum + safeNumber(item.income));
    const totalExpense = state.monthly.reduce((sum, item) => sum + safeNumber(item.expense));
    const totalProfit = totalIncome - totalExpense;
    const totalStock = state.monthly.reduce((sum, item) => sum + safeNumber(item.stock));

    document.getElementById('incomeTotal').textContent = formatRupiah(totalIncome);
    document.getElementById('expenseTotal').textContent = formatRupiah(totalExpense);
    document.getElementById('netTotal').textContent = formatRupiah(totalProfit);
    document.getElementById('stockTotal').textContent = totalStock;

    document.getElementById('guppyIncome').textContent = formatRupiah(state.fish.guppy.income);
    document.getElementById('guppyExpense').textContent = formatRupiah(state.fish.guppy.expense);
    document.getElementById('guppyStock').textContent = state.fish.guppy.stock;

    document.getElementById('mollyIncome').textContent = formatRupiah(state.fish.molly.income);
    document.getElementById('mollyExpense').textContent = formatRupiah(state.fish.molly.expense);
    document.getElementById('mollyStock').textContent = state.fish.molly.stock;

    document.getElementById('cupangIncome').textContent = formatRupiah(state.fish.cupang.income);
    document.getElementById('cupangExpense').textContent = formatRupiah(state.fish.cupang.expense);
    document.getElementById('cupangStock').textContent = state.fish.cupang.stock;

    const fishCards = document.querySelectorAll('.fish-card .pill');
    fishCards[0].textContent = formatRupiah(state.fish.guppy.income);
    fishCards[1].textContent = formatRupiah(state.fish.molly.income);
    fishCards[2].textContent = formatRupiah(state.fish.cupang.income);
}

function renderMonthlyTable() {
    analyticsTableBody.innerHTML = state.monthly
        .map((entry) => {
            const profit = getMonthlyProfit(entry);
            return `
        <tr>
          <td>${entry.month}</td>
          <td class="month-income">${formatRupiah(entry.income)}</td>
          <td class="month-expense">${formatRupiah(entry.expense)}</td>
          <td class="month-net">${formatRupiah(profit)}</td>
          <td>${entry.stock}</td>
        </tr>
      `;
        })
        .join('');
}

function renderDailyLedger() {
    const currentMonthKey = getCurrentMonthKey();
    const currentMonthEntries = state.daily
        .filter((entry) => normalizeDailyEntry(entry).date.startsWith(currentMonthKey.slice(0, 4)) && normalizeDailyEntry(entry).date.slice(5, 7) === currentMonthKey.slice(5, 7))
        .sort((a, b) => new Date(normalizeDailyEntry(a).date) - new Date(normalizeDailyEntry(b).date));

    if (!currentMonthEntries.length) {
        dailyLedgerBody.innerHTML = `
            <tr>
                <td colspan="4">Belum ada catatan harian untuk bulan ini.</td>
            </tr>
        `;
        return;
    }

    const totalIncome = currentMonthEntries.reduce((sum, entry) => {
        const normalized = normalizeDailyEntry(entry);
        return sum + fishNames.reduce((innerSum, fishName) => innerSum + safeNumber(normalized.items[fishName].income), 0);
    }, 0);
    const totalExpense = currentMonthEntries.reduce((sum, entry) => {
        const normalized = normalizeDailyEntry(entry);
        return sum + fishNames.reduce((innerSum, fishName) => innerSum + safeNumber(normalized.items[fishName].expense), 0);
    }, 0);
    const totalProfit = totalIncome - totalExpense;

    dailyLedgerBody.innerHTML = currentMonthEntries
        .map((entry) => {
            const normalized = normalizeDailyEntry(entry);
            const dayIncome = fishNames.reduce((sum, fishName) => sum + safeNumber(normalized.items[fishName].income), 0);
            const dayExpense = fishNames.reduce((sum, fishName) => sum + safeNumber(normalized.items[fishName].expense), 0);

            return `
        <tr>
          <td>${formatDateValue(normalized.date)}</td>
          <td class="month-income">${formatRupiah(dayIncome)}</td>
          <td class="month-expense">${formatRupiah(dayExpense)}</td>
          <td class="month-net">${formatRupiah(dayIncome - dayExpense)}</td>
        </tr>
      `;
        })
        .concat(`
        <tr>
          <td><strong>Total</strong></td>
          <td class="month-income"><strong>${formatRupiah(totalIncome)}</strong></td>
          <td class="month-expense"><strong>${formatRupiah(totalExpense)}</strong></td>
          <td class="month-net"><strong>${formatRupiah(totalProfit)}</strong></td>
        </tr>
      `)
        .join('');
}

function buildEditor() {
    const tabs = document.querySelectorAll('.editor-tab');
    tabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.editor === activeEditor);
    });

    if (activeEditor === 'daily') {
        const currentMonthKey = getCurrentMonthKey();
        const currentMonthEntries = state.daily
            .filter((entry) => normalizeDailyEntry(entry).date.startsWith(currentMonthKey.slice(0, 4)) && normalizeDailyEntry(entry).date.slice(5, 7) === currentMonthKey.slice(5, 7))
            .sort((a, b) => new Date(normalizeDailyEntry(a).date) - new Date(normalizeDailyEntry(b).date));

        const monthDates = currentMonthEntries.length
            ? currentMonthEntries
            : Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }, (_, index) => ({
                date: new Date(new Date().getFullYear(), new Date().getMonth(), index + 1).toISOString().split('T')[0],
                items: createEmptyDailyItems()
            }));

        editorForm.innerHTML = monthDates
            .map((entry) => {
                const normalized = normalizeDailyEntry(entry);
                return `
        <div class="field month-field">
          <label>${formatDateValue(normalized.date) || `Tanggal ${normalized.date}`}</label>
          <div class="item-daily-grid">
            ${fishNames.map((fishName) => `
              <div class="item-input-box">
                <span class="sub-label">${fishName.charAt(0).toUpperCase() + fishName.slice(1)}</span>
                <div class="item-input-stack">
                  <label>
                    <span>Pemasukan</span>
                    <input data-scope="daily-item" data-date="${normalized.date}" data-fish="${fishName}" data-field="income" type="number" value="${safeNumber(normalized.items[fishName].income)}" />
                  </label>
                  <label>
                    <span>Pengeluaran</span>
                    <input data-scope="daily-item" data-date="${normalized.date}" data-fish="${fishName}" data-field="expense" type="number" value="${safeNumber(normalized.items[fishName].expense)}" />
                  </label>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
            })
            .join('');
        return;
    }

    if (activeEditor === 'monthly') {
        editorForm.innerHTML = state.monthly
            .map((entry) => `
        <div class="field month-field">
          <label>${entry.month}</label>
          <div class="month-input-grid">
            <div>
              <span class="sub-label">Pemasukan</span>
              <input data-scope="monthly" data-month="${entry.month}" data-field="income" type="number" value="${safeNumber(entry.income)}" />
            </div>
            <div>
              <span class="sub-label">Pengeluaran</span>
              <input data-scope="monthly" data-month="${entry.month}" data-field="expense" type="number" value="${safeNumber(entry.expense)}" />
            </div>
            <div>
              <span class="sub-label">Stok</span>
              <input data-scope="monthly" data-month="${entry.month}" data-field="stock" type="number" value="${safeNumber(entry.stock)}" />
            </div>
          </div>
        </div>
      `)
            .join('');
        return;
    }

    const fish = state.fish[activeEditor];
    const fields = [
        { label: 'Pemasukan', field: 'income', value: fish.income },
        { label: 'Pengeluaran', field: 'expense', value: fish.expense },
        { label: 'Stok', field: 'stock', value: fish.stock }
    ];

    editorForm.innerHTML = fields
        .map((field) => `
      <div class="field">
        <label>${activeEditor.charAt(0).toUpperCase() + activeEditor.slice(1)} ${field.label}</label>
        <input data-scope="fish" data-fish="${activeEditor}" data-field="${field.field}" type="number" value="${safeNumber(field.value)}" />
      </div>
    `)
        .join('');
}

function applyLiveInputToState(input) {
    const scope = input.dataset.scope;
    const value = Math.max(0, safeNumber(input.value));

    if (scope === 'daily-item') {
        const date = input.dataset.date;
        const fishName = input.dataset.fish;
        const field = input.dataset.field;

        if (!date || !fishName || !field) return;

        const existingEntryIndex = state.daily.findIndex((entry) => normalizeDailyEntry(entry).date === date);
        const baseEntry = existingEntryIndex >= 0 ? normalizeDailyEntry(state.daily[existingEntryIndex]) : {
            date,
            items: createEmptyDailyItems()
        };

        const nextEntry = {
            date,
            items: {
                ...createEmptyDailyItems(),
                ...baseEntry.items,
                [fishName]: {
                    ...createEmptyDailyItems()[fishName],
                    ...(baseEntry.items?.[fishName] || {}),
                    [field]: value
                }
            }
        };

        if (existingEntryIndex >= 0) {
            state.daily[existingEntryIndex] = nextEntry;
        } else {
            state.daily.push(nextEntry);
        }

        state.daily = state.daily
            .map((entry) => normalizeDailyEntry(entry))
            .filter((entry) => entry.date);

        syncMonthlyTotalsFromDailyLedger();
        renderMonthlyTable();
        renderDailyLedger();
        updateSummaryCards();
        return;
    }

    if (scope === 'monthly') {
        const month = input.dataset.month;
        const field = input.dataset.field;
        const entry = state.monthly.find((item) => item.month === month);
        if (!entry) return;

        entry[field] = value;
        renderMonthlyTable();
        updateSummaryCards();
        return;
    }

    if (scope === 'fish') {
        const fishName = input.dataset.fish;
        const field = input.dataset.field;
        if (!state.fish[fishName]) return;

        state.fish[fishName][field] = value;
        updateSummaryCards();
    }
}

function saveCurrentEditor() {
    if (activeEditor === 'daily') {
        const dailyInputs = editorForm.querySelectorAll('[data-scope="daily-item"]');
        const updatedEntries = new Map();

        dailyInputs.forEach((input) => {
            const date = input.dataset.date;
            const fishName = input.dataset.fish;
            const field = input.dataset.field;
            const value = Math.max(0, safeNumber(input.value));

            if (!date || !fishName || !field) return;

            if (!updatedEntries.has(date)) {
                updatedEntries.set(date, {
                    date,
                    items: createEmptyDailyItems()
                });
            }

            const entry = updatedEntries.get(date);
            entry.items[fishName][field] = value;
        });

        state.daily = Array.from(updatedEntries.values())
            .filter((entry) => entry.date)
            .map((entry) => normalizeDailyEntry(entry));

        syncMonthlyTotalsFromDailyLedger();
        saveState();
        renderDailyLedger();
        renderMonthlyTable();
        updateSummaryCards();
        notify('Data harian berhasil disimpan');
        return;
    }

    if (activeEditor === 'monthly') {
        const monthInputs = editorForm.querySelectorAll('[data-scope="monthly"]');
        monthInputs.forEach((input) => {
            const month = input.dataset.month;
            const field = input.dataset.field;
            const entry = state.monthly.find((item) => item.month === month);
            if (!entry) return;

            const nextValue = Math.max(0, safeNumber(input.value));
            entry[field] = nextValue;
        });
    } else {
        const fishInputs = editorForm.querySelectorAll('[data-scope="fish"]');
        fishInputs.forEach((input) => {
            const fishName = input.dataset.fish;
            const field = input.dataset.field;
            if (!state.fish[fishName]) return;

            const nextValue = Math.max(0, safeNumber(input.value));
            state.fish[fishName][field] = nextValue;
        });
    }

    state.monthly = state.monthly.map((entry) => ({
        ...entry,
        income: Math.max(0, safeNumber(entry.income)),
        expense: Math.max(0, safeNumber(entry.expense)),
        stock: Math.max(0, safeNumber(entry.stock))
    }));

    saveState();
    renderMonthlyTable();
    renderDailyLedger();
    updateSummaryCards();
    notify('Data berhasil disimpan');
}

function generateWhatsAppMessage() {
    const totalIncome = state.monthly.reduce((sum, item) => sum + safeNumber(item.income), 0);
    const totalExpense = state.monthly.reduce((sum, item) => sum + safeNumber(item.expense), 0);
    const totalProfit = totalIncome - totalExpense;

    const summary = [
        'Laporan Analitik Bulanan Chommell Farm',
        `Pemasukan: ${formatRupiah(totalIncome)}`,
        `Pengeluaran: ${formatRupiah(totalExpense)}`,
        `Keuntungan: ${formatRupiah(totalProfit)}`,
        `Guppy: ${state.fish.guppy.stock} ekor | ${formatRupiah(state.fish.guppy.income)} masuk | ${formatRupiah(state.fish.guppy.expense)} keluar`,
        `Molly: ${state.fish.molly.stock} ekor | ${formatRupiah(state.fish.molly.income)} masuk | ${formatRupiah(state.fish.molly.expense)} keluar`,
        `Cupang: ${state.fish.cupang.stock} ekor | ${formatRupiah(state.fish.cupang.income)} masuk | ${formatRupiah(state.fish.cupang.expense)} keluar`,
        '',
        'Data berasal dari input bulanan yang terdokumentasi.'
    ].join('\n');

    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(summary)}`;
    window.open(url, '_blank');
}

function resetData() {
    localStorage.removeItem(STORAGE_KEY);
    const freshData = cloneData(defaultData);
    state.monthly = freshData.monthly;
    state.fish = freshData.fish;
    state.daily = freshData.daily;
    syncMonthlyTotalsFromDailyLedger();
    saveState();
    renderMonthlyTable();
    renderDailyLedger();
    updateSummaryCards();
    buildEditor();
    notify('Semua data berhasil direset');
}

function exportSummary() {
    const buildMonthBlocks = (monthName) => {
        const monthIndex = monthLabels.indexOf(monthName);
        if (monthIndex < 0) return '';

        const year = new Date().getFullYear();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const blocks = [];

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dateValue = new Date(year, monthIndex, day).toISOString().split('T')[0];
            const record = state.daily.find((entry) => normalizeDailyEntry(entry).date === dateValue);
            const normalized = normalizeDailyEntry(record || { date: dateValue, items: createEmptyDailyItems() });
            const dayIncome = fishNames.reduce((sum, fishName) => sum + safeNumber(normalized.items[fishName].income), 0);
            const dayExpense = fishNames.reduce((sum, fishName) => sum + safeNumber(normalized.items[fishName].expense), 0);
            const dayProfit = dayIncome - dayExpense;

            blocks.push(`
                <td style="border:1px solid #666; width:120px; padding:6px; vertical-align:top; background:#ffffff;">
                    <div style="font-size:10px; font-weight:bold; color:#1f2937; text-align:center; margin-bottom:6px;">${day}</div>
                    <div style="font-size:9px; line-height:1.5; color:#1f2937;">
                        <div>P: ${formatRupiah(dayIncome)}</div>
                        <div>O: ${formatRupiah(dayExpense)}</div>
                        <div>Keu: ${formatRupiah(dayProfit)}</div>
                    </div>
                </td>
            `);
        }

        const rows = [];
        for (let index = 0; index < blocks.length; index += 5) {
            rows.push(`<tr>${blocks.slice(index, index + 5).join('')}</tr>`);
        }

        return `
            <table style="border-collapse:collapse; width:100%; margin-bottom:18px;">
                <tr>
                    <td colspan="5" style="padding:10px; font-weight:bold; font-size:14px; text-align:center; background:#dfeaf7; border:1px solid #666; color:#111827;">${monthName}</td>
                </tr>
                ${rows.join('')}
            </table>
        `;
    };

    const htmlTable = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8" />
            <style>
                body { font-family: Arial, sans-serif; margin: 0; }
                table { border-collapse: collapse; }
                td { border: 1px solid #666; }
            </style>
        </head>
        <body>
            <div style="padding:16px; background:#f6f9fc;">
                <div style="font-size:18px; font-weight:bold; margin-bottom:12px; color:#111827;">Ringkasan Keuangan Chommell Farm</div>
                ${monthLabels.map(buildMonthBlocks).join('')}
            </div>
        </body>
        </html>
    `;

    const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ringkasan-keuangan-farm.xls';
    link.click();
    URL.revokeObjectURL(link.href);
    notify('File Excel berhasil diekspor');
}

document.getElementById('saveDataBtn').addEventListener('click', () => {
    vibrateAction();
    saveCurrentEditor();
});

document.getElementById('sendWhatsAppBtn').addEventListener('click', () => {
    vibrateAction();
    generateWhatsAppMessage();
    notify('Membuka WhatsApp');
});

document.getElementById('downloadSummaryBtn').addEventListener('click', () => {
    vibrateAction();
    exportSummary();
});

document.getElementById('resetDataBtn').addEventListener('click', () => {
    vibrateAction();
    resetData();
});

document.querySelectorAll('.editor-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        vibrateAction();
        activeEditor = tab.dataset.editor;
        buildEditor();
    });
});

editorForm.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.dataset.scope) return;

    applyLiveInputToState(input);
});

renderMonthlyTable();
renderDailyLedger();
updateSummaryCards();
buildEditor();
