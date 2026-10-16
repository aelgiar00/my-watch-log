const TMDB_API_KEY = 'f3cefc2462aadaabd61feafa4ec78ce4';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';

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
const stoppedInput = document.getElementById('new-item-stopped');
const cinemaLangSelect = document.getElementById('cinema-lang-select');
const bannerTitle = document.getElementById('banner-title');
const bannerCount = document.getElementById('banner-count');
const installAppBtn = document.getElementById('install-app-btn');
const cloudSyncBtn = document.getElementById('cloud-sync-btn');
const cloudStatusText = document.getElementById('cloud-status-text');

let allData = [];
let baseJsonData = [];
let activeCategory = 'arabic_series_2026';
let activeSubFilter = 'completed';
let deferredPrompt = null;
let cloudSyncStream = null;
let lastCloudSignature = '';
let resolvedYearsCache = {};

const categoryNamesMap = {
    'arabic_series_2026': 'مسلسلات عربي',
    'arabic_movies_2026': 'أفلام عربي',
    'english_movies_2026': 'أفلام أجنبي',
    'english_series': 'مسلسلات أجنبي',
    'anime': 'أنمي',
    'cinema': 'سينما 🎟️'
};

// ==========================================
// 🔍 التحكم في الدوائر التفاعلية (البحث والتقييمات والسنوات)
// ==========================================
window.toggleSearchInput = function() {
    const bar = document.getElementById('expandable-search-bar');
    const btn = document.getElementById('circle-search-btn');
    const input = document.getElementById('search-input');
    if (!bar) return;

    if (bar.style.display === 'none' || bar.style.display === '') {
        bar.style.display = 'flex';
        if (btn) btn.classList.add('active');
        if (input) input.focus();
    } else {
        bar.style.display = 'none';
        if (btn && (!input || !input.value.trim())) btn.classList.remove('active');
    }
};

window.clearAndCloseSearch = function() {
    const bar = document.getElementById('expandable-search-bar');
    const btn = document.getElementById('circle-search-btn');
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    if (bar) bar.style.display = 'none';
    if (btn) btn.classList.remove('active');
    filterAndDisplay();
};

window.onCircleFilterChange = function() {
    const ratingSelect = document.getElementById('filter-rating-select');
    const yearSelect = document.getElementById('filter-year-select');
    const ratingWrap = document.getElementById('rating-circle-wrap');
    const yearWrap = document.getElementById('year-circle-wrap');
    const ratingLabel = document.getElementById('rating-circle-label');
    const yearLabel = document.getElementById('year-circle-label');

    if (ratingSelect && ratingWrap && ratingLabel) {
        if (ratingSelect.value === 'all') {
            ratingWrap.classList.remove('active');
            ratingLabel.innerText = 'التقييم';
        } else {
            ratingWrap.classList.add('active');
            ratingLabel.innerText = ratingSelect.value === 'unrated' ? 'لم يقيم' : `${ratingSelect.value}/10`;
        }
    }

    if (yearSelect && yearWrap && yearLabel) {
        if (yearSelect.value === 'all') {
            yearWrap.classList.remove('active');
            yearLabel.innerText = 'السنة';
        } else {
            yearWrap.classList.add('active');
            yearLabel.innerText = yearSelect.value;
        }
    }

    filterAndDisplay();
};

window.resetAllCircleFilters = function() {
    const input = document.getElementById('search-input');
    const bar = document.getElementById('expandable-search-bar');
    const searchBtn = document.getElementById('circle-search-btn');
    const ratingSelect = document.getElementById('filter-rating-select');
    const yearSelect = document.getElementById('filter-year-select');

    if (input) input.value = '';
    if (bar) bar.style.display = 'none';
    if (searchBtn) searchBtn.classList.remove('active');
    if (ratingSelect) ratingSelect.value = 'all';
    if (yearSelect) yearSelect.value = 'all';

    onCircleFilterChange();
};

