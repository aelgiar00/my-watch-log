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

    const favCount = allData.filter(item => getEffectiveRating(item) >= 9).length;
    if (favCountBadge) favCountBadge.innerText = favCount;

    if (activeCategory === 'anime' || activeCategory === 'english_series') {
        const compCount = allData.filter(item => item.category === activeCategory && (item.status || 'completed') === 'completed').length;
        const dropCount = allData.filter(item => item.category === activeCategory && item.status === 'dropped').length;
        
        const compLabel = activeCategory === 'anime' ? '✅ أنميات كملتها' : '✅ مسلسلات كملتها';
        const dropLabel = activeCategory === 'anime' ? '❌ أنميات وقفتها / ما شوفتهاش' : '❌ مسلسلات وقفتها / ما كملتهاش';
        
        subBtnCompleted.innerHTML = `<span>${compLabel}</span> <span class="btn-count">${compCount}</span>`;
        subBtnDropped.innerHTML = `<span>${dropLabel}</span> <span class="btn-count">${dropCount}</span>`;
    }

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

// دالة البحث المفصولة: إنجليزي صافي للأجنبي والأنمي، وعربي صافي للعربي
async function fetchSmartTMDBData(item) {
    const isTV = item.category.includes('series') || item.category === 'anime';
    const type = isTV ? 'tv' : 'movie';
    
    // تحديد هل العمل عربي ولا أجنبي/أنمي
    const isArabicCategory = item.category.startsWith('arabic_') || (item.category === 'cinema' && item.lang === 'ar');

    let posterUrl = null;
    let globalRating = null;
    let apiSeasons = '';
    let apiEpisodes = '';
    let matchedId = item.tmdb_id || null;

    // 1. لو فيه ID مباشر من TMDB
    if (matchedId) {
        try {
            // لو أجنبي أو أنمي بنطلب en-US فقط عشان مستحيل يجيب بوستر مدبلج عربي
            const langParam = isArabicCategory ? 'ar-EG' : 'en-US';
            const directRes = await fetch(`${TMDB_BASE_URL}/${type}/${matchedId}?api_key=${TMDB_API_KEY}&language=${langParam}`);
            const directData = await directRes.json();
            if (directData.poster_path) posterUrl = IMG_BASE_URL + directData.poster_path;
            if (directData.vote_average && directData.vote_average > 0) globalRating = directData.vote_average.toFixed(1);
            if (isTV) {
                if (directData.number_of_seasons) apiSeasons = directData.number_of_seasons;
                if (directData.number_of_episodes) apiEpisodes = directData.number_of_episodes;
            }
        } catch(e) { console.error(e); }
    }

    // 2. البحث بالاسم
    if (!posterUrl) {
        const queries = [];
        if (item.tmdb_search_name) queries.push(item.tmdb_search_name);
        if (item.alt_queries && Array.isArray(item.alt_queries)) queries.push(...item.alt_queries);
        if (!queries.includes(item.name)) queries.push(item.name);

        let bestMatch = null;

        for (const q of queries) {
            try {
                let resultsList = [];

                if (!isArabicCategory) {
                    // للأفلام والمسلسلات الأجنبي والأنمي: نبحث بـ en-US فقط لمنع أي بوستر عربي مدبلج
                    const resEn = await fetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=en-US`);
                    const dataEn = await resEn.json();
                    resultsList = dataEn.results || [];
                } else {
                    // للأعمال العربي فقط: نبحث في العربي والإنجليزي مع اشتراط أن تكون اللغة الأصلية للعمل هي العربية (ar) لمنع أفلام زي The Gentlemen
                    const [resAr, resEn] = await Promise.all([
                        fetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=ar-EG`),
                        fetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}&language=en-US`)
                    ]);
                    const dataAr = await resAr.json();
                    const dataEn = await resEn.json();

                    let combined = [...(dataAr.results || []), ...(dataEn.results || [])];
                    
                    // فلتر صارم لقسم العربي: لازم يكون العمل عربي الأصلي (original_language === 'ar') إلا لو هو مضاف استثناء
                    const arabicOnly = combined.filter(r => r.original_language === 'ar');
                    if (arabicOnly.length > 0) {
                        combined = arabicOnly;
                    }

                    const uniqueMap = new Map();
                    for (const r of combined) {
                        if (!uniqueMap.has(r.id)) {
                            uniqueMap.set(r.id, r);
                        } else {
                            const existing = uniqueMap.get(r.id);
                            if (!existing.poster_path && r.poster_path) existing.poster_path = r.poster_path;
                            if ((!existing.vote_average || existing.vote_average === 0) && r.vote_average > 0) existing.vote_average = r.vote_average;
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
                        if (chosen.poster_path) break;
                    }
                }
            } catch (e) { console.error(e); }
        }

        if (bestMatch) {
            matchedId = bestMatch.id;
            if (bestMatch.poster_path) posterUrl = IMG_BASE_URL + bestMatch.poster_path;
            if (bestMatch.vote_average && bestMatch.vote_average > 0) globalRating = bestMatch.vote_average.toFixed(1);
        }
    }

    // 3. جلب عدد المواسم والحلقات الدقيق (أو البوستر الأصلي لو ناقص)
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

    return {
        posterUrl: posterUrl || `https://placehold.co/500x750/1a1a24/b095f6?text=${encodeURIComponent(item.name)}`,
        globalRating: globalRating || item.fallback_imdb || '7.5',
        apiSeasons: apiSeasons || item.seasons || '',
        apiEpisodes: apiEpisodes || item.episodes || ''
    };
}

async function displayItems(items, isFavView = false) {
    if (items.length === 0) {
        const emptyMsg = isFavView 
            ? 'لا توجد أعمال في المفضلة حالياً.. قيّم أي عمل بـ 9 أو 10 ليظهر هنا ❤️' 
            : 'لا توجد أعمال في هذا القسم حالياً 🍿';
        container.innerHTML = `<p style="text-align:center; width:100%; color:var(--text-muted); font-size:1.2em;">${emptyMsg}</p>`;
        return;
    }

    container.innerHTML = '<p style="text-align:center; width:100%; color:var(--lavender-accent); font-size:1.5em;">جاري تحميل البوسترات الأصلية... 🚀</p>';
    
    const itemsWithRatings = items.map(item => {
        return { ...item, finalRating: getEffectiveRating(item) };
    });

    itemsWithRatings.sort((a, b) => b.finalRating - a.finalRating);

    const fetchPromises = itemsWithRatings.map(async (item) => {
        const tmdbInfo = await fetchSmartTMDBData(item);

        let statusBadge = item.status === 'completed' 
            ? '<span class="status-badge status-completed">✓ اكتمل</span>' 
            : `<span class="status-badge status-dropped">✗ وقف عند ${item.stoppedAt || ''}</span>`;
            
        const hasValidRating = item.finalRating >= 0;
        const displayRating = hasValidRating ? item.finalRating : 'لم يقيم';
        const safeId = encodeURIComponent(item.name).replace(/[^a-zA-Z0-9]/g, '_');
        const fallbackImg = `https://placehold.co/500x750/1a1a24/b095f6?text=${encodeURIComponent(item.name)}`;

        return `
            <div class="card">
                <button class="delete-btn" title="حذف من اللوج" onclick="deleteItem('${encodeURIComponent(item.name)}', '${item.category}')">✖</button>
                ${statusBadge}
                <img src="${tmdbInfo.posterUrl}" alt="${item.name}" onerror="this.onerror=null;this.src='${fallbackImg}';">
                <div class="card-content">
                    <h3 class="movie-title">${item.name}</h3>
                    
                    <div class="meta-info">
                        ${isFavView ? `<span class="meta-tag cat-tag">📌 ${categoryNamesMap[item.category] || item.category}</span>` : ''}
                        ${item.year_watched ? `<span class="meta-tag">📅 ${item.year_watched}</span>` : ''}
                        ${tmdbInfo.apiSeasons ? `<span class="meta-tag">📺 المواسم: ${tmdbInfo.apiSeasons}</span>` : ''}
                        ${tmdbInfo.apiEpisodes ? `<span class="meta-tag">🎞️ الحلقات: ${tmdbInfo.apiEpisodes}</span>` : ''}
                        <span class="meta-tag imdb-tag">🌍 IMDb: ⭐ ${tmdbInfo.globalRating}</span>
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
