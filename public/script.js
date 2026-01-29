// Authentication state
let authToken = localStorage.getItem('authToken');
let currentUser = null;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function () {
  initializeModals();
  initializeAuth();
  initializeForms();
  // initializeCityMap() artık showContent() içinde çağrılıyor

  // İçeriği başlangıçta gizle (giriş yapılmamışsa)
  if (!authToken) {
    hideContent();
  } else {
    // Eğer token varsa ama henüz doğrulanmadıysa, showContent() verifyToken() içinde çağrılacak
    // Token yoksa ve içerik gösterilecekse burada çağrılabilir ama genelde showContent() içinde çağrılıyor
  }
});

// Initialize authentication
function initializeAuth() {
  if (authToken) {
    verifyToken();
  } else {
    updateAuthUI();
  }
}

// Verify token
async function verifyToken() {
  try {
    const res = await fetch('/api/verify', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      updateAuthUI();
      showContent();
    } else {
      localStorage.removeItem('authToken');
      authToken = null;
      updateAuthUI();
      hideContent();
    }
  } catch (error) {
    console.error('Token verification error:', error);
    localStorage.removeItem('authToken');
    authToken = null;
    updateAuthUI();
    hideContent();
  }
}

// Hide/show content
function hideContent() {
  const mapContainer = document.querySelector('.map-container');
  if (mapContainer) {
    mapContainer.style.display = 'none';
  }

  // Harita flag'ini sıfırla, böylece tekrar giriş yapıldığında harita yeniden başlatılır
  cityMapInitialized = false;
}

function showContent() {
  const mapContainer = document.querySelector('.map-container');
  if (mapContainer) {
    mapContainer.style.display = 'block';
  }
  // Haritayı başlat (içerik görünür olduktan sonra)
  // Kısa bir gecikme ile başlat ki DOM hazır olsun
  setTimeout(() => {
    cityMapInitialized = false;
    initializeCityMap();
  }, 100);
}

// Update auth UI
function updateAuthUI() {
  // auth-buttons kaldırıldı - artık header'da buton yok
  const userInfo = document.getElementById('user-info');
  const userEmail = document.getElementById('user-email');

  if (authToken && currentUser) {
    if (userInfo) userInfo.style.display = 'flex';
    if (userEmail) userEmail.textContent = currentUser.email;
    // Close modals
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    if (loginModal) loginModal.style.display = 'none';
    if (registerModal) registerModal.style.display = 'none';
  } else {
    if (userInfo) userInfo.style.display = 'none';
  }
}

// Show login modal
function showLoginModal() {
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  if (loginModal) {
    loginModal.style.display = 'flex';
  }
  if (registerModal) {
    registerModal.style.display = 'none';
  }
}

// Show register modal
function showRegisterModal() {
  const loginModal = document.getElementById('login-modal');
  const registerModal = document.getElementById('register-modal');
  if (registerModal) {
    registerModal.style.display = 'flex';
    // Şehirler listesini yükle (DOM'un hazır olması için kısa bir gecikme)
    setTimeout(() => {
      loadCitiesForRegister();
    }, 100);
  }
  if (loginModal) {
    loginModal.style.display = 'none';
  }
}

// Şehirler listesini yükle (kayıt formu için)
async function loadCitiesForRegister() {
  try {
    console.log('Şehirler yükleniyor...');
    const res = await fetch('/api/cities');

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const cities = await res.json();
    console.log('Şehirler yüklendi:', cities.length, 'şehir');

    const citySelect = document.getElementById('register-city');

    if (!citySelect) {
      console.error('register-city elementi bulunamadı!');
      // Biraz bekleyip tekrar dene
      setTimeout(() => {
        loadCitiesForRegister();
      }, 100);
      return;
    }

    citySelect.innerHTML = '<option value="">İl seçiniz</option>';
    cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city.id;
      option.textContent = city.name;
      citySelect.appendChild(option);
    });

    console.log('Şehirler dropdown\'a eklendi');
  } catch (error) {
    console.error('Şehirler yüklenirken hata:', error);
    alert('Şehirler yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
  }
}

