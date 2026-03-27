// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyANgXX1WtlIVo9ZWkQvLzqc2p5iA-ZOeSc",
  authDomain: "photogear-db.firebaseapp.com",
  projectId: "photogear-db",
  storageBucket: "photogear-db.firebasestorage.app",
  messagingSenderId: "338294604681",
  appId: "1:338294604681:web:c5e58674634e4a2bc81758"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State Management
let currentUser = null;
let gearList = [];
let userKits = [
    'סט חתונות',
    'סט צילומי סטודיו',
    'סט אירועי צהריים / קטנים',
    'סט צילומי מוצר ומסחרי',
    'סט צילומי רחוב וטבע',
    'סט ציוד גיבוי (Backups)'
];

let editingGearId = null;
let unsubscribeSnapshot = null;
let currentImageBase64 = null;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const authForm = document.getElementById('auth-form');
const btnLogout = document.getElementById('btn-logout');
const authErrorMsg = document.getElementById('auth-error-msg');

const gridEl = document.getElementById('gear-grid');
const addGearBtn = document.getElementById('btn-add-gear');
const addGearModal = document.getElementById('add-gear-modal');
const closeAddModal = document.getElementById('close-add-modal');
const form = document.getElementById('add-gear-form');
const imgUploadArea = document.getElementById('image-upload-area');
const imgInput = document.getElementById('gear-image');
const imgPreview = document.getElementById('image-preview');

const filters = document.querySelectorAll('.filter-btn');
const searchInput = document.getElementById('search-input');

// Insurance Report
const insuranceBtn = document.getElementById('btn-insurance-report');
const insuranceModal = document.getElementById('insurance-modal');
const closeInsuranceModal = document.getElementById('close-insurance-modal');

// Categories Text
const catMap = {
    'camera': 'גוף מצלמה',
    'lens': 'עדשה',
    'drone': 'רחפן',
    'lighting': 'תאורה',
    'audio': 'סאונד',
    'printer': 'מדפסת',
    'magnets': 'ציוד מגנטים',
    'computer': 'מחשב',
    'other': 'שונות'
};

// --- AUTHENTICATION LOGIC ---

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btnSubmit = document.getElementById('btn-auth-submit');
    
    authErrorMsg.style.display = 'none';
    btnSubmit.innerText = 'מתחבר...';
    btnSubmit.disabled = true;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
                // If user doesn't exist, register them
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (err) {
                authErrorMsg.innerText = "שגיאת הרשמה: " + err.message;
                authErrorMsg.style.display = 'block';
            }
        } else {
            authErrorMsg.innerText = "שגיאה: " + error.message;
            authErrorMsg.style.display = 'block';
        }
    } finally {
        btnSubmit.innerText = 'התחבר / הירשם';
        btnSubmit.disabled = false;
    }
});

btnLogout.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        loadUserData();
    } else {
        currentUser = null;
        authOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }
        gearList = [];
    }
});

function loadUserData() {
    const q = query(collection(db, "gear"), where("userId", "==", currentUser.uid));
    
    // Listen to real-time updates from Firestore
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        gearList = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id;
            gearList.push(data);
            
            // Sync kits locally
            if (data.kits && data.kits.length > 0) {
                data.kits.forEach(k => {
                    if (!userKits.includes(k)) {
                        userKits.push(k);
                    }
                });
            }
        });
        
        renderKitsOptions();
        refreshCurrentView();
    });
}

// --- CORE APP LOGIC ---

function renderKitsOptions() {
    const select = document.getElementById('gear-kits');
    select.innerHTML = '<option value="" selected>ללא שיוך לסט ספציפי (ציוד כללי)</option>';
    userKits.forEach(kit => {
        const opt = document.createElement('option');
        opt.value = kit;
        opt.innerText = kit;
        select.appendChild(opt);
    });
}

