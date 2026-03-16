// Initialize Dexie database
const db = new Dexie('SimpleInventory');
db.version(1).stores({
    items: 'id, name, category, location, quantity, available',
    transactions: '++id, itemId, itemName, borrower, borrowDate, dueDate, returnDate, status'
});

// DOM elements
const views = {
    items: document.getElementById('itemsView'),
    add: document.getElementById('addView'),
    history: document.getElementById('historyView')
};
const tabs = {
    items: document.getElementById('tabItems'),
    add: document.getElementById('tabAdd'),
    history: document.getElementById('tabHistory')
};
const itemsListDiv = document.getElementById('itemsList');
const historyListDiv = document.getElementById('historyList');
const searchInput = document.getElementById('searchItems');
const itemForm = document.getElementById('itemForm');
const modal = document.getElementById('itemModal');
const modalContent = document.getElementById('modalContent');
const modalBorrow = document.getElementById('modalBorrow');
const modalReturn = document.getElementById('modalReturn');
const modalClose = document.getElementById('modalClose');

let currentItemId = null;

// Helper: today's date as YYYY-MM-DD
function todayString() {
    return new Date().toISOString().split('T')[0];
}

// Show selected view
function showView(viewName) {
    Object.keys(views).forEach(v => views[v].classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    Object.keys(tabs).forEach(t => tabs[t].classList.remove('border-green-600', 'text-green-600'));
    tabs[viewName].classList.add('border-green-600', 'text-green-600');
}

// Render items list
async function renderItems(filter = '') {
    let items = await db.items.toArray();
    if (filter) {
        filter = filter.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(filter) || i.id.toLowerCase().includes(filter));
    }
    if (items.length === 0) {
        itemsListDiv.innerHTML = '<p class="text-gray-500 text-center">No items yet. Add some!</p>';
        return;
    }
    let html = '';
    items.forEach(item => {
        const status = item.available > 0 ? 'Available' : 'All borrowed';
        const statusColor = item.available > 0 ? 'text-green-600' : 'text-red-600';
        html += `
            <div class="border p-3 rounded cursor-pointer hover:bg-gray-50 item-row" data-id="${item.id}">
                <div class="font-semibold">${item.name}</div>
                <div class="text-sm text-gray-600">ID: ${item.id} | Location: ${item.location || '—'}</div>
                <div class="text-sm">Available: <span class="${statusColor}">${item.available}/${item.quantity}</span></div>
            </div>
        `;
    });
    itemsListDiv.innerHTML = html;
    document.querySelectorAll('.item-row').forEach(row => {
        row.addEventListener('click', () => showItemModal(row.dataset.id));
    });
}

// Render transaction history
async function renderHistory() {
    const transactions = await db.transactions.reverse().toArray();
    if (transactions.length === 0) {
        historyListDiv.innerHTML = '<p class="text-gray-500 text-center">No transactions yet.</p>';
        return;
    }
    let html = '';
    transactions.forEach(t => {
        const statusText = t.returnDate ? `Returned on ${t.returnDate}` : `Borrowed until ${t.dueDate}`;
        html += `
            <div class="border p-2 rounded text-sm">
                <div><span class="font-semibold">${t.itemName}</span> (${t.itemId})</div>
                <div>Borrower: ${t.borrower} on ${t.borrowDate}</div>
                <div>Due: ${t.dueDate} — ${statusText}</div>
            </div>
        `;
    });
    historyListDiv.innerHTML = html;
}

// Show item detail modal
async function showItemModal(id) {
    currentItemId = id;
    const item = await db.items.get(id);
    if (!item) return;

    const borrowedCount = item.quantity - item.available;
    modalContent.innerHTML = `
        <p><strong>Name:</strong> ${item.name}</p>
        <p><strong>ID:</strong> ${item.id}</p>
        <p><strong>Category:</strong> ${item.category || '—'}</p>
        <p><strong>Location:</strong> ${item.location || '—'}</p>
        <p><strong>Total:</strong> ${item.quantity}</p>
        <p><strong>Available:</strong> ${item.available}</p>
        <p><strong>Borrowed:</strong> ${borrowedCount}</p>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Borrow item
async function borrowItem(id) {
    const item = await db.items.get(id);
    if (!item || item.available <= 0) {
        alert('Item not available for borrowing.');
        return;
    }
    const borrower = prompt('Enter borrower name:');
    if (!borrower) return;
    const dueDate = prompt('Enter due date (YYYY-MM-DD):', todayString());
    if (!dueDate) return;

    item.available -= 1;
    await db.items.put(item);

    await db.transactions.add({
        itemId: item.id,
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

// Return item
async function returnItem(id) {
    const item = await db.items.get(id);
    if (!item) return;

    const transaction = await db.transactions
        .where('itemId').equals(id)
        .and(t => t.returnDate === null)
        .first();
    if (!transaction) {
        alert('No borrowed record found for this item.');
        return;
    }

    item.available += 1;
    await db.items.put(item);

    transaction.returnDate = todayString();
    transaction.status = 'returned';
    await db.transactions.put(transaction);

    alert('Item returned successfully.');
    renderItems(searchInput.value);
    renderHistory();
    modal.classList.add('hidden');
}

// Event listeners
tabs.items.addEventListener('click', () => {
    showView('items');
    renderItems(searchInput.value);
});
tabs.add.addEventListener('click', () => {
    showView('add');
    itemForm.reset();
});
tabs.history.addEventListener('click', () => {
    showView('history');
    renderHistory();
});

searchInput.addEventListener('input', (e) => renderItems(e.target.value));

itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('itemId').value.trim();
    const name = document.getElementById('name').value.trim();
    const category = document.getElementById('category').value.trim();
    const location = document.getElementById('location').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value, 10);

    if (!id || !name) {
        alert('ID and Name are required.');
        return;
    }

    const existing = await db.items.get(id);
    if (existing && !confirm('Item with this ID exists. Update it?')) {
        return;
    }

    const item = {
        id,
        name,
        category,
        location,
        quantity,
        available: existing ? existing.available : quantity
    };
    if (existing) {
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
    if (currentItemId) borrowItem(currentItemId);
});
modalReturn.addEventListener('click', () => {
    if (currentItemId) returnItem(currentItemId);
});
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
});

// Initial render
renderItems();

// Register service worker for offline
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed', err));
}