// Initialize modals
function initializeModals() {
  // login-btn ve register-btn kaldırıldı - artık header'da buton yok
  const logoutBtn = document.getElementById('logout-btn');
  const backButton = document.getElementById('back-to-turkey-btn');
  const switchToRegister = document.getElementById('switch-to-register');
  const switchToLogin = document.getElementById('switch-to-login');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('authToken');
      authToken = null;
      currentUser = null;
      hideContent();
      backToTurkeyMap();
      showLoginModal();
      updateAuthUI();
    });
  }

  if (backButton) {
    backButton.addEventListener('click', backToTurkeyMap);
  }

  // Modal'lar arası geçiş
  if (switchToRegister) {
    switchToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterModal();
    });
  }

  if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginModal();
    });
  }

  // İlk açılışta giriş yapılmamışsa giriş modalını göster
  if (!authToken) {
    showLoginModal();
  }
}

// Initialize forms
function initializeForms() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById('login-error');
      errorDiv.textContent = '';

      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
          authToken = data.token;
          currentUser = data.user;
          localStorage.setItem('authToken', authToken);
          // Close modal
          const loginModal = document.getElementById('login-modal');
          if (loginModal) loginModal.style.display = 'none';
          updateAuthUI();
          showContent();
          loginForm.reset();
        } else {
          errorDiv.textContent = data.error || 'Giriş başarısız';
        }
      } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
      }
    });
  }

  if (registerForm) {
    // Sayfa yüklendiğinde şehirleri yükle
    loadCitiesForRegister();

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById('register-error');
      errorDiv.textContent = '';

      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      const age = document.getElementById('register-age').value;
      const city_id = document.getElementById('register-city').value;

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, age, city_id })
        });

        const data = await res.json();

        if (res.ok) {
          alert('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
          // Close register modal
          const registerModal = document.getElementById('register-modal');
          if (registerModal) registerModal.style.display = 'none';
          registerForm.reset();
          showLoginModal();
          document.getElementById('login-email').value = email;
        } else {
          errorDiv.textContent = data.error || 'Kayıt başarısız';
        }
      } catch (error) {
        console.error('Register error:', error);
        errorDiv.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
      }
    });
  }
}

// Initialize city map
let cityMapInitialized = false;
let cityMapEventHandlers = {
  mousemove: null,
  mouseleave: null,
  click: null
};
let selectedCityPath = null;
let regionLegendVisible = true;