function renderGrid(itemsToRender) {
    gridEl.innerHTML = '';
    
    if (itemsToRender.length === 0) {
        gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 50px;">אין ציוד להצגה כרגע. הוסף פריט חדש כדי להתחיל.</div>`;
        return;
    }
    
    itemsToRender.forEach(item => {
        const card = document.createElement('div');
        card.className = 'gear-card';
        
        const imgSrc = item.image || '';
        const imageHtml = imgSrc 
            ? `<img src="${imgSrc}" alt="${item.name}">` 
            : `<i class="uil uil-camera fallback-icon"></i>`;

        card.innerHTML = `
            <div class="card-image">
                <span class="card-category-badge">${catMap[item.category] || item.category}</span>
                ${imageHtml}
            </div>
            <div class="card-content">
                <h3 class="card-title">${item.name}</h3>
                <div class="card-value">₪${Number(item.value).toLocaleString()}</div>
                <div class="card-meta">
                    <div><i class="uil uil-barcode"></i> S/N: ${item.serial || 'לא צוין'}</div>
                    ${item.notes ? `<div><i class="uil uil-comment-alt-notes"></i> ${item.notes}</div>` : ''}
                </div>
            </div>
            </div>
            <div class="card-actions">
                <button class="action-btn" onclick="window.editGear('${item.id}')" title="ערוך">
                    <i class="uil uil-pen"></i>
                </button>
                <button class="action-btn" onclick="window.deleteGear('${item.id}')" title="מחק">
                    <i class="uil uil-trash-alt"></i>
                </button>
            </div>
        `;
        
        gridEl.appendChild(card);
    });
}

function updateDashboard() {
    const totalValue = gearList.reduce((sum, item) => sum + Number(item.value), 0);
    document.getElementById('total-value').innerText = `₪${totalValue.toLocaleString()}`;
    document.getElementById('total-items').innerText = gearList.length;
}

// Image Handling
imgUploadArea.addEventListener('click', () => {
    imgInput.click();
});

imgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // Simple base64 encoding (Warning: large images might exceed firestore doc limits. Ideal is Firebase Storage)
        const reader = new FileReader();
        reader.onload = (event) => {
            currentImageBase64 = event.target.result;
            imgPreview.src = currentImageBase64;
            imgPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

function refreshCurrentView() {
    const vKits = document.getElementById('view-kits');
    const vKitInner = document.getElementById('kit-inner-view');
    const pageTitle = document.getElementById('page-main-title');
    
    if (!vKits.classList.contains('hidden')) {
        if (!vKitInner.classList.contains('hidden')) {
            const currentKitName = pageTitle.innerText.replace('סט: ', '');
            const kitItems = gearList.filter(item => item.kits && item.kits.includes(currentKitName));
            if (kitItems.length === 0) {
                document.getElementById('btn-back-to-kits').click();
            } else {
                openKit(currentKitName, kitItems);
            }
            renderKitsGrid(); // refresh totals
        } else {
            renderKitsGrid();
        }
    } else {
        renderGrid(gearList);
    }
    updateDashboard();
}

window.editGear = function(id) {
    const item = gearList.find(g => g.id === id);
    if (!item) return;
    
    editingGearId = id;
    
    document.getElementById('gear-name').value = item.name;
    document.getElementById('category').value = item.category;
    document.getElementById('value').value = item.value;
    document.getElementById('serial').value = item.serial || '';
    document.getElementById('notes').value = item.notes || '';
    document.getElementById('gear-kits').value = (item.kits && item.kits.length > 0) ? item.kits[0] : '';
    
    currentImageBase64 = item.image || null;
    if (currentImageBase64) {
        imgPreview.src = currentImageBase64;
        imgPreview.style.display = 'block';
    } else {
        imgPreview.style.display = 'none';
        imgPreview.src = '';
    }
    
    document.querySelector('.modal-title').innerText = 'עריכת ציוד';
    document.querySelector('.submit-btn').innerText = 'שמור שינויים';
    addGearModal.classList.add('active');
};

// Form Submission - Save to Firestore
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    const submitBtn = document.querySelector('.submit-btn');
    submitBtn.innerText = 'שומר...';
    submitBtn.disabled = true;
    
    const rawKits = document.getElementById('gear-kits').value;
    const kitsArray = rawKits ? [rawKits] : [];

    const itemData = {
        name: document.getElementById('gear-name').value,
        category: document.getElementById('category').value,
        value: document.getElementById('value').value,
        serial: document.getElementById('serial').value,
        notes: document.getElementById('notes').value,
        kits: kitsArray,
        image: currentImageBase64,
        userId: currentUser.uid // Attach data to specific user
    };
    
    try {
        const idToSave = editingGearId || Date.now().toString() + Math.random().toString(36).substring(7);
        const docRef = doc(db, "gear", idToSave);
        await setDoc(docRef, itemData, { merge: true });
        
        // Reset form
        form.reset();
        currentImageBase64 = null;
        imgPreview.style.display = 'none';
        imgPreview.src = '';
        editingGearId = null;
        addGearModal.classList.remove('active');
    } catch (error) {
        alert("שגיאה בשמירת הנתונים: " + error.message);
    } finally {
        submitBtn.innerText = 'שמור ציוד בתיק';
        submitBtn.disabled = false;
    }
});

