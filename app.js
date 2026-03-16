// Initialize Dexie database
const db = new Dexie('SchoolInventory');
db.version(1).stores({
    items: 'barcode, name, category, location, quantity, available, borrowedCount',
    transactions: '++id, barcode, itemName, borrower, borrowDate, dueDate, returnDate, status' // status: borrowed/returned
});

// DOM elements
const views = {
    items: document.getElementById('itemsView'),
    scan: document.getElementById('scanView'),
    add: document.getElementById('addView'),
    history: document.getElementById('historyView')
};
const tabs = {
    items: document.getElementById('tabItems'),
    scan: document.getElementById('tabScan'),
    add: document.getElementById('tabAdd'),
    history: document.getElementById('tabHistory')
};
const itemsListDiv = document.getElementById('itemsList');
const historyListDiv = document.getElementById('historyList');
const searchInput = document.getElementById('searchItems');
const scannerDiv = document.getElementById('scanner');
const stopScanBtn = document.getElementById('stopScan');
const itemForm = document.getElementById('itemForm');
const modal = document.getElementById('itemModal');
const modalContent = document.getElementById('modalContent');
const modalBorrow = document.getElementById('modalBorrow');
const modalReturn = document.getElementById('modalReturn');
const modalClose = document.getElementById('modalClose');

let currentItemBarcode = null; // for modal
let html5QrcodeScanner = null;

// ---------- Helper: Format date as YYYY-MM-DD ----------
function todayString() {
    return new Date().toISOString().split('T')[0];
}

// ---------- Show view ----------
function showView(viewName) {
    Object.keys(views).forEach(v => views[v].classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    // Update tab styles
    Object.keys(tabs).forEach(t => tabs[t].classList.remove('border-green-600', 'text-green-600'));
    tabs[viewName].classList.add('border-green-600', 'text-green-600');
}

// ---------- Render items list ----------
async function renderItems(filter = '') {
    let items = await db.items.toArray();
    if (filter) {
        filter = filter.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(filter) || i.barcode.includes(filter));
    }
    if (items.length === 0) {
        itemsListDiv.innerHTML = '<p class="text-gray-500 text-center">No items found. Add some!</p>';
        return;
    }
    let html = '';
    items.forEach(item => {
        const status = item.available > 0 ? 'Available' : 'All borrowed';
        const statusColor = item.available > 0 ? 'text-green-600' : 'text-red-600';
        html += `
            <div class="border p-3 rounded cursor-pointer hover:bg-gray-50 item-row" data-barcode="${item.barcode}">
                <div class="font-semibold">${item.name}</div>
                <div class="text-sm text-gray-600">Barcode: ${item.barcode} | Location: ${item.location || '—'}</div>
                <div class="text-sm">Available: <span class="${statusColor}">${item.available}/${item.quantity}</span></div>
            </div>
        `;
    });
    itemsListDiv.innerHTML = html;
    // Attach click event to each row
    document.querySelectorAll('.item-row').forEach(row => {
        row.addEventListener('click', () => showItemModal(row.dataset.barcode));
    });
}

// ---------- Render transaction history ----------
async function renderHistory() {
    const transactions = await db.transactions.reverse().toArray(); // newest first
    if (transactions.length === 0) {
        historyListDiv.innerHTML = '<p class="text-gray-500 text-center">No transactions yet.</p>';
        return;
    }
    let html = '';
    transactions.forEach(t => {
        const statusText = t.returnDate ? `Returned on ${t.returnDate}` : `Borrowed until ${t.dueDate}`;
        html += `
            <div class="border p-2 rounded text-sm">
                <div><span class="font-semibold">${t.itemName}</span> (${t.barcode})</div>
                <div>Borrower: ${t.borrower} on ${t.borrowDate}</div>
                <div>Due: ${t.dueDate} — ${statusText}</div>
            </div>
        `;
    });
    historyListDiv.innerHTML = html;
}