// ==========================================
// ☁️ نظام المزامنة السحابية اللحظية
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
        '☁️ للمزامنة اللحظية التلقائية بين اللاب والموبايل:\n\nانسخ رابط Firebase Realtime Database بتاعك وحطه هنا:',
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
            alert('لتثبيت التطبيق على موبايلك:\nاضغط على الثلاث نقاط في المتصفح واختار "تثبيت التطبيق / Install App".');
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
    } else if (item.myRating && item.myRating > 0) {
        return parseFloat(item.myRating);
    }
    return -1;
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

    const favCount = allData.filter(item => item.category !== 'cinema' && getEffectiveRating(item) >= 9).length;
    if (favCountBadge) favCountBadge.innerText = favCount;

    // تحديث النصوص والأعداد للشريط الفرعي (أنمي، مسلسلات أجنبي، مسلسلات عربي)
    if (activeCategory === 'anime' || activeCategory === 'english_series' || activeCategory === 'arabic_series_2026') {
        const compCount = allData.filter(item => item.category === activeCategory && (item.status || 'completed') === 'completed').length;
        const dropCount = allData.filter(item => item.category === activeCategory && item.status === 'dropped').length;
        
        let compLabel = '✅ شفتها';
        let dropLabel = '⏳ عايز أشوفها';

        if (activeCategory === 'anime') {
            compLabel = '✅ أنميات شفتها';
            dropLabel = '⏳ أنميات عايز أشوفها';
        } else if (activeCategory === 'english_series') {
            compLabel = '✅ مسلسلات شفتها';
            dropLabel = '⏳ مسلسلات عايز أشوفها';
        } else if (activeCategory === 'arabic_series_2026') {
            compLabel = '✅ شفتها';
            dropLabel = '⏳ عايز أشوفها';
        }
        
        subBtnCompleted.innerHTML = `<span>${compLabel}</span> <span class="btn-count">${compCount}</span>`;
        subBtnDropped.innerHTML = `<span>${dropLabel}</span> <span class="btn-count">${dropCount}</span>`;
    }

    let titleText = '';
    if (activeCategory === 'favorites') {
        titleText = '❤️ إجمالي الأعمال المفضلة (9 و 10):';
    } else if (activeCategory === 'anime') {
        titleText = activeSubFilter === 'completed' ? '🎬 إجمالي أنميات شفتها:' : '🛑 إجمالي أنميات عايز أشوفها:';
    } else if (activeCategory === 'english_series') {
        titleText = activeSubFilter === 'completed' ? '📺 إجمالي مسلسلات أجنبي شفتها:' : '🛑 إجمالي مسلسلات أجنبي عايز أشوفها:';
    } else if (activeCategory === 'arabic_series_2026') {
        titleText = activeSubFilter === 'completed' ? '📺 إجمالي مسلسلات عربي شفتها:' : '🛑 إجمالي مسلسلات عربي عايز أشوفها:';
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
        const matchingLocal = localItems.find(loc => normalizeText(loc.name) === normalizeText(item.name) && loc.category === item.category);
        if (matchingLocal) {
            if (item.poster && !matchingLocal.poster) {
                matchingLocal.poster = item.poster;
            }
            return false;
        }
        return !deletedItems.includes(keyWithStatus) && !deletedItems.includes(oldKey);
    }).map(item => {
        const overrideKey = `${item.name}_${item.category}`;
        if (statusOverrides[overrideKey]) {
            return { ...item, ...statusOverrides[overrideKey] };
        }
        return item;
    });

    allData = [...localItems, ...filteredJsonData];
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

function filterAndDisplay() {
    let baseList = [];

    if (activeCategory === 'favorites') {
        baseList = allData.filter(item => item.category !== 'cinema' && getEffectiveRating(item) >= 9);
    } else {
        baseList = allData.filter(item => item.category === activeCategory);
        if (activeCategory === 'anime' || activeCategory === 'english_series' || activeCategory === 'arabic_series_2026') {
            baseList = baseList.filter(item => (item.status || 'completed') === activeSubFilter);
        }
    }

    const searchInput = document.getElementById('search-input');
    const ratingSelect = document.getElementById('filter-rating-select');
    const yearSelect = document.getElementById('filter-year-select');

    const searchQuery = searchInput ? normalizeText(searchInput.value) : '';
    const selectedRating = ratingSelect ? ratingSelect.value : 'all';
    const selectedYear = yearSelect ? yearSelect.value : 'all';

    if (searchQuery) {
        baseList = baseList.filter(item => {
            const n1 = normalizeText(item.name);
            const n2 = normalizeText(item.tmdb_search_name || '');
            return n1.includes(searchQuery) || n2.includes(searchQuery);
        });
    }

    if (selectedRating !== 'all') {
        baseList = baseList.filter(item => {
            const r = getEffectiveRating(item);
            if (selectedRating === 'unrated') return r <= 0;
            return Math.floor(r) === parseInt(selectedRating);
        });
    }

    if (selectedYear !== 'all') {
        baseList = baseList.filter(item => {
            const cachedY = resolvedYearsCache[item.name + '_' + item.category] || (item.release_year ? item.release_year.toString() : '');
            return cachedY === selectedYear;
        });
    }

    updateAllCounts(baseList.length);
    displayItems(baseList, activeCategory === 'favorites');
}

