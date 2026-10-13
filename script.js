const TMDB_API_KEY = 'f3cefc2462aadaabd61feafa4ec78ce4';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';

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

let allData = [];
let activeCategory = 'arabic_series_2026';
let activeSubFilter = 'completed';

const categoryNamesMap = {
    'arabic_series_2026': 'مسلسلات عربي',
    'arabic_movies_2026': 'أفلام عربي',
    'english_movies_2026': 'أفلام أجنبي',
    'english_series': 'مسلسلات أجنبي',
    'anime': 'أنمي',
    'cinema': 'سينما 🎟️'
};

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

// دالة تحديث العدادات على كل الأزرار وفي الشريط الرئيسي
function updateAllCounts(currentFilteredCount = 0) {
    // 1. تحديث عدادات الأزرار الرئيسية
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

    // 2. تحديث عداد المفضلة (9 و 10)
    const favCount = allData.filter(item => getEffectiveRating(item) >= 9).length;
    if (favCountBadge) favCountBadge.innerText = favCount;

    // 3. تحديث عدادات الشريط الفرعي (لو مفتوح في الأنمي أو المسلسلات الأجنبي)
    if (activeCategory === 'anime' || activeCategory === 'english_series') {
        const compCount = allData.filter(item => item.category === activeCategory && (item.status || 'completed') === 'completed').length;
        const dropCount = allData.filter(item => item.category === activeCategory && item.status === 'dropped').length;
        
        const compLabel = activeCategory === 'anime' ? '✅ أنميات كملتها' : '✅ مسلسلات كملتها';
        const dropLabel = activeCategory === 'anime' ? '❌ أنميات وقفتها / ما شوفتهاش' : '❌ مسلسلات وقفتها / ما كملتهاش';
        
        subBtnCompleted.innerHTML = `<span>${compLabel}</span> <span class="btn-count">${compCount}</span>`;
        subBtnDropped.innerHTML = `<span>${dropLabel}</span> <span class="btn-count">${dropCount}</span>`;
    }

    // 4. تحديث الشريط الكبير فوق الكروت
    let titleText = '';
    if (activeCategory === 'favorites') {
        titleText = '❤️ إجمالي الأعمال المفضلة (تقييم 9 و 10):';
    } else if (activeCategory === 'anime') {
        titleText = activeSubFilter === 'completed' ? '🎬 إجمالي أنميات كملتها:' : '🛑 إجمالي أنميات وقفتها:';
    } else if (activeCategory === 'english_series') {
        titleText = activeSubFilter === 'completed' ? '📺 إجمالي مسلسلات أجنبي كملتها:' : '🛑 إجمالي مسلسلات أجنبي وقفتها:';
    } else {
        titleText = `📊 إجمالي ${categoryNamesMap[activeCategory] || activeCategory}:`;
    }
    
    bannerTitle.innerText = titleText;
    bannerCount.innerText = currentFilteredCount;
}

async function loadData() {
    try {
        const response = await fetch('data.json');
        const jsonData = await response.json();
        const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
        const deletedItems = JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [];
        
        const combinedData = [...localItems, ...jsonData];
        allData = combinedData.filter(item => !deletedItems.includes(item.name + '_' + item.category));
        
        filterAndDisplay();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function filterAndDisplay() {
    if (activeCategory === 'favorites') {
        const favData = allData.filter(item => getEffectiveRating(item) >= 9);
        updateAllCounts(favData.length);
        displayItems(favData, true);
        return;
    }

    let filteredData = allData.filter(item => item.category === activeCategory);
    
    if (activeCategory === 'anime' || activeCategory === 'english_series') {
        filteredData = filteredData.filter(item => (item.status || 'completed') === activeSubFilter);
    }
    
    updateAllCounts(filteredData.length);
    displayItems(filteredData, false);
}

window.deleteItem = function(encodedName, category) {
    const name = decodeURIComponent(encodedName);
    if (!confirm(`متأكد إنك عايز تمسح "${name}" من اللوج نهائياً؟`)) return;

    const uniqueKey = name + '_' + category;
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
}

window.addNewItem = function() {
    const name = document.getElementById('new-item-name').value.trim();
    const status = statusSelect.value;
    const stoppedAt = stoppedInput.value;
    const myRating = document.getElementById('new-item-rating').value;
    const cinemaLang = cinemaLangSelect.value;

    if(!name) { alert('أرجوك اكتب اسم العمل الأول!'); return; }

    const newItem = {
        name: name,
        tmdb_search_name: name,
        category: activeCategory,
        status: status,
        stoppedAt: status === 'dropped' ? stoppedAt : "",
        myRating: myRating ? parseFloat(myRating) : 0,
        year_watched: new Date().getFullYear(),
        lang: activeCategory === 'cinema' ? cinemaLang : null
    };

    allData.unshift(newItem);
    const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    localItems.unshift(newItem);
    localStorage.setItem('my_added_watch_items', JSON.stringify(localItems));
    
    if(myRating) localStorage.setItem('rating_' + name, myRating);

    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-rating').value = '';
    stoppedInput.value = '';

    if ((activeCategory === 'anime' || activeCategory === 'english_series') && status !== activeSubFilter) {
        activeSubFilter = status;
        subButtons.forEach(b => {
            b.classList.toggle('active', b.dataset.subfilter === status);
        });
    }

    filterAndDisplay();
}

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
    }
}

