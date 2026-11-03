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
        fish: Object.fromEntries(fishNames.map((name) => [name, {
            stock: 0,
            pricePerHundred: 0,
            pricePerFish: 0
        }])),
        daily: [],
        transactions: [],
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
            {
                stock: Math.max(0, safeNumber(parsed.fish?.[name]?.stock)),
                pricePerHundred: Math.max(0, safeNumber(parsed.fish?.[name]?.pricePerHundred)),
                pricePerFish: Math.max(0, safeNumber(parsed.fish?.[name]?.pricePerFish ?? safeNumber(parsed.fish?.[name]?.pricePerHundred) / 100))
            }
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
            transactions: Array.isArray(parsed.transactions)
                ? parsed.transactions.filter((transaction) => transaction && fishNames.includes(transaction.fish) && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date))
                    .map((transaction, index) => ({
                        id: String(transaction.id || `tx-${Date.now()}-${index}`),
                        date: transaction.date,
                        fish: transaction.fish,
                        sold: Math.max(0, safeNumber(transaction.sold)),
                        unitPrice: Math.max(0, safeNumber(transaction.unitPrice)),
                        income: Math.max(0, safeNumber(transaction.income)),
                        expense: Math.max(0, safeNumber(transaction.expense))
                    }))
                : [],
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

