const TMDB_API_KEY = 'f3cefc2462aadaabd61feafa4ec78ce4'; // مفتاحك جاهز هنا
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const container = document.getElementById('app-container');
const buttons = document.querySelectorAll('.filter-btn');
const subButtons = document.querySelectorAll('.sub-filter-btn');
const animeSubNav = document.getElementById('anime-sub-nav');
const currentCategorySpan = document.getElementById('current-category-name');
const statusSelect = document.getElementById('new-item-status');
const stoppedInput = document.getElementById('new-item-stopped');
const cinemaLangSelect = document.getElementById('cinema-lang-select');

let allData = [];
let activeCategory = 'arabic_series_2026';
let activeAnimeSubFilter = 'completed'; // الافتراضي للأنمي هو المكتمل

// إظهار/إخفاء خانة "وقفت فين"
statusSelect.addEventListener('change', function() {
    if(this.value === 'dropped') {
        stoppedInput.style.display = 'block';
    } else {
        stoppedInput.style.display = 'none';
        stoppedInput.value = '';
    }
});

// تحميل الداتا واستبعاد المحذوفات
async function loadData() {
    try {
        const response = await fetch('data.json');
        const jsonData = await response.json();
        const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
        const deletedItems = JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [];
        
        // دمج الداتا الأساسية مع الإضافات، وفلترة أي عنصر عملتله حذف (X)
        const combinedData = [...localItems, ...jsonData];
        allData = combinedData.filter(item => !deletedItems.includes(item.name + '_' + item.category));
        
        filterAndDisplay();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// دالة الفلترة الذكية (بتراعي قسم الأنمي الفرعي)
function filterAndDisplay() {
    let filteredData = allData.filter(item => item.category === activeCategory);
    
    // لو احنا في قسم الأنمي، نفلتر كمان حسب (كملته ولا وقفته)
    if (activeCategory === 'anime') {
        filteredData = filteredData.filter(item => item.status === activeAnimeSubFilter);
    }
    
    displayItems(filteredData);
}

// دالة حذف عنصر (زرار X)
window.deleteItem = function(encodedName, category) {
    const name = decodeURIComponent(encodedName);
    if (!confirm(`متأكد إنك عايز تمسح "${name}" من اللوج نهائياً؟`)) return;

    const uniqueKey = name + '_' + category;
    
    // تسجيل العنصر في قائمة المحذوفات عشان ما يظهرش تاني من الـ JSON
    const deletedItems = JSON.parse(localStorage.getItem('my_deleted_watch_items')) || [];
    if (!deletedItems.includes(uniqueKey)) {
        deletedItems.push(uniqueKey);
        localStorage.setItem('my_deleted_watch_items', JSON.stringify(deletedItems));
    }

    // لو كان مضاف يدوياً في اللوكال ستوريج نمسحه منها كمان
    let localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    localItems = localItems.filter(item => !(item.name === name && item.category === category));
    localStorage.setItem('my_added_watch_items', JSON.stringify(localItems));

    // تحديث المصفوفة الحالية وإعادة العرض فوراً
    allData = allData.filter(item => !(item.name === name && item.category === category));
    filterAndDisplay();
}

// إضافة عمل جديد
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

    // تنظيف الفورم
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-rating').value = '';
    stoppedInput.value = '';

    // لو ضفنا أنمي حالته مختلفة عن التاب المفتوح، نفتح التاب بتاعه عشان تشوفه
    if (activeCategory === 'anime' && status !== activeAnimeSubFilter) {
        activeAnimeSubFilter = status;
        subButtons.forEach(b => {
            b.classList.toggle('active', b.dataset.subfilter === status);
        });
    }

    filterAndDisplay();
}

// حفظ التقييم
window.saveMyRating = function(encodedName) {
    const name = decodeURIComponent(encodedName);
    const safeId = encodedName.replace(/[^a-zA-Z0-9]/g, '_');
    const inputField = document.getElementById('input_' + safeId);
    const displaySpan = document.getElementById('display_' + safeId);
    
    if (inputField && inputField.value !== '') {
        localStorage.setItem('rating_' + name, inputField.value);
        displaySpan.innerHTML = `👤 تقييمي: ⭐ ${inputField.value}`;
        inputField.style.backgroundColor = '#4CAF50'; inputField.style.color = 'white';
        setTimeout(() => { inputField.style.backgroundColor = 'rgba(176, 149, 246, 0.1)'; }, 800);
    }
}

// عرض الكروت وسحب الداتا بدقة عالية
async function displayItems(items) {
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align:center; width:100%; color:var(--text-muted); font-size:1.2em;">لا توجد أعمال في هذا القسم حالياً 🍿</p>';
        return;
    }

    container.innerHTML = '<p style="text-align:center; width:100%; color:var(--lavender-accent); font-size:1.5em;">جاري التحميل... 🚀</p>';
    
    const itemsWithRatings = items.map(item => {
        let savedRating = localStorage.getItem('rating_' + item.name);
        let finalRating = 0;
        if (savedRating && savedRating !== '') finalRating = parseFloat(savedRating);
        else if (item.myRating) finalRating = parseFloat(item.myRating);
        return { ...item, finalRating };
    });

    // ترتيب تنازلي حسب تقييمك
    itemsWithRatings.sort((a, b) => b.finalRating - a.finalRating);

    const fetchPromises = itemsWithRatings.map(async (item) => {
        let posterUrl = item.poster ? item.poster : 'https://via.placeholder.com/500x750/1a1a24/b095f6?text=No+Poster';
        let globalRating = 'N/A';
        let apiSeasons = ''; let apiEpisodes = '';
        
        try {
            const isTV = item.category.includes('series') || item.category === 'anime';
            const type = isTV ? 'tv' : 'movie';
            
            // لو محددين ID مباشر من TMDB في ملف JSON عشان نمنع أي خطأ في الصور
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
                // البحث الذكي بالاسم
                const searchQuery = item.tmdb_search_name ? item.tmdb_search_name : item.name;
                let searchUrl = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}`;
                
                // لو محددين سنة إنتاج معينة للعمل عشان نفرق بين القديم والجديد
                if (item.release_year) {
                    searchUrl += isTV ? `&first_air_date_year=${item.release_year}` : `&primary_release_year=${item.release_year}`;
                }

                const res = await fetch(searchUrl);
                const tmdbData = await res.json();
                
                if (tmdbData.results && tmdbData.results.length > 0) {
                    let result = tmdbData.results.find(r => {
                        const title = (r.name || r.title || r.original_name || r.original_title || '').toLowerCase();
                        return title === searchQuery.trim().toLowerCase();
                    });
                    if (!result) result = tmdbData.results[0];

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
        } catch(e) { console.error("TMDB error", e); }

        let statusBadge = item.status === 'completed' 
            ? '<span class="status-badge status-completed">✓ اكتمل</span>' 
            : `<span class="status-badge status-dropped">✗ وقف عند ${item.stoppedAt || ''}</span>`;
            
        const displayRating = item.finalRating > 0 ? item.finalRating : 'لم يقيم';
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
                    ${item.year_watched ? `<p><strong>سنة المشاهدة:</strong> ${item.year_watched}</p>` : ''}
                    ${displaySeasons ? `<p><strong>المواسم:</strong> ${displaySeasons}</p>` : ''}
                    ${displayEpisodes ? `<p><strong>الحلقات:</strong> ${displayEpisodes}</p>` : ''}
                    <div class="rating">
                        <span>🌍 IMDb: ⭐ ${globalRating}</span>
                        <span style="color:var(--lavender-accent)" id="display_${safeId}">👤 تقييمي: ⭐ ${displayRating}</span>
                    </div>
                    <div class="user-rating-control">
                        <input type="number" min="0" max="10" step="0.5" placeholder="تقييمك" id="input_${safeId}" value="${item.finalRating > 0 ? item.finalRating : ''}">
                        <button onclick="saveMyRating('${encodeURIComponent(item.name)}')">حفظ</button>
                    </div>
                </div>
            </div>`;
    });

    const htmlArray = await Promise.all(fetchPromises);
    container.innerHTML = htmlArray.join('');
}