async function displayItems(items, isFavView = false) {
    if (items.length === 0) {
        const emptyMsg = isFavView 
            ? 'لا توجد أعمال في المفضلة حالياً.. قيّم أي عمل بـ 9 أو 10 ليظهر هنا ❤️' 
            : 'لا توجد أعمال في هذا القسم حالياً 🍿';
        container.innerHTML = `<p style="text-align:center; width:100%; color:var(--text-muted); font-size:1.2em;">${emptyMsg}</p>`;
        return;
    }

    container.innerHTML = '<p style="text-align:center; width:100%; color:var(--lavender-accent); font-size:1.5em;">جاري التحميل والترتيب... 🚀</p>';
    
    const itemsWithRatings = items.map(item => {
        return { ...item, finalRating: getEffectiveRating(item) };
    });

    itemsWithRatings.sort((a, b) => b.finalRating - a.finalRating);

    const fetchPromises = itemsWithRatings.map(async (item) => {
        let posterUrl = item.poster ? item.poster : 'https://via.placeholder.com/500x750/1a1a24/b095f6?text=' + encodeURIComponent(item.name);
        let globalRating = 'N/A';
        let apiSeasons = ''; let apiEpisodes = '';
        
        try {
            const isTV = item.category.includes('series') || item.category === 'anime';
            const type = isTV ? 'tv' : 'movie';
            
            if (item.tmdb_id) {
                const directRes = await fetch(`${TMDB_BASE_URL}/${type}/${item.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`);
                const directData = await directRes.json();
                if (directData.poster_path && !item.poster) posterUrl = IMG_BASE_URL + directData.poster_path;
                globalRating = directData.vote_average ? directData.vote_average.toFixed(1) : 'N/A';
                if (isTV) {
                    if(directData.number_of_seasons) apiSeasons = directData.number_of_seasons;
                    if(directData.number_of_episodes) apiEpisodes = directData.number_of_episodes;
                }
            } else {
                const searchQuery = item.tmdb_search_name ? item.tmdb_search_name : item.name;
                let searchUrl = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}`;
                
                if (item.release_year) {
                    searchUrl += isTV ? `&first_air_date_year=${item.release_year}` : `&primary_release_year=${item.release_year}`;
                }

                const res = await fetch(searchUrl);
                const tmdbData = await res.json();
                
                if (tmdbData.results && tmdbData.results.length > 0) {
                    let resultsList = tmdbData.results;

                    if (item.modern_only) {
                        resultsList = resultsList.filter(r => {
                            const dateStr = r.release_date || r.first_air_date || '';
                            const year = parseInt(dateStr.substring(0, 4));
                            return year >= 2024;
                        });
                    }

                    if (resultsList.length > 0) {
                        let result = resultsList.find(r => {
                            const title = (r.name || r.title || r.original_name || r.original_title || '').toLowerCase();
                            return title === searchQuery.trim().toLowerCase();
                        });
                        if (!result) result = resultsList[0];

                        if (result.poster_path && !item.poster) posterUrl = IMG_BASE_URL + result.poster_path;
                        globalRating = result.vote_average ? result.vote_average.toFixed(1) : 'N/A';
                        
                        if (isTV && result.id) {
                            const detailsRes = await fetch(`${TMDB_BASE_URL}/tv/${result.id}?api_key=${TMDB_API_KEY}&language=en-US`);
                            const details = await detailsRes.json();
                            if(details.number_of_seasons) apiSeasons = details.number_of_seasons;
                            if(details.number_of_episodes) apiEpisodes = details.number_of_episodes;
                        }
                    }
                }
            }
        } catch(e) { console.error("TMDB error", e); }

        let statusBadge = item.status === 'completed' 
            ? '<span class="status-badge status-completed">✓ اكتمل</span>' 
            : `<span class="status-badge status-dropped">✗ وقف عند ${item.stoppedAt || ''}</span>`;
            
        const hasValidRating = item.finalRating >= 0;
        const displayRating = hasValidRating ? item.finalRating : 'لم يقيم';
        const displaySeasons = apiSeasons || item.seasons || '';
        const displayEpisodes = apiEpisodes || item.episodes || '';
        const safeId = encodeURIComponent(item.name).replace(/[^a-zA-Z0-9]/g, '_');

        return `
            <div class="card">
                <button class="delete-btn" title="حذف من اللوج" onclick="deleteItem('${encodeURIComponent(item.name)}', '${item.category}')">✖</button>
                ${statusBadge}
                <img src="${posterUrl}" alt="${item.name}">
                <div class="card-content">
                    <h3 class="movie-title">${item.name}</h3>
                    
                    <div class="meta-info">
                        ${isFavView ? `<span class="meta-tag cat-tag">📌 ${categoryNamesMap[item.category] || item.category}</span>` : ''}
                        ${item.year_watched ? `<span class="meta-tag">📅 ${item.year_watched}</span>` : ''}
                        ${displaySeasons ? `<span class="meta-tag">📺 المواسم: ${displaySeasons}</span>` : ''}
                        ${displayEpisodes ? `<span class="meta-tag">🎞️ الحلقات: ${displayEpisodes}</span>` : ''}
                        <span class="meta-tag imdb-tag">🌍 IMDb: ⭐ ${globalRating}</span>
                    </div>
                    
                    <div class="my-rating-box" id="display_${safeId}">
                        👤 تقييمي الشخصي: ⭐ ${displayRating}
                    </div>
                    
                    <div class="user-rating-control">
                        <input type="number" min="0" max="10" step="0.5" placeholder="تقييمك" id="input_${safeId}" value="${hasValidRating ? item.finalRating : ''}">
                        <button onclick="saveMyRating('${encodeURIComponent(item.name)}')">حفظ</button>
                    </div>
                </div>
            </div>`;
    });

    const htmlArray = await Promise.all(fetchPromises);
    container.innerHTML = htmlArray.join('');
}

function updateSubNavUI() {
    if (activeCategory === 'anime' || activeCategory === 'english_series') {
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

        if (activeCategory === 'anime' || activeCategory === 'english_series') {
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
