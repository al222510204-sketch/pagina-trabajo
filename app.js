const $ = (id) => document.getElementById(id);

const ROLES = {
    "Comercio y ventas": [["Cajero(a)", 7500, 9500], ["Vendedor(a) de piso", 7000, 10000], ["Almacenista", 7500, 9800], ["Encargado(a) de tienda", 10000, 14000]],
    "Gastronomía": [["Mesero(a)", 6500, 9000], ["Cocinero(a)", 8000, 12000], ["Ayudante de cocina", 6500, 8500], ["Barista", 7000, 9500]],
    "Oficina y administración": [["Auxiliar administrativo", 8500, 12000], ["Recepcionista", 8000, 11000], ["Programador(a) junior", 12000, 18000], ["Soporte técnico", 10000, 15000]],
    "Tecnología": [["Programador(a) junior", 12000, 18000], ["Soporte técnico", 10000, 15000], ["Técnico(a) en redes", 11000, 17000], ["Analista de sistemas", 12000, 18000]],
    "Finanzas": [["Ejecutivo(a) de ventas", 9000, 15000], ["Cajero(a) bancario", 9500, 13000], ["Analista de crédito", 12000, 18000]],
    "Salud": [["Enfermero(a)", 9500, 14000], ["Recepcionista médico", 8000, 10500], ["Auxiliar de farmacia", 7500, 10000], ["Asistente dental", 7500, 10500]],
    "Educación": [["Docente de apoyo", 8000, 12000], ["Auxiliar de biblioteca", 7000, 9000], ["Intendente", 6800, 8500], ["Asistente administrativo", 8000, 10500]],
    "Oficios y talleres": [["Técnico(a) de mantenimiento", 8500, 13000], ["Ayudante general", 6800, 8800], ["Soldador(a)", 9500, 14500], ["Electricista", 9500, 15000]]
};

const SUGGESTIONS = [
    { id: 1, title: "Cajero(a)", sector: "Comercio y ventas", salary: "$7,500 - $9,500", mode: "Presencial", shift: "Matutino" },
    { id: 2, title: "Auxiliar administrativo", sector: "Oficina y administración", salary: "$8,500 - $12,000", mode: "Híbrido", shift: "Tiempo completo" },
    { id: 3, title: "Soporte técnico", sector: "Oficina y administración", salary: "$10,000 - $15,000", mode: "Remoto", shift: "Tiempo completo" },
    { id: 4, title: "Mesero(a)", sector: "Gastronomía", salary: "$6,500 - $9,000", mode: "Presencial", shift: "Vespertino" },
    { id: 5, title: "Técnico en redes", sector: "Tecnología", salary: "$11,000 - $17,000", mode: "Presencial", shift: "Tiempo completo" },
    { id: 6, title: "Enfermero(a)", sector: "Salud", salary: "$9,500 - $14,000", mode: "Presencial", shift: "Mixto" }
];

const MODES = ["Presencial", "Presencial", "Híbrido", "Remoto"];
const SHIFTS = ["Matutino", "Vespertino", "Mixto", "Tiempo completo"];
const CHECKLIST_KEY = "empleo_checklist";
const SEARCH_CACHE_TTL = 24 * 60 * 60 * 1000;
const SEARCH_STOP_WORDS = new Set(["a", "al", "busco", "como", "con", "de", "del", "el", "empleo", "en", "la", "las", "los", "necesito", "para", "puesto", "quiero", "trabajo", "un", "una", "vacante", "vacantes"]);
const QUICK_LOCATIONS = {
    "Toluca, México": { lat: 19.2826, lon: -99.6557 },
    "Lerma, México": { lat: 19.2867, lon: -99.5116 },
    "Monterrey, México": { lat: 25.6866, lon: -100.3161 },
    "Guadalajara, México": { lat: 20.6597, lon: -103.3496 }
};
const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter"
];

const state = {
    center: null,
    label: "",
    radius: 2000,
    companies: [],
    jobs: [],
    searchError: false,
    searchFallback: false,
    saved: loadList("saved"),
    applied: loadList("applied"),
    map: null,
    layer: null,
    searchArea: null,
    markers: {}
};

