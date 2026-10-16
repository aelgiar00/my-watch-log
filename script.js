const TMDB_API_KEY = 'f3cefc2462aadaabd61feafa4ec78ce4';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// ☁️ لو معاك لينك Firebase Realtime Database حطه هنا بين علامتين التنصيص:
const DEFAULT_FIREBASE_URL = 'PUT_YOUR_FIREBASE_DB_URL_HERE';

const container = document.getElementById('app-container');
const buttons = document.querySelectorAll('.filter-btn');
const favBtn = document.getElementById('fav-btn');
const favCountBadge = document.getElementById('fav-count-badge');
const subButtons = document.querySelectorAll('.sub-filter-btn');
const subNav = document.getElementById('sub-nav');
const subBtnCompleted = document.getElementById('sub-btn-completed');
const subBtnDropped = document.getElementById('sub-btn-dropped');
const addFormContainer = document.getElementById('add-form-container');
const currentCategorySpan = document.getElementById('current-category-name');
const statusSelect = document.getElementById('new-item-status');
const statusOptDropped = document.getElementById('status-opt-dropped');
const stoppedInput = document.getElementById('new-item-stopped');
const cinemaLangSelect = document.getElementById('cinema-lang-select');
const bannerTitle = document.getElementById('banner-title');
const bannerCount = document.getElementById('banner-count');
const installAppBtn = document.getElementById('install-app-btn');
const cloudSyncBtn = document.getElementById('cloud-sync-btn');
const cloudStatusText = document.getElementById('cloud-status-text');

// عناصر الفلترة الذكية
const searchInput = document.getElementById('category-search-input');
const ratingFilterSelect = document.getElementById('rating-filter-select');
const yearFilterSelect = document.getElementById('year-filter-select');

let allData = [];
let baseJsonData = [];
let activeCategory = 'arabic_series_2026';
let activeSubFilter = 'completed';
let deferredPrompt = null;
let cloudSyncStream = null;
let lastCloudSignature = '';

// كاش سريع لحفظ بيانات TMDB عشان الفلترة بالسنة والبحث والتقييم تشتغل في جزء من الثانية بدون إعادة تحميل!
const tmdbCache = {};

const categoryNamesMap = {
    'arabic_series_2026': 'مسلسلات عربي',
    'arabic_movies_2026': 'أفلام عربي',
    'english_movies_2026': 'أفلام أجنبي',
    'english_series': 'مسلسلات أجنبي',
    'anime': 'أنمي',
    'cinema': 'سينما 🎟️'
};

// الأقسام اللي فيها شريط فرعي (كملتها / عايز أشوفها أو وقفتها)
function hasSubSections(cat) {
    return cat === 'arabic_series_2026' || cat === 'english_series' || cat === 'anime';
}

// ==========================================
// ☁️ نظام المزامنة السحابية اللحظية (Live Cloud Sync)
// ==========================================
function getCloudDbUrl() {
    let url = localStorage.getItem('watchlog_firebase_url') || DEFAULT_FIREBASE_URL;
    if (!url || url === 'PUT_YOUR_FIREBASE_DB_URL_HERE') return null;
    url = url.trim().replace(/\/+$/, '');
    if (!url.startsWith('http')) url = 'https://' + url;
    return url;
}

function getLocalRatingsObject() {
    const ratings = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rating_')) {
            ratings[key] = localStorage.getItem(key);
        }
    }
    return ratings;
}

function updateCloudBadgeUI(connected) {
    if (!cloudSyncBtn || !cloudStatusText) return;
    if (connected) {
        cloudSyncBtn.classList.add('connected');
        cloudStatusText.innerText = 'متصل بالسحابة (تزامن لحظي 🟢)';
    } else {
        cloudSyncBtn.classList.remove('connected');
        cloudStatusText.innerText = 'ربط السحابة (مزامنة اللاب والموبايل)';
    }
}