function reportEntries() {
    const byDate = new Map(state.daily.map((entry) => [entry.date, normalizeDailyEntry(entry)]));
    state.transactions.forEach((transaction) => {
        if (!byDate.has(transaction.date)) {
            byDate.set(transaction.date, { date: transaction.date, items: createEmptyDailyItems() });
        }
        const item = byDate.get(transaction.date).items[transaction.fish];
        item.income += transaction.income;
        item.expense += transaction.expense;
        item.sold += transaction.sold;
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function currentMonthEntries() {
    const currentMonth = localDateKey(new Date()).slice(0, 7);
    return reportEntries().filter((entry) => entry.date.startsWith(currentMonth));
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
    const priceIds = {
        guppy: ['guppyPriceHundred', 'guppyPriceEach'],
        molly: ['mollyPriceHundred', 'mollyPriceEach'],
        cupang: ['cupangPriceHundred', 'cupangPriceEach'],
        cawangWhite: ['cawangWhitePriceHundred', 'cawangWhitePriceEach'],
        cawangBlack: ['cawangBlackPriceHundred', 'cawangBlackPriceEach']
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
        const [hundredId, eachId] = priceIds[name];
        document.getElementById(hundredId).textContent = formatRupiah(state.fish[name].pricePerHundred);
        document.getElementById(eachId).textContent = formatRupiah(state.fish[name].pricePerFish);
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
        const entries = reportEntries().filter((entry) => {
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

function getRecordedYears() {
    const years = new Set(reportEntries().map((entry) => Number(entry.date.slice(0, 4))));
    years.add(new Date().getFullYear());
    return Array.from(years).filter(Number.isFinite).sort((a, b) => b - a);
}

function renderAnnualRecap() {
    const select = document.getElementById('annualYearSelect');
    const years = getRecordedYears();
    const selectedYear = Number(select.value) || new Date().getFullYear();
    select.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
    select.value = String(years.includes(selectedYear) ? selectedYear : years[0]);
    const entries = reportEntries();
    document.getElementById('annualComparisonBody').innerHTML = years.map((year) => {
        const totals = getDailyTotals(entries.filter((entry) => entry.date.startsWith(`${year}-`)));
        return `<tr>
            <td>${year}</td>
            <td class="month-income">${formatRupiah(totals.income)}</td>
            <td class="month-expense">${formatRupiah(totals.expense)}</td>
            <td class="month-net">${formatRupiah(totals.income - totals.expense)}</td>
            <td>${totals.sold.toLocaleString('id-ID')} ekor</td>
        </tr>`;
    }).join('');

    const year = Number(select.value);
    const headers = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const entriesByDate = new Map(entries.filter((entry) => entry.date.startsWith(`${year}-`)).map((entry) => [entry.date, entry]));
    document.getElementById('annualCalendar').innerHTML = monthLabels.map((month, monthIndex) => {
        const days = new Date(year, monthIndex + 1, 0).getDate();
        const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
        const cells = Array.from({ length: offset }, () => '<div class="calendar-cell calendar-empty" aria-hidden="true"></div>');
        for (let day = 1; day <= days; day += 1) {
            const date = localDateKey(new Date(year, monthIndex, day));
            const totals = getDailyTotals(entriesByDate.has(date) ? [entriesByDate.get(date)] : []);
            cells.push(`<div class="calendar-cell${totals.income || totals.expense || totals.sold ? ' has-activity' : ''}">
                <strong>${day}</strong>
                <span>Masuk ${formatRupiah(totals.income)}</span>
                <span>Keluar ${formatRupiah(totals.expense)}</span>
                <span>Untung ${formatRupiah(totals.income - totals.expense)}</span>
                <span>Terjual ${totals.sold}</span>
            </div>`);
        }
        return `<article class="calendar-month">
            <h4>${month} ${year}</h4>
            <div class="calendar-grid">${headers.map((header) => `<strong class="calendar-weekday">${header}</strong>`).join('')}${cells.join('')}</div>
        </article>`;
    }).join('');
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

function renderTransactions() {
    const list = document.getElementById('transactionList');
    if (!state.transactions.length) {
        list.innerHTML = '<p class="empty-customers">Belum ada transaksi. Tambahkan transaksi di atas.</p>';
        return;
    }
    list.innerHTML = state.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).map((transaction) => `
        <form class="transaction-row" data-transaction-id="${escapeHTML(transaction.id)}">
            <label class="field">Tanggal<input name="date" type="date" required value="${transaction.date}" /></label>
            <label class="field">Ikan<select name="fish">${fishNames.map((name) => `<option value="${name}"${transaction.fish === name ? ' selected' : ''}>${fishLabels[name]}</option>`).join('')}</select></label>
            <label class="field">Terjual<input name="sold" type="number" min="0" step="1" required value="${transaction.sold}" /></label>
            <label class="field">Harga / ekor<input name="unitPrice" type="number" min="0" step="any" required value="${transaction.unitPrice}" /></label>
            <label class="field">Pendapatan<input name="income" type="number" min="0" step="1" required value="${transaction.income}" /></label>
            <label class="field">Pengeluaran<input name="expense" type="number" min="0" step="1" required value="${transaction.expense}" /></label>
            <div class="customer-actions">
                <button class="mini-btn" type="submit">Simpan</button>
                <button class="ghost-btn delete-transaction-btn" type="button" data-id="${escapeHTML(transaction.id)}">Hapus</button>
            </div>
        </form>
    `).join('');
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
        <label for="fishPriceHundred">Harga per 100 ekor (Rp)</label>
        <input id="fishPriceHundred" data-scope="fish" data-fish="${fishName}" data-field="pricePerHundred" type="number" min="0" step="1" value="${fish.pricePerHundred}" />
        <label for="fishPriceEach">Harga perekor (Rp)</label>
        <input id="fishPriceEach" data-scope="fish" data-fish="${fishName}" data-field="pricePerFish" type="number" min="0" step="any" value="${fish.pricePerFish}" />
    </div>
    <p class="editor-help">Pemasukan transaksi dihitung dari jumlah terjual dan harga perekor. Harga per 100 ekor dan perekor saling mengikuti.</p>`;
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
        editorForm.querySelectorAll('[data-scope="fish"]').forEach((input) => {
            const field = input.dataset.field;
            const value = Math.max(0, safeNumber(input.value));
            if (field === 'stock') state.fish[activeEditor].stock = Math.floor(value);
            if (field === 'pricePerHundred') {
                state.fish[activeEditor].pricePerHundred = value;
                state.fish[activeEditor].pricePerFish = value / 100;
            }
            if (field === 'pricePerFish') {
                state.fish[activeEditor].pricePerFish = value;
                state.fish[activeEditor].pricePerHundred = value * 100;
            }
        });
    }
    saveState();
    renderMonthlyTable();
    renderDailyLedger();
    renderAnnualRecap();
    updateSummaryCards();
    notify('Data berhasil disimpan');
}

function renderCustomers() {
    const customerList = document.getElementById('customerList');
    if (!state.customers.length) {
        customerList.innerHTML = '<p class="empty-customers">Belum ada pelanggan. Tambahkan nama toko dan alamatnya.</p>';
        return;
    }
    customerList.innerHTML = state.customers.map((customer, index) => {
        const mapQuery = encodeURIComponent(`${customer.name} ${customer.address}`);
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
        const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(customer.address)}&output=embed`;
        return `<article class="customer-card">
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
            <a class="map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer">Buka alamat di Google Maps</a>
            <iframe class="customer-map" src="${embedUrl}" title="Peta ${escapeHTML(customer.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </article>`;
    }).join('');
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
    state.transactions = freshData.transactions;
    state.customers = freshData.customers;
    state.queueCounter = freshData.queueCounter;
    state.queueDate = freshData.queueDate;
    saveState();
    renderMonthlyTable();
    renderDailyLedger();
    renderAnnualRecap();
    updateSummaryCards();
    renderEditor();
    renderTransactions();
    renderCustomers();
    document.getElementById('queueTicket').hidden = true;
    notify('Semua data berhasil direset');
}

function exportSummary() {
    const years = getRecordedYears();
    const entries = reportEntries();
    const cellStyle = 'border:1px solid #cbd5e1;padding:8px;text-align:left;';
    const header = (labels) => labels.map((label) => `<th style="${cellStyle};background:#e8f1eb">${label}</th>`).join('');
    const monthlyRows = years.flatMap((year) => monthLabels.map((month, index) => {
        const totals = getDailyTotals(entries.filter((entry) => {
            const date = new Date(`${entry.date}T00:00:00`);
            return date.getFullYear() === year && date.getMonth() === index;
        }));
        return `<tr><td style="${cellStyle}">${year}</td><td style="${cellStyle}">${month}</td><td style="${cellStyle}">${totals.income}</td><td style="${cellStyle}">${totals.expense}</td><td style="${cellStyle}">${totals.income - totals.expense}</td><td style="${cellStyle}">${totals.sold}</td></tr>`;
    }));
    const dailyRows = entries.map((entry) => {
        const totals = getDailyTotals([entry]);
        return `<tr>${[
            formatDateValue(entry.date),
            ...fishNames.map((name) => entry.items[name].income),
            ...fishNames.map((name) => entry.items[name].expense),
            ...fishNames.map((name) => entry.items[name].sold),
            totals.income, totals.expense, totals.income - totals.expense, totals.sold
        ].map((value) => `<td style="${cellStyle}">${value}</td>`).join('')}</tr>`;
    });
    const transactionRows = state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((transaction) => `
        <tr>${[
            formatDateValue(transaction.date),
            fishLabels[transaction.fish],
            transaction.sold,
            transaction.unitPrice,
            transaction.income,
            transaction.expense,
            transaction.income - transaction.expense
        ].map((value) => `<td style="${cellStyle}">${value}</td>`).join('')}</tr>
    `);
    const fishHeadings = [
        ...fishNames.map((name) => `Pemasukan ${fishLabels[name]} (Rp)`),
        ...fishNames.map((name) => `Pengeluaran ${fishLabels[name]} (Rp)`),
        ...fishNames.map((name) => `Terjual ${fishLabels[name]} (ekor)`)
    ];
    const tableStyle = 'border-collapse:collapse;width:100%;margin-bottom:24px;';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;color:#173b32}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left}caption{text-align:left;font-size:18px;font-weight:bold;padding:10px}</style></head><body>
        <table style="${tableStyle}"><caption>Rekap keuangan tahunan Chommell Farm</caption><thead><tr>${header(['Tahun', 'Bulan', 'Pemasukan (Rp)', 'Pengeluaran (Rp)', 'Keuntungan (Rp)', 'Terjual (ekor)'])}</tr></thead><tbody>${monthlyRows.join('')}</tbody></table>
        <table style="${tableStyle}"><caption>Rekap keuangan per tanggal</caption><thead><tr>${header(['Tanggal', ...fishHeadings, 'Total pemasukan (Rp)', 'Total pengeluaran (Rp)', 'Keuntungan (Rp)', 'Total terjual (ekor)'])}</tr></thead><tbody>${dailyRows.join('')}</tbody></table>
        <table style="${tableStyle}"><caption>Rincian transaksi</caption><thead><tr>${header(['Tanggal', 'Jenis ikan', 'Jumlah terjual (ekor)', 'Harga perekor (Rp)', 'Pendapatan (Rp)', 'Pengeluaran (Rp)', 'Keuntungan (Rp)'])}</tr></thead><tbody>${transactionRows.join('')}</tbody></table></body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chommell-farm-rekap-${years[0]}-${years[years.length - 1]}.xls`;
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
document.getElementById('annualRecapBtn').addEventListener('click', () => {
    const annualPanel = document.getElementById('annualPanel');
    annualPanel.hidden = !annualPanel.hidden;
    if (!annualPanel.hidden) {
        renderAnnualRecap();
        annualPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('annualRecapBtn').textContent = 'Tutup rekap tahunan';
    } else {
        document.getElementById('annualRecapBtn').textContent = 'Rekap tahunan';
    }
});
document.getElementById('annualYearSelect').addEventListener('change', renderAnnualRecap);
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
        if (event.target.dataset.field === 'pricePerHundred') {
            editorForm.querySelector('[data-field="pricePerFish"]').value = String(safeNumber(event.target.value) / 100);
        }
        if (event.target.dataset.field === 'pricePerFish') {
            editorForm.querySelector('[data-field="pricePerHundred"]').value = String(safeNumber(event.target.value) * 100);
        }
        saveCurrentEditor();
    }
});
const transactionDateInput = document.getElementById('transactionDate');
const transactionFishInput = document.getElementById('transactionFish');
const transactionSoldInput = document.getElementById('transactionSold');
const transactionUnitPriceInput = document.getElementById('transactionUnitPrice');
const transactionIncomeInput = document.getElementById('transactionIncome');
transactionDateInput.value = localDateKey(new Date());
transactionUnitPriceInput.value = String(state.fish[transactionFishInput.value].pricePerFish);
const updateTransactionEstimate = () => {
    transactionIncomeInput.value = String(
        Math.round(safeNumber(transactionSoldInput.value) * safeNumber(transactionUnitPriceInput.value))
    );
};
transactionFishInput.addEventListener('change', () => {
    transactionUnitPriceInput.value = String(state.fish[transactionFishInput.value].pricePerFish);
    updateTransactionEstimate();
});
transactionSoldInput.addEventListener('input', updateTransactionEstimate);
transactionUnitPriceInput.addEventListener('input', updateTransactionEstimate);
document.getElementById('transactionForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const date = String(formData.get('date') || '');
    const fish = String(formData.get('fish') || '');
    if (!date || !fishNames.includes(fish)) return;
    state.transactions.push({
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        fish,
        sold: Math.max(0, Math.floor(safeNumber(formData.get('sold')))),
        unitPrice: Math.max(0, safeNumber(formData.get('unitPrice'))),
        income: Math.max(0, safeNumber(formData.get('income'))),
        expense: Math.max(0, safeNumber(formData.get('expense')))
    });
    saveState();
    renderTransactions();
    renderDailyLedger();
    renderMonthlyTable();
    renderAnnualRecap();
    updateSummaryCards();
    event.currentTarget.reset();
    transactionDateInput.value = localDateKey(new Date());
    transactionFishInput.value = 'guppy';
    transactionUnitPriceInput.value = String(state.fish.guppy.pricePerFish);
    transactionSoldInput.value = '0';
    transactionIncomeInput.value = '0';
    document.getElementById('transactionExpense').value = '0';
    notify('Transaksi berhasil ditambahkan ke rekap tanggal');
});
document.getElementById('transactionList').addEventListener('submit', (event) => {
    if (!event.target.matches('.transaction-row')) return;
    event.preventDefault();
    const transaction = state.transactions.find((item) => item.id === event.target.dataset.transactionId);
    if (!transaction) return;
    const formData = new FormData(event.target);
    const fish = String(formData.get('fish') || '');
    const date = String(formData.get('date') || '');
    if (!fishNames.includes(fish) || !date) return;
    Object.assign(transaction, {
        date,
        fish,
        sold: Math.max(0, Math.floor(safeNumber(formData.get('sold')))),
        unitPrice: Math.max(0, safeNumber(formData.get('unitPrice'))),
        income: Math.max(0, safeNumber(formData.get('income'))),
        expense: Math.max(0, safeNumber(formData.get('expense')))
    });
    saveState();
    renderTransactions();
    renderDailyLedger();
    renderMonthlyTable();
    renderAnnualRecap();
    updateSummaryCards();
    notify('Transaksi berhasil diperbarui');
});
document.getElementById('transactionList').addEventListener('click', (event) => {
    const button = event.target.closest('.delete-transaction-btn');
    if (!button) return;
    const transaction = state.transactions.find((item) => item.id === button.dataset.id);
    if (!transaction || !window.confirm('Hapus transaksi ini? Rekap harian dan tahunan akan diperbarui.')) return;
    state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
    saveState();
    renderTransactions();
    renderDailyLedger();
    renderMonthlyTable();
    renderAnnualRecap();
    updateSummaryCards();
    notify('Transaksi berhasil dihapus');
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
document.getElementById('toggleCustomerDirectory').addEventListener('click', () => {
    const content = document.getElementById('customerDirectoryContent');
    content.hidden = !content.hidden;
    document.getElementById('toggleCustomerDirectory').textContent = content.hidden
        ? 'Daftar alamat toko'
        : 'Tutup daftar alamat';
    if (!content.hidden) content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

renderMonthlyTable();
renderDailyLedger();
renderAnnualRecap();
updateSummaryCards();
renderEditor();
renderTransactions();
renderCustomers();
if (sessionStorage.getItem(LOGIN_KEY) === 'true') {
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('dashboardApp').hidden = false;
}