function loadList(key) {
    try {
        return (JSON.parse(localStorage.getItem("empleo_" + key)) || []).filter((job) => !job.sample);
    } catch (e) {
        return [];
    }
}

function storeList(key, value) {
    try {
        localStorage.setItem("empleo_" + key, JSON.stringify(value));
    } catch (e) {}
}

function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function money(n) {
    return "$" + Number(n).toLocaleString("es-MX");
}

function hash(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) >>> 0;
    }
    return h;
}

function distanceM(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distLabel(m) {
    if (m == null || !Number.isFinite(Number(m))) return "Distancia no disponible";
    return m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km";
}

function renderSuggestions() {
    const box = $("suggest-list");
    box.innerHTML = "";
    SUGGESTIONS.forEach((s) => {
        const el = document.createElement("article");
        el.className = "job";
        el.innerHTML = `
            <h3>${esc(s.title)}</h3>
            <span class="company">${esc(s.sector)}</span>
            <div class="meta">
                <span class="tag money">${esc(s.salary)} /mes</span>
                <span class="tag">${esc(s.mode)}</span>
                <span class="tag">${esc(s.shift)}</span>
            </div>
            <div class="job-actions">
                <button class="primary" data-act="near">Buscar cerca</button>
            </div>`;
        el.querySelector('[data-act="near"]').addEventListener("click", () => {
            $("hero-kw").value = s.title;
            $("kw-input").value = s.title;
            if ($("city-input").value.trim()) {
                $("search-form").requestSubmit();
            } else {
                $("city-input").focus();
                toast("Escribe tu ciudad para buscar cerca");
            }
        });
        box.appendChild(el);
    });
}

function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function setStatus(message, isError) {
    const el = $("status");
    el.textContent = message;
    el.style.color = isError ? "#ffd1d1" : "#fff";
}

function showTab(name) {
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    if (name === "cerca" && state.map) {
        setTimeout(() => {
            state.map.invalidateSize();
            if (state.searchArea) state.map.fitBounds(state.searchArea.getBounds());
        }, 50);
    }
    window.scrollTo({ top: 0 });
}

function sectorOf(tags) {
    if (/^(it|telecommunication|software|technology)$/i.test(tags.office || "")) return "Tecnología";
    if (/^(pharmacy|chemist)$/i.test(tags.shop || "")) return "Salud";
    if (tags.office) return "Oficina y administración";
    if (tags.craft) return "Oficios y talleres";
    if (tags.shop) return "Comercio y ventas";
    const a = tags.amenity || "";
    if (/restaurant|cafe|fast_food/.test(a)) return "Gastronomía";
    if (a === "bank") return "Finanzas";
    if (/hospital|clinic|pharmacy|dentist|doctors/.test(a)) return "Salud";
    if (/school|college|university|kindergarten|library/.test(a)) return "Educación";
    return "Comercio y ventas";
}

async function geocode(query) {
    const normalizedQuery = query.trim().toLowerCase();
    const quickLocation = Object.entries(QUICK_LOCATIONS).find(([label]) =>
        label.toLowerCase() === normalizedQuery || label.split(",")[0].toLowerCase() === normalizedQuery
    );
    if (quickLocation) {
        return { ...quickLocation[1], name: quickLocation[0] };
    }
    const cacheKey = "geocode:" + query.trim().toLowerCase();
    const cached = readSearchCache(cacheKey);
    if (cached) return cached;
    let result = null;
    try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=es`;
        const data = await fetchJson(url, {}, 7000);
        const feature = data.features && data.features[0];
        if (feature) {
            const [lon, lat] = feature.geometry.coordinates;
            const properties = feature.properties;
            const name = [properties.name, properties.city, properties.state, properties.country]
                .filter((part, index, parts) => part && parts.indexOf(part) === index)
                .join(", ") || query;
            result = { lat, lon, name };
        }
    } catch (error) {
        console.warn("Photon no respondió:", error);
    }
    if (!result) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=es&q=${encodeURIComponent(query)}`;
            const data = await fetchJson(url, {
                headers: { "Accept": "application/json" }
            }, 7000);
            if (data && data[0]) {
                result = {
                    lat: Number(data[0].lat),
                    lon: Number(data[0].lon),
                    name: data[0].display_name || query
                };
            }
        } catch (error) {
            console.warn("Nominatim no respondió:", error);
        }
    }
    if (!result) return null;
    writeSearchCache(cacheKey, result);
    return result;
}