window.deleteGear = async function(id) {
    if(confirm('האם אתה בטוח שברצונך למחוק פריט זה?')) {
        try {
            await deleteDoc(doc(db, "gear", id));
        } catch (error) {
            alert("שגיאה במחיקה: " + error.message);
        }
    }
};

// Filtering & Searching
filters.forEach(btn => {
    btn.addEventListener('click', () => {
        filters.forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.dataset.filter;
        if(filter === 'all') {
            renderGrid(gearList);
        } else {
            renderGrid(gearList.filter(item => item.category === filter));
        }
    });
});

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = gearList.filter(item => 
        item.name.toLowerCase().includes(term) || 
        item.serial.toLowerCase().includes(term) ||
        (catMap[item.category] && catMap[item.category].includes(term))
    );
    renderGrid(filtered);
});

// Modals Handling
addGearBtn.addEventListener('click', () => {
    editingGearId = null;
    form.reset();
    currentImageBase64 = null;
    imgPreview.style.display = 'none';
    imgPreview.src = '';
    document.querySelector('.modal-title').innerText = 'הוספת ציוד חדש';
    document.querySelector('.submit-btn').innerText = 'שמור ציוד בתיק';
    addGearModal.classList.add('active');
});

closeAddModal.addEventListener('click', () => addGearModal.classList.remove('active'));

document.getElementById('btn-add-kit').addEventListener('click', () => {
    const newKitName = prompt('הזן שם עבור הסט החדש:');
    if (newKitName && newKitName.trim() !== '') {
        const trimmed = newKitName.trim();
        if (!userKits.includes(trimmed)) {
            userKits.push(trimmed);
            renderKitsOptions();
        }
        document.getElementById('gear-kits').value = trimmed;
    }
});

// Insurance Report Generation
insuranceBtn.addEventListener('click', () => {
    generateReport();
    insuranceModal.classList.add('active');
});

closeInsuranceModal.addEventListener('click', () => insuranceModal.classList.remove('active'));

function generateReport() {
    const tbody = document.getElementById('report-tbody');
    tbody.innerHTML = '';
    
    const date = new Date().toLocaleDateString('he-IL');
    document.getElementById('report-date').innerText = date;
    document.getElementById('report-items-count').innerText = gearList.length;
    
    let total = 0;
    
    gearList.forEach((item, index) => {
        total += Number(item.value);
        const tr = document.createElement('tr');
        
        const imgCell = item.image 
            ? `<img src="${item.image}" class="report-img">` 
            : `אין תמונה`;

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${imgCell}</td>
            <td>${item.name}</td>
            <td>${catMap[item.category] || item.category}</td>
            <td>${item.serial || 'N/A'}</td>
            <td>₪${Number(item.value).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('report-total-value').innerText = `₪${total.toLocaleString()}`;
}

// Close modals on escape or outside click
window.addEventListener('click', (e) => {
    if (e.target === addGearModal) addGearModal.classList.remove('active');
    if (e.target === insuranceModal) insuranceModal.classList.remove('active');
});

window.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') {
        addGearModal.classList.remove('active');
        insuranceModal.classList.remove('active');
    }
});