// ---------- Show item detail modal ----------
async function showItemModal(barcode) {
    currentItemBarcode = barcode;
    const item = await db.items.get(barcode);
    if (!item) return;

    const borrowedCount = item.quantity - (item.available || 0);
    modalContent.innerHTML = `
        <p><strong>Name:</strong> ${item.name}</p>
        <p><strong>Barcode:</strong> ${item.barcode}</p>
        <p><strong>Category:</strong> ${item.category || '—'}</p>
        <p><strong>Location:</strong> ${item.location || '—'}</p>
        <p><strong>Total:</strong> ${item.quantity}</p>
        <p><strong>Available:</strong> ${item.available}</p>
        <p><strong>Borrowed:</strong> ${borrowedCount}</p>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// ---------- Borrow item ----------
async function borrowItem(barcode) {
    const item = await db.items.get(barcode);
    if (!item || item.available <= 0) {
        alert('Item not available for borrowing.');
        return;
    }
    const borrower = prompt('Enter borrower name:');
    if (!borrower) return;
    const dueDate = prompt('Enter due date (YYYY-MM-DD):', todayString());
    if (!dueDate) return;

    // Update item available count
    item.available -= 1;
    await db.items.put(item);

    // Record transaction
    await db.transactions.add({
        barcode: item.barcode,
        itemName: item.name,
        borrower,
        borrowDate: todayString(),
        dueDate,
        returnDate: null,
        status: 'borrowed'
    });

    alert('Item borrowed successfully.');
    renderItems(searchInput.value);
    renderHistory();
    modal.classList.add('hidden');
}

// ---------- Return item ----------
async function returnItem(barcode) {
    const item = await db.items.get(barcode);
    if (!item) return;

    // Find the oldest borrowed transaction for this item without return date
    const transaction = await db.transactions
        .where('barcode').equals(barcode)
        .and(t => t.returnDate === null)
        .first();
    if (!transaction) {
        alert('No borrowed record found for this item.');
        return;
    }

    // Update item available count
    item.available += 1;
    await db.items.put(item);

    // Update transaction
    transaction.returnDate = todayString();
    transaction.status = 'returned';
    await db.transactions.put(transaction);

    alert('Item returned successfully.');
    renderItems(searchInput.value);
    renderHistory();
    modal.classList.add('hidden');
}

// ---------- Initialize scanner ----------
function startScanner() {
    html5QrcodeScanner = new Html5Qrcode("scanner");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        onScanSuccess,
        onScanError
    ).catch(err => alert('Camera error: ' + err));
}

function onScanSuccess(decodedText) {
    // Stop scanner
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            showView('items');
            // Look up item
            db.items.get(decodedText).then(item => {
                if (item) {
                    showItemModal(decodedText);
                } else {
                    if (confirm(`Barcode ${decodedText} not found. Add new item?`)) {
                        document.getElementById('barcode').value = decodedText;
                        showView('add');
                    }
                }
            });
        });
    }
}

function onScanError(error) {
    // Ignore, just keep scanning
}

// ---------- Stop scanner ----------
function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            showView('items');
        });
    }
}

// ---------- Event Listeners ----------
tabs.items.addEventListener('click', () => {
    showView('items');
    renderItems(searchInput.value);
});
tabs.scan.addEventListener('click', () => {
    showView('scan');
    startScanner();
});
tabs.add.addEventListener('click', () => {
    showView('add');
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
});
tabs.history.addEventListener('click', () => {
    showView('history');
    renderHistory();
});

searchInput.addEventListener('input', (e) => renderItems(e.target.value));

stopScanBtn.addEventListener('click', stopScanner);

// Save item form
itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const barcode = document.getElementById('barcode').value.trim();
    const name = document.getElementById('name').value.trim();
    const category = document.getElementById('category').value.trim();
    const location = document.getElementById('location').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value, 10);

    if (!barcode || !name) {
        alert('Barcode and Name are required.');
        return;
    }

    const existing = await db.items.get(barcode);
    if (existing && !confirm('Item with this barcode exists. Update it?')) {
        return;
    }

    const item = {
        barcode,
        name,
        category,
        location,
        quantity,
        available: existing ? existing.available : quantity // if new, all available
    };
    if (existing) {
        // If quantity changed, adjust available accordingly
        const diff = quantity - existing.quantity;
        item.available = (existing.available || 0) + diff;
        if (item.available < 0) item.available = 0;
    }
    await db.items.put(item);
    alert('Item saved.');
    showView('items');
    renderItems('');
});

modalClose.addEventListener('click', () => {
    modal.classList.add('hidden');
});
modalBorrow.addEventListener('click', () => {
    if (currentItemBarcode) borrowItem(currentItemBarcode);
});
modalReturn.addEventListener('click', () => {
    if (currentItemBarcode) returnItem(currentItemBarcode);
});

// Close modal if click outside content
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
});

// Initial render
renderItems();

// ---------- PWA: Register Service Worker ----------
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('SW registration failed', err));
}