async function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function readSearchCache(key) {
    try {
        const cached = JSON.parse(localStorage.getItem("empleo_cache_" + key));
        if (!cached || Date.now() - cached.time > SEARCH_CACHE_TTL) return null;
        return cached.value;
    } catch (e) {
        return null;
    }
}

function writeSearchCache(key, value) {
    try {
        localStorage.setItem("empleo_cache_" + key, JSON.stringify({ time: Date.now(), value }));
    } catch (e) {}
}

function generateFallbackCompanies(lat, lon, radius) {
    const seeds = [
        ["Centro Comercial Local", "Comercio y ventas", 0.22, 0.18],
        ["Farmacia cercana", "Salud", -0.18, 0.12],
        ["Café de la colonia", "Gastronomía", 0.10, -0.22],
        ["Oficina administrativa", "Oficina y administración", -0.12, -0.16],
        ["Taller técnico", "Oficios y talleres", 0.28, -0.08],
        ["Centro educativo", "Educación", -0.26, 0.08],
        ["Banco de la zona", "Finanzas", 0.06, 0.26],
        ["Soporte tecnológico", "Tecnología", -0.08, 0.30]
    ];
    const kmPerDegreeLat = 111;
    const kmPerDegreeLon = 111 * Math.cos(lat * Math.PI / 180);
    const scale = Math.max(0.35, Math.min(radius / 1000, 10));
    return seeds.map(([name, sector, dx, dy]) => {
        const distanceKm = Math.max(0.15, Math.abs(dx) * scale * 0.14 + Math.abs(dy) * scale * 0.14);
        const clat = lat + (dy * scale * 0.009);
        const clon = lon + (dx * scale * 0.009);
        const dist = distanceM(lat, lon, clat, clon);
        return { name, lat: clat, lon: clon, sector, dist };
    }).filter((company) => company.dist <= radius).sort((a, b) => a.dist - b.dist);
}

async function fetchCompanies(lat, lon, radius) {
    state.searchFallback = false;
    const cacheKey = `companies:${lat.toFixed(3)}:${lon.toFixed(3)}:${radius}`;
    const cached = readSearchCache(cacheKey);
    if (cached) return cached;
    const area = (type, key, values) => `${type}(around:${radius},${lat},${lon})["${key}"${values ? `~"${values}"` : ""}]["name"];`;
    const selectors = [
        area("node", "office"), area("way", "office"),
        area("node", "shop"), area("way", "shop"),
        area("node", "craft"), area("way", "craft"),
        area("node", "amenity", "restaurant|cafe|fast_food|bank|hospital|clinic|pharmacy|school|college|kindergarten|library|dentist"),
        area("way", "amenity", "restaurant|cafe|fast_food|bank|hospital|clinic|pharmacy|school|college|kindergarten|library|dentist")
    ];
    const q = `[out:json][timeout:4];(${selectors.join("")});out center 80;`;
    let data;
    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            data = await fetchJson(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: "data=" + encodeURIComponent(q)
            }, 7000);
            break;
        } catch (error) {
            lastError = error;
        }
    }
    if (!data) {
        console.warn("OpenStreetMap no respondió:", lastError);
        state.searchFallback = true;
        const fallback = generateFallbackCompanies(lat, lon, radius);
        writeSearchCache(cacheKey, fallback);
        return fallback;
    }
    const seen = new Set();
    const list = [];
    (data.elements || []).forEach((el) => {
        const name = el.tags && el.tags.name && el.tags.name.trim();
        const point = el.center || el;
        if (!name || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        list.push({
            name,
            lat: point.lat,
            lon: point.lon,
            sector: sectorOf(el.tags),
            dist: distanceM(lat, lon, point.lat, point.lon)
        });
    });
    list.sort((a, b) => a.dist - b.dist);
    const results = list.slice(0, 60);
    writeSearchCache(cacheKey, results);
    return results;
}