async function pushStateToCloud() {
    const dbUrl = getCloudDbUrl();
    if (!dbUrl) return;

    const payload = {
        addedItems: JSON.parse(localStorage.getItem('my_added_watch_items')) || [],
        deletedItems: JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [],
        statusOverrides: JSON.parse(localStorage.getItem('my_status_overrides')) || {},
        ratings: getLocalRatingsObject(),
        updatedAt: Date.now()
    };

    lastCloudSignature = JSON.stringify({
        a: payload.addedItems,
        d: payload.deletedItems,
        s: payload.statusOverrides,
        r: payload.ratings
    });

    try {
        await fetch(`${dbUrl}/watchlog_sync.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        updateCloudBadgeUI(true);
    } catch (e) {
        console.error('Cloud push error:', e);
    }
}

function applyCloudStateLocally(cloudData) {
    if (!cloudData) return false;

    const incomingSig = JSON.stringify({
        a: cloudData.addedItems || [],
        d: cloudData.deletedItems || [],
        s: cloudData.statusOverrides || {},
        r: cloudData.ratings || {}
    });

    if (incomingSig === lastCloudSignature) return false;
    lastCloudSignature = incomingSig;

    localStorage.setItem('my_added_watch_items', JSON.stringify(cloudData.addedItems || []));
    localStorage.setItem('my_deleted_watch_items', JSON.stringify(cloudData.deletedItems || []));
    localStorage.setItem('my_status_overrides', JSON.stringify(cloudData.statusOverrides || {}));

    if (cloudData.ratings) {
        Object.keys(cloudData.ratings).forEach(k => {
            localStorage.setItem(k, cloudData.ratings[k]);
        });
    }

    rebuildAllDataAndRender();
    return true;
}

async function initCloudSync() {
    const dbUrl = getCloudDbUrl();
    if (!dbUrl) {
        updateCloudBadgeUI(false);
        return;
    }

    try {
        const res = await fetch(`${dbUrl}/watchlog_sync.json`);
        const cloudData = await res.json();

        const localAdded = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
        const localRatings = getLocalRatingsObject();

        if (!cloudData && (localAdded.length > 0 || Object.keys(localRatings).length > 0)) {
            await pushStateToCloud();
        } else if (cloudData) {
            applyCloudStateLocally(cloudData);
        }
        updateCloudBadgeUI(true);

        if (window.EventSource && !cloudSyncStream) {
            cloudSyncStream = new EventSource(`${dbUrl}/watchlog_sync.json`);
            cloudSyncStream.addEventListener('put', (e) => {
                try {
                    const packet = JSON.parse(e.data);
                    if (packet.path === '/' && packet.data) {
                        applyCloudStateLocally(packet.data);
                    } else {
                        fetch(`${dbUrl}/watchlog_sync.json`).then(r => r.json()).then(d => applyCloudStateLocally(d));
                    }
                } catch (err) {}
            });
        }
    } catch (e) {
        console.error('Cloud init error:', e);
        updateCloudBadgeUI(false);
    }
}

window.setupCloudSync = async function() {
    const currentUrl = getCloudDbUrl() || '';
    const inputUrl = prompt(
        '☁️ للمزامنة اللحظية التلقائية بين اللاب والموبايل:\n\nانسخ رابط Firebase Realtime Database بتاعك وحطه هنا:\n\n(لو عايز تفصل السحابة امسح الرابط ودوس OK)',
        currentUrl
    );

    if (inputUrl === null) return;

    const cleaned = inputUrl.trim();
    if (!cleaned) {
        localStorage.removeItem('watchlog_firebase_url');
        if (cloudSyncStream) { cloudSyncStream.close(); cloudSyncStream = null; }
        updateCloudBadgeUI(false);
        alert('تم فصل المزامنة السحابية.');
        return;
    }

    localStorage.setItem('watchlog_firebase_url', cleaned);
    if (cloudSyncStream) { cloudSyncStream.close(); cloudSyncStream = null; }
    await initCloudSync();
    alert('تم ربط السحابة بنجاح! 🎉');
};

// ==========================================

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installAppBtn) installAppBtn.style.display = 'inline-flex';
});

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installAppBtn.style.display = 'none';
            }
            deferredPrompt = null;
        } else {
            alert('لتثبيت التطبيق على موبايلك:\n- في أندرويد (Chrome): اضغط على الثلاث نقاط فوق واختار "تثبيت التطبيق / Install App".\n- في آيفون (Safari): اضغط على زر المشاركة (Share) واختار "Add to Home Screen".');
        }
    });
}

statusSelect.addEventListener('change', function() {
    if(this.value === 'dropped') {
        stoppedInput.style.display = 'block';
    } else {
        stoppedInput.style.display = 'none';
        stoppedInput.value = '';
    }
});

function getEffectiveRating(item) {
    let savedRating = localStorage.getItem('rating_' + item.name);
    if (savedRating !== null && savedRating !== '') {
        return parseFloat(savedRating);
    } else if (item.myRating !== undefined && item.myRating !== null && item.myRating > 0) {
        return parseFloat(item.myRating);
    }
    return -1;
}

function normalizeText(text) {
    if (!text) return '';
    return text.toString().toLowerCase().trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[؟!.,،:\-_]/g, '')
        .replace(/\s+/g, ' ');
}

function updateAllCounts(currentFilteredCount = 0) {
    buttons.forEach(btn => {
        const cat = btn.dataset.filter;
        const count = allData.filter(item => item.category === cat).length;
        let badge = btn.querySelector('.btn-count');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'btn-count';
            btn.appendChild(badge);
        }
        badge.innerText = count;
    });

    // استبعاد السينما من عداد المفضلة
    const favCount = allData.filter(item => item.category !== 'cinema' && getEffectiveRating(item) >= 9).length;
    if (favCountBadge) favCountBadge.innerText = favCount;

    if (hasSubSections(activeCategory)) {
        const compCount = allData.filter(item => item.category === activeCategory && (item.status || 'completed') === 'completed').length;
        const dropCount = allData.filter(item => item.category === activeCategory && item.status === 'dropped').length;
        
        let compLabel = '✅ مسلسلات كملتها';
        let dropLabel = '⏳ مسلسلات عايز أشوفها / لسه ما خلصتهاش';

        if (activeCategory === 'anime') {
            compLabel = '✅ أنميات كملتها';
            dropLabel = '❌ أنميات وقفتها / ما شوفتهاش';
        } else if (activeCategory === 'english_series') {
            compLabel = '✅ مسلسلات كملتها';
            dropLabel = '❌ مسلسلات وقفتها / ما كملتهاش';
        }
        
        subBtnCompleted.innerHTML = `<span>${compLabel}</span> <span class="btn-count">${compCount}</span>`;
        subBtnDropped.innerHTML = `<span>${dropLabel}</span> <span class="btn-count">${dropCount}</span>`;
    }

    let titleText = '';
    if (activeCategory === 'favorites') {
        titleText = '❤️ إجمالي الأعمال المفضلة المعروضة:';
    } else if (activeCategory === 'arabic_series_2026') {
        titleText = activeSubFilter === 'completed' ? '📺 مسلسلات عربي كملتها:' : '⏳ مسلسلات عربي عايز أشوفها:';
    } else if (activeCategory === 'anime') {
        titleText = activeSubFilter === 'completed' ? '🎬 أنميات كملتها:' : '🛑 أنميات وقفتها:';
    } else if (activeCategory === 'english_series') {
        titleText = activeSubFilter === 'completed' ? '📺 مسلسلات أجنبي كملتها:' : '🛑 مسلسلات أجنبي وقفتها:';
    } else {
        titleText = `📊 إجمالي ${categoryNamesMap[activeCategory] || activeCategory}:`;
    }
    
    bannerTitle.innerText = titleText;
    bannerCount.innerText = currentFilteredCount;
}

function rebuildAllDataAndRender() {
    const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    const deletedItems = JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [];
    const statusOverrides = JSON.parse(localStorage.getItem('my_status_overrides')) || {};
    
    const filteredJsonData = baseJsonData.filter(item => {
        const keyWithStatus = `${item.name}_${item.category}_${item.status || 'completed'}`;
        const oldKey = `${item.name}_${item.category}`;
        const existsInLocal = localItems.some(loc => normalizeText(loc.name) === normalizeText(item.name) && loc.category === item.category);
        if (existsInLocal) return false;
        return !deletedItems.includes(keyWithStatus) && !deletedItems.includes(oldKey);
    }).map(item => {
        const overrideKey = `${item.name}_${item.category}`;
        if (statusOverrides[overrideKey]) {
            return { ...item, ...statusOverrides[overrideKey] };
        }
        return item;
    });

    // منع أي تكرار في الداتا المدمجة
    const combined = [...localItems, ...filteredJsonData];
    const uniqueSeen = new Set();
    allData = [];
    for (const item of combined) {
        const uKey = `${normalizeText(item.name)}_${item.category}`;
        if (!uniqueSeen.has(uKey)) {
            uniqueSeen.add(uKey);
            allData.push(item);
        }
    }

    updateSubNavUI();
    filterAndDisplay();
}

async function loadData() {
    try {
        const response = await fetch('data.json?v=' + new Date().getTime());
        baseJsonData = await response.json();
        rebuildAllDataAndRender();
        await initCloudSync();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// الحصول على عناصر القسم الحالي قبل تطبيق فلاتر البحث والسنة والتقييم
function getBaseCategoryItems() {
    if (activeCategory === 'favorites') {
        return allData.filter(item => item.category !== 'cinema' && getEffectiveRating(item) >= 9);
    }
    let filteredData = allData.filter(item => item.category === activeCategory);
    if (hasSubSections(activeCategory)) {
        filteredData = filteredData.filter(item => (item.status || 'completed') === activeSubFilter);
    }
    return filteredData;
}

function filterAndDisplay() {
    const baseItems = getBaseCategoryItems();
    displayItems(baseItems, activeCategory === 'favorites');
}

// تطبيق الفلاتر الفورية (البحث بالاسم + تدريج التقييم + السنة)
window.applyLocalFilters = function() {
    const cards = container.querySelectorAll('.card');
    if (cards.length === 0) return;

    const searchVal = normalizeText(searchInput ? searchInput.value : '');
    const selectedRating = ratingFilterSelect ? ratingFilterSelect.value : 'all';
    const selectedYear = yearFilterSelect ? yearFilterSelect.value : 'all';

    let visibleCount = 0;

    cards.forEach(card => {
        const itemName = normalizeText(card.dataset.name || '');
        const itemRating = parseFloat(card.dataset.rating);
        const itemYear = card.dataset.year || '';

        let matchSearch = true;
        if (searchVal) {
            matchSearch = itemName.includes(searchVal);
        }

        let matchRating = true;
        if (selectedRating !== 'all') {
            if (selectedRating === 'unrated') {
                matchRating = itemRating < 0;
            } else {
                const targetR = parseFloat(selectedRating);
                matchRating = Math.floor(itemRating) === targetR;
            }
        }

        let matchYear = true;
        if (selectedYear !== 'all') {
            matchYear = itemYear === selectedYear;
        }

        if (matchSearch && matchRating && matchYear) {
            card.style.display = 'flex';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    bannerCount.innerText = visibleCount;
};

window.resetLocalFilters = function() {
    if (searchInput) searchInput.value = '';
    if (ratingFilterSelect) ratingFilterSelect.value = 'all';
    if (yearFilterSelect) yearFilterSelect.value = 'all';
    applyLocalFilters();
};

// تحديث قائمة السنوات ديناميكياً حسب الأعمال الموجودة في القسم المفتوح
function populateYearDropdown(yearsList) {
    if (!yearFilterSelect) return;
    const currentSelected = yearFilterSelect.value;
    const uniqueYears = Array.from(new Set(yearsList.filter(Boolean))).sort((a, b) => parseInt(b) - parseInt(a));
    
    let optionsHtml = '<option value="all">📅 كل السنوات</option>';
    uniqueYears.forEach(yr => {
        optionsHtml += `<option value="${yr}">📅 سنة ${yr}</option>`;
    });
    yearFilterSelect.innerHTML = optionsHtml;

    if (uniqueYears.includes(currentSelected)) {
        yearFilterSelect.value = currentSelected;
    } else {
        yearFilterSelect.value = 'all';
    }
}

window.toggleItemStatus = function(encodedName, category) {
    const name = decodeURIComponent(encodedName);
    const targetItem = allData.find(item => item.name === name && item.category === category);
    if (!targetItem) return;

    const currentStatus = targetItem.status || 'completed';
    const newStatus = currentStatus === 'completed' ? 'dropped' : 'completed';
    let stoppedAtVal = '';

    if (newStatus === 'dropped' && category !== 'arabic_series_2026') {
        stoppedAtVal = prompt(`وقفت "${name}" عند فين؟ (مثال: الموسم 2 أو الحلقة 5)`, targetItem.stoppedAt || '1 Season');
        if (stoppedAtVal === null) return;
    }

    targetItem.status = newStatus;
    targetItem.stoppedAt = stoppedAtVal;

    let localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    let updatedInLocal = false;
    localItems = localItems.map(item => {
        if (item.name === name && item.category === category) {
            updatedInLocal = true;
            return { ...item, status: newStatus, stoppedAt: stoppedAtVal };
        }
        return item;
    });
    if (updatedInLocal) {
        localStorage.setItem('my_added_watch_items', JSON.stringify(localItems));
    } else {
        const statusOverrides = JSON.parse(localStorage.getItem('my_status_overrides')) || {};
        statusOverrides[`${name}_${category}`] = { status: newStatus, stoppedAt: stoppedAtVal };
        localStorage.setItem('my_status_overrides', JSON.stringify(statusOverrides));
    }

    filterAndDisplay();
    pushStateToCloud();
};

window.deleteItem = function(encodedName, category) {
    const name = decodeURIComponent(encodedName);
    if (!confirm(`متأكد إنك عايز تمسح "${name}" من اللوج نهائياً؟`)) return;

    const targetItem = allData.find(item => item.name === name && item.category === category);
    const status = targetItem ? (targetItem.status || 'completed') : 'completed';
    const uniqueKey = `${name}_${category}_${status}`;

    const deletedItems = JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [];
    if (!deletedItems.includes(uniqueKey)) {
        deletedItems.push(uniqueKey);
        localStorage.setItem('my_deleted_watch_items', JSON.stringify(deletedItems));
    }

    let localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    localItems = localItems.filter(item => !(item.name === name && item.category === category));
    localStorage.setItem('my_added_watch_items', JSON.stringify(localItems));

    allData = allData.filter(item => !(item.name === name && item.category === category));
    filterAndDisplay();
    pushStateToCloud();
}

window.addNewItem = function() {
    const name = document.getElementById('new-item-name').value.trim();
    const status = statusSelect.value;
    const stoppedAt = stoppedInput.value;
    const myRating = document.getElementById('new-item-rating').value;
    const cinemaLang = cinemaLangSelect.value;

    if(!name) { alert('أرجوك اكتب اسم العمل الأول!'); return; }

    let deletedItems = JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [];
    deletedItems = deletedItems.filter(key => !key.startsWith(`${name}_${activeCategory}`));
    localStorage.setItem('my_deleted_watch_items', JSON.stringify(deletedItems));

    const existingIndex = allData.findIndex(item => normalizeText(item.name) === normalizeText(name) && item.category === activeCategory);
    
    const newItem = {
        name: name,
        tmdb_search_name: name,
        category: activeCategory,
        status: status,
        stoppedAt: status === 'dropped' ? stoppedAt : "",
        myRating: myRating ? parseFloat(myRating) : 0,
        lang: activeCategory === 'cinema' ? cinemaLang : null
    };

    if (existingIndex !== -1) {
        allData[existingIndex] = { ...allData[existingIndex], ...newItem };
    } else {
        allData.unshift(newItem);
    }

    let localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    localItems = localItems.filter(item => !(normalizeText(item.name) === normalizeText(name) && item.category === activeCategory));
    localItems.unshift(newItem);
    localStorage.setItem('my_added_watch_items', JSON.stringify(localItems));
    
    if(myRating) localStorage.setItem('rating_' + name, myRating);

    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-rating').value = '';
    stoppedInput.value = '';

    if (hasSubSections(activeCategory) && status !== activeSubFilter) {
        activeSubFilter = status;
        subButtons.forEach(b => {
            b.classList.toggle('active', b.dataset.subfilter === status);
        });
    }

    filterAndDisplay();
    pushStateToCloud();
}

window.restoreHiddenItems = function() {
    const deletedItems = JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [];
    if (deletedItems.length === 0) {
        alert('مفيش أي أعمال مخفية في قائمة المحذوفات حالياً! كله ظاهر قدامك.');
        return;
    }
    if (confirm(`لقينا (${deletedItems.length}) عمل مخفي في قائمة المحذوفات:\n(${deletedItems.join(' ، ')})\n\nهل عايز تسترجعهم كلهم دلوقتي؟`)) {
        localStorage.removeItem('my_deleted_watch_items');
        rebuildAllDataAndRender();
        pushStateToCloud();
        alert('تم استرجاع كل الأعمال المخفية بنجاح!');
    }
};

window.exportFullDataJSON = function() {
    const finalExportData = allData.map(item => {
        const effRating = getEffectiveRating(item);
        const cleanItem = { ...item };
        delete cleanItem.finalRating;
        cleanItem.myRating = effRating >= 0 ? effRating : 0;
        return cleanItem;
    });

    const dataStr = JSON.stringify(finalExportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.importDataJSON = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) {
                alert('الملف غير صالح!');
                return;
            }

            importedData.forEach(item => {
                if (item.myRating && item.myRating > 0) {
                    localStorage.setItem('rating_' + item.name, item.myRating);
                }
            });

            localStorage.setItem('my_added_watch_items', JSON.stringify(importedData));
            localStorage.removeItem('my_deleted_watch_items');
            allData = importedData;
            filterAndDisplay();
            pushStateToCloud();
            alert('تم استيراد ومزامنة كل تعديلاتك وأفلامك بنجاح! 🚀');
        } catch (err) {
            alert('حدث خطأ أثناء قراءة الملف!');
        }
    };
    reader.readAsText(file);
};

window.saveMyRating = function(encodedName) {
    const name = decodeURIComponent(encodedName);
    const safeId = encodedName.replace(/[^a-zA-Z0-9]/g, '_');
    const inputField = document.getElementById('input_' + safeId);
    
    if (inputField && inputField.value !== '') {
        const val = parseFloat(inputField.value);
        if (val < 0 || val > 10) {
            alert('التقييم لازم يكون بين 0 و 10');
            return;
        }
        localStorage.setItem('rating_' + name, val);
        filterAndDisplay();
        pushStateToCloud();
    }
}

function extractYearFromDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const year = dateStr.substring(0, 4);
    return /^\d{4}$/.test(year) ? year : '';
}

async function fetchSmartTMDBData(item) {
    const cacheKey = `${item.name}_${item.category}`;
    if (tmdbCache[cacheKey]) {
        // لو فيه صورة hardcoded اتضافت، نضمن إنها تفضل موجودة
        if (item.poster) tmdbCache[cacheKey].posterUrl = item.poster;
        return tmdbCache[cacheKey];
    }

    const isTV = item.category.includes('series') || item.category === 'anime';
    const type = isTV ? 'tv' : 'movie';
    const isArabicCategory = item.category.startsWith('arabic_') || (item.category === 'cinema' && item.lang === 'ar');

    // ✅ لو المسلسل ليه صورة Hardcoded على جيت هاب (زي الـ 11 مسلسل الجداد)، ياخدها فوراً!
    let posterUrl = item.poster ? item.poster : null;
    let globalRating = null;
    let apiSeasons = '';
    let apiEpisodes = '';
    let actualReleaseYear = item.release_year ? item.release_year.toString() : '';
    let matchedId = item.tmdb_id || null;

    if (matchedId) {
        try {
            const langParam = isArabicCategory ? 'ar-EG' : 'en-US';
            const directRes = await fetch(`${TMDB_BASE_URL}/${type}/${matchedId}?api_key=${TMDB_API_KEY}&language=${langParam}`);
            const directData = await directRes.json();
            if (directData.poster_path && !item.poster) posterUrl = IMG_BASE_URL + directData.poster_path;
            if (directData.vote_average && directData.vote_average > 0) globalRating = directData.vote_average.toFixed(1);
            
            const dateStr = directData.first_air_date || directData.release_date || '';
            if (dateStr) actualReleaseYear = extractYearFromDate(dateStr);

            if (isTV) {
                if (directData.number_of_seasons) apiSeasons = directData.number_of_seasons;
                if (directData.number_of_episodes) apiEpisodes = directData.number_of_episodes;
            }
        } catch(e) { console.error(e); }
    }

    if (!matchedId) {
        const queries = [];
        if (item.tmdb_search_name) queries.push(item.tmdb_search_name);
        if (item.alt_queries && Array.isArray(item.alt_queries)) queries.push(...item.alt_queries);
        if (!queries.includes(item.name)) queries.push(item.name);

        let bestMatch = null;

        for (const q of queries) {
            try {
                let resultsList = [];

                if (!isArabicCategory) {
                    const resEn = await fetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=en-US`);
                    const dataEn = await resEn.json();
                    resultsList = dataEn.results || [];
                } else {
                    const [resAr, resEn] = await Promise.all([
                        fetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ar-EG`),
                        fetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=en-US`)
                    ]);
                    const dataAr = await resAr.json();
                    const dataEn = await resEn.json();

                    let combined = [...(dataAr.results || []), ...(dataEn.results || [])];
                    const arabicOnly = combined.filter(r => r.original_language === 'ar');
                    if (arabicOnly.length > 0) combined = arabicOnly;

                    const uniqueMap = new Map();
                    for (const r of combined) {
                        if (!uniqueMap.has(r.id)) {
                            uniqueMap.set(r.id, r);
                        } else {
                            const existing = uniqueMap.get(r.id);
                            if (!existing.poster_path && r.poster_path) existing.poster_path = r.poster_path;
                            if ((!existing.vote_average || existing.vote_average === 0) && r.vote_average > 0) existing.vote_average = r.vote_average;
                            if (!existing.release_date && r.release_date) existing.release_date = r.release_date;
                            if (!existing.first_air_date && r.first_air_date) existing.first_air_date = r.first_air_date;
                        }
                    }
                    resultsList = Array.from(uniqueMap.values());
                }

                if (resultsList.length > 0) {
                    if (item.release_year) {
                        const yearFiltered = resultsList.filter(r => {
                            const d = r.first_air_date || r.release_date || '';
                            return d.startsWith(item.release_year.toString());
                        });
                        if (yearFiltered.length > 0) resultsList = yearFiltered;
                    }

                    if (item.modern_only) {
                        const modernFiltered = resultsList.filter(r => {
                            const d = r.release_date || r.first_air_date || '';
                            const y = parseInt(d.substring(0, 4));
                            return y >= 2024;
                        });
                        if (modernFiltered.length > 0) resultsList = modernFiltered;
                    }

                    const normQ = normalizeText(q);

                    let exactWithPoster = resultsList.find(r => {
                        const t1 = normalizeText(r.name || r.title);
                        const t2 = normalizeText(r.original_name || r.original_title);
                        return r.poster_path && (t1 === normQ || t2 === normQ);
                    });

                    let exactAny = resultsList.find(r => {
                        const t1 = normalizeText(r.name || r.title);
                        const t2 = normalizeText(r.original_name || r.original_title);
                        return t1 === normQ || t2 === normQ;
                    });

                    let anyWithPoster = resultsList.find(r => r.poster_path);
                    let chosen = exactWithPoster || exactAny || anyWithPoster || resultsList[0];

                    if (chosen) {
                        bestMatch = chosen;
                        if (chosen.poster_path || item.poster) break;
                    }
                }
            } catch (e) { console.error(e); }
        }

        if (bestMatch) {
            matchedId = bestMatch.id;
            if (bestMatch.poster_path && !item.poster) posterUrl = IMG_BASE_URL + bestMatch.poster_path;
            if (bestMatch.vote_average && bestMatch.vote_average > 0) globalRating = bestMatch.vote_average.toFixed(1);
            const matchDate = bestMatch.first_air_date || bestMatch.release_date || '';
            if (matchDate && !actualReleaseYear) actualReleaseYear = extractYearFromDate(matchDate);
        }
    }

    if (matchedId) {
        try {
            const detailLang = isArabicCategory ? 'ar-EG' : 'en-US';
            const imgLang = isArabicCategory ? 'ar,en,null' : 'en,null';
            const detailsRes = await fetch(`${TMDB_BASE_URL}/${type}/${matchedId}?api_key=${TMDB_API_KEY}&language=${detailLang}&append_to_response=images&include_image_language=${imgLang}`);
            const details = await detailsRes.json();
            
            if (isTV) {
                if (details.number_of_seasons) apiSeasons = details.number_of_seasons;
                if (details.number_of_episodes) apiEpisodes = details.number_of_episodes;
            }
            if (!globalRating && details.vote_average && details.vote_average > 0) {
                globalRating = details.vote_average.toFixed(1);
            }
            if (!actualReleaseYear) {
                const detailDate = details.first_air_date || details.release_date || '';
                if (detailDate) actualReleaseYear = extractYearFromDate(detailDate);
            }
            if (!posterUrl && !item.poster) {
                if (details.poster_path) {
                    posterUrl = IMG_BASE_URL + details.poster_path;
                } else if (details.images && details.images.posters && details.images.posters.length > 0) {
                    posterUrl = IMG_BASE_URL + details.images.posters[0].file_path;
                } else if (details.backdrop_path) {
                    posterUrl = IMG_BASE_URL + details.backdrop_path;
                }
            }
        } catch(e) { console.error(e); }
    }

    if (!actualReleaseYear && (item.category.includes('2026') || item.modern_only)) {
        actualReleaseYear = '2026';
    }

    const resultObj = {
        posterUrl: posterUrl || `https://placehold.co/500x750/1a1a24/b095f6?text=${encodeURIComponent(item.name)}`,
        globalRating: globalRating || item.fallback_imdb || '7.5',
        apiSeasons: apiSeasons || item.seasons || '',
        apiEpisodes: apiEpisodes || item.episodes || '',
        releaseYear: actualReleaseYear
    };

    tmdbCache[cacheKey] = resultObj;
    return resultObj;
}

