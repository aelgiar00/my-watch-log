const TMDB_API_KEY = 'f3cefc2462aadaabd61feafa4ec78ce4';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const container = document.getElementById('app-container');
const buttons = document.querySelectorAll('.filter-btn');

let allData = [];

// جلب البيانات من ملف JSON
async function loadData() {
    try {
        const response = await fetch('data.json');
        allData = await response.json();
        displayItems(allData);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// عرض الكروت
async function displayItems(items) {
    container.innerHTML = '';
    
    for (const item of items) {
        // لو مفيش بوستر، هنحاول نجيبه من TMDB
        let posterUrl = 'https://via.placeholder.com/500x750?text=No+Poster';
        let globalRating = 'N/A';
        
        try {
            const type = item.category.includes('series') || item.category === 'anime' ? 'tv' : 'movie';
            const searchUrl = `${TMDB_BASE_URL}/search/${type}?api_key=428989dbf5c3daeb30740a6b7d2bfbe4&query=${encodeURIComponent(item.name)}`;
            
            const res = await fetch(searchUrl);
            const tmdbData = await res.json();
            
            if (tmdbData.results && tmdbData.results.length > 0) {
                const result = tmdbData.results[0];
                if (result.poster_path) posterUrl = IMG_BASE_URL + result.poster_path;
                globalRating = result.vote_average ? result.vote_average.toFixed(1) : 'N/A';
            }
        } catch(e) {
            console.error("TMDB error:", e);
        }

        const card = document.createElement('div');
        card.className = 'card';
        
        let statusBadge = '';
        if(item.status === 'completed') statusBadge = '<span class="status-badge status-completed">✓ اكتمل</span>';
        if(item.status === 'dropped') statusBadge = `<span class="status-badge status-dropped">✗ وقف عند ${item.stoppedAt || 'غير محدد'}</span>`;

        card.innerHTML = `
            ${statusBadge}
            <img src="${posterUrl}" alt="${item.name}">
            <div class="card-content">
                <h3 class="movie-title">${item.name}</h3>
                <p><strong>القسم:</strong> ${getCategoryName(item.category)}</p>
                ${item.year_watched ? `<p><strong>سنة المشاهدة:</strong> ${item.year_watched}</p>` : ''}
                ${item.seasons ? `<p><strong>عدد المواسم:</strong> ${item.seasons}</p>` : ''}
                ${item.episodes ? `<p><strong>الحلقات:</strong> ${item.episodes}</p>` : ''}
                
                <div class="rating">
                    <span>🌍 TMDB: ⭐ ${globalRating}</span>
                    <span>👤 تقييمي: ⭐ ${item.myRating || 'لم يقيم'}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    }
}

function getCategoryName(cat) {
    const cats = {
        'arabic_series_2026': 'مسلسلات عربي 2026',
        'movies_2026': 'أفلام 2026',
        'english_series': 'مسلسلات أجنبي',
        'anime': 'أنمي'
    };
    return cats[cat] || cat;
}

// الفلترة
buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.dataset.filter;
        if (filter === 'all') {
            displayItems(allData);
        } else {
            const filteredData = allData.filter(item => item.category === filter);
            displayItems(filteredData);
        }
    });
});

loadData();