// Navigation Logic
const navAllGear = document.getElementById('nav-all-gear');
const navKits = document.getElementById('nav-kits');
const viewAllGear = document.getElementById('view-all-gear');
const viewKits = document.getElementById('view-kits');
const pageMainTitle = document.getElementById('page-main-title');

const kitsGrid = document.getElementById('kits-grid');
const kitInnerView = document.getElementById('kit-inner-view');
const kitGearGrid = document.getElementById('kit-gear-grid');
const btnBackToKits = document.getElementById('btn-back-to-kits');

navAllGear.addEventListener('click', () => {
    navAllGear.classList.add('active');
    navKits.classList.remove('active');
    viewAllGear.classList.remove('hidden');
    viewKits.classList.add('hidden');
    pageMainTitle.innerText = 'הציוד שלי';
    renderGrid(gearList);
});

navKits.addEventListener('click', () => {
    navKits.classList.add('active');
    navAllGear.classList.remove('active');
    viewAllGear.classList.add('hidden');
    viewKits.classList.remove('hidden');
    
    // Show kits grid, hide inner view
    kitsGrid.classList.remove('hidden');
    kitInnerView.classList.add('hidden');
    pageMainTitle.innerText = 'תצוגת סטים (Kits)';
    renderKitsGrid();
});

btnBackToKits.addEventListener('click', () => {
    kitsGrid.classList.remove('hidden');
    kitInnerView.classList.add('hidden');
    pageMainTitle.innerText = 'תצוגת סטים (Kits)';
});

function renderKitsGrid() {
    kitsGrid.innerHTML = '';
    
    const allKitsSet = new Set();
    gearList.forEach(item => {
        if (item.kits && item.kits.length > 0) {
            item.kits.forEach(k => allKitsSet.add(k));
        }
    });
    
    const uniqueKits = Array.from(allKitsSet);
    
    if (uniqueKits.length === 0) {
        kitsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 50px;">אין סטים להצגה. הוסף ציוד ושייך אותו לסט במסך ההוספה.</div>`;
        return;
    }
    
    uniqueKits.forEach(kitName => {
        const kitItems = gearList.filter(item => item.kits && item.kits.includes(kitName));
        const kitValue = kitItems.reduce((sum, item) => sum + Number(item.value), 0);
        
        const folder = document.createElement('div');
        folder.className = 'kit-folder';
        folder.innerHTML = `
            <i class="uil uil-suitcase-alt kit-folder-icon"></i>
            <div class="kit-folder-title">${kitName}</div>
            <div class="kit-folder-meta">₪${kitValue.toLocaleString()} &bull; ${kitItems.length} פריטים</div>
        `;
        
        folder.addEventListener('click', () => openKit(kitName, kitItems));
        kitsGrid.appendChild(folder);
    });
}

function openKit(kitName, kitItems) {
    kitsGrid.classList.add('hidden');
    kitInnerView.classList.remove('hidden');
    pageMainTitle.innerText = `סט: ${kitName}`;
    
    kitGearGrid.innerHTML = '';
    
    if (kitItems.length === 0) {
        return;
    }
    
    kitItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'gear-card';
        
        const imgSrc = item.image || ''; 
        const imageHtml = imgSrc 
            ? `<img src="${imgSrc}" alt="${item.name}">` 
            : `<i class="uil uil-camera fallback-icon"></i>`;

        card.innerHTML = `
            <div class="card-image">
                <span class="card-category-badge">${catMap[item.category] || item.category}</span>
                ${imageHtml}
            </div>
            <div class="card-content">
                <h3 class="card-title">${item.name}</h3>
                <div class="card-value">₪${Number(item.value).toLocaleString()}</div>
                <div class="card-meta">
                    <div><i class="uil uil-barcode"></i> S/N: ${item.serial || 'לא צוין'}</div>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn" onclick="window.editGear('${item.id}')" title="ערוך">
                    <i class="uil uil-pen"></i>
                </button>
                <button class="action-btn" onclick="window.deleteGear('${item.id}')" title="מחק">
                    <i class="uil uil-trash-alt"></i>
                </button>
            </div>
        `;
        kitGearGrid.appendChild(card);
    });
}
