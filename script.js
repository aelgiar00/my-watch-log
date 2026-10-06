const TMDB_API_KEY = 'f3cefc2462aadaabd61feafa4ec78ce4';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const container = document.getElementById('app-container');
const buttons = document.querySelectorAll('.filter-btn');
const currentCategorySpan = document.getElementById('current-category-name');
const statusSelect = document.getElementById('new-item-status');
const stoppedInput = document.getElementById('new-item-stopped');

let allData = [];
let activeCategory = 'arabic_series_2026';

// إظهار/إخفاء خانة "وقفت فين" في فورم الإضافة
statusSelect.addEventListener('change', function() {
    if(this.value === 'dropped') {
        stoppedInput.style.display = 'block';
    } else {
        stoppedInput.style.display = 'none';
        stoppedInput.value = '';
    }
});

// تحميل الداتا من JSON ومن الإضافات الجديدة اللي في المتصفح
async function loadData() {
    try {
        const response = await fetch('data.json');
        const jsonData = await response.json();
        
        // استدعاء الإضافات الخاصة بيك من المتصفح
        const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
        
        // دمج الداتا الأساسية مع إضافاتك الجديدة
        allData = [...localItems, ...jsonData];
        
        const filteredData = allData.filter(item => item.category === activeCategory);
        displayItems(filteredData);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// إضافة عمل جديد
window.addNewItem = function() {
    const name = document.getElementById('new-item-name').value;
    const status = statusSelect.value;
    const stoppedAt = stoppedInput.value;
    const myRating = document.getElementById('new-item-rating').value;

    if(!name) {
        alert('أرجوك اكتب اسم العمل الأول!');
        return;
    }

    const newItem = {
        name: name,
        category: activeCategory,
        status: status,
        stoppedAt: status === 'dropped' ? stoppedAt : "",
        myRating: myRating ? parseFloat(myRating) : 0,
        year_watched: new Date().getFullYear() // يحط السنة الحالية تلقائي
    };

    // حفظ في المصفوفة الحالية
    allData.unshift(newItem);

    // حفظ في ذاكرة المتصفح عشان تفضل موجودة
    const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    localItems.unshift(newItem);
    localStorage.setItem('my_added_watch_items', JSON.stringify(localItems));

    // لو حط تقييم نحفظه برضه
    if(myRating) {
        localStorage.setItem('rating_' + name, myRating);
    }

    // تنظيف الفورم
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-rating').value = '';
    statusSelect.value = 'completed';
    stoppedInput.style.display = 'none';
    stoppedInput.value = '';

    // إعادة العرض (هيجيب بياناته من TMDB تلقائي وإحنا بنعرض)
    const filteredData = allData.filter(item => item.category === activeCategory);
    displayItems(filteredData);
}

// حفظ وتحديث التقييم من الكارت
window.saveMyRating = function(encodedName) {
    const name = decodeURIComponent(encodedName);
    const safeId = encodedName.replace(/[^a-zA-Z0-9]/g, '_');
    const inputField = document.getElementById('input_' + safeId);
    const displaySpan = document.getElementById('display_' + safeId);
    
    if (inputField && inputField.value !== '') {
        localStorage.setItem('rating_' + name, inputField.value);
        displaySpan.innerHTML = `👤 تقييمي: ⭐ ${inputField.value}`;
        
        inputField.style.backgroundColor = '#4CAF50';
        inputField.style.color = 'white';
        setTimeout(() => {
            inputField.style.backgroundColor = 'rgba(176, 149, 246, 0.1)';
        }, 800);
    }
}

// عرض الكروت وسحب البيانات من TMDB
async function displayItems(items) {
    container.innerHTML = '<p style="text-align:center; width:100%; color:var(--lavender-accent);">جاري التحميل وجلب البيانات من TMDB...</p>';
    let htmlContent = '';

    for (const item of items) {
        let posterUrl = 'https://via.placeholder.com/500x750/1a1a24/b095f6?text=No+Poster';
        let globalRating = 'N/A';
        let apiSeasons = '';
        let apiEpisodes = '';
        
        try {
            const isTV = item.category.includes('series') || item.category === 'anime';
            const type = isTV ? 'tv' : 'movie';
            const searchQuery = item.tmdb_search_name ? item.tmdb_search_name : item.name;
            const searchUrl = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}&language=ar-SA`;
            
            const res = await fetch(searchUrl);
            const tmdbData = await res.json();
            
            if (tmdbData.results && tmdbData.results.length > 0) {
                const result = tmdbData.results[0];
                if (result.poster_path) posterUrl = IMG_BASE_URL + result.poster_path;
                globalRating = result.vote_average ? result.vote_average.toFixed(1) : 'N/A';
                
                if (isTV && result.id) {
                    const detailsRes = await fetch(`${TMDB_BASE_URL}/tv/${result.id}?api_key=${TMDB_API_KEY}&language=en-US`);
                    const details = await detailsRes.json();
                    if(details.number_of_seasons) apiSeasons = details.number_of_seasons;
                    if(details.number_of_episodes) apiEpisodes = details.number_of_episodes;
                }
            }
        } catch(e) {
            console.error("TMDB error for", item.name, e);
        }

        let statusBadge = '';
        if(item.status === 'completed') statusBadge = '<span class="status-badge status-completed">✓ اكتمل</span>';
        if(item.status === 'dropped') statusBadge = `<span class="status-badge status-dropped">✗ وقف عند ${item.stoppedAt || ''}</span>`;

        let savedRating = localStorage.getItem('rating_' + item.name);
        const displayRating = savedRating ? savedRating : (item.myRating > 0 ? item.myRating : 'لم يقيم');
        const displaySeasons = apiSeasons || item.seasons || '';
        const displayEpisodes = apiEpisodes || item.episodes || '';
        const safeId = encodeURIComponent(item.name).replace(/[^a-zA-Z0-9]/g, '_');

        htmlContent += `
            <div class="card">
                ${statusBadge}
                <img src="${posterUrl}" alt="${item.name}">
                <div class="card-content">
                    <h3 class="movie-title">${item.name}</h3>
                    ${item.year_watched ? `<p><strong>السنة:</strong> ${item.year_watched}</p>` : ''}
                    ${displaySeasons ? `<p><strong>المواسم:</strong> ${displaySeasons}</p>` : ''}
                    ${displayEpisodes ? `<p><strong>الحلقات:</strong> ${displayEpisodes}</p>` : ''}
                    
                    <div class="rating">
                        <span>🌍 IMDb: ⭐ ${globalRating}</span>
                        <span style="color:var(--lavender-accent)" id="display_${safeId}">👤 تقييمي: ⭐ ${displayRating}</span>
                    </div>
                    
                    <div class="user-rating-control">
                        <input type="number" min="0" max="10" step="0.5" placeholder="تقييمك" id="input_${safeId}" value="${savedRating || ''}">
                        <button onclick="saveMyRating('${encodeURIComponent(item.name)}')">حفظ</button>
                    </div>
                </div>
            </div>
        `;
    }
    container.innerHTML = htmlContent;
}

// التحكم في الأزرار (تغيير القسم الحالي)
buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        activeCategory = btn.dataset.filter;
        currentCategorySpan.innerText = btn.innerText; // تغيير اسم القسم في فورم الإضافة
        
        const filteredData = allData.filter(item => item.category === activeCategory);
        displayItems(filteredData);
    });
});

loadData();