// Bölge sınıfı eklemek için şehir slug -> bölge eşlemesi
const regionByCity = {
  // Marmara
  istanbul: 'region-marmara',
  edirne: 'region-marmara',
  tekirdag: 'region-marmara',
  kirklareli: 'region-marmara',
  canakkale: 'region-marmara',
  balikesir: 'region-marmara',
  bursa: 'region-marmara',
  yalova: 'region-marmara',
  kocaeli: 'region-marmara',
  sakarya: 'region-marmara',
  bilecik: 'region-marmara',
  // Ege
  izmir: 'region-aegean',
  aydin: 'region-aegean',
  manisa: 'region-aegean',
  mugla: 'region-aegean',
  denizli: 'region-aegean',
  usak: 'region-aegean',
  kutahya: 'region-aegean',
  afyonkarahisar: 'region-aegean',
  // Akdeniz
  antalya: 'region-mediterranean',
  mersin: 'region-mediterranean',
  adana: 'region-mediterranean',
  osmaniye: 'region-mediterranean',
  hatay: 'region-mediterranean',
  kahramanmaras: 'region-mediterranean',
  isparta: 'region-mediterranean',
  burdur: 'region-mediterranean',
  // İç Anadolu
  ankara: 'region-central-anatolia',
  konya: 'region-central-anatolia',
  kayseri: 'region-central-anatolia',
  eskisehir: 'region-central-anatolia',
  nevsehir: 'region-central-anatolia',
  nigde: 'region-central-anatolia',
  aksaray: 'region-central-anatolia',
  kirikkale: 'region-central-anatolia',
  kirsehir: 'region-central-anatolia',
  yozgat: 'region-central-anatolia',
  corum: 'region-central-anatolia',
  cankiri: 'region-central-anatolia',
  sivas: 'region-central-anatolia',
  karaman: 'region-central-anatolia',
  // Karadeniz
  artvin: 'region-black-sea',
  rize: 'region-black-sea',
  trabzon: 'region-black-sea',
  giresun: 'region-black-sea',
  ordu: 'region-black-sea',
  samsun: 'region-black-sea',
  sinop: 'region-black-sea',
  kastamonu: 'region-black-sea',
  bartin: 'region-black-sea',
  zonguldak: 'region-black-sea',
  duzce: 'region-black-sea',
  bolu: 'region-black-sea',
  karabuk: 'region-black-sea',
  bayburt: 'region-black-sea',
  gumushane: 'region-black-sea',
  tokat: 'region-black-sea',
  amasya: 'region-black-sea',
  // Doğu Anadolu
  erzurum: 'region-eastern-anatolia',
  erzincan: 'region-eastern-anatolia',
  malatya: 'region-eastern-anatolia',
  elazig: 'region-eastern-anatolia',
  bingol: 'region-eastern-anatolia',
  tunceli: 'region-eastern-anatolia',
  mus: 'region-eastern-anatolia',
  bitlis: 'region-eastern-anatolia',
  agri: 'region-eastern-anatolia',
  van: 'region-eastern-anatolia',
  hakkari: 'region-eastern-anatolia',
  kars: 'region-eastern-anatolia',
  ardahan: 'region-eastern-anatolia',
  igdir: 'region-eastern-anatolia',
  // Güneydoğu Anadolu
  gaziantep: 'region-southeastern-anatolia',
  kilis: 'region-southeastern-anatolia',
  sanliurfa: 'region-southeastern-anatolia',
  mardin: 'region-southeastern-anatolia',
  batman: 'region-southeastern-anatolia',
  siirt: 'region-southeastern-anatolia',
  sirnak: 'region-southeastern-anatolia',
  adiyaman: 'region-southeastern-anatolia',
  diyarbakir: 'region-southeastern-anatolia'
};

function toggleRegionLegend(show) {
  const legend = document.querySelector('.region-legend');
  regionLegendVisible = !!show;
  if (legend) {
    legend.style.display = show ? 'grid' : 'none';
  }
}

// İl/ilçe isimlerini dosya adına dönüştürmek için normalize helper
function normalizeForFileName(name) {
  return (name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ğ/gi, 'g')
    .replace(/ü/gi, 'u')
    .replace(/ş/gi, 's')
    .replace(/ı/gi, 'i')
    .replace(/ö/gi, 'o')
    .replace(/ç/gi, 'c')
    .replace(/[^a-z0-9]/gi, '')
    .replace(/^\w/, c => c.toUpperCase());
}

// Seçilen il/ilçe için görsel haritayı göster
function showDistrictMap(provinceName, districtName) {
  const turkeyWrapper = document.getElementById('turkey-map-wrapper');
  const districtWrapper = document.getElementById('district-map-wrapper');
  const districtImg = document.getElementById('district-map-image');
  const backButton = document.getElementById('back-to-turkey-btn');

  if (!turkeyWrapper || !districtWrapper || !districtImg) return;

  const fileName = normalizeForFileName(provinceName);
  districtImg.src = `/districts/${fileName}.png`;
  districtImg.alt = `${districtName || provinceName} haritası`;

  turkeyWrapper.style.display = 'none';
  districtWrapper.style.display = 'block';
  if (backButton) backButton.style.display = 'inline-flex';
}