window.toggleItemStatus = function(encodedName, category) {
    const name = decodeURIComponent(encodedName);
    const targetItem = allData.find(item => item.name === name && item.category === category);
    if (!targetItem) return;

    const currentStatus = targetItem.status || 'completed';
    const newStatus = currentStatus === 'completed' ? 'dropped' : 'completed';
    let stoppedAtVal = '';

    if (newStatus === 'dropped') {
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

    if ((activeCategory === 'anime' || activeCategory === 'english_series' || activeCategory === 'arabic_series_2026') && status !== activeSubFilter) {
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
    const isTV = item.category.includes('series') || item.category === 'anime';
    const type = isTV ? 'tv' : 'movie';
    const isArabicCategory = item.category.startsWith('arabic_') || (item.category === 'cinema' && item.lang === 'ar');

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
            if (!posterUrl && directData.poster_path) posterUrl = IMG_BASE_URL + directData.poster_path;
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

                    let anyWithPoster = resultsList.find(r => r.poster_path);
                    let chosen = exactWithPoster || anyWithPoster || resultsList[0];

                    if (chosen) {
                        bestMatch = chosen;
                        if (chosen.poster_path || posterUrl) break;
                    }
                }
            } catch (e) { console.error(e); }
        }

        if (bestMatch) {
            matchedId = bestMatch.id;
            if (!posterUrl && bestMatch.poster_path) posterUrl = IMG_BASE_URL + bestMatch.poster_path;
            if (bestMatch.vote_average && bestMatch.vote_average > 0) globalRating = bestMatch.vote_average.toFixed(1);
            const matchDate = bestMatch.first_air_date || bestMatch.release_date || '';
            if (matchDate) actualReleaseYear = extractYearFromDate(matchDate);
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
            if (!posterUrl) {
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

    if (actualReleaseYear) {
        resolvedYearsCache[item.name + '_' + item.category] = actualReleaseYear;
    }

    return {
        posterUrl: posterUrl || `https://placehold.co/500x750/1a1a24/b095f6?text=${encodeURIComponent(item.name)}`,
        globalRating: globalRating || item.fallback_imdb || '7.5',
        apiSeasons: apiSeasons || item.seasons || '',
        apiEpisodes: apiEpisodes || item.episodes || '',
        releaseYear: actualReleaseYear
    };
}

async function displayItems(items, isFavView = false) {
    if (items.length === 0) {
        const emptyMsg = isFavView 
            ? 'لا توجد أعمال في المفضلة حالياً.. قيّم أي عمل بـ 9 أو 10 ليظهر هنا ❤️' 
            : 'لا توجد أعمال مطابقة حالياً 🍿';
        container.innerHTML = `<p style="text-align:center; width:100%; color:var(--text-muted); font-size:1.2em;">${emptyMsg}</p>`;
        return;
    }

    container.innerHTML = '<p style="text-align:center; width:100%; color:var(--lavender-accent); font-size:1.3em;">جاري التحميل... 🚀</p>';
    
    const itemsWithRatings = items.map(item => {
        return { ...item, finalRating: getEffectiveRating(item) };
    });

    itemsWithRatings.sort((a, b) => b.finalRating - a.finalRating);

    const fetchPromises = itemsWithRatings.map(async (item) => {
        const tmdbInfo = await fetchSmartTMDBData(item);

        let statusBadge = item.status === 'completed' 
            ? '<span class="status-badge status-completed">✓ اكتمل</span>' 
            : `<span class="status-badge status-dropped">✗ وقف عند ${item.stoppedAt || ''}</span>`;

        const canToggleStatus = (item.category === 'anime' || item.category === 'english_series' || item.category === 'arabic_series_2026');
        const toggleBtnHtml = canToggleStatus 
            ? `<button class="toggle-status-btn" onclick="toggleItemStatus('${encodeURIComponent(item.name)}', '${item.category}')">
                ${item.status === 'dropped' ? '↪️ شفتها' : '⏸️ عايز أشوفها'}
               </button>`
            : '';
            
        const hasValidRating = item.finalRating >= 0;
        const displayRating = hasValidRating ? item.finalRating : 'لم يقيم';
        const safeId = encodeURIComponent(item.name).replace(/[^a-zA-Z0-9]/g, '_');
        const fallbackImg = `https://placehold.co/500x750/1a1a24/b095f6?text=${encodeURIComponent(item.name)}`;

        return `
            <div class="card">
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
}

function updateSubNavUI() {
    if (activeCategory === 'anime' || activeCategory === 'english_series' || activeCategory === 'arabic_series_2026') {
        subNav.style.display = 'flex';
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

        if (activeCategory === 'anime' || activeCategory === 'english_series' || activeCategory === 'arabic_series_2026') {
            statusSelect.value = activeSubFilter;
            stoppedInput.style.display = (activeSubFilter === 'dropped') ? 'block' : 'none';
        } else {
            statusSelect.value = 'completed';
            stoppedInput.style.display = 'none';
        }
        
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

        filterAndDisplay();
    });
});

loadData();