// التحكم في الأزرار الرئيسية
buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        activeCategory = btn.dataset.filter;
        currentCategorySpan.innerText = btn.innerText;
        
        // إظهار القسم الفرعي لو اخترنا أنمي فقط
        animeSubNav.style.display = (activeCategory === 'anime') ? 'flex' : 'none';
        
        // إظهار اختيار اللغة لو اخترنا سينما فقط
        cinemaLangSelect.style.display = (activeCategory === 'cinema') ? 'block' : 'none';

        // ضبط حالة القائمة المنسدلة في الفورم تلقائياً لو احنا في الأنمي
        if (activeCategory === 'anime') {
            statusSelect.value = activeAnimeSubFilter;
            stoppedInput.style.display = (activeAnimeSubFilter === 'dropped') ? 'block' : 'none';
        }
        
        filterAndDisplay();
    });
});

// التحكم في الأزرار الفرعية للأنمي (مكتمل / متوقف)
subButtons.forEach(subBtn => {
    subBtn.addEventListener('click', () => {
        subButtons.forEach(b => b.classList.remove('active'));
        subBtn.classList.add('active');
        
        activeAnimeSubFilter = subBtn.dataset.subfilter;
        
        // نخلي الفورم فوق توافق القسم اللي انت واقف فيه تلقائي
        statusSelect.value = activeAnimeSubFilter;
        stoppedInput.style.display = (activeAnimeSubFilter === 'dropped') ? 'block' : 'none';

        filterAndDisplay();
    });
});

loadData();
