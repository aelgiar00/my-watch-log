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

// إظهار/إخفاء خانة "وقفت فين"
statusSelect.addEventListener('change', function() {
    if(this.value === 'dropped') {
        stoppedInput.style.display = 'block';
    } else {
        stoppedInput.style.display = 'none';
        stoppedInput.value = '';
    }
});

// تحميل الداتا من JSON ومن الإضافات الجديدة
async function loadData() {
    try {
        const response = await fetch('data.json');
        const jsonData = await response.json();
        const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
        allData = [...localItems, ...jsonData];
        
        const filteredData = allData.filter(item => item.category === activeCategory);
        displayItems(filteredData);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// إضافة عمل جديد
window.addNewItem = function() {
    const name = document.getElementById('new-item-name').value.trim();
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
        year_watched: new Date().getFullYear()
    };

    allData.push(newItem); // ضفناه للداتا

    const localItems = JSON.parse(localStorage.getItem('my_added_watch_items')) || [];
    localItems.push(newItem);
    localStorage.setItem('my_added_watch_items', JSON.stringify(localItems));

    if(myRating) {
        localStorage.setItem('rating_' + name, myRating);
    }

    // تنظيف الفورم
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-rating').value = '';
    statusSelect.value = 'completed';
    stoppedInput.style.display = 'none';
    stoppedInput.value = '';

    const filteredData = allData.filter(item => item.category === activeCategory);
    displayItems(filteredData);
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
        
        inputField.style.backgroundColor = '#4CAF50';
        inputField.style.color = 'white';
        setTimeout(() => {
            inputField.style.backgroundColor = 'rgba(176, 149, 246, 0.1)';
        }, 800);
        
        // مش هنعمل ريفريش هنا عشان الشاشة ماتتحركش فجأة وأنت بتقيم
        // الترتيب هيحصل تلقائي أول ما تعمل ريفريش للصفحة أو تغير القسم
    }
}

// عرض الكروت وسحب البيانات من TMDB بسرعة الصاروخ وبالترتيب
async function displayItems(items) {
    container.innerHTML = '<p style="text-align:center; width:100%; color:var(--lavender-accent); font-size:1.5em;">جاري التحميل بسرعة... 🚀</p>';
    
    // 1. استخراج التقييمات النهائية عشان نرتب بيها
    const itemsWithRatings = items.map(item => {
        let savedRating = localStorage.getItem('rating_' + item.name);
        let finalRating = 0;
        if (savedRating && savedRating !== '') {
            finalRating = parseFloat(savedRating);
        } else if (item.myRating) {
            finalRating = parseFloat(item.myRating);
        }
        return { ...item, finalRating };
    });

    // 2. ترتيب الأعمال من الأعلى تقييماً (10) للأقل
    itemsWithRatings.sort((a, b) => b.finalRating - a.finalRating);

    // 3. جلب البيانات بالتوازي (Promise.all) لزيادة السرعة 10 أضعاف
    const fetchPromises = itemsWithRatings.map(async (item) => {
        let posterUrl = 'https://via.placeholder.com/500x750/1a1a24/b095f6?text=No+Poster';
        let globalRating = 'N/A';
        let apiSeasons = '';
        let apiEpisodes = '';
        
        try {
            const isTV = item.category.includes('series') || item.category === 'anime';
            const type = isTV ? 'tv' : 'movie';
            const searchQuery = item.tmdb_search_name ? item.tmdb_search_name : item.name;
            
            // شيلنا إجبار اللغة العربية عشان نجيب بوسترات أصلية جودتها عالية وبدون تكست
            const searchUrl = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}&language=en-US`;
            
            const res = await fetch(searchUrl);
            const tmdbData = await res.json();
            
            if (tmdbData.results && tmdbData.results.length > 0) {
                // البحث عن "تطابق تام" عشان يتجنب يجيب "وعد إبليس" لما تبحث عن "وعد"
                let result = tmdbData.results.find(r => {
                    const title = r.name || r.title || r.original_name || r.original_title;
                    return title && title.trim() === searchQuery.trim();
                });
                
                // لو ملقاش تطابق تام، ياخد أول وأشهر نتيجة
                if (!result) result = tmdbData.results[0];

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

        const displayRating = item.finalRating > 0 ? item.finalRating : 'لم يقيم';
        const displaySeasons = apiSeasons || item.seasons || '';
        const displayEpisodes = apiEpisodes || item.episodes || '';
        const safeId = encodeURIComponent(item.name).replace(/[^a-zA-Z0-9]/g, '_');

        return `
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
                        <input type="number" min="0" max="10" step="0.5" placeholder="تقييمك" id="input_${safeId}" value="${item.finalRating > 0 ? item.finalRating : ''}">
                        <button onclick="saveMyRating('${encodeURIComponent(item.name)}')">حفظ</button>
                    </div>
                </div>
            </div>
        `;
    });

    // انتظار تحميل كل الكروت في نفس الوقت ودمجهم
    const htmlArray = await Promise.all(fetchPromises);
    container.innerHTML = htmlArray.join('');
}

// التحكم في الأزرار
buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        activeCategory = btn.dataset.filter;
        currentCategorySpan.innerText = btn.innerText;
        
        const filteredData = allData.filter(item => item.category === activeCategory);
        displayItems(filteredData);
    });
});

loadData();