function buildJobs(companies) {
    const jobs = [];
    let id = 1;
    companies.forEach((c) => {
        const h = hash(c.name);
        const roles = ROLES[c.sector] || ROLES["Comercio y ventas"];
        roles.forEach((role, i) => {
            const mode = ["Oficina y administración", "Tecnología"].includes(c.sector) ? MODES[(h >>> 5) % MODES.length] : "Presencial";
            const step = Math.round(((h >>> (i + 2)) % 5) * (role[2] - role[1]) / 4 / 100) * 100;
            const salary = role[1] + step;
            jobs.push({
                id: id++,
                title: role[0],
                company: c.name,
                sector: c.sector,
                lat: c.lat,
                lon: c.lon,
                dist: c.dist,
                salary,
                salaryMax: Math.min(role[2], salary + 1500),
                mode,
                shift: SHIFTS[(h >>> (i + 4)) % SHIFTS.length]
            });
        });
    });
    return jobs;
}

function ensureMap() {
    if (state.map) return;
    state.map = L.map("map").setView([19.4326, -99.1332], 12);
    const tileProviders = [
        {
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
            subdomains: "",
            attribution: "Tiles &copy; Esri"
        },
        {
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            subdomains: "",
            attribution: "&copy; OpenStreetMap"
        }
    ];
    let tileIndex = 0;
    let tileLayer = null;
    const addTileProvider = () => {
        if (tileLayer) state.map.removeLayer(tileLayer);
        const provider = tileProviders[tileIndex];
        tileLayer = L.tileLayer(provider.url, {
            maxZoom: 19,
            subdomains: provider.subdomains,
            attribution: provider.attribution
        }).addTo(state.map);
        tileLayer.on("tileerror", () => {
            if (tileIndex < tileProviders.length - 1) {
                tileIndex++;
                addTileProvider();
            } else {
                $("map").classList.add("map-tiles-offline");
            }
        });
    };
    addTileProvider();
    state.layer = L.layerGroup().addTo(state.map);
}

function renderMap() {
    if (!window.L) {
        $("map").innerHTML = '<div class="map-fallback"><strong>Mapa no disponible</strong><br>La lista de negocios sigue disponible. Conéctate a internet para cargar el mapa.</div>';
        return;
    }
    ensureMap();
    state.layer.clearLayers();
    state.markers = {};
    const { lat, lon } = state.center;
    state.searchArea = L.circle([lat, lon], { radius: state.radius, color: "#0e7c6b", weight: 1, fillOpacity: 0.06 }).addTo(state.layer);
    L.marker([lat, lon]).addTo(state.layer).bindPopup("<b>Tu búsqueda</b>");
    state.companies.forEach((c, i) => {
        const jobsCount = state.jobs.filter((j) => j.company === c.name).length;
        const m = L.circleMarker([c.lat, c.lon], { radius: 7, color: "#14577a", fillColor: "#ffb43a", fillOpacity: 0.95, weight: 2 }).addTo(state.layer);
        m.bindPopup(`<b>${esc(c.name)}</b><br>${esc(c.sector)}<br>${distLabel(c.dist)} · ${jobsCount} puesto(s)`);
        state.markers[i] = m;
    });
    if ($("cerca").classList.contains("active")) {
        state.map.invalidateSize();
        state.map.fitBounds(state.searchArea.getBounds());
    }
}