async function displayItems(items, isFavView = false) {
    updateAllCounts(items.length);

    if (items.length === 0) {
        populateYearDropdown([]);
        const emptyMsg = isFavView 
            ? 'لا توجد أعمال في المفضلة حالياً.. قيّم أي عمل بـ 9 أو 10 ليظهر هنا ❤️' 
            : 'لا توجد أعمال في هذا القسم حالياً 🍿';
        container.innerHTML = `<p style="text-align:center; width:100%; color:var(--text-muted); font-size:1.2em;">${emptyMsg}</p>`;
        return;
    }

    container.innerHTML = '<p style="text-align:center; width:100%; color:var(--lavender-accent); font-size:1.3em;">جاري تحميل البوسترات الأصلية وسنوات الإصدار... 🚀</p>';
    
    const itemsWithRatings = items.map(item => {
        return { ...item, finalRating: getEffectiveRating(item) };
    });

    itemsWithRatings.sort((a, b) => b.finalRating - a.finalRating);

    const collectedYears = [];

    const fetchPromises = itemsWithRatings.map(async (item) => {
        const tmdbInfo = await fetchSmartTMDBData(item);
        if (tmdbInfo.releaseYear) collectedYears.push(tmdbInfo.releaseYear);

        let statusBadge = '';
        if (item.status === 'completed' || !item.status) {
            statusBadge = '<span class="status-badge status-completed">✓ اكتمل</span>';
        } else if (item.category === 'arabic_series_2026') {
            statusBadge = `<span class="status-badge status-watchlist">⏳ عايز أشوفه ${item.stoppedAt ? '(' + item.stoppedAt + ')' : ''}</span>`;
        } else {
            statusBadge = `<span class="status-badge status-dropped">✗ وقف عند ${item.stoppedAt || ''}</span>`;
        }

        const canToggleStatus = hasSubSections(item.category);
        let toggleLabel = '';
        if (canToggleStatus) {
            if (item.status === 'dropped') {
                toggleLabel = '↪️ نقل لـ كملتها';
            } else {
                toggleLabel = item.category === 'arabic_series_2026' ? '⏳ نقل لـ عايز أشوفها' : '⏸️ نقل لـ وقفتها';
            }
        }

        const toggleBtnHtml = canToggleStatus 
            ? `<button class="toggle-status-btn" onclick="toggleItemStatus('${encodeURIComponent(item.name)}', '${item.category}')">${toggleLabel}</button>`
            : '';
            
        const hasValidRating = item.finalRating > 0;
        const displayRating = hasValidRating ? item.finalRating : 'لم يقيم';
        const safeId = encodeURIComponent(item.name).replace(/[^a-zA-Z0-9]/g, '_');
        const fallbackImg = `https://placehold.co/500x750/1a1a24/b095f6?text=${encodeURIComponent(item.name)}`;

        return `
            <div class="card" data-name="${item.name}" data-rating="${hasValidRating ? item.finalRating : -1}" data-year="${tmdbInfo.releaseYear || ''}">
                <button class="delete-btn" title="حذف نهائي" onclick="deleteItem('${encodeURIComponent(item.name)}', '${item.category}')">✖</button>
                ${statusBadge}
                ${toggleBtnHtml}
                <img src="${tmdbInfo.posterUrl}" alt="${item.name}" onerror="this.onerror=null;this.src='${fallbackImg}';">
                <div class="card-content">
                    <h3 class="movie-title">${item.name}</h3>
                    
                    <div class="meta-info">
                        ${isFavView ? `<span class="meta-tag cat-tag">📌 ${categoryNamesMap[item.category] || item.category}</span>` : ''}
                        ${tmdbInfo.releaseYear ? `<span class="meta-tag" title="سنة الإصدار">📅 ${tmdbInfo.releaseYear}</span>` : ''}
                        ${tmdbInfo.apiSeasons ? `<span class="meta-tag">📺 المواسم: ${tmdbInfo.apiSeasons}</span>` : ''}
                        ${tmdbInfo.apiEpisodes ? `<span class="meta-tag">🎞️ الحلقات: ${tmdbInfo.apiEpisodes}</span>` : ''}
                        <span class="meta-tag imdb-tag">🌍 IMDb: ⭐ ${tmdbInfo.globalRating}</span>
                    </div>
                    
                    <div class="my-rating-box" id="display_${safeId}">
                        👤 تقييمي: ⭐ ${displayRating}
                    </div>
                    
                    <div class="user-rating-control">
                        <input type="number" min="0" max="10" step="0.5" placeholder="تقييم" id="input_${safeId}" value="${hasValidRating ? item.finalRating : ''}">
                        <button onclick="saveMyRating('${encodeURIComponent(item.name)}')">حفظ</button>
                    </div>
                </div>
            </div>`;
    });

    const htmlArray = await Promise.all(fetchPromises);
    container.innerHTML = htmlArray.join('');

    // تحديث قائمة السنوات وتطبيق أي فلاتر مختارة
    populateYearDropdown(collectedYears);
    applyLocalFilters();
}