function initializeCityMap() {
  const cityNameElement = document.getElementById("city-name");
  const svgMap = document.getElementById("svg-turkey-map");
  const cityPaths = document.querySelectorAll("#svg-turkey-map path");

  if (!cityNameElement || !svgMap || cityPaths.length === 0) {
    console.error('City map elements not found', { cityNameElement, svgMap, cityPathsLength: cityPaths.length });
    // Bir süre sonra tekrar dene
    setTimeout(() => {
      initializeCityMap();
    }, 500);
    return;
  }

  // Eğer zaten başlatıldıysa, önce mevcut listener'ları kaldır
  if (cityMapInitialized && cityMapEventHandlers.mousemove) {
    console.log('Removing existing event listeners...');
    svgMap.removeEventListener("mousemove", cityMapEventHandlers.mousemove);
    svgMap.removeEventListener("mouseleave", cityMapEventHandlers.mouseleave);
    svgMap.removeEventListener("click", cityMapEventHandlers.click);
  }

  console.log('Initializing city map with', cityPaths.length, 'paths');

  // Bölge sınıflarını uygula
  cityPaths.forEach(path => {
    const slug = path.getAttribute('data-city-name');
    if (slug && regionByCity[slug]) {
      path.classList.add(regionByCity[slug]);
    }
  });

  // Event delegation kullanarak SVG üzerinde tek bir listener ekle
  cityMapEventHandlers.mousemove = function (event) {
    const path = event.target.closest('path');
    if (path && path.hasAttribute('data-city-name')) {
      cityNameElement.innerHTML = path.getAttribute("title");
      cityNameElement.classList.add("active");
      cityNameElement.style.left = (event.clientX + 20) + "px";
      cityNameElement.style.top = (event.clientY + 20) + "px";
    } else {
      cityNameElement.classList.remove("active");
    }
  };

  cityMapEventHandlers.mouseleave = function (event) {
    cityNameElement.classList.remove("active");
  };

  cityMapEventHandlers.click = function (event) {
    const path = event.target.closest('path');
    if (path && path.hasAttribute('data-city-name')) {
      const cityNameSlug = path.getAttribute("data-city-name");
      const provinceName = path.getAttribute("title");
      console.log('City clicked:', cityNameSlug, provinceName);
      // seçili ili vurgula
      if (selectedCityPath) {
        selectedCityPath.classList.remove('selected');
      }
      selectedCityPath = path;
      selectedCityPath.classList.add('selected');
      if (cityNameSlug) {
        showDistricts(cityNameSlug, provinceName);
      }
    }
  };

  // Event listener'ları SVG'ye ekle (event delegation)
  console.log('Adding event listeners to SVG map (event delegation)');
  svgMap.addEventListener("mousemove", cityMapEventHandlers.mousemove);
  svgMap.addEventListener("mouseleave", cityMapEventHandlers.mouseleave);
  svgMap.addEventListener("click", cityMapEventHandlers.click);

  cityMapInitialized = true;
  console.log('City map initialized successfully');
}

// Back to Turkey map
function backToTurkeyMap() {
  const districtContainer = document.querySelector('.district-container');
  const districtDetail = document.getElementById('district-detail');
  const backButton = document.getElementById('back-to-turkey-btn');
  const turkeyWrapper = document.getElementById('turkey-map-wrapper');
  const districtWrapper = document.getElementById('district-map-wrapper');
  const districtImg = document.getElementById('district-map-image');
  const provinceTitle = document.getElementById('selected-province');
  const districtList = document.getElementById('district-list');

  if (districtContainer) districtContainer.style.display = 'none';
  if (districtDetail) districtDetail.style.display = 'none';
  if (turkeyWrapper) turkeyWrapper.style.display = 'block';
  if (districtWrapper) districtWrapper.style.display = 'none';
  if (districtImg) districtImg.src = '';
  if (backButton) backButton.style.display = 'none';
  if (provinceTitle) provinceTitle.textContent = '';
  if (districtList) districtList.innerHTML = '';
  if (selectedCityPath) {
    selectedCityPath.classList.remove('selected');
    selectedCityPath = null;
  }
  toggleRegionLegend(true);
}