function renderCompanies() {
    const ul = $("company-list");
    ul.innerHTML = "";
    state.companies.forEach((c, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<b>${esc(c.name)}</b><small>${esc(c.sector)} · ${distLabel(c.dist)}</small>`;
        li.addEventListener("click", () => {
            state.map.setView([c.lat, c.lon], 17);
            state.markers[i].openPopup();
        });
        ul.appendChild(li);
    });
    $("company-empty").hidden = state.companies.length > 0;
    $("company-empty").textContent = "No se encontraron negocios en este radio. Prueba con uno mayor.";
    $("place-name").textContent = state.label.split(",")[0];
}

function renderStats() {
    $("stats").hidden = false;
    $("stat-place").textContent = state.label.split(",")[0];
    $("stat-companies").textContent = state.companies.length;
    $("stat-jobs").textContent = state.jobs.length;
    const avg = state.jobs.length ? Math.round(state.jobs.reduce((s, j) => s + j.salary, 0) / state.jobs.length / 100) * 100 : 0;
    $("stat-salary").textContent = avg ? money(avg) : "-";
    $("jobs-count").textContent = state.jobs.length;

    const counts = {};
    state.jobs.forEach((j) => (counts[j.sector] = (counts[j.sector] || 0) + 1));
    const chips = $("sector-chips");
    chips.hidden = false;
    chips.innerHTML = "";
    Object.keys(counts).forEach((s) => {
        const b = document.createElement("button");
        b.className = "chip";
        b.innerHTML = `${esc(s)}<b>${counts[s]}</b>`;
        b.addEventListener("click", () => {
            $("sector-select").value = s;
            renderJobs();
            showTab("vacantes");
        });
        chips.appendChild(b);
    });

    const sel = $("sector-select");
    sel.innerHTML = '<option value="">Todos los sectores</option>';
    Object.keys(counts).forEach((s) => {
        sel.innerHTML += `<option>${esc(s)}</option>`;
    });
}

function jobCard(job, compact) {
    const saved = state.saved.some((j) => j.id === job.id && j.company === job.company);
    const applied = state.applied.some((j) => j.id === job.id && j.company === job.company);
    const el = document.createElement("article");
    el.className = "job";
    el.innerHTML = `
        <h3>${esc(job.title)}</h3>
        <span class="company">${esc(job.company)} · ${distLabel(job.dist)}</span>
        <div class="meta">
            <span class="tag money">${money(job.salary)} - ${money(job.salaryMax)} /mes</span>
            <span class="tag">${esc(job.mode)}</span>
            <span class="tag">${esc(job.shift)}</span>
            ${compact ? "" : `<span class="tag">${esc(job.sector)}</span>`}
        </div>
        <div class="job-actions">
            <button class="primary" data-act="open">Ver detalle</button>
            <button class="ghost ${saved ? "on" : ""}" data-act="save">${saved ? "Guardada" : "Guardar"}</button>
            ${applied ? '<span class="tag">En seguimiento</span>' : ""}
        </div>`;
    el.querySelector('[data-act="open"]').addEventListener("click", () => openDialog(job));
    el.querySelector('[data-act="save"]').addEventListener("click", () => toggleSave(job));
    return el;
}

function filteredJobs() {
    const kw = normalizeSearch($("kw-input").value);
    const terms = kw.split(/\s+/).filter(Boolean);
    const sector = $("sector-select").value;
    const mode = $("mode-select").value;
    const shift = $("shift-select").value;
    const min = Number($("salary-range").value);
    const list = state.jobs.filter((j) =>
        (!terms.length || terms.every((term) => normalizeSearch(`${j.title} ${j.company} ${j.sector} ${state.label}`).includes(term))) &&
        (!sector || j.sector === sector) &&
        (!mode || j.mode === mode) &&
        (!shift || j.shift === shift) &&
        j.salary >= min
    );
    const sort = $("sort-select").value;
    if (sort === "salary") list.sort((a, b) => b.salary - a.salary);
    else list.sort((a, b) => a.dist - b.dist);
    return list;
}

function normalizeSearch(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\([^)]*\)/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((word) => word && !SEARCH_STOP_WORDS.has(word))
        .map((word) => word.length > 4 ? word.replace(/[oa]s?$/, "") : word)
        .join(" ");
}

function renderJobs() {
    const box = $("job-list");
    box.innerHTML = "";
    const list = filteredJobs();
    list.forEach((j) => box.appendChild(jobCard(j, false)));
    const empty = $("job-empty");
    empty.hidden = list.length > 0;
    empty.textContent = state.jobs.length
        ? "Sin resultados."
        : state.searchError
            ? "No se pudieron cargar puestos porque el servicio de mapas no respondió. Inténtalo de nuevo cuando haya conexión."
            : "Busca una ciudad para ver puestos.";
}

function renderList() {
    const sBox = $("saved-list");
    const aBox = $("applied-list");
    sBox.innerHTML = "";
    aBox.innerHTML = "";
    state.saved.forEach((j) => sBox.appendChild(jobCard(j, true)));
    state.applied.forEach((j) => aBox.appendChild(jobCard(j, true)));
    $("saved-empty").hidden = state.saved.length > 0;
    $("applied-empty").hidden = state.applied.length > 0;
    $("list-count").textContent = state.saved.length + state.applied.length;
}

function refreshAll() {
    renderJobs();
    renderList();
    renderSuggestions();
}

function toggleSave(job) {
    const idx = state.saved.findIndex((j) => j.id === job.id && j.company === job.company);
    if (idx >= 0) {
        state.saved.splice(idx, 1);
        toast("Puesto quitado de guardados");
    } else {
        state.saved.push(job);
        toast("Puesto guardado");
    }
    storeList("saved", state.saved);
    refreshAll();
    if ($("job-dialog").open) openDialog(job);
}

function apply(job) {
    if (state.applied.some((j) => j.id === job.id && j.company === job.company)) {
        toast("Este puesto ya está en tu seguimiento");
        return;
    }
    state.applied.push(job);
    storeList("applied", state.applied);
    toast("Puesto agregado a tu seguimiento");
    refreshAll();
    openDialog(job);
}

function openDialog(job) {
    const saved = state.saved.some((j) => j.id === job.id && j.company === job.company);
    const applied = state.applied.some((j) => j.id === job.id && j.company === job.company);
    $("dialog-body").innerHTML = `
        <h2>${esc(job.title)}</h2>
        <p><b>${esc(job.company)}</b> · ${esc(job.sector)}</p>
        <div class="meta">
            <span class="tag money">${money(job.salary)} - ${money(job.salaryMax)} /mes</span>
            <span class="tag">${esc(job.mode)}</span>
            <span class="tag">${esc(job.shift)}</span>
            <span class="tag">${distLabel(job.dist)} de tu búsqueda</span>
        </div>
        <p>Comunícate con el negocio para preguntar por el puesto y sus condiciones.</p>
        <div class="dialog-actions">
            <button class="primary" id="dlg-apply">${applied ? "En seguimiento" : "Registrar seguimiento"}</button>
            <button class="ghost" id="dlg-save">${saved ? "Quitar de guardadas" : "Guardar"}</button>
            <button class="ghost" id="dlg-map">Ver en mapa</button>
            <button class="ghost" id="dlg-close">Cerrar</button>
        </div>`;
    $("dlg-apply").addEventListener("click", () => apply(job));
    $("dlg-save").addEventListener("click", () => toggleSave(job));
    $("dlg-close").addEventListener("click", () => $("job-dialog").close());
    const mapButton = $("dlg-map");
    mapButton.addEventListener("click", () => {
        $("job-dialog").close();
        showTab("cerca");
        if (!state.map) {
            toast("El mapa necesita conexión a internet para cargarse");
            return;
        }
        state.map.setView([job.lat, job.lon], 17);
        const idx = state.companies.findIndex((c) => c.name === job.company);
        if (idx >= 0 && state.markers[idx]) state.markers[idx].openPopup();
    });
    if (!$("job-dialog").open) $("job-dialog").showModal();
}

async function runSearch(center, label) {
    state.center = center;
    state.label = label;
    state.radius = Number($("radius-select").value);
    state.searchError = false;
    state.searchFallback = false;
    const searchButton = $("search-btn");
    searchButton.disabled = true;
    searchButton.textContent = "Buscando...";
    setStatus("Buscando negocios y puestos cerca de la zona...");
    try {
        state.companies = await fetchCompanies(center.lat, center.lon, state.radius);
        state.jobs = buildJobs(state.companies);
        const keyword = normalizeSearch($("hero-kw").value);
        if (keyword) {
            const terms = keyword.split(/\s+/).filter(Boolean);
            state.jobs = state.jobs.filter((job) =>
                terms.every((term) =>
                    normalizeSearch(`${job.title} ${job.company} ${job.sector}`).includes(term)
                )
            );
            const matchingCompanies = new Set(state.jobs.map((job) => job.company));
            state.companies = state.companies.filter((company) =>
                matchingCompanies.has(company.name)
            );
        }
        renderMap();
        renderCompanies();
        renderStats();
        renderJobs();
        $("job-empty").hidden = state.jobs.length > 0;
        setStatus(state.jobs.length
            ? state.searchFallback
                ? `Mostramos ${state.companies.length} opciones de exploración y ${state.jobs.length} puestos mientras el servicio de mapas se recupera.`
                : `Encontramos ${state.companies.length} negocios y ${state.jobs.length} puestos.`
            : "No encontramos negocios en este radio. Prueba con uno mayor.");
    } catch (e) {
        console.error(e);
        state.companies = [];
        state.jobs = [];
        state.searchError = true;
        renderMap();
        renderCompanies();
        renderStats();
        renderJobs();
        setStatus("No se pudo conectar con el servicio de negocios. Inténtalo de nuevo cuando haya conexión.", true);
    } finally {
        searchButton.disabled = false;
        searchButton.textContent = "Buscar empleo";
    }
}

$("search-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const city = $("city-input").value.trim();
    if (!city) {
        setStatus("Escribe un lugar válido para buscar.", true);
        return;
    }
    setStatus("Localizando la zona...");
    try {
        const place = await geocode(city);
        if (!place) {
            setStatus("No encontramos esa ubicación. Prueba con otra ciudad o colonia.", true);
            return;
        }
        $("kw-input").value = $("hero-kw").value.trim();
        renderJobs();
        await runSearch({ lat: place.lat, lon: place.lon }, place.name);
        renderJobs();
        if ($("hero-kw").value.trim()) {
            showTab("vacantes");
        } else if (state.jobs.length) {
            showTab("cerca");
        }
    } catch (e) {
        console.error(e);
        setStatus("Error al comunicarse con el servidor de ubicaciones.", true);
    }
});

$("quick-cities").addEventListener("click", (ev) => {
    const button = ev.target.closest("button[data-city]");
    const city = button && button.dataset.city;
    if (!city) return;
    $("city-input").value = city.split(",")[0];
    $("search-form").requestSubmit();
});

$("tabs").addEventListener("click", (ev) => {
    const tab = ev.target.closest(".tab");
    if (tab) showTab(tab.dataset.tab);
});

["kw-input", "sector-select", "mode-select", "shift-select", "sort-select"].forEach((id) => {
    $(id).addEventListener("input", renderJobs);
});

$("salary-range").addEventListener("input", () => {
    $("salary-out").textContent = money($("salary-range").value);
    renderJobs();
});

$("clear-filters").addEventListener("click", () => {
    $("kw-input").value = "";
    $("sector-select").value = "";
    $("mode-select").value = "";
    $("shift-select").value = "";
    $("salary-range").value = 0;
    $("sort-select").value = "dist";
    $("salary-out").textContent = money(0);
    renderJobs();
});

$("clear-list").addEventListener("click", () => {
    state.saved = [];
    state.applied = [];
    storeList("saved", []);
    storeList("applied", []);
    refreshAll();
    toast("Lista borrada");
});

$("job-dialog").addEventListener("click", (ev) => {
    if (ev.target === $("job-dialog")) $("job-dialog").close();
});

function updateChecklist() {
    const checks = [...document.querySelectorAll("#checklist input[type='checkbox']")];
    const completed = checks.filter((check) => check.checked).length;
    $("checklist-progress").textContent = `${completed} de ${checks.length} completados`;
    $("checklist-bar").style.width = `${checks.length ? (completed / checks.length) * 100 : 0}%`;
    try {
        localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checks.map((check) => check.checked)));
    } catch (e) {}
}

const checklistState = (() => {
    try {
        return JSON.parse(localStorage.getItem(CHECKLIST_KEY)) || [];
    } catch (e) {
        return [];
    }
})();

document.querySelectorAll("#checklist input[type='checkbox']").forEach((check, index) => {
    check.checked = Boolean(checklistState[index]);
    check.addEventListener("change", updateChecklist);
});
updateChecklist();
renderList();
renderSuggestions();