function updateSubNavUI() {
    if (hasSubSections(activeCategory)) {
        subNav.style.display = 'flex';
        if (statusOptDropped) {
            statusOptDropped.innerText = activeCategory === 'arabic_series_2026' 
                ? 'عايز أشوفه / لسه ما خلصتوش (⏳)' 
                : 'لم يكتمل / وقفته (✗)';
        }
    } else {
        subNav.style.display = 'none';
    }
}

favBtn.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('active'));
    favBtn.classList.add('active');
    
    activeCategory = 'favorites';
    subNav.style.display = 'none';
    addFormContainer.style.display = 'none';
    
    resetLocalFilters();
    filterAndDisplay();
});

buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        favBtn.classList.remove('active');
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        activeCategory = btn.dataset.filter;
        const labelSpan = btn.querySelector('.btn-label');
        currentCategorySpan.innerText = labelSpan ? labelSpan.innerText : btn.innerText;
        addFormContainer.style.display = 'block';
        
        updateSubNavUI();
        cinemaLangSelect.style.display = (activeCategory === 'cinema') ? 'block' : 'none';

        if (hasSubSections(activeCategory)) {
            statusSelect.value = activeSubFilter;
            stoppedInput.style.display = (activeSubFilter === 'dropped') ? 'block' : 'none';
        } else {
            statusSelect.value = 'completed';
            stoppedInput.style.display = 'none';
        }
        
        resetLocalFilters();
        filterAndDisplay();
    });
});

subButtons.forEach(subBtn => {
    subBtn.addEventListener('click', () => {
        subButtons.forEach(b => b.classList.remove('active'));
        subBtn.classList.add('active');
        
        activeSubFilter = subBtn.dataset.subfilter;
        statusSelect.value = activeSubFilter;
        stoppedInput.style.display = (activeSubFilter === 'dropped') ? 'block' : 'none';

        resetLocalFilters();
        filterAndDisplay();
    });
});

loadData();