// Route Planner function - defined in route-planner.js
// This is just a placeholder if route-planner.js doesn't load
if (typeof openRoutePlanner === 'undefined') {
  window.openRoutePlanner = function (districtId) {
    alert('Route Planner yükleniyor...');
  };
}

async function showDistricts(city, provinceName = null) {
  try {
    console.log("showDistricts çağrıldı - şehir:", city, "il adı:", provinceName);

    // Önceki ilçe detaylarını temizle
    const districtDetail = document.getElementById("district-detail");
    if (districtDetail) {
      districtDetail.innerHTML = "";
      districtDetail.style.display = "none";
    }

    // Geri butonunu gizle
    const backButton = document.getElementById("back-to-turkey-btn");
    if (backButton) {
      backButton.style.display = "none";
    }

    // Token kontrolü
    authToken = localStorage.getItem('authToken');
    console.log("Token durumu:", authToken ? "var" : "yok");
    if (!authToken) {
      alert('Lütfen giriş yapın');
      showLoginModal();
      return;
    }

    console.log("API çağrısı yapılıyor:", `/api/districts?city=${city}`);
    const res = await fetch(`/api/districts?city=${encodeURIComponent(city)}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log("API response status:", res.status);
    const data = await res.json();
    console.log("API response data:", data);

    if (!res.ok) {
      // API'den dönen hata mesajını göster
      throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
    }

    const districts = data; // data zaten array veya error object

    // Eğer data bir error object ise
    if (data.error) {
      throw new Error(data.error);
    }

    const list = document.getElementById("district-list");
    const provinceTitle = document.getElementById("selected-province");
    console.log("DOM elementleri:", { list: !!list, provinceTitle: !!provinceTitle });

    // Use provided province name or try to find it
    if (!provinceName) {
      const clickedPath = document.querySelector(`[data-city-name="${city}"]`);
      provinceName = clickedPath?.getAttribute("title") || city;
    }

    if (provinceTitle) {
      provinceTitle.textContent = `${provinceName} İlçeleri`;
      provinceTitle.style.display = "block";
    }

    if (list) {
      if (!Array.isArray(districts) || districts.length === 0) {
        list.innerHTML = `<li>Bu il için ilçe bulunamadı.</li>`;
      } else {
        list.innerHTML = districts.map(d => {
          const districtName = d.name || d.district_name || d.districtName || d.district || d.ilce_adi || 'İsimsiz';
          const districtId = d.id;
          return `<li class="district-item" data-district-id="${districtId}">${districtName}</li>`;
        }).join("");

        // Her ilçeye click event listener eklendi
        const districtItems = list.querySelectorAll('.district-item');
        districtItems.forEach(item => {
          item.addEventListener('click', function () {
            const districtId = this.getAttribute('data-district-id');
            showDistrictDetails(districtId);
          });
        });
      }
      list.style.display = "grid"; // CSS'te grid olduğu için grid kullan
      console.log("İlçe listesi güncellendi:", districts.length, "ilçe");

      // district-container'ı görünür yap ve sayfayı kaydır
      const districtContainer = document.querySelector('.district-container');
      console.log("district-container bulundu:", !!districtContainer);
      if (districtContainer) {
        districtContainer.style.display = "block"; // Container'ı görünür yap
        // Scroll'u hemen yap
        districtContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log("scrollIntoView çağrıldı");
      }
    }
  } catch (error) {
    console.error("Hata detayı:", error);
    const list = document.getElementById("district-list");
    const provinceTitle = document.getElementById("selected-province");

    if (provinceTitle) {
      provinceTitle.textContent = "Hata";
      provinceTitle.style.display = "block";
    }

    if (list) {
      const errorMessage = error.message || "İlçeler yüklenirken bir hata oluştu.";
      list.innerHTML = `<li style="color: red;">${errorMessage}</li>`;
      list.style.display = "grid";

      // Hata durumunda da sayfayı ilçeler bölümüne kaydır
      const districtContainer = document.querySelector('.district-container');
      if (districtContainer) {
        districtContainer.style.display = "block";
        districtContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
}

async function showDistrictDetails(districtId) {
  try {
    // Token kontrolü
    authToken = localStorage.getItem('authToken');
    if (!authToken) {
      alert('Lütfen giriş yapın');
      showLoginModal();
      return;
    }

    const res = await fetch(`/api/district/${districtId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!res.ok) {
      throw new Error('İlçe detayları yüklenemedi');
    }

    const district = await res.json();
    const provinceTitle = document.getElementById('selected-province');

    // İlçe detay container'ını göster
    const detailContainer = document.getElementById("district-detail");
    if (detailContainer) {
      detailContainer.style.display = "block";
      detailContainer.innerHTML = `
        <div class="district-detail-header">
          <h2>${district.name}</h2>
          <p class="district-city">${district.city_name} İli</p>
        </div>
        
        <div class="district-detail-content">
          <div class="district-actions">
            <button class="route-planner-btn" onclick="openRoutePlanner(${districtId})">
              🗺️ Rota Planla
            </button>
          </div>
          
          <section class="detail-section">
            <h3>1. Genel Bilgi</h3>
            <div class="detail-text" id="general-info-content">
              ${district.general_info || '<em>Genel bilgi henüz eklenmemiş.</em>'}
            </div>
          </section>
          
          <section class="detail-section">
            <h3>2. Gezilecek Yerler</h3>
            
            <div class="sub-section">
              <h4>Doğa</h4>
              <div class="detail-text" id="nature-content">
                ${district.nature_places || '<em>Doğa yerleri henüz eklenmemiş.</em>'}
              </div>
            </div>
            
            <div class="sub-section">
              <h4>Tarih</h4>
              <div class="detail-text" id="history-content">
                ${district.historical_places || '<em>Tarih yerleri henüz eklenmemiş.</em>'}
              </div>
            </div>
          </section>
          
          <section class="detail-section">
            <h3>3. Yeme-İçme</h3>
            <div class="detail-text" id="food-content">
              ${district.food_drink || '<em>Yeme-içme bilgileri henüz eklenmemiş.</em>'}
            </div>
          </section>
        </div>
      `;

      // İlçe haritasını göster
      showDistrictMap(district.city_name || provinceTitle?.textContent?.replace(' İlçeleri', ''), district.name);
      toggleRegionLegend(false);

      // Sayfayı ilçe detayına kaydır
      detailContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    console.error("Hata:", error);
    alert("İlçe detayları yüklenirken bir hata oluştu.");
  }
}

// ==================== ROTALAR MODÜL ====================

// Rotalar modalını göster
function showRoutesModal() {
  const modal = document.getElementById('routes-modal');
  if (modal) {
    modal.style.display = 'flex';
    loadRoutes();
  }
}

// Rotaları yükle
async function loadRoutes() {
  const routesList = document.getElementById('routes-list');
  if (!routesList) return;

  routesList.innerHTML = '<p class="loading-message">Yükleniyor...</p>';

  try {
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch('/api/routes', { headers });

    if (!res.ok) {
      throw new Error('Rotalar yüklenemedi');
    }

    const routes = await res.json();

    if (routes.length === 0) {
      routesList.innerHTML = '<p style="color: #666;">Henüz rota oluşturulmamış.</p>';
      return;
    }

    routesList.innerHTML = routes.map(route => {
      const actionBtn = route.is_owner
        ? `<button class="route-action-btn delete-btn" onclick="deleteRoute(${route.id})">Sil</button>`
        : route.is_participant
          ? `<button class="route-action-btn leave-btn" onclick="leaveRoute(${route.id})">Ayrıl</button>`
          : `<button class="route-action-btn join-btn" onclick="joinRoute(${route.id})">Katıl</button>`;

      return `
        <div class="route-card" style="border: 1px solid #ddd; padding: 12px; margin-bottom: 10px; border-radius: 8px; background: #f9f9f9;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h4 style="margin: 0 0 4px 0; font-size: 15px;">${escapeHtml(route.name)}</h4>
              ${route.description ? `<p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">${escapeHtml(route.description)}</p>` : ''}
              <p style="margin: 0; font-size: 12px; color: #888;">
                Oluşturan: ${escapeHtml(route.owner_email)} | 
                Katılımcı: ${route.participant_count}
                ${route.is_owner ? ' <span style="color: #4CAF50; font-weight: bold;">(Sizin rotanız)</span>' : ''}
                ${route.is_participant && !route.is_owner ? ' <span style="color: #2196F3; font-weight: bold;">(Katıldınız)</span>' : ''}
              </p>
            </div>
            <div>
              ${actionBtn}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Rotalar yüklenirken hata:', error);
    routesList.innerHTML = '<p style="color: red;">Rotalar yüklenirken hata oluştu.</p>';
  }
}

// HTML escape yardımcı fonksiyon
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Yeni rota oluştur
async function createRoute(name, description) {
  if (!authToken) {
    alert('Lütfen giriş yapın');
    return false;
  }

  try {
    const res = await fetch('/api/routes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ name, description })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Rota oluşturulamadı');
      return false;
    }

    alert('Rota başarıyla oluşturuldu!');
    loadRoutes();
    return true;
  } catch (error) {
    console.error('Rota oluşturma hatası:', error);
    alert('Bir hata oluştu');
    return false;
  }
}

// Rotaya katıl
async function joinRoute(routeId) {
  if (!authToken) {
    alert('Lütfen giriş yapın');
    return;
  }

  try {
    const res = await fetch(`/api/routes/${routeId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Rotaya katılınamadı');
      return;
    }

    alert('Rotaya başarıyla katıldınız!');
    loadRoutes();
  } catch (error) {
    console.error('Rotaya katılma hatası:', error);
    alert('Bir hata oluştu');
  }
}

// Rotadan ayrıl
async function leaveRoute(routeId) {
  if (!authToken) {
    alert('Lütfen giriş yapın');
    return;
  }

  if (!confirm('Bu rotadan ayrılmak istediğinizden emin misiniz?')) {
    return;
  }

  try {
    const res = await fetch(`/api/routes/${routeId}/leave`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Rotadan ayrılınamadı');
      return;
    }

    alert('Rotadan başarıyla ayrıldınız!');
    loadRoutes();
  } catch (error) {
    console.error('Rotadan ayrılma hatası:', error);
    alert('Bir hata oluştu');
  }
}

// Rotayı sil
async function deleteRoute(routeId) {
  if (!authToken) {
    alert('Lütfen giriş yapın');
    return;
  }

  if (!confirm('Bu rotayı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
    return;
  }

  try {
    const res = await fetch(`/api/routes/${routeId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Rota silinemedi');
      return;
    }

    alert('Rota başarıyla silindi!');
    loadRoutes();
  } catch (error) {
    console.error('Rota silme hatası:', error);
    alert('Bir hata oluştu');
  }
}

// Rotalar modülü için event listener'ları ekle
document.addEventListener('DOMContentLoaded', function () {
  // Rotalar butonuna tıklama
  const routesBtn = document.getElementById('routes-btn');
  if (routesBtn) {
    routesBtn.addEventListener('click', showRoutesModal);
  }

  // Modal kapatma butonu
  const closeRoutesModal = document.getElementById('close-routes-modal');
  if (closeRoutesModal) {
    closeRoutesModal.addEventListener('click', () => {
      const modal = document.getElementById('routes-modal');
      if (modal) modal.style.display = 'none';
    });
  }

  // Rota oluşturma formu
  const createRouteForm = document.getElementById('create-route-form');
  if (createRouteForm) {
    createRouteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('route-name').value;
      const description = document.getElementById('route-description').value;

      const success = await createRoute(name, description);
      if (success) {
        createRouteForm.reset();
      }
    });
  }
});
